import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogContentHash, loadKnowledgeCatalog, selectOperationalRules } from '../scripts/lib/knowledge.mjs';
import { initializeState } from '../scripts/lib/state.mjs';

test('active knowledge rejects synthetic future clock while errata mode preserves history as non-ready', () => {
  const syntheticBeforeReview = '2026-10-26T18:05:59Z';
  assert.throws(() => loadKnowledgeCatalog(undefined, { now: syntheticBeforeReview }), error => error.code === 'MISSING_EVIDENCE' && /after the actual clock/.test(error.message));
  const archived = loadKnowledgeCatalog(undefined, { now: syntheticBeforeReview, allowFutureForErrata: true });
  assert.equal(archived.temporal_readiness.status, 'not_ready');
  assert.throws(() => selectOperationalRules({ intent: 'review', goal: { primary_goal: 'relevant_reach' }, use: 'performance_review', signals: {} }, archived), error => error.code === 'MISSING_EVIDENCE' && /future-dated evidence/.test(error.message));
});

test('v4 seeds corrected active objects after exact historical ancestors', () => {
  const bundle = loadKnowledgeCatalog();
  assert.equal(bundle.catalog.catalog_id, 'x-algorithm-public-v4');
  assert.equal(bundle.temporal_readiness.status, 'ready');
  assert.deepEqual(Object.keys(bundle.history.facts).sort(), [
    'fact-c16-6258a1549ef8', 'fact-c17-6258a1549ef8',
    'fact-c18-6258a1549ef8', 'fact-c19-6258a1549ef8'
  ]);
  const state = initializeState({ account: { user_id: null, handle: 'time-audit-fixture' } }, 4);
  for (const fact of Object.values(bundle.facts).filter(item => item.supersedes)) {
    assert.deepEqual(state.rule_versions_v2[fact.supersedes], bundle.history.facts[fact.supersedes]);
    assert.deepEqual(state.rule_versions_v2[fact.rule_version_id], fact);
    assert.notEqual(fact.source_material_ref, bundle.history.facts[fact.supersedes].source_material_ref);
  }
  assert.equal(state.knowledge_catalogs[bundle.catalog.catalog_id].catalog_content_hash, bundle.catalog.catalog_content_hash);
  assert.deepEqual(state.knowledge_events[bundle.event.event_id], bundle.event);
});

test('v4 content hash excludes lifecycle bytes while archived v2 keeps its legacy hash', () => {
  const bundle = loadKnowledgeCatalog();
  const changedLifecycle = structuredClone(bundle.catalog);
  for (const file of changedLifecycle.files) if (file.kind === 'knowledge_event' || file.kind === 'historical_catalog') file.sha256 = 'f'.repeat(64);
  assert.equal(catalogContentHash(changedLifecycle, changedLifecycle.dependencies), bundle.catalog.catalog_content_hash);
  const v2 = JSON.parse(readFileSync(new URL('../assets/algorithm-knowledge/source-snapshots/catalogs/x-algorithm-public-v2.json', import.meta.url)));
  assert.equal(catalogContentHash(v2, v2.dependencies), v2.catalog_content_hash);
});
