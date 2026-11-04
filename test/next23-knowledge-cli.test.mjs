import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { catalogContentHash, knowledgeBundleFromState, knowledgeReplayResultHashV5 } from '../scripts/lib/knowledge.mjs';
import { commitState, initializeState, loadState, putImmutable } from '../scripts/lib/state.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const entry = resolve('scripts/x-ops.mjs');

async function call(stateDir, payload, expectedStatus = 0) {
  const state = await loadState(stateDir), input = join(stateDir, `${crypto.randomUUID()}.input.json`), output = join(stateDir, `${crypto.randomUUID()}.output.json`);
  await writeFile(input, JSON.stringify({ schema_version: 1, run_id: null, expected_revision: state.revision, payload }));
  const processResult = spawnSync(process.execPath, [entry, 'knowledge-step', '--input', input, '--output', output, '--state-dir', stateDir], { encoding: 'utf8' });
  const envelope = JSON.parse(processResult.stdout);
  assert.equal(processResult.status, expectedStatus, JSON.stringify(envelope.errors));
  return { state: await loadState(stateDir), data: envelope.data, errors:envelope.errors };
}

async function fixtureRegistry() {
  const source = resolve('assets/algorithm-knowledge'), catalog = JSON.parse(await readFile(join(source, 'catalog.json'), 'utf8')), manifest = JSON.parse(await readFile(join(source, catalog.dependency_manifest_path), 'utf8')), byId = new Map(manifest.dependencies.map(item => [item.dependency_id, item])), activeRules = new Set(catalog.rule_version_refs), dependencyIds = new Set(), ruleRefs = [];
  for (const entry of catalog.files.filter(item => item.kind === 'operational_rule')) { const rule = JSON.parse(await readFile(join(source, entry.path), 'utf8')); if (!activeRules.has(rule.rule_version_id) || rule.dependency_ids.some(ref => byId.get(ref)?.source_visibility !== 'public')) continue; ruleRefs.push(rule.rule_version_id); for (const ref of rule.dependency_ids) dependencyIds.add(ref); }
  return { dependencies: manifest.dependencies.filter(item => dependencyIds.has(item.dependency_id)), ruleRefs };
}

async function writeFixtureSources(checkout, dependencies) {
  const source = resolve('assets/algorithm-knowledge'), hashes = new Map();
  for (const dependency of dependencies) { const evidencePath = dependency.dependency_id === 'scorer:compute_weighted_score' ? 'source-snapshots/review-excerpts/scorer_compute_weighted_score.txt' : dependency.evidence_material_path, bytes = await readFile(join(source, evidencePath)), path = join(checkout, dependency.path); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes); hashes.set(dependency.path, sha(bytes)); }
  return hashes;
}

function narrowCurrentKnowledge(state, registry, materialHashes, priorHead) {
  const event = Object.values(state.knowledge_events).find(item => item.event_type === 'activated'), catalog = state.knowledge_catalogs[event.catalog_ref], ids = new Set(registry.dependencies.map(item => item.dependency_id));
  catalog.dependencies = registry.dependencies.map(item => ({ ...item, material_hash: materialHashes.get(item.path) })); catalog.rule_version_refs = registry.ruleRefs; catalog.dependency_manifest_hash = canonicalHash(catalog.dependencies); catalog.upstream.commit = priorHead; catalog.coverage = { ...catalog.coverage, reviewed_dependency_count: catalog.dependencies.length, unreviewed_public_dependency_ids: [], external_unpublished_dependency_ids: [] }; catalog.catalog_content_hash = catalogContentHash(catalog, catalog.dependencies);
  event.observed_head_commit = priorHead; event.gaps = event.gaps.filter(ref => ids.has(ref));
}

async function candidatePackage(root, commit, registry, materialHashes, { removedDependencyId = null, removeReferencingRules = false, suffix = '' } = {}) {
  const source = resolve('assets/algorithm-knowledge'), target = join(root, `candidate-package${suffix}`);
  await cp(source, target, { recursive: true });
  const catalogPath = join(target, 'catalog.json'), catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  catalog.catalog_id = `x-algorithm-candidate-v5-fixture${suffix}`; catalog.catalog_version = '1.2.0'; catalog.upstream.commit = commit;
  const dependenciesPath = join(target, catalog.dependency_manifest_path), dependencies = JSON.parse(await readFile(dependenciesPath, 'utf8'));
  dependencies.dependencies = dependencies.dependencies.filter(item => registry.dependencies.some(selected => selected.dependency_id === item.dependency_id) && item.dependency_id !== removedDependencyId).map(item => ({ ...item, material_hash: materialHashes.get(item.path) }));
  const changed = dependencies.dependencies.find(item => item.dependency_id === 'scorer:compute_weighted_score');
  changed.review_note = 'Fixture review of the actual committed scoring source, with inherited rules and facts retained at their historical pins.';
  changed.caller_refs=[];
  changed.evidence_material_path='source-snapshots/review-excerpts/scorer_compute_weighted_score.txt';
  changed.evidence_content_hash=sha(await readFile(join(target,changed.evidence_material_path)));
  const dependencyBytes = Buffer.from(`${JSON.stringify(dependencies, null, 2)}\n`); await writeFile(dependenciesPath, dependencyBytes);
  catalog.files.find(item => item.path === catalog.dependency_manifest_path).sha256 = sha(dependencyBytes);
  catalog.dependencies = dependencies.dependencies; catalog.rule_version_refs = registry.ruleRefs;
  if (removeReferencingRules && removedDependencyId) {
    const referencing = new Set();
    for (const entry of catalog.files.filter(item => item.kind === 'operational_rule')) { const rule = JSON.parse(await readFile(join(target, entry.path), 'utf8')); if (rule.dependency_ids.includes(removedDependencyId)) referencing.add(rule.rule_version_id); }
    catalog.rule_version_refs = catalog.rule_version_refs.filter(ref => !referencing.has(ref));
  }
  catalog.dependency_manifest_hash = canonicalHash(dependencies.dependencies);
  catalog.coverage = { ...catalog.coverage, reviewed_dependency_count: catalog.dependencies.length, unreviewed_public_dependency_ids: [], external_unpublished_dependency_ids: [] };
  const eventPath = join(target, catalog.activation_event_path), event = JSON.parse(await readFile(eventPath, 'utf8'));
  event.event_id = 'candidate-event-v5-fixture'; event.event_type = 'candidate_update'; event.catalog_ref = catalog.catalog_id; event.observed_head_commit = commit; event.gaps = event.gaps.filter(ref => catalog.dependencies.some(item => item.dependency_id === ref));
  const eventBytes = Buffer.from(`${JSON.stringify(event, null, 2)}\n`); await writeFile(eventPath, eventBytes);
  const eventEntry=catalog.files.find(item=>item.path===catalog.activation_event_path);if(eventEntry)eventEntry.sha256=sha(eventBytes);
  catalog.catalog_content_hash = catalogContentHash(catalog, catalog.dependencies);
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return { target, catalog };
}

async function hostReceipt(dir, { receipt_id, subject_ref, subject_hash, reviewed_payload }) {
  const reviewed_at = new Date().toISOString(), actual = { purpose: 'review_knowledge', subject_ref, subject_hash, subject_content_hash: subject_hash, decision: 'approved', checks: { complete: true, exact_subject: true }, issues: [], reviewer: 'fixture-independent-reviewer', generator_ref: 'fixture-generator', reviewed_at, reviewed_payload };
  const path = join(dir, `${receipt_id}.json`), bytes = Buffer.from(`${JSON.stringify(actual, null, 2)}\n`); await writeFile(path, bytes);
  return { contract_version: 5, receipt_id, purpose: actual.purpose, subject_ref, subject_hash, subject_content_hash: subject_hash, actual_result_ref: path, actual_result_sha256: sha(bytes), actual_result_hash: subject_hash, decision: actual.decision, checks: actual.checks, issues: [], reviewer: actual.reviewer, generator_ref: actual.generator_ref, data_mode: 'fixture', reviewed_at, tool_name: 'fixture-review', host_call_ref: `host-call:${receipt_id}` };
}

async function approveProposal(root, stateDir, proposal, suffix) {
  const proposalBase = Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== 'proposal_hash')), proposalReceipt = await hostReceipt(root, { receipt_id: `proposal-review-${suffix}`, subject_ref: proposal.proposal_id, subject_hash: proposal.proposal_hash, reviewed_payload: proposalBase }), replayResults = [], replayReceipts = [];
  for (const ref of proposal.affected_rule_version_refs) { const base = { contract_version: 5, replay_id: `replay-${suffix}-${ref}`, proposal_ref: proposal.proposal_id, rule_version_ref: ref, subject_hash: proposal.proposal_hash, status: 'passed', cases: ['applicable', 'not_applicable', 'unknown'].map(expected => ({ case_id: `${suffix}-${ref}-${expected}`, expected, actual: expected, status: 'passed' })) }, result = { ...base, replay_result_hash: knowledgeReplayResultHashV5(base), review_ref: `review-${suffix}-${ref}` }; replayResults.push(result); replayReceipts.push(await hostReceipt(root, { receipt_id: result.review_ref, subject_ref: result.replay_id, subject_hash: result.replay_result_hash, reviewed_payload: base })); }
  const state = await loadState(stateDir); await commitState(stateDir, state.revision, working => { for (const receipt of [proposalReceipt, ...replayReceipts]) putImmutable(working.host_media_receipts, receipt.receipt_id, receipt); return working; });
  return { proposalReceipt, replayResults };
}

test('knowledge-step V5 auto-checks registered paths and blocks unreviewed repository changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-knowledge-cli-')), checkout = join(root, 'checkout'), stateDir = join(root, 'state');
  await Promise.all([mkdir(checkout), mkdir(stateDir)]);
  git(checkout, ['init']); git(checkout, ['config', 'user.email', 'fixture@example.com']); git(checkout, ['config', 'user.name', 'Fixture']); git(checkout, ['remote', 'add', 'origin', 'https://github.com/xai-org/x-algorithm.git']);
  const remote=join(root,'remote.git');git(checkout,['init','--bare',remote]);git(checkout,['config',`url.${remote}.insteadOf`,'https://github.com/xai-org/x-algorithm.git']);
  const registry = await fixtureRegistry(), materialHashes = await writeFixtureSources(checkout, registry.dependencies); git(checkout, ['add', '.']); git(checkout, ['commit', '-m', 'prior']); const priorHead = git(checkout, ['rev-parse', 'HEAD']); await writeFile(join(checkout, 'tracked.rs'), 'candidate\n'); git(checkout, ['add', '.']); git(checkout, ['commit', '-m', 'candidate']);git(checkout,['push','origin','HEAD:master']);git(checkout,['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/master']);
  const head = git(checkout, ['rev-parse', 'HEAD']), candidate = await candidatePackage(root, head, registry, materialHashes);
  const initialized = initializeState(createDefaultConfig({ handle: 'fixture_knowledge5', profile_url: 'https://x.com/fixture_knowledge5', user_id: null, identity_basis: 'user_provided' }));
  narrowCurrentKnowledge(initialized, registry, materialHashes, priorHead);
  let state = await commitState(stateDir, 0, () => initialized);

  let response = await call(stateDir, { contract_version: 5, operation: 'check', checkout_dir: checkout, paths: ['tracked.rs'] });
  state = response.state; const successfulCheck = response.data.check;
  assert.equal(successfulCheck.status, 'changed');
  assert.equal(successfulCheck.inventory_scope, 'full_repository');
  assert.deepEqual(successfulCheck.repository_diff, [{ path: 'tracked.rs', change: 'A' }]);
  for (const dep of registry.dependencies) assert.ok(successfulCheck.files.some(file => file.path === dep.path));
  response = await call(stateDir, { contract_version: 5, operation: 'propose-update', package_dir: candidate.target, check_ref: successfulCheck.check_id });
  const proposal = response.data.proposal;
  assert.ok(proposal.gaps.includes('path:tracked.rs'));
  assert.deepEqual(proposal.unreviewed_paths, ['tracked.rs']);
  assert.ok(proposal.affected_rule_version_refs.length > 0);
  const approval = await approveProposal(root, stateDir, proposal, 'unreviewed'), before = await loadState(stateDir);
  response = await call(stateDir, { contract_version: 5, operation: 'activate-update', proposal_ref: proposal.proposal_id, candidate_catalog_ref: candidate.catalog.catalog_id, review_receipt_ref: approval.proposalReceipt.receipt_id, replay_results: approval.replayResults }, 4);
  assert.equal(response.errors[0].code, 'MISSING_EVIDENCE');
  assert.equal(response.errors[0].path, '/gaps');
  assert.equal(response.state.revision, before.revision);
  assert.equal(knowledgeBundleFromState(response.state).catalog.catalog_id, proposal.prior_catalog_ref);
  response = await call(stateDir, { contract_version: 5, operation: 'check', checkout_dir: join(root, 'missing'), paths: ['tracked.rs'] });
  assert.equal(response.data.check.status, 'check_failed');
  assert.equal(response.data.last_successful_checked_at, successfulCheck.checked_at);

});

test('knowledge-step V5 rejects dangling references and retains deleted-path review gaps', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-knowledge-delete-cli-')), checkout = join(root, 'checkout'), stateDir = join(root, 'state');
  await Promise.all([mkdir(checkout), mkdir(stateDir)]);
  git(checkout, ['init']); git(checkout, ['config', 'user.email', 'fixture@example.com']); git(checkout, ['config', 'user.name', 'Fixture']); git(checkout, ['remote', 'add', 'origin', 'https://github.com/xai-org/x-algorithm.git']);
  const remote=join(root,'remote.git');git(checkout,['init','--bare',remote]);git(checkout,['config',`url.${remote}.insteadOf`,'https://github.com/xai-org/x-algorithm.git']);
  const registry = await fixtureRegistry(), materialHashes = await writeFixtureSources(checkout, registry.dependencies); git(checkout, ['add', '.']); git(checkout, ['commit', '-m', 'prior']); const priorHead = git(checkout, ['rev-parse', 'HEAD']);
  const removed = registry.dependencies.find(item => item.dependency_id !== 'scorer:compute_weighted_score'); assert.ok(removed);
  await rm(join(checkout, removed.path)); git(checkout, ['add', '-A']); git(checkout, ['commit', '-m', 'delete registered dependency']);git(checkout,['push','origin','HEAD:master']);git(checkout,['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/master']);
  const head = git(checkout, ['rev-parse', 'HEAD']), invalidCandidate = await candidatePackage(root, head, registry, materialHashes, { removedDependencyId: removed.dependency_id, suffix: '-invalid' }), legalCandidate = await candidatePackage(root, head, registry, materialHashes, { removedDependencyId: removed.dependency_id, removeReferencingRules: true, suffix: '-legal' });
  const initialized = initializeState(createDefaultConfig({ handle: 'fixture_knowledge_delete', profile_url: 'https://x.com/fixture_knowledge_delete', user_id: null, identity_basis: 'user_provided' }));
  narrowCurrentKnowledge(initialized, registry, materialHashes, priorHead); await commitState(stateDir, 0, () => initialized);

  const registeredPaths = [...new Set(registry.dependencies.map(item => item.path))];
  let response = await call(stateDir, { contract_version: 5, operation: 'check', checkout_dir: checkout, paths: registeredPaths });
  const successfulCheck = response.data.check; assert.equal(successfulCheck.files.find(item => item.path === removed.path).status, 'deleted');
  const beforeRejectedProposal = response.state, activeBefore = knowledgeBundleFromState(beforeRejectedProposal).catalog.catalog_id;
  const rejected = await call(stateDir, { contract_version: 5, operation: 'propose-update', package_dir: invalidCandidate.target, check_ref: successfulCheck.check_id }, 2);
  assert.equal(rejected.errors[0].code, 'INVALID_EVIDENCE_REF'); assert.match(rejected.errors[0].message, /unsupported dependency/); assert.equal(rejected.state.revision, beforeRejectedProposal.revision); assert.equal(knowledgeBundleFromState(rejected.state).catalog.catalog_id, activeBefore); assert.equal(rejected.state.knowledge_catalogs[invalidCandidate.catalog.catalog_id], undefined);

  response = await call(stateDir, { contract_version: 5, operation: 'propose-update', package_dir: legalCandidate.target, check_ref: successfulCheck.check_id });
  const proposal = response.data.proposal; assert.ok(proposal.dependency_diff.removed.includes(removed.dependency_id)); assert.ok(proposal.affected_rule_version_refs.length > 0);
  const approval = await approveProposal(root, stateDir, proposal, 'legal-delete');
  assert.ok(proposal.unreviewed_paths.includes(removed.path));
  assert.ok(proposal.gaps.includes(`path:${removed.path}`));
  const beforeActivation = await loadState(stateDir);
  response = await call(stateDir, { contract_version: 5, operation: 'activate-update', proposal_ref: proposal.proposal_id, candidate_catalog_ref: legalCandidate.catalog.catalog_id, review_receipt_ref: approval.proposalReceipt.receipt_id, replay_results: approval.replayResults }, 4);
  assert.equal(response.errors[0].code, 'MISSING_EVIDENCE');
  assert.equal(response.errors[0].path, '/gaps');
  assert.equal(response.state.revision, beforeActivation.revision);
  assert.equal(knowledgeBundleFromState(response.state).catalog.catalog_id, activeBefore);

});
