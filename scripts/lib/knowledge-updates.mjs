import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { canonicalHash, ContractError } from './contracts.mjs';

const fail = (path, message, code = 'INVALID_INPUT') => { throw new ContractError(code, path, message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const nowIso = value => {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) fail('/clock', 'Knowledge clock must be a valid instant');
  return date.toISOString();
};

export function inspectKnowledgeCheckoutV5({ checkout_dir, repo, prior_head = null, paths = [], clock = new Date() }) {
  const checked_at = nowIso(clock);
  try {
    const observed_head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: checkout_dir, encoding: 'utf8' }).trim();
    if (!/^[a-f0-9]{40}$/.test(observed_head)) fail('/observed_head', 'Git HEAD is not a full commit hash', 'MISSING_EVIDENCE');
    const rawRemote = execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd: checkout_dir, encoding: 'utf8' }).trim();
    const remote = rawRemote.replace(/\.git$/, '');
    const expected = String(repo).replace(/^https?:\/\/github\.com\//, '').replace(/^git@github\.com:/, '').replace(/\.git$/, '');
    const actual = remote.replace(/^https?:\/\/github\.com\//, '').replace(/^git@github\.com:/, '');
    if (actual !== expected) fail('/repo', 'Git checkout origin does not match the active knowledge repository', 'MISSING_EVIDENCE');
    const queryRemote = rawRemote.startsWith('git@github.com:') ? `https://github.com/${rawRemote.slice('git@github.com:'.length)}` : rawRemote;
    const remoteResult = execFileSync('git', ['ls-remote', queryRemote, 'HEAD'], { cwd: checkout_dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' } }).trim();
    const remote_head = remoteResult.split(/\s+/u)[0] ?? null, remote_checked_at = nowIso(clock);
    if (!/^[a-f0-9]{40}$/.test(remote_head)) fail('/remote_head', 'Remote HEAD lookup did not return a full commit hash', 'MISSING_EVIDENCE');
    const files = paths.map(path => {
      const absolute = resolve(checkout_dir, path), rel = relative(resolve(checkout_dir), absolute);
      if (isAbsolute(rel) || rel.startsWith('..')) fail('/paths', 'Knowledge check path escapes the checkout');
      const tree = execFileSync('git', ['ls-tree', observed_head, '--', rel], { cwd: checkout_dir, encoding: 'utf8' }).trim();
      const git_blob_oid = tree ? /^\d+ blob ([a-f0-9]{40})\t/u.exec(tree)?.[1] : null;
      const present = existsSync(absolute);
      if (tree && !git_blob_oid) fail('/paths', 'Source must identify an exact committed file blob', 'MISSING_EVIDENCE');
      const committed = git_blob_oid ? execFileSync('git', ['show', `${observed_head}:${rel}`], { cwd: checkout_dir, maxBuffer: 32 * 1024 * 1024 }) : null;
      if (present !== Boolean(committed) || (present && sha256(readFileSync(absolute)) !== sha256(committed))) fail('/paths', 'Working source bytes differ from the committed HEAD', 'MISSING_EVIDENCE');
      return { path: rel, status: committed ? 'present' : 'deleted', sha256: committed ? sha256(committed) : null, git_blob_oid: git_blob_oid ?? null, commit: observed_head };
    });
    const mismatch = observed_head !== remote_head;
    const base = { contract_version: 5, check_id: `knowledge-check-${canonicalHash({ repo, checked_at, observed_head, remote_head, files }).slice(0, 24)}`, repo, checked_at, checkout_dir: resolve(checkout_dir), source_binding_version: 'git-source-v1', remote_url: remote, remote_checked_at, prior_head, observed_head, remote_head, status: mismatch ? 'check_failed' : prior_head === remote_head ? 'unchanged' : 'changed', files, error: mismatch ? `CHECKOUT_NOT_REMOTE_HEAD: checkout=${observed_head} remote=${remote_head}` : null };
    return Object.freeze({ ...base, check_hash: canonicalHash(base) });
  } catch (error) {
    const base = { contract_version: 5, check_id: `knowledge-check-${canonicalHash({ repo, checked_at, prior_head, error: String(error.message) }).slice(0, 24)}`, repo, checked_at, remote_url: null, remote_checked_at: checked_at, prior_head, observed_head: null, remote_head: null, status: 'check_failed', files: [], error: String(error.message) };
    return Object.freeze({ ...base, check_hash: canonicalHash(base) });
  }
}

const byId = (items, key) => new Map((items ?? []).map(item => [item[key], item]));
export function dependencyDiffV5(currentDependencies, candidateDependencies) {
  const before = byId(currentDependencies, 'dependency_id'), after = byId(candidateDependencies, 'dependency_id');
  const added = [], modified = [], removed = [], moved = [];
  for (const [id, next] of after) {
    const prior = before.get(id);
    if (!prior) added.push(id);
    else if (canonicalHash(prior) !== canonicalHash(next)) {
      if (prior.path !== next.path && canonicalHash({ ...prior, path: next.path }) === canonicalHash(next)) moved.push({ dependency_id: id, from: prior.path, to: next.path });
      else modified.push(id);
    }
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);
  return { added: added.sort(), modified: modified.sort(), removed: removed.sort(), moved: moved.sort((a, b) => a.dependency_id.localeCompare(b.dependency_id)) };
}

function checkedDependencyImpactV5(currentBundle, candidateBundle, check) {
  const priorDeps = byId(currentBundle.dependencies, 'dependency_id'), checked = new Map((check?.files ?? []).map(file => [file.path, file]));
  const modified = [], potentially_modified = [], limitations = [];
  if (check?.status !== 'changed' || check.observed_head === currentBundle.catalog?.upstream?.commit) return { modified, potentially_modified, limitations };
  const historicalHeadMatches = Boolean(currentBundle.catalog?.upstream?.commit) && check.prior_head === currentBundle.catalog.upstream.commit;
  for (const dep of candidateBundle.dependencies) {
    const prior = priorDeps.get(dep.dependency_id);
    if (!prior || canonicalHash(prior) !== canonicalHash(dep) || dep.source_visibility === 'external_unpublished') continue;
    const file = checked.get(dep.path);
    if (!file) {
      potentially_modified.push(dep.dependency_id);
      limitations.push({ dependency_id: dep.dependency_id, path: dep.path, reason: 'not_checked_at_candidate_head' });
      continue;
    }
    if (!historicalHeadMatches) {
      potentially_modified.push(dep.dependency_id);
      limitations.push({ dependency_id: dep.dependency_id, path: dep.path, reason: 'historical_head_unverified' });
    } else if (!prior.material_hash) {
      potentially_modified.push(dep.dependency_id);
      limitations.push({ dependency_id: dep.dependency_id, path: dep.path, reason: 'historical_source_pin_missing' });
    } else if (file.status === 'deleted' || file.sha256 !== prior.material_hash) {
      modified.push(dep.dependency_id);
      limitations.push({ dependency_id: dep.dependency_id, path: dep.path, reason: 'candidate_metadata_stale' });
    }
  }
  return { modified: [...new Set(modified)].sort(), potentially_modified: [...new Set(potentially_modified)].sort(), limitations: limitations.sort((a, b) => a.dependency_id.localeCompare(b.dependency_id)) };
}

export function computeKnowledgeImpactV5(currentBundle, candidateBundle, check = null) {
  const sourceImpact = checkedDependencyImpactV5(currentBundle, candidateBundle, check);
  const baseDiff = dependencyDiffV5(currentBundle.dependencies, candidateBundle.dependencies);
  const dependency_diff = { ...baseDiff, modified: [...new Set([...baseDiff.modified, ...sourceImpact.modified])].sort() };
  if (sourceImpact.potentially_modified.length) dependency_diff.potentially_modified = sourceImpact.potentially_modified;
  const changed = new Set([...dependency_diff.added, ...dependency_diff.modified, ...(dependency_diff.potentially_modified ?? []), ...dependency_diff.removed, ...dependency_diff.moved.map(item => item.dependency_id)]);
  const allRules = new Set([...Object.keys(currentBundle.rules), ...Object.keys(candidateBundle.rules)]), affected = [];
  for (const ref of allRules) {
    const prior = currentBundle.rules[ref], next = candidateBundle.rules[ref];
    if (!prior || !next || canonicalHash(prior) !== canonicalHash(next) || [...(prior?.dependency_ids ?? []), ...(next?.dependency_ids ?? [])].some(id => changed.has(id))) affected.push(ref);
  }
  return Object.freeze({ dependency_diff, affected_rule_version_refs: affected.sort(), impact_limitations: sourceImpact.limitations });
}

/** Bind new research to actually inspected Git blobs; inherited facts retain their original pin. */
export function knowledgeSourceBindingsV5(currentBundle, candidateBundle, check) {
  const { check_hash, ...checkBase } = check ?? {};
  if (!check_hash || canonicalHash(checkBase) !== check_hash) fail('/check_hash', 'Source check hash changed', 'RECEIPT_CONFLICT');
  const checked = new Map((check.files ?? []).map(file => [file.path, file]));
  const bindings = [];
  const bind = (source_ref, path, expectedHash = null, material_hash = null) => {
    const file = checked.get(path);
    if (!file || file.commit !== check.observed_head || (file.status === 'present' && !/^[a-f0-9]{40}$/u.test(file.git_blob_oid ?? ''))) fail('/source_bindings', `Source file coverage needs a fresh committed blob check: ${path}`, 'MISSING_EVIDENCE');
    if (expectedHash && (file.status !== 'present' || file.sha256 !== expectedHash)) fail('/source_bindings', `Candidate source bytes do not match the inspected file: ${path}`, 'RECEIPT_CONFLICT');
    bindings.push({ source_ref, path, commit: file.commit, status: file.status, git_blob_oid: file.git_blob_oid, file_sha256: file.sha256, material_hash });
  };
  const priorDeps = byId(currentBundle.dependencies, 'dependency_id');
  const stale = new Set(checkedDependencyImpactV5(currentBundle, candidateBundle, check).limitations.filter(item => item.reason !== 'not_checked_at_candidate_head').map(item => item.dependency_id));
  for (const dep of candidateBundle.dependencies) {
    const inherited = canonicalHash(priorDeps.get(dep.dependency_id) ?? null) === canonicalHash(dep);
    if ((inherited && !stale.has(dep.dependency_id)) || dep.source_visibility === 'external_unpublished') continue;
    if (!dep.material_hash && !inherited) fail('/source_bindings', 'A public dependency needs its actual upstream file hash', 'MISSING_EVIDENCE');
    bind(`dependency:${dep.dependency_id}`, dep.path, inherited ? null : dep.material_hash, inherited ? dep.material_hash : dep.evidence_content_hash);
    if (inherited) continue;
    for (const path of [...new Set(dep.caller_refs ?? [])].filter(path => /\.(?:rs|py|go|java|scala|ts|js|md)$/u.test(path))) if (path !== dep.path) bind(`caller:${dep.dependency_id}:${path}`, path);
  }
  for (const dep of currentBundle.dependencies) if (!candidateBundle.dependencies.some(item => item.dependency_id === dep.dependency_id) && dep.source_visibility !== 'external_unpublished') bind(`removed_dependency:${dep.dependency_id}`, dep.path);
  for (const [ref, fact] of Object.entries(candidateBundle.facts ?? {})) {
    if (canonicalHash(currentBundle.facts?.[ref] ?? null) === canonicalHash(fact)) continue;
    const artifact = candidateBundle.artifacts?.[fact.source_material_ref];
    if (!artifact || artifact.commit !== check.observed_head) fail('/source_bindings', `New fact requires an artifact at the checked commit: ${ref}`, 'MISSING_EVIDENCE');
    bind(`artifact:${artifact.artifact_id}`, artifact.source_path, artifact.upstream_file_hash, artifact.artifact_content_hash);
  }
  return bindings.sort((a, b) => a.source_ref.localeCompare(b.source_ref));
}

/** The CLI verifies the packaged excerpts/review document, not only their self-reported hashes. */
export function verifyKnowledgeSourceMaterialsV5(currentBundle, candidateBundle, check, packageDir) {
  knowledgeSourceBindingsV5(currentBundle, candidateBundle, check);
  if (check.source_binding_version !== 'git-source-v1' || !check.checkout_dir) fail('/check_ref', 'A fresh committed-source check is required', 'MISSING_EVIDENCE');
  const checked = new Map(check.files.map(file => [file.path, file]));
  const sourceBytes = path => {
    const file = checked.get(path);
    if (!file || file.status !== 'present' || file.commit !== check.observed_head) fail('/source_material', `Source was not actually checked: ${path}`, 'MISSING_EVIDENCE');
    const bytes = execFileSync('git', ['show', `${check.observed_head}:${path}`], { cwd: check.checkout_dir, maxBuffer: 32 * 1024 * 1024 });
    if (sha256(bytes) !== file.sha256) fail('/source_material', 'Checked Git source changed', 'RECEIPT_CONFLICT');
    return bytes;
  };
  const materialBytes = path => {
    const absolute = resolve(packageDir, path), rel = relative(resolve(packageDir), absolute);
    if (isAbsolute(rel) || rel.startsWith('..')) fail('/source_material', 'Source material escapes the package');
    return readFileSync(absolute);
  };
  const priorDeps = byId(currentBundle.dependencies, 'dependency_id');
  for (const dep of candidateBundle.dependencies) {
    if (canonicalHash(priorDeps.get(dep.dependency_id) ?? null) === canonicalHash(dep) || dep.source_visibility === 'external_unpublished') continue;
    const source = sourceBytes(dep.path), evidence = materialBytes(dep.evidence_material_path);
    if (sha256(evidence) !== dep.evidence_content_hash) fail('/source_material', 'Candidate evidence bytes changed', 'RECEIPT_CONFLICT');
    if (source.includes(evidence) && evidence.length) continue;
    let doc; try { doc = JSON.parse(evidence.toString('utf8')); } catch { fail('/source_material', `Dependency evidence is neither an actual source excerpt nor a bound review document: ${dep.dependency_id}`, 'MISSING_EVIDENCE'); }
    if (doc.candidate_commit !== check.observed_head || !doc.files?.length) fail('/source_material', 'Review document must identify checked source files and commit', 'MISSING_EVIDENCE');
    for (const file of doc.files) {
      const actual = checked.get(file.path);
      if (file.status === 'deleted') {
        if (!actual || actual.status !== 'deleted' || actual.commit !== check.observed_head || file.sha256 !== null) fail('/source_material', 'Deleted source must match the checked commit inventory', 'RECEIPT_CONFLICT');
      } else if (sha256(sourceBytes(file.path)) !== file.sha256) fail('/source_material', 'Review document refers to different source bytes', 'RECEIPT_CONFLICT');
    }
  }
  for (const [ref, fact] of Object.entries(candidateBundle.facts ?? {})) {
    if (canonicalHash(currentBundle.facts?.[ref] ?? null) === canonicalHash(fact)) continue;
    const artifact = candidateBundle.artifacts[fact.source_material_ref], source = sourceBytes(artifact.source_path), material = materialBytes(artifact.material_path), range = /^(\d+)-(\d+)$/u.exec(artifact.line_range ?? '');
    const expected = range ? Buffer.from(source.toString('utf8').split(/(?<=\n)/u).slice(Number(range[1]) - 1, Number(range[2])).join('')) : source;
    if (sha256(material) !== artifact.artifact_content_hash || !expected.equals(material)) fail('/source_material', `Fact excerpt does not match its committed source range: ${ref}`, 'RECEIPT_CONFLICT');
  }
  return true;
}

export function proposeKnowledgeUpdateV5(currentBundle, savedCandidate, check) {
  if (!savedCandidate?.catalog || !savedCandidate?.dependencies || !savedCandidate?.rules) fail('/saved_candidate', 'A saved, reloadable candidate bundle is required', 'MISSING_EVIDENCE');
  if (check?.status !== 'changed' || check.observed_head !== check.remote_head || check.remote_head !== savedCandidate.catalog.upstream.commit) fail('/check', 'Changed check must bind candidate to actual remote HEAD', 'INVALID_EVIDENCE_REF');
  const source_bindings = knowledgeSourceBindingsV5(currentBundle, savedCandidate, check);
  const impact = computeKnowledgeImpactV5(currentBundle, savedCandidate, check);
  const gaps = [...new Set([...savedCandidate.dependencies.filter(item => item.wiring_status === 'unreviewed' || item.source_visibility !== 'public').map(item => item.dependency_id), ...impact.impact_limitations.map(item => item.dependency_id)])].sort();
  const candidate_bundle_hash = canonicalHash({ catalog: savedCandidate.catalog, dependencies: savedCandidate.dependencies, rules: savedCandidate.rules });
  const base = { contract_version: 5, proposal_id: `knowledge-proposal-${canonicalHash({ current: currentBundle.catalog.catalog_content_hash, candidate: savedCandidate.catalog.catalog_content_hash, check: check.check_hash }).slice(0, 24)}`, prior_catalog_ref: currentBundle.catalog.catalog_id, candidate_catalog_ref: savedCandidate.catalog.catalog_id, candidate_catalog_hash: savedCandidate.catalog.catalog_content_hash, candidate_bundle_hash, check_ref: check.check_id, check_hash: check.check_hash, source_binding_version: 'git-source-v1', source_bindings, ...impact, gaps };
  return Object.freeze({ ...base, proposal_hash: canonicalHash(base) });
}

export function knowledgeReplayResultHashV5(result) {
  return canonicalHash({ contract_version: result.contract_version, replay_id: result.replay_id, proposal_ref: result.proposal_ref, rule_version_ref: result.rule_version_ref, subject_hash: result.subject_hash, status: result.status, cases: result.cases });
}

export function activateKnowledgeUpdateV5(currentBundle, savedCandidate, proposal, { review_receipt, replay_results, check, activated_at = new Date() }) {
  if (proposal.source_binding_version !== 'git-source-v1' || check?.check_hash !== proposal.check_hash || check.check_id !== proposal.check_ref || canonicalHash(knowledgeSourceBindingsV5(currentBundle, savedCandidate, check)) !== canonicalHash(proposal.source_bindings)) fail('/source_bindings', 'Activation requires current exact saved source bindings; re-check legacy candidates', 'MISSING_EVIDENCE');
  const pendingRules = Object.values(savedCandidate.rules).filter(rule => rule.review_status !== 'approved').map(rule => rule.rule_version_id);
  if (pendingRules.length) fail('/candidate_catalog/rules', `Candidate contains rules without approved status: ${pendingRules.join(', ')}`, 'MISSING_EVIDENCE');
  const recomputed = computeKnowledgeImpactV5(currentBundle, savedCandidate, check);
  const candidateBundleHash = canonicalHash({ catalog: savedCandidate.catalog, dependencies: savedCandidate.dependencies, rules: savedCandidate.rules });
  const proposalBase = Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== 'proposal_hash'));
  if (proposal.candidate_catalog_hash !== savedCandidate.catalog.catalog_content_hash || proposal.candidate_bundle_hash !== candidateBundleHash || proposal.proposal_hash !== canonicalHash(proposalBase)) fail('/proposal', 'Proposal is not the immutable saved candidate proposal', 'RECEIPT_CONFLICT');
  if (canonicalHash(recomputed) !== canonicalHash({ dependency_diff: proposal.dependency_diff, affected_rule_version_refs: proposal.affected_rule_version_refs, impact_limitations: proposal.impact_limitations ?? [] })) fail('/proposal', 'Saved candidate impact changed; activation requires a new proposal', 'RECEIPT_CONFLICT');
  if (!review_receipt || review_receipt.decision !== 'approved' || review_receipt.purpose !== 'review_knowledge' || review_receipt.subject_hash !== proposal.proposal_hash || review_receipt.actual_result_hash !== proposal.proposal_hash) fail('/review_receipt', 'Actual independent review of exact proposal is required', 'MISSING_EVIDENCE');
  const results = new Map((replay_results ?? []).map(result => [result.rule_version_ref, result]));
  for (const ref of recomputed.affected_rule_version_refs) {
    const result = results.get(ref), cases = result?.cases ?? [];
    if (!result || result.contract_version !== 5 || result.proposal_ref !== proposal.proposal_id || result.status !== 'passed' || result.subject_hash !== proposal.proposal_hash || result.replay_result_hash !== knowledgeReplayResultHashV5(result) || !result.review_ref || !['applicable', 'not_applicable', 'unknown'].every(expected => cases.some(item => item.expected === expected && item.actual === expected && item.status === 'passed'))) fail('/replay_results', `Affected rule lacks actual three-state replay evidence: ${ref}`, 'REQUESTED_OUTPUT_INCOMPLETE');
  }
  const changed = new Set([...recomputed.dependency_diff.added, ...recomputed.dependency_diff.modified, ...(recomputed.dependency_diff.potentially_modified ?? []), ...recomputed.dependency_diff.moved.map(item => item.dependency_id)]);
  if (proposal.gaps.some(id => changed.has(id))) fail('/gaps', 'Affected unresolved dependencies cannot be activated', 'MISSING_EVIDENCE');
  const event = { contract_version: 5, event_id: `knowledge-event-${canonicalHash({ proposal: proposal.proposal_hash, review: review_receipt.receipt_id }).slice(0, 24)}`, event_type: 'activated', catalog_ref: savedCandidate.catalog.catalog_id, prior_catalog_ref: currentBundle.catalog.catalog_id, checked_at: nowIso(activated_at), observed_head_commit: savedCandidate.catalog.upstream.commit, affected_rule_version_refs: recomputed.affected_rule_version_refs, gaps: proposal.gaps, review_receipt_ref: review_receipt.receipt_id, replay_result_refs: replay_results.map(item => item.replay_id) };
  return Object.freeze({ catalog: savedCandidate.catalog, event, impact: recomputed });
}
