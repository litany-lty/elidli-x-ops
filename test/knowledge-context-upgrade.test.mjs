import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { buildRuleContextV5, buildSignalSetV5, validateRuleApplicationV5, applicationProposalHash } from '../scripts/lib/knowledge.mjs';
import { ruleContextCompatibleV5 } from '../scripts/lib/v5-dispatch.mjs';
import { loadLegacyKnowledgeCatalog } from './helpers/legacy-knowledge-fixture.mjs';

const T = '2026-10-27T05:00:00.000Z';

test('runtime scope upgrade invalidates old saved V5 context without changing its catalog; a fresh selection is usable', () => {
  const bundle = loadLegacyKnowledgeCatalog({ now: T });
  const rule = Object.values(bundle.rules).find(rule => rule.rule_id === 'OP01');
  const subject = { ref: 'fixture-upgrade:1', content_hash: canonicalHash('测试正文'), texts: ['测试正文'], format: 'short_post', post_type: 'original', surface: 'for_you', media: [], full_text: true, read_status: 'read', source_refs: ['fixture-upgrade:1'], observed_at: T };
  const base = { assessment_id: 'fixture-benefit', signal: 'reader_benefit_clear', value: false, unit: 'flag', subject_ref: subject.ref, subject_hash: subject.content_hash, source_refs: [subject.ref], locator: 'texts/0' };
  const semantic = { ...base, assessment_hash: canonicalHash(base), review_receipt_ref: 'fixture-review', reviewed_at: T };
  const signal_set = buildSignalSetV5({ subject, cutoff: T, semantic_evidence: [semantic], actual_reviews: [{ receipt_id: semantic.review_receipt_ref, purpose: 'review_signals', subject_ref: subject.ref, subject_hash: subject.content_hash, actual_result_hash: semantic.assessment_hash, decision: 'approved', reviewed_at: T }] });
  const input = { run_id: 'before-runtime-upgrade', intent: 'draft', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance', surface: subject.surface, post_type: subject.post_type, subject_ref: subject.ref, subject_hash: subject.content_hash, cutoff: T, explicit_rule_version_refs: [rule.rule_version_id], signal_set };
  const selected = buildRuleContextV5(input, bundle);
  // Model the persisted pre-scope contract exactly: direct dependencies, no new
  // execution_scope / unresolved_dependencies fields, and its original hash.
  const saved = structuredClone(selected);
  for (const selection of saved.selections) {
    delete selection.execution_scope; delete selection.unresolved_dependencies;
    selection.dependency_ids = [...bundle.rules[selection.rule_version_ref].dependency_ids];
  }
  saved.selected_dependency_hashes = Object.fromEntries([...new Set(saved.selections.flatMap(s => s.dependency_ids))].sort().map(ref => [ref, canonicalHash(bundle.dependencies.find(d => d.dependency_id === ref))]));
  delete saved.selected_rule_context_hash;
  saved.selected_rule_context_hash = canonicalHash(saved);
  const savedBytes = JSON.stringify(saved);
  assert.equal(saved.catalog_ref, bundle.catalog.catalog_id);
  assert.equal(saved.catalog_content_hash, bundle.catalog.catalog_content_hash);
  assert.equal(ruleContextCompatibleV5(saved, bundle), false, 'old guidance must be reviewed again, not silently treated as scope-checked');

  const application = context => {
    const app = { contract_version: 5, application_id: `application-${context.run_id}`, context_ref: context.context_id, selected_rule_context_hash: context.selected_rule_context_hash, subject_ref: subject.ref, actual_input_hash: subject.content_hash, rule_version_refs: [rule.rule_version_id], checks: [{ check_id: 'benefit', check_type: 'semantic', status: 'applicable', reviewed_input_hash: subject.content_hash, review_ref: semantic.review_receipt_ref, inspected_refs: [subject.ref], finding: 'Fixture review confirms missing reader benefit' }], findings: [], actions: [{ action_id: 'clarify-benefit', rule_version_ref: rule.rule_version_id, disposition: 'modify', text: '说明读者收益', deliverable_refs: [subject.ref], basis_kind: 'editorial_inference', supporting_check_refs: ['benefit'], signal_refs: ['reader_benefit_clear'] }], keep_unchanged_reason: null, validation_plan: '核对编辑建议；交付仍须独立审核', deliverable_refs: [subject.ref] };
    return { ...app, application_proposal_hash: applicationProposalHash(app) };
  };
  assert.throws(() => validateRuleApplicationV5(application(saved), saved, bundle), error => error.code === 'STALE_BUNDLE');
  const refreshed = buildRuleContextV5({ ...input, run_id: 'after-runtime-upgrade' }, bundle);
  assert.notEqual(refreshed.context_id, saved.context_id, 'use a new run, retaining immutable prior context');
  assert.equal(ruleContextCompatibleV5(refreshed, bundle), true);
  assert.doesNotThrow(() => validateRuleApplicationV5(application(refreshed), refreshed, bundle));
  assert.equal(JSON.stringify(saved), savedBytes, 'upgrading neither rewrites nor deletes prior evidence');
});
