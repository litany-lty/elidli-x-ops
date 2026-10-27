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
      const present = existsSync(absolute);
      return { path, status: present ? 'present' : 'deleted', sha256: present ? sha256(readFileSync(absolute)) : null };
    });
    const mismatch = observed_head !== remote_head;
    const base = { contract_version: 5, check_id: `knowledge-check-${canonicalHash({ repo, checked_at, observed_head, remote_head, files }).slice(0, 24)}`, repo, checked_at, remote_url: remote, remote_checked_at, prior_head, observed_head, remote_head, status: mismatch ? 'check_failed' : prior_head === remote_head ? 'unchanged' : 'changed', files, error: mismatch ? `CHECKOUT_NOT_REMOTE_HEAD: checkout=${observed_head} remote=${remote_head}` : null };
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

export function computeKnowledgeImpactV5(currentBundle, candidateBundle) {
  const dependency_diff = dependencyDiffV5(currentBundle.dependencies, candidateBundle.dependencies);
  const changed = new Set([...dependency_diff.added, ...dependency_diff.modified, ...dependency_diff.removed, ...dependency_diff.moved.map(item => item.dependency_id)]);
  const allRules = new Set([...Object.keys(currentBundle.rules), ...Object.keys(candidateBundle.rules)]), affected = [];
  for (const ref of allRules) {
    const prior = currentBundle.rules[ref], next = candidateBundle.rules[ref];
    if (!prior || !next || canonicalHash(prior) !== canonicalHash(next) || [...(prior?.dependency_ids ?? []), ...(next?.dependency_ids ?? [])].some(id => changed.has(id))) affected.push(ref);
  }
  return Object.freeze({ dependency_diff, affected_rule_version_refs: affected.sort() });
}

export function proposeKnowledgeUpdateV5(currentBundle, savedCandidate, check) {
  if (!savedCandidate?.catalog || !savedCandidate?.dependencies || !savedCandidate?.rules) fail('/saved_candidate', 'A saved, reloadable candidate bundle is required', 'MISSING_EVIDENCE');
  if (check?.status !== 'changed' || check.observed_head !== check.remote_head || check.remote_head !== savedCandidate.catalog.upstream.commit) fail('/check', 'Changed check must bind candidate to actual remote HEAD', 'INVALID_EVIDENCE_REF');
  const impact = computeKnowledgeImpactV5(currentBundle, savedCandidate);
  const gaps = savedCandidate.dependencies.filter(item => item.wiring_status === 'unreviewed' || item.source_visibility !== 'public').map(item => item.dependency_id).sort();
  const candidate_bundle_hash = canonicalHash({ catalog: savedCandidate.catalog, dependencies: savedCandidate.dependencies, rules: savedCandidate.rules });
  const base = { contract_version: 5, proposal_id: `knowledge-proposal-${canonicalHash({ current: currentBundle.catalog.catalog_content_hash, candidate: savedCandidate.catalog.catalog_content_hash, check: check.check_hash }).slice(0, 24)}`, prior_catalog_ref: currentBundle.catalog.catalog_id, candidate_catalog_ref: savedCandidate.catalog.catalog_id, candidate_catalog_hash: savedCandidate.catalog.catalog_content_hash, candidate_bundle_hash, check_ref: check.check_id, check_hash: check.check_hash, ...impact, gaps };
  return Object.freeze({ ...base, proposal_hash: canonicalHash(base) });
}

export function knowledgeReplayResultHashV5(result) {
  return canonicalHash({ contract_version: result.contract_version, replay_id: result.replay_id, proposal_ref: result.proposal_ref, rule_version_ref: result.rule_version_ref, subject_hash: result.subject_hash, status: result.status, cases: result.cases });
}

export function activateKnowledgeUpdateV5(currentBundle, savedCandidate, proposal, { review_receipt, replay_results, activated_at = new Date() }) {
  const pendingRules = Object.values(savedCandidate.rules).filter(rule => rule.review_status !== 'approved').map(rule => rule.rule_version_id);
  if (pendingRules.length) fail('/candidate_catalog/rules', `Candidate contains rules without approved status: ${pendingRules.join(', ')}`, 'MISSING_EVIDENCE');
  const recomputed = computeKnowledgeImpactV5(currentBundle, savedCandidate);
  const candidateBundleHash = canonicalHash({ catalog: savedCandidate.catalog, dependencies: savedCandidate.dependencies, rules: savedCandidate.rules });
  const proposalBase = Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== 'proposal_hash'));
  if (proposal.candidate_catalog_hash !== savedCandidate.catalog.catalog_content_hash || proposal.candidate_bundle_hash !== candidateBundleHash || proposal.proposal_hash !== canonicalHash(proposalBase)) fail('/proposal', 'Proposal is not the immutable saved candidate proposal', 'RECEIPT_CONFLICT');
  if (canonicalHash(recomputed) !== canonicalHash({ dependency_diff: proposal.dependency_diff, affected_rule_version_refs: proposal.affected_rule_version_refs })) fail('/proposal', 'Saved candidate impact changed; activation requires a new proposal', 'RECEIPT_CONFLICT');
  if (!review_receipt || review_receipt.decision !== 'approved' || review_receipt.purpose !== 'review_knowledge' || review_receipt.subject_hash !== proposal.proposal_hash || review_receipt.actual_result_hash !== proposal.proposal_hash) fail('/review_receipt', 'Actual independent review of exact proposal is required', 'MISSING_EVIDENCE');
  const results = new Map((replay_results ?? []).map(result => [result.rule_version_ref, result]));
  for (const ref of recomputed.affected_rule_version_refs) {
    const result = results.get(ref), cases = result?.cases ?? [];
    if (!result || result.contract_version !== 5 || result.proposal_ref !== proposal.proposal_id || result.status !== 'passed' || result.subject_hash !== proposal.proposal_hash || result.replay_result_hash !== knowledgeReplayResultHashV5(result) || !result.review_ref || !['applicable', 'not_applicable', 'unknown'].every(expected => cases.some(item => item.expected === expected && item.actual === expected && item.status === 'passed'))) fail('/replay_results', `Affected rule lacks actual three-state replay evidence: ${ref}`, 'REQUESTED_OUTPUT_INCOMPLETE');
  }
  const changed = new Set([...recomputed.dependency_diff.added, ...recomputed.dependency_diff.modified, ...recomputed.dependency_diff.moved.map(item => item.dependency_id)]);
  if (proposal.gaps.some(id => changed.has(id))) fail('/gaps', 'Affected unresolved dependencies cannot be activated', 'MISSING_EVIDENCE');
  const event = { contract_version: 5, event_id: `knowledge-event-${canonicalHash({ proposal: proposal.proposal_hash, review: review_receipt.receipt_id }).slice(0, 24)}`, event_type: 'activated', catalog_ref: savedCandidate.catalog.catalog_id, prior_catalog_ref: currentBundle.catalog.catalog_id, checked_at: nowIso(activated_at), observed_head_commit: savedCandidate.catalog.upstream.commit, affected_rule_version_refs: recomputed.affected_rule_version_refs, gaps: proposal.gaps, review_receipt_ref: review_receipt.receipt_id, replay_result_refs: replay_results.map(item => item.replay_id) };
  return Object.freeze({ catalog: savedCandidate.catalog, event, impact: recomputed });
}
