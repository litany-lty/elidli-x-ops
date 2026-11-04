import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKnowledgeCatalog, selectOperationalRules, catalogContentHash, validateKnowledgeBundleIntegrity } from '../scripts/lib/knowledge.mjs';
import { ruleDependencyClosure, validateEditorialScope } from '../scripts/lib/knowledge-scope.mjs';

const fixture = () => {
  const b = structuredClone(loadKnowledgeCatalog());
  const rule = Object.values(b.rules).find(r => r.rule_id === 'OP02');
  b.rules = { [rule.rule_version_id]: rule };
  const input = { intent: 'draft', goal: '*', use: 'content', surface: 'home_for_you', post_type: 'original', signals: { internal_mechanism_observed: { value: true, unit: 'flag' } } };
  return { b, rule, input };
};

test('only approved rules can be selected', () => {
  const { b, rule, input } = fixture();
  for (const status of ['pending', 'rejected']) {
    rule.review_status = status;
    const r = selectOperationalRules(input, b);
    assert.equal(r.selected.length, 0);
    assert.equal(r.not_selected[0].reason, 'rule_not_approved');
  }
});

test('a transitive private dependency blocks mechanism claims and is included in provenance', () => {
  const { b, rule, input } = fixture();
  const direct = b.dependencies.find(d => d.dependency_id === rule.dependency_ids[0]);
  direct.missing_dependencies = ['external:deployment_configuration'];
  const r = selectOperationalRules(input, b).selected[0];
  assert.equal(r.mechanism_applicability.status, 'unknown');
  assert.ok(r.dependency_ids.includes('external:deployment_configuration'));
  assert.ok(r.unresolved_dependencies.includes('external:deployment_configuration'));
  direct.missing_dependencies = ['missing-unregistered-private-input'];
  assert.ok(ruleDependencyClosure(rule, b).unresolved_dependencies.includes('missing-unregistered-private-input'));
});

test('explicit editorial scope ignores supplied mechanism true and is integrity-bound', () => {
  const { b, rule, input } = fixture();
  const oldHash = catalogContentHash(b.catalog);
  b.catalog.execution_scope = 'editorial_only';
  assert.notEqual(catalogContentHash(b.catalog), oldHash);
  assert.equal(selectOperationalRules(input, b).selected[0].mechanism_applicability.status, 'unknown');
  assert.throws(() => validateEditorialScope(b, { requireExplicitRules: true }), /explicitly editorial/);
  rule.execution_scope = 'editorial_only'; rule.origin = 'editorial_practice';
  // Scope validation is also enforced before a scoped catalog can be activated.
  assert.doesNotThrow(() => validateEditorialScope(b));
  rule.editorial_predicate = { eq: { signal: 'internal_mechanism_observed', value: true, unit: 'flag' } };
  assert.throws(() => validateEditorialScope(b), /actual V5 extractor/);
});
