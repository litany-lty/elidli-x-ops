import test from 'node:test';
import assert from 'node:assert/strict';
import { actionPlanHash, actionRequiresCurrentApproval } from '../scripts/lib/actions.mjs';
import { applyActionDecision, applyExperimentTransition, experimentEvidenceSummary } from '../scripts/lib/experiments.mjs';
import { guidanceOutputContentHashV5, validateGuidanceOutputV5 } from '../scripts/lib/guidance.mjs';
import { applicationProposalHash, buildRuleContextV5, buildSignalSetV5, loadKnowledgeCatalog, validateRuleApplicationV5 } from '../scripts/lib/knowledge.mjs';
import { canonicalHash } from '../scripts/lib/contracts.mjs';

const T = '2026-10-27T06:00:00.000Z';

function legacyAction(overrides = {}) {
  return {
    contract_version: 2, action_id: 'legacy-action', priority: 1, objective: '调整开头', target: 'content_series', change: '首句更清楚', why_now: '待验证',
    account_evidence_refs: [], content_evidence_refs: [], rule_version_refs: [], expected_direction: '改善理解', effort: { level: 'low', basis: '单处修改' },
    primary_metric_ref: null, guardrail_metric_refs: [], observation_window: { description: '24h' }, review_condition_or_due_at: '24h 后复查', success_interpretation: '描述性改善',
    stop_or_revise_condition: '无改善则停止', uncertainties: [], status: 'proposed', ...overrides
  };
}

test('A25 state5 legacy acceptance without review origin is rejected while historical accepted state remains readable', () => {
  const action = legacyAction(), state = { schema_version: 5, actions: { [action.action_id]: action }, action_decisions: {}, coaching_reports: {}, experiments: {} };
  assert.equal(actionRequiresCurrentApproval(state, action.action_id), true);
  assert.throws(() => applyActionDecision(state, { decision_id: 'accept-old', action_id: action.action_id, decision: 'accepted', basis: '用户现在接受', decided_at: T }), /re-review|replacement|approved guidance/i);

  const historical = { ...state, actions: { [action.action_id]: { ...action, status: 'accepted', decision_ref: 'historical-decision' } } };
  assert.equal(historical.actions[action.action_id].status, 'accepted');
  assert.throws(() => applyExperimentTransition({ ...historical, experiments: { exp: { contract_version: 2, experiment_id: 'exp', originating_action_id: action.action_id, status: 'proposed', status_history: [{ status: 'proposed', at: T, basis_refs: [], reason: null }], linked_publication_ids: [] } } }, { event_id: 'accept-exp', experiment_id: 'exp', type: 'accept', at: T, adoption_ids: ['historical-decision'] }), /re-review|replacement|approved guidance/i);
});

test('A08 publication aliases count one actual post and cadence execution remains one sample', () => {
  const state = {
    post_aliases: { 'x:alias-1': 'x:post-1' }, actions: { a: { strategy_version_ref: 'strategy-1' } },
    experiments: { exp: { experiment_id: 'exp', originating_action_id: 'a', linked_publication_ids: ['pub-1', 'pub-duplicate', 'pub-2'] } },
    publications: {
      'pub-1': { publication_id: 'pub-1', platform_post_id: 'post-1', post_id: 'post-1' },
      'pub-duplicate': { publication_id: 'pub-duplicate', platform_post_id: 'post-1', post_id: 'alias-1' },
      'pub-2': { publication_id: 'pub-2', platform_post_id: 'post-2', post_id: 'post-2' }
    }
  };
  const summary = experimentEvidenceSummary(state, 'exp');
  assert.equal(summary.independent_publication_n, 2);
  assert.equal(summary.independent_sample_n, 2);
  state.experiments.exp.cadence_group_ref = 'cadence-1';
  const cadence = experimentEvidenceSummary(state, 'exp');
  assert.equal(cadence.independent_publication_n, 2);
  assert.equal(cadence.independent_sample_n, 1);
});

test('A01/A06 V5 guidance binds a proposal complete canonical plans but ignores lifecycle-only changes', () => {
  const base = legacyAction({ contract_version: 5, action_id: 'action-v5', strategy_version_ref: 'strategy-v1', originating_proposal_ref: 'proposal-v5', goal: 'relevant_reach', use: 'coaching', primary_metric_definition_id: 'post.impressions', retry_reason: null, addresses_failure_refs: [], new_relevant_evidence_refs: [] });
  const action = { ...base, plan_hash: actionPlanHash(base) };
  const state = { actions: { [action.action_id]: action }, coaching_reports: { 'proposal-v5': { contract_version: 5, proposal_id: 'proposal-v5', actions: [{ action_id: action.action_id }] } } };
  const outputBase = { contract_version: 5, output_id: 'output-v5', delivery_id: 'delivery-v5', goal: { primary_goal: 'relevant_reach' }, use: 'coaching', guidance_text: '按完整计划执行', actions: ['调整开头'], rationale: ['保持边界'], observation_plan: ['24h'], gaps: [], deliverable_refs: ['proposal-v5'], action_plan_hashes: [action.plan_hash], generator_ref: 'generator', created_at: T };
  const output = { ...outputBase, output_content_hash: guidanceOutputContentHashV5(outputBase) };
  assert.doesNotThrow(() => validateGuidanceOutputV5(output, state));
  state.actions[action.action_id].status = 'accepted';
  assert.doesNotThrow(() => validateGuidanceOutputV5(output, state));

  const escapedBase = { ...outputBase, output_id: 'escaped', deliverable_refs: ['account'] };
  assert.throws(() => validateGuidanceOutputV5({ ...escapedBase, output_content_hash: guidanceOutputContentHashV5(escapedBase) }, state), /proposal|deliverable|plan/i);
  state.actions[action.action_id].observation_window = { description: '7d' };
  assert.throws(() => validateGuidanceOutputV5(output, state), /canonical|changed|plan/i);
});

test('A05 RuleApplication support must be affirmative, basis-compatible and backed by observed signals', () => {
  const subject = { ref: 'draft:1', content_hash: canonicalHash('正文'), texts: ['正文'], format: 'short_post', post_type: 'original', surface: 'for_you', media: [], full_text: true, read_status: 'read', source_refs: ['draft:1'], observed_at: T };
  const assessmentBase = { assessment_id: 'assessment-benefit', signal: 'reader_benefit_clear', value: false, unit: 'flag', subject_ref: subject.ref, subject_hash: subject.content_hash, source_refs: [subject.ref], locator: 'texts/0' };
  const assessment = { ...assessmentBase, assessment_hash: canonicalHash(assessmentBase), review_receipt_ref: 'review-benefit', reviewed_at: T };
  const signalSet = buildSignalSetV5({ subject, cutoff: T, semantic_evidence: [assessment], actual_reviews: [{ receipt_id: assessment.review_receipt_ref, purpose: 'review_signals', subject_ref: subject.ref, subject_hash: subject.content_hash, actual_result_hash: assessment.assessment_hash, decision: 'approved', reviewed_at: T }] });
  const bundle = loadKnowledgeCatalog(undefined, { now: T });
  const context = buildRuleContextV5({ run_id: 'run', intent: 'draft', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance', surface: 'for_you', post_type: 'original', subject_ref: subject.ref, subject_hash: subject.content_hash, cutoff: T, explicit_rule_version_refs: ['operational-op01-v3'], signal_set: signalSet }, bundle);
  const base = { contract_version: 5, application_id: 'application', context_ref: context.context_id, selected_rule_context_hash: context.selected_rule_context_hash, subject_ref: subject.ref, actual_input_hash: subject.content_hash, rule_version_refs: ['operational-op01-v3'], checks: [{ check_id: 'support', check_type: 'semantic', status: 'unknown', reviewed_input_hash: subject.content_hash, review_ref: assessment.review_receipt_ref, inspected_refs: [subject.ref], finding: '尚未确认修改依据' }], findings: [], actions: [{ action_id: 'modify', rule_version_ref: 'operational-op01-v3', disposition: 'modify', text: '修改开头', deliverable_refs: [subject.ref], basis_kind: 'editorial_inference', supporting_check_refs: ['support'], signal_refs: ['opening_delivers'] }], keep_unchanged_reason: null, validation_plan: '复核', deliverable_refs: [subject.ref] };
  const unknown = { ...base, application_proposal_hash: applicationProposalHash(base) };
  assert.throws(() => validateRuleApplicationV5(unknown, context, bundle), /affirmative|applicable|observed|support/i);

  const wrongTypeBase = { ...base, checks: [{ ...base.checks[0], check_type: 'mechanism', status: 'applicable' }] };
  const wrongType = { ...wrongTypeBase, application_proposal_hash: applicationProposalHash(wrongTypeBase) };
  assert.throws(() => validateRuleApplicationV5(wrongType, context, bundle), /editorial|semantic|support/i);
});
