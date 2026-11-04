import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalHash, textHash } from '../scripts/lib/contracts.mjs';
import { createDefaultConfigV5 } from '../scripts/lib/config.mjs';
import { initializeState, commitState, loadState } from '../scripts/lib/state.mjs';
import { resolveSubjectV5 } from '../scripts/lib/subjects.mjs';
import { buildSignalSetV5, buildRuleContextV5, knowledgeBundleFromState, applicationProposalHash } from '../scripts/lib/knowledge.mjs';
import { dispatchV5, currentGuidanceV5 } from '../scripts/lib/v5-dispatch.mjs';
import { verifyHostReviewV5 } from '../scripts/lib/host-review-v5.mjs';
import { guidanceOutputContentHashV5, guidanceReviewSubjectHashV5 } from '../scripts/lib/guidance.mjs';

// All content and independent reviews below are controlled fixtures, not live
// account observations, production ranking evidence, or actual publication.
const T = new Date().toISOString();
const cases = [
  { id: 'OP07', text: '测试讨论全文：读者问缓存更新后为何仍显示旧值？回复应先解释失效与刷新时机。', values: { has_real_question: true, has_readable_discussion_context: true }, missing: 'has_real_question', other: false, action: '先回答缓存失效与刷新时机，再决定是否整理成原创说明。' },
  { id: 'OP10', text: '测试新闻全文：更新与数据库迁移有关；本测试案例附有迁移步骤，可据步骤解释影响，不宣称线上效果。', values: { hot_topic_relevant: true, personal_contribution_available: true }, missing: 'hot_topic_relevant', other: true, action: '围绕已给出的迁移步骤解释这次更新的适用条件，不伪造亲历。' }
];

async function actualReview(dir, subject, id, purpose, hash, assessment = null) {
  const actual = { purpose, subject_ref: subject.ref, subject_hash: hash, subject_content_hash: subject.content_hash, decision: 'approved', checks: { exact_material: true, evidence_bounded: true }, issues: [], reviewer: 'fixture-independent-reviewer', generator_ref: 'fixture-review-generator', reviewed_at: T, ...(assessment ? { assessment } : {}) };
  const path = join(dir, `${id}.json`), bytes = JSON.stringify(actual);
  await writeFile(path, bytes);
  const { assessment: _assessment, ...fields } = actual;
  const receipt = { contract_version: 5, receipt_id: id, ...fields, actual_result_ref: path, actual_result_sha256: createHash('sha256').update(bytes).digest('hex'), actual_result_hash: assessment?.assessment_hash ?? null, data_mode: 'fixture', tool_name: 'fixture-review', host_call_ref: `fixture-call:${id}` };
  await verifyHostReviewV5(receipt);
  return receipt;
}

for (const item of cases) test(`${item.id}: approved editorial rule reaches persisted guidance delivery, missing evidence cannot modify`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xops-scoped-delivery-'));
  const account = { handle: 'fixture_scoped_delivery', profile_url: 'https://x.com/fixture_scoped_delivery', user_id: null, identity_basis: 'user_provided' };
  let state = initializeState(createDefaultConfigV5(account), 5);
  const draft = { draft_id: `fixture-${item.id}`, revision: 1, parent_revision: null, card_id: null, original_text: item.text, original_ref: null, format: 'short_post', texts: [item.text], fact_mapping: [], semantic_review: null, length_checks: [], text_hashes: [textHash(item.text)], validity: 'unverified' };
  state.drafts[draft.draft_id] = { latest_revision: 1, revisions: { 1: draft } };
  state = await commitState(dir, 0, () => state);
  const subject = resolveSubjectV5(state, `${draft.draft_id}:1`), bundle = knowledgeBundleFromState(state);
  assert.equal(subject.full_text, true);
  assert.equal(subject.read_status, 'read');
  const rule = Object.values(bundle.rules).find(rule => rule.rule_id === item.id && rule.rule_version_id.includes('b220448'));
  assert.ok(rule, 'the default installed package must expose the new rule');
  assert.equal(rule.review_status, 'approved');
  assert.equal(rule.execution_scope, 'editorial_only');
  const assessments = [], reviews = [];
  for (const [signal, value] of Object.entries(item.values)) {
    const assessment = { assessment_id: `fixture-${signal}`, signal, value, unit: 'flag', subject_ref: subject.ref, subject_hash: subject.content_hash, source_refs: [subject.ref], locator: 'texts/0' };
    assessment.assessment_hash = canonicalHash(assessment);
    assessment.review_receipt_ref = `review-${signal}`;
    assessment.reviewed_at = T;
    assessments.push(assessment);
    reviews.push(await actualReview(dir, subject, assessment.review_receipt_ref, 'review_signals', subject.content_hash, assessment));
  }
  const signalSet = buildSignalSetV5({ subject, cutoff: T, semantic_evidence: assessments, actual_reviews: reviews });
  assert.throws(() => buildSignalSetV5({ subject, cutoff: T, semantic_evidence: assessments, actual_reviews: reviews.map(review => ({ ...review, actual_result_hash: canonicalHash('wrong-material') })) }), /exact host review/);
  const input = { run_id: `fixture-${item.id}`, intent: 'draft', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance', surface: subject.surface, post_type: subject.post_type, subject_ref: subject.ref, subject_hash: subject.content_hash, cutoff: T, explicit_rule_version_refs: [rule.rule_version_id] };
  const context = buildRuleContextV5({ ...input, signal_set: signalSet }, bundle);
  assert.equal(context.selections.length, 1);
  assert.equal(context.selections[0].editorial_applicability.status, 'applicable');
  assert.equal(context.selections[0].mechanism_applicability.status, 'unknown');
  const makeApplication = (context, id) => {
    const application = { contract_version: 5, application_id: id, context_ref: context.context_id, selected_rule_context_hash: context.selected_rule_context_hash, subject_ref: subject.ref, actual_input_hash: subject.content_hash, rule_version_refs: [rule.rule_version_id], checks: assessments.map(assessment => ({ check_id: assessment.signal, check_type: 'semantic', status: 'applicable', reviewed_input_hash: subject.content_hash, review_ref: assessment.review_receipt_ref, inspected_refs: [subject.ref], finding: `Fixture exact full-text assessment: ${assessment.signal}` })), findings: ['Only editorial support is established'], actions: [{ action_id: id, rule_version_ref: rule.rule_version_id, disposition: 'modify', text: item.action, deliverable_refs: [subject.ref], basis_kind: 'editorial_inference', supporting_check_refs: assessments.map(a => a.signal), signal_refs: assessments.map(a => a.signal) }], keep_unchanged_reason: null, validation_plan: '核对说明是否回应原问题；效果须在实际发布后另行观察。', deliverable_refs: [subject.ref], application_proposal_hash: '' };
    application.application_proposal_hash = applicationProposalHash(application);
    return application;
  };
  state = await commitState(dir, state.revision, working => {
    working.rule_contexts[context.context_id] = context;
    for (const review of reviews) working.host_media_receipts[review.receipt_id] = review;
    return working;
  });
  const record = async (operation, data) => {
    state = await loadState(dir);
    const result = await dispatchV5('record', { expected_revision: state.revision, payload: { contract_version: 5, operation, data, as_of: T } }, dir, state);
    state = result.state;
    return result;
  };
  const application = makeApplication(context, `application-${item.id}`);
  // Persist independently named, internally self-consistent hostile contexts.
  // A fresh application hash cannot make a stale catalog or forged selection valid.
  for (const kind of ['stale-catalog', 'tampered-selection']) {
    const invalidContext = structuredClone(context);
    invalidContext.context_id = `${kind}-${item.id}`;
    if (kind === 'stale-catalog') {
      invalidContext.catalog_content_hash = canonicalHash('fixture-obsolete-catalog');
    } else {
      invalidContext.selections[0].mechanism_applicability.status = 'applicable';
    }
    delete invalidContext.selected_rule_context_hash;
    invalidContext.selected_rule_context_hash = canonicalHash(invalidContext);
    state = await loadState(dir);
    state = await commitState(dir, state.revision, working => {
      working.rule_contexts[invalidContext.context_id] = invalidContext;
      return working;
    });
    const invalidApplication = makeApplication(invalidContext, `${kind}-application-${item.id}`);
    const revisionBefore = state.revision;
    await assert.rejects(record('rule_application', invalidApplication), error => error.code === 'STALE_BUNDLE');
    const after = await loadState(dir);
    assert.equal(after.revision, revisionBefore, 'rejected application must not commit a new state revision');
    assert.equal(after.rule_applications[invalidApplication.application_id], undefined);
    assert.deepEqual(after.rule_contexts[context.context_id], context, 'negative fixtures must not mutate the legitimate context');
  }
  const promoted = structuredClone(application);
  promoted.actions[0].basis_kind = 'public_mechanism';
  promoted.application_proposal_hash = applicationProposalHash(promoted);
  await assert.rejects(record('rule_application', promoted), /mechanism|editorial.only/i);

  // OP07 any(false, missing) and OP10 all(true, missing) must stay unknown.
  const remaining = assessments.filter(a => a.signal !== item.missing).map(a => {
    const next = { ...a, value: item.other };
    next.assessment_hash = canonicalHash(Object.fromEntries(['assessment_id','signal','value','unit','subject_ref','subject_hash','source_refs','locator'].map(key => [key, next[key]])));
    return next;
  });
  const missingReviews = [];
  for (const assessment of remaining) missingReviews.push(await actualReview(dir, subject, `missing-${assessment.signal}`, 'review_signals', subject.content_hash, assessment));
  remaining.forEach((a, i) => { a.review_receipt_ref = missingReviews[i].receipt_id; });
  const missingSet = buildSignalSetV5({ subject, cutoff: T, semantic_evidence: remaining, actual_reviews: missingReviews });
  assert.equal(missingSet.signals[item.missing].value, null);
  const missingContext = buildRuleContextV5({ ...input, context_id: `missing-${item.id}`, signal_set: missingSet }, bundle);
  assert.equal(missingContext.selections[0].editorial_applicability.status, 'unknown');
  state = await loadState(dir);
  state = await commitState(dir, state.revision, working => { working.rule_contexts[missingContext.context_id] = missingContext; return working; });
  await assert.rejects(record('rule_application', makeApplication(missingContext, 'unsupported-modify')), /double-unknown/);
  assert.equal((await loadState(dir)).rule_applications['unsupported-modify'], undefined);

  await record('rule_application', application);
  const output = { contract_version: 5, output_id: `output-${item.id}`, delivery_id: `delivery-${item.id}`, goal: context.goal, use: context.use, guidance_text: `${item.action} 这只是编辑建议，内部推荐机制未知。`, actions: [item.action], rationale: ['实际完整正文的测试语义审核支持该编辑动作'], observation_plan: [application.validation_plan], gaps: ['内部推荐机制未知；无实际发布效果数据'], deliverable_refs: [subject.ref], action_plan_hashes: [], generator_ref: 'fixture-guidance-writer', output_content_hash: '', created_at: T };
  output.output_content_hash = guidanceOutputContentHashV5(output);
  await record('guidance_output', output);
  assert.equal((await currentGuidanceV5(await loadState(dir), subject.ref, { intent: 'draft', use: context.use, goal: context.goal })).readiness, 'needs_review');
  const binding = { delivery_id: output.delivery_id, subject_ref: subject.ref, subject_content_hash: subject.content_hash, output_material_ref: output.output_id, output_content_hash: output.output_content_hash, personal_context_selection_hash: null, personal_context_absence_reason: 'not_used', selected_rule_context_hash: context.selected_rule_context_hash, application_ref: application.application_id, application_proposal_hash: application.application_proposal_hash, action_plan_hashes: [] };
  const reviewHash = guidanceReviewSubjectHashV5(binding), host = await actualReview(dir, subject, 'guidance-host', 'review_guidance', reviewHash);
  await record('guidance_review_result', host);
  const receipt = { contract_version: 5, receipt_id: 'guidance-approved', ...binding, review_subject_hash: reviewHash, actual_review_receipt_ref: host.receipt_id, decision: 'approved', checks: host.checks, issues: [], reviewed_at: T, supersedes_receipt_ref: null };
  await record('guidance_receipt', receipt);
  const restored = await loadState(dir), gate = await currentGuidanceV5(restored, subject.ref, { intent: 'draft', use: context.use, goal: context.goal });
  assert.equal(gate.readiness, 'ready');
  const deliveredReceipt = restored.guidance_receipts[gate.active_receipt_ref];
  const delivered = restored.guidance_outputs[deliveredReceipt.output_material_ref];
  assert.equal(delivered.guidance_text, output.guidance_text);
  assert.deepEqual(restored.rule_applications[deliveredReceipt.application_ref].rule_version_refs, [rule.rule_version_id]);
  assert.equal(restored.drafts[draft.draft_id].revisions[1].texts[0], item.text, 'guidance delivery does not secretly rewrite or publish the source');
});
