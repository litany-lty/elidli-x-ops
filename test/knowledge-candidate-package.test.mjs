import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareKnowledgeCandidate } from '../scripts/prepare-knowledge-candidate.mjs';
import { loadKnowledgeCatalog } from '../scripts/lib/knowledge.mjs';
import { seedKnowledgeState } from '../scripts/lib/knowledge-state.mjs';

test('candidate materialization preserves all fact ancestors and never activates or overwrites', () => {
  const before = loadKnowledgeCatalog(), output = join(mkdtempSync(join(tmpdir(), 'xops-candidate-')), 'package');
  const result = prepareKnowledgeCandidate(output), bundle = loadKnowledgeCatalog(output);
  assert.equal(result.status, 'candidate_not_activated');
  assert.equal(bundle.event.event_type, 'candidate_update');
  assert.equal(Object.keys(bundle.facts).length, 30);
  assert.equal(Object.keys(bundle.history.facts).length, 34);
  assert.equal(bundle.catalog.change_review.entries.length, 248);
  const state = { rule_versions_v2: {} };
  seedKnowledgeState(state, bundle, { activate: false });
  assert.equal(Object.keys(state.rule_versions_v2).length, 64);
  for (const fact of Object.values(bundle.facts)) {
    assert.ok(state.rule_versions_v2[fact.supersedes]);
    const prior = state.rule_versions_v2[fact.supersedes];
    if (prior.supersedes) assert.ok(state.rule_versions_v2[prior.supersedes]);
  }
  assert.equal(Object.keys(state.knowledge_events).length, 0);
  assert.throws(() => prepareKnowledgeCandidate(output), /not be overwritten/);
  assert.equal(loadKnowledgeCatalog().catalog.catalog_content_hash, before.catalog.catalog_content_hash);
});
