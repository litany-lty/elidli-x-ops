import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { initializeState, commitState, loadState } from '../scripts/lib/state.mjs';
import { catalogContentHash, knowledgeBundleFromState } from '../scripts/lib/knowledge.mjs';
import { previewKnowledgeRollbackV5, rollbackKnowledgeV5 } from '../scripts/lib/knowledge-rollback.mjs';
import { dispatchKnowledgeV5 } from '../scripts/lib/knowledge-dispatch-v5.mjs';

const clock = new Date('2026-11-04T12:00:00Z');
function fixture({ legacyScope = false } = {}) {
  const state = initializeState(createDefaultConfig({ handle: 'rollback_fixture', profile_url: 'https://x.com/rollback_fixture', user_id: null, identity_basis: 'user_provided' }));
  // These isolated scope fixtures remain legacy even when the installed package changes.
  if (legacyScope) {
    for (const [id, value] of Object.entries(state.operational_rules)) { const rule = structuredClone(value); delete rule.execution_scope; state.operational_rules[id] = rule; }
    for (const [id, value] of Object.entries(state.knowledge_catalogs)) { const catalog = structuredClone(value); delete catalog.execution_scope; catalog.catalog_content_hash = catalogContentHash(catalog); state.knowledge_catalogs[id] = catalog; }
  }
  const old = knowledgeBundleFromState(state, { now: clock }), target = old.catalog.catalog_id;
  const catalog = { ...structuredClone(old.catalog), catalog_id: 'fixture-current' };
  state.knowledge_catalogs[catalog.catalog_id] = catalog;
  state.knowledge_events['fixture-activation'] = { ...structuredClone(old.event), event_id: 'fixture-activation', catalog_ref: catalog.catalog_id, prior_catalog_ref: target };
  return { state, target };
}
async function review(dir, state, target, overrides = {}) {
  const preview = previewKnowledgeRollbackV5(state, target, { clock });
  const actual = { purpose: 'review_knowledge', subject_ref: preview.subject_ref, subject_hash: preview.subject_hash, subject_content_hash: preview.subject_hash, decision: 'approved', checks: { exact: true }, issues: [], reviewer: 'fixture-independent-reviewer', generator_ref: 'fixture-generator', reviewed_at: '2026-11-01T00:00:00Z', reviewed_payload: preview.subject, ...overrides };
  const path = join(dir, 'actual.json'), bytes = Buffer.from(JSON.stringify(actual)); await writeFile(path, bytes);
  const receipt = { contract_version: 5, receipt_id: 'fixture-review', ...actual, actual_result_ref: path, actual_result_sha256: createHash('sha256').update(bytes).digest('hex'), actual_result_hash: preview.subject_hash, data_mode: 'fixture', tool_name: 'fixture-review', host_call_ref: 'fixture-host' };
  delete receipt.reviewed_payload;
  state.host_media_receipts[receipt.receipt_id] = receipt;
  return { preview, payload: { target_catalog_ref: target, review_receipt_ref: receipt.receipt_id } };
}

test('rollback appends a fresh identity, preserves old records, and can restore again', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rollback-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const { state, target } = fixture(), before = structuredClone(state), { payload, preview } = await review(dir, state, target);
  assert.equal(canonicalHash(preview.subject), preview.subject_hash);
  const result = await rollbackKnowledgeV5(state, payload, { clock });
  assert.notEqual(result.catalog.catalog_id, target);
  assert.equal(result.catalog.catalog_content_hash, before.knowledge_catalogs[target].catalog_content_hash);
  for (const [id, event] of Object.entries(before.knowledge_events)) assert.deepEqual(state.knowledge_events[id], event);
  for (const [id, catalog] of Object.entries(before.knowledge_catalogs)) assert.deepEqual(state.knowledge_catalogs[id], catalog);
  assert.equal(knowledgeBundleFromState(state, { now: clock }).catalog.catalog_id, result.catalog.catalog_id);
  assert.equal(result.event.rollback_target_catalog_ref, target);
  const second = await review(dir, state, target);
  const twice = await rollbackKnowledgeV5(state, second.payload, { clock });
  assert.notEqual(twice.catalog.catalog_id, result.catalog.catalog_id);
  assert.equal(knowledgeBundleFromState(state, { now: clock }).catalog.catalog_id, twice.catalog.catalog_id);
});

test('rollback denies unknown, never activated, current, ambiguous active and future history', () => {
  for (const kind of ['unknown', 'candidate', 'current', 'conflict', 'future']) {
    const { state, target } = fixture(); let ref = target;
    if (kind === 'unknown') ref = 'missing';
    if (kind === 'candidate') { ref = 'candidate'; state.knowledge_catalogs[ref] = { ...state.knowledge_catalogs[target], catalog_id: ref }; }
    if (kind === 'current') ref = 'fixture-current';
    if (kind === 'conflict') state.knowledge_events.extra = { ...state.knowledge_events['fixture-activation'], event_id: 'extra' };
    if (kind === 'future') state.knowledge_catalogs[target] = { ...state.knowledge_catalogs[target], created_at: '2099-01-01T00:00:00Z' };
    assert.throws(() => previewKnowledgeRollbackV5(state, ref, { clock }), undefined, kind);
  }
});

test('rollback rejects missing, mismatched, tampered, and future actual review without writes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rollback-review-')); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const kind of ['missing', 'mismatch', 'tamper', 'future', 'stale']) {
    const { state, target } = fixture();
    const { payload } = await review(dir, state, target, kind === 'mismatch' ? { subject_ref: 'another-subject' } : kind === 'future' ? { reviewed_at: '2099-01-01T00:00:00Z' } : {});
    if (kind === 'missing') delete state.host_media_receipts['fixture-review'];
    if (kind === 'tamper') await writeFile(join(dir, 'actual.json'), '{}');
    if (kind === 'stale') state.knowledge_events['fixture-activation'] = { ...state.knowledge_events['fixture-activation'], checked_at: '2026-11-04T11:00:00Z' };
    const before = canonicalHash(state);
    await assert.rejects(rollbackKnowledgeV5(state, payload, { clock }));
    assert.equal(canonicalHash(state), before, kind);
  }
});

test('rollback rejects damaged historical dependencies and missing facts', () => {
  for (const kind of ['dependency', 'fact']) {
    const { state, target } = fixture();
    if (kind === 'dependency') state.knowledge_catalogs[target] = { ...state.knowledge_catalogs[target], dependency_manifest_hash: '0'.repeat(64) };
    else delete state.rule_versions_v2[state.knowledge_catalogs[target].fact_version_refs[0]];
    assert.throws(() => previewKnowledgeRollbackV5(state, target, { clock }));
  }
});

test('rollback cannot widen an editorial-only active scope', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rollback-scope-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const { state, target } = fixture({ legacyScope: true });
  state.knowledge_catalogs['fixture-current'].execution_scope = 'editorial_only';
  state.knowledge_catalogs['fixture-current'].catalog_content_hash = catalogContentHash(state.knowledge_catalogs['fixture-current']);
  const { payload, preview } = await review(dir, state, target);
  const result = await rollbackKnowledgeV5(state, payload, { clock });
  assert.equal(result.catalog.execution_scope, 'editorial_only');
  assert.notEqual(result.catalog.catalog_content_hash, state.knowledge_catalogs[target].catalog_content_hash);
  assert.equal(preview.subject.restored_catalog_hash, result.catalog.catalog_content_hash);
  assert.equal(result.event.rollback_target_catalog_hash, state.knowledge_catalogs[target].catalog_content_hash);
});

test('rollback schemas reject unbound payloads and preview dispatch does not mutate', async () => {
  const { state, target } = fixture(), before = canonicalHash(state);
  assert.throws(() => validate('KnowledgeStepPayloadV5', { contract_version: 5, operation: 'rollback', target_catalog_ref: target }));
  const result = await dispatchKnowledgeV5({ payload: { contract_version: 5, operation: 'rollback-preview', target_catalog_ref: target } }, '/unused', state);
  assert.equal(result.data.rollback.subject.target_catalog_ref, target);
  assert.equal(canonicalHash(state), before);
});

 test('rollback dispatch commits one append-only transition and failed review commits nothing', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rollback-dispatch-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const { state, target } = fixture();
  const { payload } = await review(dir, state, target);
  const saved = await commitState(dir, 0, () => state);
  const before = canonicalHash(await loadState(dir));
  await assert.rejects(dispatchKnowledgeV5({ expected_revision: saved.revision, payload: { contract_version: 5, operation: 'rollback', ...payload, review_receipt_ref: 'missing' } }, dir, saved));
  assert.equal(canonicalHash(await loadState(dir)), before);
  const result = await dispatchKnowledgeV5({ expected_revision: saved.revision, payload: { contract_version: 5, operation: 'rollback', ...payload } }, dir, saved);
  assert.equal(result.state.revision, saved.revision + 1);
  assert.equal(knowledgeBundleFromState(await loadState(dir)).catalog.catalog_id, result.data.catalog.catalog_id);
});

for (const side of ['current', 'target']) test(`rollback preserves ${side} rule-only editorial scope`, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rollback-rule-scope-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const { state, target } = fixture({ legacyScope: true });
  const catalogRef = side === 'current' ? 'fixture-current' : target;
  const catalog = structuredClone(state.knowledge_catalogs[catalogRef]);
  const oldRef = catalog.rule_version_refs[0], newRef = `${oldRef}-scope-fixture`;
  state.operational_rules[newRef] = { ...structuredClone(state.operational_rules[oldRef]), rule_version_id: newRef, execution_scope: 'editorial_only' };
  catalog.rule_version_refs = catalog.rule_version_refs.map(ref => ref === oldRef ? newRef : ref);
  catalog.catalog_content_hash = catalogContentHash(catalog);
  state.knowledge_catalogs[catalogRef] = catalog;
  const before = structuredClone(state.knowledge_catalogs[target]);
  assert.equal(state.knowledge_catalogs['fixture-current'].execution_scope, undefined);
  assert.equal(state.knowledge_catalogs[target].execution_scope, undefined);
  const { payload, preview } = await review(dir, state, target);
  const result = await rollbackKnowledgeV5(state, payload, { clock });
  assert.equal(preview.subject.execution_scope, 'editorial_only');
  assert.equal(result.catalog.execution_scope, 'editorial_only');
  assert.equal(result.catalog.catalog_content_hash, preview.subject.restored_catalog_hash);
  assert.notEqual(result.catalog.catalog_content_hash, before.catalog_content_hash);
  assert.deepEqual(state.knowledge_catalogs[target], before);
});

test('rollback rejects self-review and blank reviewer or generator identities without writes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-rollback-independent-')); t.after(() => rm(dir, { recursive: true, force: true }));
  for (const overrides of [
    { reviewer: 'fixture-generator' },
    { reviewer: ' fixture-generator ' },
    { reviewer: '' }, { generator_ref: '' },
    { reviewer: '  ' }, { generator_ref: '  ' }
  ]) {
    const { state, target } = fixture();
    const { payload } = await review(dir, state, target, overrides);
    const before = canonicalHash(state);
    await assert.rejects(rollbackKnowledgeV5(state, payload, { clock }));
    assert.equal(canonicalHash(state), before);
  }
});
