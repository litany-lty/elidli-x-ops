import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadAlgorithmResearch } from '../scripts/lib/knowledge-research.mjs';
import { dispatchKnowledgeV5 } from '../scripts/lib/knowledge-dispatch-v5.mjs';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { initializeState } from '../scripts/lib/state.mjs';

test('current research keeps three source-bound categories and disabled experiments distinct', () => {
  const research = loadAlgorithmResearch();
  assert.equal(research.upstream.commit, 'b220448766ab4ee4c83d58a67d51f0cb5bda86c2');
  assert.deepEqual([...new Set(research.rules.map(rule => rule.category))].sort(), ['account_and_context', 'demotion', 'distribution_opportunity']);
  assert.equal(research.status, 'source_reviewed_not_operationally_activated');
  assert.ok(research.coverage.unreviewed_changed_paths.length > 0);
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
  assert.equal(result.data.operational_commit, '2f252142b9284e692ac72851768c8072d045f0d5');
  assert.equal(result.data.alignment, 'research_newer_than_operational_catalog');
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
