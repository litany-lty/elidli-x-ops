import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAlgorithmResearch } from '../scripts/lib/knowledge-research.mjs';
import { dispatchKnowledgeV5 } from '../scripts/lib/knowledge-dispatch-v5.mjs';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { initializeState } from '../scripts/lib/state.mjs';
import { canonicalHash } from '../scripts/lib/contracts.mjs';

test('current research keeps three source-bound categories and disabled experiments distinct', () => {
  const research = loadAlgorithmResearch();
  assert.equal(research.upstream.commit, 'b220448766ab4ee4c83d58a67d51f0cb5bda86c2');
  assert.deepEqual([...new Set(research.rules.map(rule => rule.category))].sort(), ['account_and_context', 'demotion', 'distribution_opportunity']);
  assert.equal(research.status, 'source_reviewed_editorial_scope_activated');
  assert.equal(research.coverage.scope, 'reviewed_public_diff');
  assert.deepEqual(research.coverage.unreviewed_changed_paths, []);
  assert.equal(research.rules.length, 38);
  for (const rule of research.rules) {
    assert.ok(rule.code_behavior && rule.operational_inference && rule.activation_status);
    assert.ok(rule.source_refs.length && rule.preconditions.length && rule.not_proven.length);
  }
});

test('research operation returns both commits without changing operational state', async () => {
  const state = initializeState(createDefaultConfig({ handle: 'fixture_research', profile_url: 'https://x.com/fixture_research', user_id: null, identity_basis: 'user_provided' }));
  const before = JSON.stringify(state);
  const result = await dispatchKnowledgeV5({ expected_revision: state.revision, payload: { contract_version: 5, operation: 'research' } }, '/unused-for-read-only-research', state);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.data.operational_commit, 'b220448766ab4ee4c83d58a67d51f0cb5bda86c2');
  assert.equal(result.data.alignment, 'same_commit');
  assert.equal(result.data.operational_execution_scope, 'editorial_only');
  assert.equal(result.data.production_mechanism_status, 'unknown');
});

test('research rejects a changed source excerpt and future-dated use', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-research-'));
  await cp(new URL('../assets/algorithm-knowledge/research', import.meta.url), join(root, 'research'), { recursive: true });
  const manifest = JSON.parse(await readFile(join(root, 'research/current.json'), 'utf8'));
  const path = join(root, manifest.sources[0].material_path);
  await writeFile(path, `${await readFile(path, 'utf8')}\nchanged`);
  assert.throws(() => loadAlgorithmResearch(root), /Source material changed/);
  assert.throws(() => loadAlgorithmResearch(undefined, { now: '2026-01-01T00:00:00Z' }), /not available/);
});

test('crosschecked revision keeps archived evidence and source-bound runtime conditions', async () => {
  const research = loadAlgorithmResearch();
  assert.equal(research.research_revision, '2026-11-04-editorial-release-v4');
  assert.equal(research.supersedes_content_hash, 'e5a5389d60c1607e98db52305978bff9cbbe8bde02689b104b800eeacb0c59e6');
  const prior = JSON.parse(await readFile(new URL(`../assets/algorithm-knowledge/research/history/${research.supersedes_content_hash}.json`, import.meta.url), 'utf8'));
  const { content_hash, ...content } = prior;
  assert.equal(canonicalHash(content), content_hash);
  assert.equal(prior.rules.length, 38);
  const bindings = new Map(research.runtime_bindings.map(binding => [binding.binding_id, binding]));
  for (const id of ['home_vm_value_model', 'home_vm_new_user_oon', 'home_vf_action_consumption', 'vm_dpp_gates', 'home_page_experiments']) {
    assert.equal(bindings.get(id)?.production_status, 'unknown');
    assert.ok(bindings.get(id).source_refs.length);
    assert.ok(research.rules.some(rule => rule.runtime_binding_refs.includes(id)));
  }
  assert.equal(bindings.get('home_vm_value_model').declared_defaults.ComputeValueModel, false);
  assert.equal(bindings.get('home_vm_value_model').request_fields.compute_value_model, true);
  assert.equal(bindings.get('home_vm_new_user_oon').request_fields.viewer_following_count, null);
  assert.equal(bindings.get('home_vm_new_user_oon').declared_defaults.NEW_USER_MIN_FOLLOWING, 5);
  const actions = bindings.get('home_vf_action_consumption').request_fields.actions_mapping;
  assert.equal(actions.Downrank, 'keep'); assert.equal(actions.Avoid, 'keep');
  assert.equal(actions.NotEvaluated, 'remove'); assert.equal(actions.missing, 'keep');
  assert.deepEqual(bindings.get('vm_dpp_gates').declared_defaults, { dpp_enabled: false, DppEnabled: true, TopicDppEnabled: false });
  assert.deepEqual(bindings.get('home_page_experiments').declared_defaults, { EnablePageDecodeRerank: false, EnablePageRlExploration: false });
  for (const id of ['research-05', 'research-06']) assert.ok(research.rules.find(rule => rule.rule_id === id).runtime_binding_refs.includes('home_vm_value_model'));
});

test('crosschecked research rejects missing runtime references and changed history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-runtime-binding-'));
  await cp(new URL('../assets/algorithm-knowledge/research', import.meta.url), join(root, 'research'), { recursive: true });
  const path = join(root, 'research/current.json'), original = JSON.parse(await readFile(path, 'utf8'));
  const research = structuredClone(original);
  research.rules[0].runtime_binding_refs = ['missing-runtime-binding'];
  const { content_hash, ...content } = research;
  research.content_hash = canonicalHash(content);
  await writeFile(path, JSON.stringify(research));
  assert.throws(() => loadAlgorithmResearch(root), /Missing runtime binding/);
  await writeFile(path, JSON.stringify(original));
  const historyPath = join(root, 'research/history', `${original.supersedes_content_hash}.json`);
  const prior = JSON.parse(await readFile(historyPath, 'utf8'));
  prior.rules[0].code_behavior = 'changed historical evidence';
  await writeFile(historyPath, JSON.stringify(prior));
  assert.throws(() => loadAlgorithmResearch(root), /Previous research manifest changed/);
});

test('completed public diff research requires its exact ledger', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-diff-ledger-'));
  await cp(new URL('../assets/algorithm-knowledge/research', import.meta.url), join(root, 'research'), { recursive: true });
  const research = JSON.parse(await readFile(join(root, 'research/current.json'), 'utf8'));
  const ledgerPath = join(root, research.coverage.diff_review_ref.path);
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.equal(ledger.entries.length, 248);
  ledger.entries.pop();
  await writeFile(ledgerPath, JSON.stringify(ledger));
  assert.throws(() => loadAlgorithmResearch(root), /immutable public-diff review/);
});


test('editorial release metadata cannot promote unknown production mechanics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xops-editorial-research-'));
  await cp(new URL('../assets/algorithm-knowledge/research', import.meta.url), join(root, 'research'), { recursive: true });
  const path = join(root, 'research/current.json'), manifest = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(manifest.operational_release.execution_scope, 'editorial_only');
  manifest.operational_release.mechanism_status = 'activated';
  const { content_hash, ...content } = manifest;
  manifest.content_hash = canonicalHash(content);
  await writeFile(path, JSON.stringify(manifest));
  assert.throws(() => loadAlgorithmResearch(root), /unknown mechanism status/);
});
