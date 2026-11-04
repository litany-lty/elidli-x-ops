import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { validateKnowledgeChangeReview } from '../scripts/lib/knowledge-change-review.mjs';
import { computeKnowledgeImpactV5 } from '../scripts/lib/knowledge-updates.mjs';
import { proposeKnowledgeUpdate, activateKnowledgeCatalog } from '../scripts/lib/knowledge.mjs';

const base = 'a'.repeat(40), target = 'b'.repeat(40), hash = 'c'.repeat(64);
function fixture() {
  const entries = [ ['settings.yaml', 'M'], ['deleted.rs', 'D'], ['added.rs', 'A'] ].map(([path, change]) => ({
    path, change, before_sha256: change === 'A' ? null : hash, after_sha256: change === 'D' ? null : hash,
    patch_sha256: hash, review_status: 'reviewed_public_diff', operational_disposition: 'bounded_known_behavior',
    summary: `Reviewed ${change} in ${path}`, impact: 'Public caller remains conditional; no production claim.', rule_refs: ['OP01'], unknowns: ['Production config'],
    evidence: [{ path, commit: change === 'D' ? base : target, line_start: 1, line_end: 2, reason: 'Changed branch and consumer reviewed.' }]
  }));
  const content = { version: 1, scope: 'public_changed_paths', base_commit: base, target_commit: target, entries, limitations: ['No private production configuration.'] };
  const review = { ...content, content_hash: canonicalHash(content) };
  const check = { status: 'changed', prior_head: base, observed_head: target, inventory_scope: 'full_repository', repository_diff: entries.map(({ path, change }) => ({ path, change })), files: [...entries.map(entry => ({ path: entry.path, commit: target, status: entry.change === 'D' ? 'deleted' : 'present', sha256: entry.after_sha256 })), { path: 'source.rs', commit: target, status: 'present', sha256: hash }] };
  const dep = { dependency_id: 'score', path: 'source.rs', caller_refs: ['settings.yaml'], material_hash: hash, source_visibility: 'public' };
  const current = { catalog: { upstream: { commit: base } }, dependencies: [dep], rules: { rule: { dependency_ids: ['score'] } } };
  const candidate = { ...current, catalog: { upstream: { commit: target }, change_review: review } };
  return { review, check, current, candidate };
}
const rehash = review => { const { content_hash, ...content } = review; review.content_hash = canonicalHash(content); };

test('an exact semantic ledger closes added/deleted/config paths without changing unknown production facts', () => {
  const { review, check, current, candidate } = fixture();
  assert.equal(validateKnowledgeChangeReview(review, { base, target, check }), review);
  const result = computeKnowledgeImpactV5(current, candidate, check);
  assert.deepEqual(result.unreviewed_paths, []);
  assert.deepEqual(result.impact_limitations, []);
  assert.deepEqual(result.dependency_diff.modified, ['score']);
  assert.deepEqual(result.affected_rule_version_refs, ['rule']);
  assert.deepEqual(review.entries[0].unknowns, ['Production config']);
  assert.equal(computeKnowledgeImpactV5(current, current, check).unreviewed_paths.length, 3);
});

test('hash-only, missing, stale and duplicate reviews do not close review gaps', () => {
  for (const change of [
    r => { r.entries[0].summary = ''; },
    r => { r.entries.pop(); },
    r => { r.entries[0].after_sha256 = 'd'.repeat(64); },
    r => { r.entries.push(r.entries[0]); },
    r => { r.target_commit = base; }
  ]) {
    const { review, check } = fixture(); change(review); rehash(review);
    assert.throws(() => validateKnowledgeChangeReview(review, { base, target, check }));
  }
});

test('a semantic blocker remains a gap despite complete inventory and exact hashes', () => {
  const { review, check, current, candidate } = fixture();
  review.entries[0].operational_disposition = 'blocked'; rehash(review);
  const result = computeKnowledgeImpactV5(current, candidate, check);
  assert.deepEqual(result.unreviewed_paths, ['settings.yaml']);
  assert.equal(result.impact_limitations[0].reason, 'caller_or_config_changed');
});

test('blocked source wins over revised reviewed metadata and semantic rule references still require replay', () => {
  const { review, check, current, candidate } = fixture();
  candidate.dependencies = [{ ...current.dependencies[0], path: 'settings.yaml', material_hash: hash, wiring_status: 'wired_reviewed' }];
  review.entries[0].operational_disposition = 'blocked'; rehash(review);
  assert.ok(computeKnowledgeImpactV5(current, candidate, check).unreviewed_paths.includes('settings.yaml'));
  const isolated = fixture();
  isolated.current.dependencies = []; isolated.candidate.dependencies = [];
  isolated.current.rules = { r: { rule_id: 'OP01', dependency_ids: [] } }; isolated.candidate.rules = isolated.current.rules;
  assert.deepEqual(computeKnowledgeImpactV5(isolated.current, isolated.candidate, isolated.check).affected_rule_version_refs, ['r']);
});

test('V4 cannot bypass changed-path checked-source review', () => {
  const { current, candidate } = fixture();
  assert.throws(() => proposeKnowledgeUpdate(current, candidate, {}), /V5 checked-source/);
  assert.throws(() => activateKnowledgeCatalog(current, { candidate_catalog: candidate.catalog }, {}), /V5 checked-source/);
});

test('reviewed deleted caller closes only when the candidate no longer references it', () => {
  const { current, candidate, check } = fixture();
  current.dependencies = [{ ...current.dependencies[0], caller_refs: ['deleted.rs'] }];
  candidate.dependencies = [{ ...current.dependencies[0], caller_refs: [] }];
  assert.deepEqual(computeKnowledgeImpactV5(current, candidate, check).impact_limitations, []);
  candidate.dependencies[0].caller_refs = ['deleted.rs'];
  assert.equal(computeKnowledgeImpactV5(current, candidate, check).impact_limitations[0].path, 'deleted.rs');
});
