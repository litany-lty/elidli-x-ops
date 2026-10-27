import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

async function candidatePackage(root, commit) {
  const source = resolve('assets/algorithm-knowledge'), target = join(root, 'candidate-package');
  await cp(source, target, { recursive: true });
  const catalogPath = join(target, 'catalog.json'), catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  catalog.catalog_id = 'x-algorithm-candidate-v5-fixture'; catalog.catalog_version = '1.2.0'; catalog.upstream.commit = commit;
  const dependenciesPath = join(target, catalog.dependency_manifest_path), dependencies = JSON.parse(await readFile(dependenciesPath, 'utf8'));
  const changed = dependencies.dependencies.find(item => item.dependency_id === 'scorer:compute_weighted_score');
  changed.review_note = 'Fixture review of the actual committed scoring source, with inherited rules and facts retained at their historical pins.';
  changed.caller_refs=[];
  changed.evidence_material_path='source-snapshots/review-excerpts/scorer_compute_weighted_score.txt';
  changed.evidence_content_hash=sha(await readFile(join(target,changed.evidence_material_path)));
  changed.material_hash=changed.evidence_content_hash;
  const dependencyBytes = Buffer.from(`${JSON.stringify(dependencies, null, 2)}\n`); await writeFile(dependenciesPath, dependencyBytes);
  catalog.files.find(item => item.path === catalog.dependency_manifest_path).sha256 = sha(dependencyBytes);
  catalog.dependencies = dependencies.dependencies; catalog.dependency_manifest_hash = canonicalHash(dependencies.dependencies);
  const eventPath = join(target, catalog.activation_event_path), event = JSON.parse(await readFile(eventPath, 'utf8'));
  event.event_id = 'candidate-event-v5-fixture'; event.event_type = 'candidate_update'; event.catalog_ref = catalog.catalog_id; event.observed_head_commit = commit;
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

test('knowledge-step V5 persists real checks, saved candidate proposal, reviewed replay and activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-knowledge-cli-')), checkout = join(root, 'checkout'), stateDir = join(root, 'state');
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([mkdir(checkout), mkdir(stateDir)]));
  git(checkout, ['init']); git(checkout, ['config', 'user.email', 'fixture@example.com']); git(checkout, ['config', 'user.name', 'Fixture']); git(checkout, ['remote', 'add', 'origin', 'https://github.com/xai-org/x-algorithm.git']);
  const remote=join(root,'remote.git');git(checkout,['init','--bare',remote]);git(checkout,['config',`url.${remote}.insteadOf`,'https://github.com/xai-org/x-algorithm.git']);
  await writeFile(join(checkout, 'tracked.rs'), 'candidate\n'); await import('node:fs/promises').then(({mkdir})=>mkdir(join(checkout,'xai-value-model'))); await writeFile(join(checkout,'xai-value-model/scoring.rs'),await readFile(resolve('assets/algorithm-knowledge/source-snapshots/review-excerpts/scorer_compute_weighted_score.txt'))); git(checkout, ['add', '.']); git(checkout, ['commit', '-m', 'candidate']);git(checkout,['push','origin','HEAD:master']);git(checkout,['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/master']);
  const head = git(checkout, ['rev-parse', 'HEAD']), candidate = await candidatePackage(root, head);
  const initialized = initializeState(createDefaultConfig({ handle: 'fixture_knowledge5', profile_url: 'https://x.com/fixture_knowledge5', user_id: null, identity_basis: 'user_provided' }));
  let state = await commitState(stateDir, 0, () => initialized);

  let response = await call(stateDir, { contract_version: 5, operation: 'check', checkout_dir: checkout, paths: ['tracked.rs'] });
  state = response.state; const incompleteCheck = response.data.check;
  const rejected=await call(stateDir,{contract_version:5,operation:'propose-update',package_dir:candidate.target,check_ref:incompleteCheck.check_id},4);assert.equal(rejected.errors[0].code,'MISSING_EVIDENCE');
  response=await call(stateDir,{contract_version:5,operation:'check',checkout_dir:checkout,paths:['xai-value-model/scoring.rs']});
  state=response.state;const successfulCheck=response.data.check;
  assert.equal(successfulCheck.status, 'changed'); assert.equal(successfulCheck.observed_head, head); assert.match(successfulCheck.files[0].sha256, /^[a-f0-9]{64}$/);
  response = await call(stateDir, { contract_version: 5, operation: 'check', checkout_dir: join(root, 'missing'), paths: ['tracked.rs'] });
  state = response.state; assert.equal(response.data.check.status, 'check_failed'); assert.equal(response.data.last_successful_checked_at, successfulCheck.checked_at);

  response = await call(stateDir, { contract_version: 5, operation: 'propose-update', package_dir: candidate.target, check_ref: successfulCheck.check_id });
  state = response.state; const proposal = response.data.proposal;
  assert.equal(state.knowledge_catalogs[candidate.catalog.catalog_id].catalog_content_hash, candidate.catalog.catalog_content_hash);
  assert.ok(proposal.affected_rule_version_refs.length > 0);

  const proposalBase = Object.fromEntries(Object.entries(proposal).filter(([key]) => key !== 'proposal_hash'));
  const proposalReceipt = await hostReceipt(root, { receipt_id: 'proposal-review', subject_ref: proposal.proposal_id, subject_hash: proposal.proposal_hash, reviewed_payload: proposalBase });
  const replayResults = [], replayReceipts = [];
  for (const ref of proposal.affected_rule_version_refs) {
    const base = { contract_version: 5, replay_id: `replay-${ref}`, proposal_ref: proposal.proposal_id, rule_version_ref: ref, subject_hash: proposal.proposal_hash, status: 'passed', cases: ['applicable', 'not_applicable', 'unknown'].map(expected => ({ case_id: `${ref}-${expected}`, expected, actual: expected, status: 'passed' })) };
    const result = { ...base, replay_result_hash: knowledgeReplayResultHashV5(base), review_ref: `review-${ref}` };
    replayResults.push(result); replayReceipts.push(await hostReceipt(root, { receipt_id: result.review_ref, subject_ref: result.replay_id, subject_hash: result.replay_result_hash, reviewed_payload: base }));
  }
  state = await commitState(stateDir, state.revision, working => {for (const receipt of [proposalReceipt, ...replayReceipts]) putImmutable(working.host_media_receipts, receipt.receipt_id, receipt); return working;});
  response = await call(stateDir, { contract_version: 5, operation: 'activate-update', proposal_ref: proposal.proposal_id, candidate_catalog_ref: candidate.catalog.catalog_id, review_receipt_ref: proposalReceipt.receipt_id, replay_results: replayResults });
  state = response.state;
  assert.equal(knowledgeBundleFromState(state).catalog.catalog_id, candidate.catalog.catalog_id);
  assert.deepEqual(response.data.event.affected_rule_version_refs, proposal.affected_rule_version_refs);
  for (const replay of replayResults) assert.deepEqual(state.knowledge_events[replay.replay_id], replay);
});
