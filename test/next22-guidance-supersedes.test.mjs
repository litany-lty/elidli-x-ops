import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { applicationProposalHash, buildRuleContextV4, loadKnowledgeCatalog } from '../scripts/lib/knowledge.mjs';
import { guidanceOutputContentHash, guidanceReviewSubjectHash, validateGuidanceReceipt } from '../scripts/lib/guidance.mjs';

function fixture() {
  const bundle = loadKnowledgeCatalog();
  const subject = { ref: 'draft:timefix:1', content_hash: canonicalHash('same corrected draft') };
  const context = buildRuleContextV4({
    run_id: 'run-timefix', intent: 'operational_optimize', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance',
    subject_ref: subject.ref, cutoff: '2026-10-26T18:10:00Z', personal_context_selection_ref: null,
    personal_context_selection_hash: null, personal_context_absence_reason: 'not_available', evidence_bundle_ref: null,
    evidence_bundle_hash: null, explicit_rule_version_refs: ['operational-op08-v3'], signals: {
      factual_sensitivity: { value: true, unit: 'flag' }, evidence_strength: { value: 'weak', unit: 'category' },
      actual_warning_present: { value: false, unit: 'flag' }, internal_mechanism_observed: { value: false, unit: 'flag' }
    }
  }, bundle);
  const application = {
    contract_version: 4, application_id: 'application-timefix', context_ref: context.context_id,
    selected_rule_context_hash: context.selected_rule_context_hash, subject_ref: subject.ref, actual_input_hash: subject.content_hash,
    rule_version_refs: ['operational-op08-v3'], checks: [{ check_id: 'semantic-1', check_type: 'semantic', status: 'applicable', reviewed_input_hash: subject.content_hash, inspected_refs: [subject.ref], finding: '边界已核对' }],
    findings: ['边界已核对'], actions: [{ action_id: 'action-1', rule_version_ref: 'operational-op08-v3', disposition: 'modify', text: '保留原意并限定为推断', deliverable_refs: [subject.ref] }],
    keep_unchanged_reason: null, validation_plan: '发布后只观察实际反馈', deliverable_refs: [subject.ref], application_proposal_hash: ''
  };
  application.application_proposal_hash = applicationProposalHash(application);
  const output = {
    contract_version: 4, output_id: 'output-timefix', delivery_id: 'delivery-stable', goal: context.goal, use: context.use,
    guidance_text: '保留原意并限定为推断。', actions: ['保留原意并限定为推断'], rationale: ['没有算法事实证据'],
    observation_plan: ['发布后只观察实际反馈'], gaps: ['内部机制未知'], deliverable_refs: [subject.ref], generator_ref: 'writer',
    output_content_hash: '', created_at: '2026-10-26T18:10:01Z'
  };
  output.output_content_hash = guidanceOutputContentHash(output);
  const binding = {
    delivery_id: output.delivery_id, subject_ref: subject.ref, subject_content_hash: subject.content_hash,
    output_material_ref: output.output_id, output_content_hash: output.output_content_hash,
    personal_context_selection_hash: context.personal_context_selection_hash, personal_context_absence_reason: context.personal_context_absence_reason,
    selected_rule_context_hash: context.selected_rule_context_hash, application_ref: application.application_id,
    application_proposal_hash: application.application_proposal_hash
  };
  const reviewSubject = guidanceReviewSubjectHash(binding);
  const actual = { receipt_id: 'actual-new', subject_hash: reviewSubject, generator_ref: 'independent-reviewer', decision: 'approved', checks: { exact: true }, issues: [] };
  const receipt = { contract_version: 4, receipt_id: 'receipt-new', ...binding, review_subject_hash: reviewSubject, actual_review_receipt_ref: actual.receipt_id, decision: actual.decision, checks: actual.checks, issues: actual.issues, reviewed_at: '2026-10-26T18:10:02Z', supersedes_receipt_ref: 'receipt-old' };
  const old = { ...receipt, receipt_id: 'receipt-old', review_subject_hash: 'a'.repeat(64), output_content_hash: 'b'.repeat(64), selected_rule_context_hash: 'c'.repeat(64), application_proposal_hash: 'd'.repeat(64), actual_review_receipt_ref: 'actual-old', supersedes_receipt_ref: null };
  return { output, application, context, subject, actual, receipt, old };
}

test('same delivery and subject may supersede a separately reviewed prior binding', () => {
  const x = fixture();
  assert.doesNotThrow(() => validateGuidanceReceipt(x.receipt, { ...x, actualReviewReceipt: x.actual, receipts: [x.old] }));
});

test('supersession cannot cross delivery or subject', () => {
  const x = fixture();
  for (const old of [{ ...x.old, delivery_id: 'another-delivery' }, { ...x.old, subject_ref: 'another-subject' }]) {
    assert.throws(() => validateGuidanceReceipt(x.receipt, { ...x, actualReviewReceipt: x.actual, receipts: [old] }), /another delivery or subject/);
  }
});

test('supersession cycles remain rejected', () => {
  const x = fixture(), old = { ...x.old, supersedes_receipt_ref: x.receipt.receipt_id };
  assert.throws(() => validateGuidanceReceipt(x.receipt, { ...x, actualReviewReceipt: x.actual, receipts: [old, x.receipt] }), /cycle/);
});
