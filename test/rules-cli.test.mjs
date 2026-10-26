import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { invoke } from './helpers/invoke.mjs';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig, resolveConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));
const { newId } = await import(runtimeUrl('scripts/lib/contracts.mjs'));
const bindingTemplate = JSON.parse(await readFile(new URL(runtimeUrl('assets/host-binding.codex-desktop.json')), 'utf8'));
const T = '2026-10-26T04:00:00Z';

test('RULES: a synthetic code update preserves old run rule identity and online uncertainty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rules-'));
  try {
    const config = createDefaultConfig({ handle: 'fixture_rules', profile_url: 'https://x.com/fixture_rules', user_id: null, identity_basis: 'user_provided' });
    config.news.core_topics = ['API tools'];
    invoke('record', { operation: 'initialize', data: config, as_of: T }, { stateDir: dir });
    const oldId = newId('rule_version');
    const nextId = newId('rule_version');
    const rule = { rule_version_id: oldId, source_commit: 'fixture-before', path_symbol: 'fixture/scoring.mjs::computeScore', read_source: 'fixture://explicit-rule-diff', execution_conditions: 'Only the synthetic fixture function, not live X', inference_boundary: 'Do not infer deployed settings or guaranteed reach', checked_at: T, supersedes: null };
    invoke('record', { operation: 'rule_version', data: rule, as_of: T }, { stateDir: dir });
    const binding = structuredClone(bindingTemplate);
    binding.data_mode = 'fixture';
    const initialized = invoke('news-step', { operation: 'init', request: { task_text: 'fixture API news', requested_at: T, scope_patch: null, requested_outputs: ['cards'], data_mode: 'fixture' }, effective_config: resolveConfig(config, null, T), binding }, { stateDir: dir });
    const runId = initialized.envelope.data.run.run_id;
    invoke('record', { operation: 'rule_version', data: { ...rule, rule_version_id: nextId, source_commit: 'fixture-after', checked_at: '2026-10-26T05:00:00Z', supersedes: oldId }, as_of: '2026-10-26T05:00:00Z' }, { stateDir: dir });
    const state = JSON.parse(await readFile(join(dir, 'account-state.json'), 'utf8'));
    assert.deepEqual(state.runs[runId].rule_version_ids, [oldId]);
    assert.equal(state.rule_versions[oldId].source_commit, 'fixture-before');
    assert.equal(state.rule_versions[nextId].supersedes, oldId);
    assert.match(state.rule_versions[nextId].inference_boundary, /Do not infer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
