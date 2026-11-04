import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { catalogContentHash, loadKnowledgeCatalog, knowledgeBundleFromState } from '../scripts/lib/knowledge.mjs';
import { seedKnowledgeState } from '../scripts/lib/knowledge-state.mjs';
import { previewKnowledgeRollbackV5 } from '../scripts/lib/knowledge-rollback.mjs';

const clock = new Date('2026-11-05T12:00:00Z');
const emptyState = () => ({ schema_version: 5, rule_versions_v2: {} });

async function packageFixture(t, { candidate = false, duplicate = false, cycle = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'xops-history-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(resolve('assets/algorithm-knowledge'), dir, { recursive: true });
  const old = loadKnowledgeCatalog(dir, { now: clock });
  const catalog = structuredClone(old.catalog);
  const writeRecord = async (path, data, kind) => {
    const bytes = Buffer.from(`${JSON.stringify(data, null, 2)}\n`); await writeFile(join(dir, path), bytes);
    const entry = { path, kind, sha256: createHash('sha256').update(bytes).digest('hex') };
    catalog.files = [...catalog.files.filter(item => item.path !== path), entry];
  };
  await writeRecord('history-fixture-catalog.json', old.catalog, 'historical_catalog');
  // Replace the known ancestor lifecycle, rather than inventing an approval in production.
  const ancestor = { ...old.event, ...(candidate ? { contract_version: 4, event_type: 'candidate_update' } : {}), ...(cycle ? { prior_catalog_ref: old.catalog.catalog_id } : {}) };
  if (candidate) delete ancestor.replay_result_refs;
  await writeRecord(old.catalog.activation_event_path, ancestor, 'knowledge_event');
  if (duplicate) await writeRecord('history-duplicate-event.json', { ...old.event, event_id: 'fixture-duplicate' }, 'knowledge_event');
  catalog.catalog_id = 'fixture-new-active';
  const event = { ...old.event, event_id: 'fixture-new-event', catalog_ref: catalog.catalog_id, prior_catalog_ref: old.catalog.catalog_id };
  catalog.activation_event_path = 'history-current-event.json';
  await writeRecord(catalog.activation_event_path, event, 'knowledge_event');
  catalog.catalog_content_hash = catalogContentHash(catalog);
  await writeFile(join(dir, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  return { dir, target: old.catalog.catalog_id, ancestorId: old.event.event_id };
}

test('fresh package seed retains connected historical activation for rollback preview', async t => {
  const { dir, target, ancestorId } = await packageFixture(t);
  const bundle = loadKnowledgeCatalog(dir, { now: clock });
  assert.ok(bundle.history.events[ancestorId]);
  const state = seedKnowledgeState(emptyState(), bundle);
  assert.equal(knowledgeBundleFromState(state, { now: clock }).catalog.catalog_id, bundle.catalog.catalog_id);
  const preview = previewKnowledgeRollbackV5(state, target, { clock });
  assert.equal(preview.subject.target_catalog_ref, target);
  assert.equal(preview.subject.target_activation_ref, ancestorId);
});

test('historical candidates never become activated and activate=false preserves event history', async t => {
  const { dir, ancestorId } = await packageFixture(t, { candidate: true });
  const bundle = loadKnowledgeCatalog(dir, { now: clock });
  assert.equal(bundle.history.events[ancestorId], undefined);
  const state = seedKnowledgeState(emptyState(), bundle);
  assert.deepEqual(Object.keys(state.knowledge_events), [bundle.event.event_id]);
  const unchanged = emptyState(); unchanged.knowledge_events = { sentinel: { event_type: 'fixture' } };
  const activePackage = await packageFixture(t);
  seedKnowledgeState(unchanged, loadKnowledgeCatalog(activePackage.dir, { now: clock }), { activate: false });
  assert.deepEqual(unchanged.knowledge_events, { sentinel: { event_type: 'fixture' } });
});

test('bundled legacy events outside the connected activation ancestry do not add active catalogs', () => {
  const bundle = loadKnowledgeCatalog(undefined, { now: clock }), state = seedKnowledgeState(emptyState(), bundle);
  assert.equal(state.knowledge_events['knowledge-event-public-v2'], undefined);
  assert.equal(state.knowledge_events['knowledge-event-bundled-v1'], undefined);
  assert.equal(knowledgeBundleFromState(state, { now: clock }).catalog.catalog_id, bundle.catalog.catalog_id);
  assert.ok(Object.values(state.knowledge_events).every(event => event.event_type === 'activated'));
});

test('ambiguous or cyclic historical activation ancestry is rejected', async t => {
  for (const options of [{ duplicate: true }, { cycle: true }]) {
    const { dir } = await packageFixture(t, options);
    assert.throws(() => loadKnowledgeCatalog(dir, { now: clock }), error => error.code === 'STATE_CONFLICT');
  }
});
