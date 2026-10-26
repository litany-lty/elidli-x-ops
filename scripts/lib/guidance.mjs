import { canonicalHash, ContractError } from './contracts.mjs';
import { applicationProposalHash, ruleContextHash } from './knowledge.mjs';

export const GUIDANCE_COLLECTIONS = Object.freeze(['guidance_outputs', 'guidance_receipts', 'personal_patterns']);
const fail = (path, message, code = 'INVALID_INPUT') => { throw new ContractError(code, path, message); };

export function guidanceOutputContentHash(output) {
  return canonicalHash({
    delivery_id: output.delivery_id, goal: output.goal, use: output.use,
    guidance_text: output.guidance_text, actions: output.actions, rationale: output.rationale,
    observation_plan: output.observation_plan, gaps: output.gaps,
    deliverable_refs: output.deliverable_refs
  });
}

export function validateGuidanceOutput(output) {
  if (output.contract_version !== 4) fail('/contract_version', 'GuidanceOutput must use contract version 4', 'SCHEMA_VERSION');
  if (!output.guidance_text?.trim()) fail('/guidance_text', 'Complete user-visible guidance text is required', 'REQUESTED_OUTPUT_INCOMPLETE');
  if (!output.deliverable_refs?.length) fail('/deliverable_refs', 'Guidance must identify actual deliverables', 'REQUESTED_OUTPUT_INCOMPLETE');
  if (guidanceOutputContentHash(output) !== output.output_content_hash) fail('/output_content_hash', 'Guidance hash does not match the complete output', 'RECEIPT_CONFLICT');
  return structuredClone(output);
}

export function guidanceReviewSubjectHash(binding) {
  return canonicalHash({
    delivery_id: binding.delivery_id,
    subject_ref: binding.subject_ref,
    subject_content_hash: binding.subject_content_hash,
    output_material_ref: binding.output_material_ref,
    output_content_hash: binding.output_content_hash,
    personal_context_selection_hash: binding.personal_context_selection_hash,
    personal_context_absence_reason: binding.personal_context_absence_reason,
    selected_rule_context_hash: binding.selected_rule_context_hash,
    application_ref: binding.application_ref,
    application_proposal_hash: binding.application_proposal_hash
  });
}

function exactBinding(output, application, context, subject) {
  return {
    delivery_id: output.delivery_id,
    subject_ref: subject.ref,
    subject_content_hash: subject.content_hash,
    output_material_ref: output.output_id,
    output_content_hash: output.output_content_hash,
    personal_context_selection_hash: context.personal_context_selection_hash,
    personal_context_absence_reason: context.personal_context_absence_reason,
    selected_rule_context_hash: context.selected_rule_context_hash,
    application_ref: application.application_id,
    application_proposal_hash: application.application_proposal_hash
  };
}

export function validateGuidanceReceipt(receipt, { output, application, context, subject, actualReviewReceipt, receipts = [] }) {
  validateGuidanceOutput(output);
  if (receipt.contract_version !== 4) fail('/contract_version', 'GuidanceReceipt must use contract version 4', 'SCHEMA_VERSION');
  if (ruleContextHash(context) !== context.selected_rule_context_hash) fail('/selected_rule_context_hash', 'Rule context changed after selection', 'STALE_BUNDLE');
  if (applicationProposalHash(application) !== application.application_proposal_hash) fail('/application_proposal_hash', 'Rule application changed after proposal', 'STALE_BUNDLE');
  if (canonicalHash(output.goal) !== canonicalHash(context.goal) || output.use !== context.use) fail('/output', 'Guidance goal and use must match the exact rule context', 'INVALID_EVIDENCE_REF');
  if (subject.ref !== application.subject_ref || subject.ref !== context.subject_ref || subject.content_hash !== application.actual_input_hash) fail('/subject_ref', 'Guidance subject must match the context, application and exact input hash', 'INVALID_EVIDENCE_REF');
  if (!output.deliverable_refs.includes(subject.ref) || !application.deliverable_refs.includes(subject.ref) || application.deliverable_refs.some(ref => !output.deliverable_refs.includes(ref))) fail('/deliverable_refs', 'Guidance output must cover the actual subject and every applied deliverable', 'INVALID_EVIDENCE_REF');
  const binding = exactBinding(output, application, context, subject);
  for (const [key, value] of Object.entries(binding)) if (receipt[key] !== value) fail(`/${key}`, `Receipt does not match exact ${key}`, 'INVALID_EVIDENCE_REF');
  const reviewSubjectHash = guidanceReviewSubjectHash(binding);
  if (receipt.review_subject_hash !== reviewSubjectHash) fail('/review_subject_hash', 'Guidance review subject hash mismatch', 'RECEIPT_CONFLICT');
  if (!actualReviewReceipt || actualReviewReceipt.receipt_id !== receipt.actual_review_receipt_ref || actualReviewReceipt.subject_hash !== reviewSubjectHash) fail('/actual_review_receipt_ref', 'Independent review of this exact subject is required', 'MISSING_EVIDENCE');
  if (actualReviewReceipt.generator_ref && actualReviewReceipt.generator_ref === output.generator_ref) fail('/actual_review_receipt_ref', 'Guidance review must be independent from generation', 'MISSING_EVIDENCE');
  for (const key of ['decision', 'checks', 'issues']) if (canonicalHash(actualReviewReceipt[key]) !== canonicalHash(receipt[key])) fail(`/${key}`, `Saved ${key} differs from actual review`, 'RECEIPT_CONFLICT');
  if (receipt.decision === 'approved' && (!Object.keys(receipt.checks).length || Object.values(receipt.checks).some(value => value !== true) || receipt.issues.length)) fail('/decision', 'Approved guidance requires non-empty all-true checks and no issues', 'REQUESTED_OUTPUT_INCOMPLETE');
  if (receipt.supersedes_receipt_ref) {
    let cursor = receipts.find(item => item.receipt_id === receipt.supersedes_receipt_ref);
    if (!cursor || cursor.delivery_id !== receipt.delivery_id || cursor.subject_ref !== receipt.subject_ref) fail('/supersedes_receipt_ref', 'Superseded receipt is missing or belongs to another delivery or subject', 'INVALID_EVIDENCE_REF');
    const seen = new Set([receipt.receipt_id]);
    while (cursor) {
      if (seen.has(cursor.receipt_id)) fail('/supersedes_receipt_ref', 'Guidance receipt supersession cycle');
      seen.add(cursor.receipt_id);
      cursor = receipts.find(item => item.receipt_id === cursor.supersedes_receipt_ref);
    }
  }
  return structuredClone(receipt);
}

function activeReceipt(receipts, subjectHash) {
  const matching = receipts.filter(item => item.review_subject_hash === subjectHash);
  const superseded = new Set(matching.map(item => item.supersedes_receipt_ref).filter(Boolean));
  const active = matching.filter(item => !superseded.has(item.receipt_id));
  return active.length === 1 ? active[0] : null;
}

export function evaluateGuidanceReadinessV4({ output, application, context, subject, receipts = [], actualReviewReceipts = {} }) {
  if (!output || !application || !context || !subject) return { readiness: 'needs_guidance', reasons: ['missing_guidance_binding'], active_receipt_ref: null };
  const subjectHash = guidanceReviewSubjectHash(exactBinding(output, application, context, subject));
  const receipt = activeReceipt(receipts, subjectHash);
  if (!receipt) return { readiness: 'needs_review', reasons: ['missing_or_conflicting_active_guidance_receipt'], active_receipt_ref: null };
  try { validateGuidanceReceipt(receipt, { output, application, context, subject, actualReviewReceipt: actualReviewReceipts[receipt.actual_review_receipt_ref], receipts }); }
  catch (error) { return { readiness: 'needs_review', reasons: [error.code ?? 'invalid_guidance_receipt'], active_receipt_ref: receipt.receipt_id }; }
  return receipt.decision === 'approved'
    ? { readiness: 'ready', reasons: [], active_receipt_ref: receipt.receipt_id }
    : { readiness: 'needs_revision', reasons: receipt.issues, active_receipt_ref: receipt.receipt_id };
}

export function guidanceRequiredFor({ intent, use }) {
  return new Set(['coach', 'news', 'topic_selection', 'operational_optimize', 'review', 'retrospective']).has(intent)
    || new Set(['coaching', 'topic_selection', 'operational_guidance', 'performance_review']).has(use);
}

export function evaluateCurrentDeliverable({ intent, use, content_readiness, guidance }) {
  const guidanceRequired = guidanceRequiredFor({ intent, use });
  const guidanceReadiness = guidanceRequired ? evaluateGuidanceReadinessV4(guidance ?? {}) : { readiness: 'not_required', reasons: [], active_receipt_ref: null };
  return {
    content_readiness,
    guidance_required: guidanceRequired,
    guidance_readiness: guidanceReadiness,
    task_readiness: content_readiness?.readiness === 'ready' && guidanceReadiness.readiness === (guidanceRequired ? 'ready' : 'not_required') ? 'ready' : 'not_ready'
  };
}

export function personalPatternHash(pattern) {
  return canonicalHash({
    account_ref: pattern.account_ref, goal: pattern.goal,
    topic_scope: pattern.topic_scope, format_scope: pattern.format_scope,
    publication_refs: pattern.publication_refs, observation_refs: pattern.observation_refs,
    review_refs: pattern.review_refs, pattern_statement: pattern.pattern_statement,
    alternative_explanations: pattern.alternative_explanations,
    support_status: pattern.support_status, counter_evidence_refs: pattern.counter_evidence_refs
  });
}
