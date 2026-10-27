import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { actionPlanHash, actionStrategyIdentity, finalizeMaterializedCoaching, materializeCoachingActions, strategyDefinitionHash } from '../scripts/lib/actions.mjs';
import { applyActionDecision, applyExperimentTransition, createExperimentFromAction, experimentEvidenceSummary } from '../scripts/lib/experiments.mjs';
import { guidanceOutputContentHashV5 } from '../scripts/lib/guidance.mjs';
import { buildCoachingSignalContext, coachingProposalHashV5, validateCoachingProposalV5 } from '../scripts/lib/coaching.mjs';
import { verifySemanticChecksV5 } from '../scripts/lib/v5-dispatch.mjs';
import { verifyHostReviewV5 } from '../scripts/lib/host-review-v5.mjs';

const T = '2026-10-27T03:00:00Z';

function fullAction(overrides = {}) {
  return {
    action_id: 'action-1', priority: 1, objective: '验证清楚开头', target: 'content_series', change: '下一条同主题内容只调整开头，正文与媒体保持一致', why_now: '当前证据支持窄范围验证',
    account_evidence_refs: ['metric-1'], content_evidence_refs: ['content-1'], rule_version_refs: ['rule-1'], expected_direction: '帮助读者更快理解', effort: { level: 'low', basis: '只改开头' }, primary_metric_ref: 'metric-1', guardrail_metric_refs: [],
    observation_window: { description: '发布后24小时' }, review_condition_or_due_at: '成熟24小时观测后复查', success_interpretation: '同口径描述性改善时继续验证', stop_or_revise_condition: '没有改善时停止或修订', uncertainties: ['样本少'], status: 'proposed', ...overrides
  };
}

function stageAState() {
  const action = fullAction();
  return { actions: {}, coaching_reports: { proposal: { contract_version: 4, proposal_id: 'proposal', actions: [{ action_id: action.action_id, objective: action.objective, target: action.target, change: action.change, primary_metric_ref: action.primary_metric_ref, evidence_refs: ['metric-1', 'content-1', 'rule-1'], status: 'proposed' }] } }, guidance_receipts: {}, host_media_receipts: {}, experiments: {}, action_decisions: {} };
}

function approved(planHash) {
  return { readiness: 'ready', subject_ref: 'proposal', action_plan_hashes: [planHash], active_receipt_ref: 'guidance-approved' };
}

function experiment(target = 'content_series') {
  return { contract_version: 2, experiment_id: 'experiment-1', originating_action_id: 'action-1', goal: 'relevant_reach', hypothesis: '更清楚的开头可能帮助理解但不保证增长', single_primary_change: '只改开头', baseline_scope: { description: '历史相容内容', refs: [] }, target_scope: { description: target, refs: [] }, inclusion_exclusion_rules: [], planned_primary_metric: { definition_id: 'post.impressions', evidence_ref: null }, guardrails: [], age_window_or_period: { kind: 'age_window', value: '24h', tolerance_hours: 2 }, planned_review_condition: '24小时窗口成熟', assignment_or_selection_method: '描述性单变量', known_confounders: [], success_interpretation: '只作描述性判断', stop_condition: '无改善则停止', status: 'proposed', status_history: [{ status: 'proposed', at: T, basis_refs: [], reason: null }], linked_publication_ids: [] };
}

test('A01 materializes complete V2 actions and requires exact current plan approval', () => {
  const state = stageAState(), action = fullAction();
  const materialized = materializeCoachingActions(state, { proposal_ref: 'proposal', actions: [action], created_at: T });
  assert.equal(materialized.nextState.actions['action-1'].why_now, action.why_now);
  assert.throws(() => finalizeMaterializedCoaching(materialized.nextState, { proposal_ref: 'proposal', action_ids: ['action-1'] }), /approved guidance review/);
  const planHash = actionPlanHash(action);
  const finalized = finalizeMaterializedCoaching(materialized.nextState, { proposal_ref: 'proposal', action_ids: ['action-1'], approved_guidance: approved(planHash) });
  assert.equal(finalized.adoption_readiness, 'ready');
  assert.deepEqual(finalized.action_plan_hashes, [planHash]);
  assert.throws(() => materializeCoachingActions(state, { proposal_ref: 'proposal', actions: [fullAction({ change: '不同计划' })], created_at: T }), /Thin proposal differs/);
});

test('A06 lifecycle does not change plan hash and old decision payload uses the approval gate', () => {
  const action = fullAction(), materialized = materializeCoachingActions(stageAState(), { proposal_ref: 'proposal', actions: [action], created_at: T });
  const before = actionPlanHash(materialized.nextState.actions['action-1']);
  assert.throws(() => applyActionDecision(materialized.nextState, { decision_id: 'decision-1', action_id: 'action-1', decision: 'accepted', basis: '用户明确接受', decided_at: T }), /approved guidance review/);
  const accepted = applyActionDecision(materialized.nextState, { decision_id: 'decision-1', action_id: 'action-1', decision: 'accepted', basis: '用户明确接受', decided_at: T }, { approved_guidance: approved(before) });
  assert.equal(actionPlanHash(accepted.actions['action-1']), before);
  const created = createExperimentFromAction(accepted, { experiment: experiment(), approved_guidance: approved(before) });
  assert.equal(created.nextState.experiments['experiment-1'].status, 'proposed');
});

test('A29 non-posting action cannot fabricate publication and cadence posts form one independent sample', () => {
  const state = { actions: { 'action-1': fullAction({ target: 'profile', status: 'accepted' }) }, experiments: { 'experiment-1': { ...experiment('profile'), status: 'accepted', status_history: [{ status: 'accepted', at: T, basis_refs: [], reason: null }], linked_publication_ids: [] } }, publications: { p1: { publication_id: 'p1' } } };
  assert.throws(() => applyExperimentTransition(state, { event_id: 'publish-1', experiment_id: 'experiment-1', type: 'publish', at: T, publication_ids: ['p1'] }), /not a post-publication action/);
  const grouped = { actions: { 'action-1': { ...fullAction(), strategy_version_ref: 'strategy-1' } }, experiments: { 'experiment-1': { ...experiment(), linked_publication_ids: ['p1', 'p2'], cadence_group_ref: 'cadence-week-1' } }, publications: { p1: { publication_id: 'p1' }, p2: { publication_id: 'p2' } } };
  assert.equal(experimentEvidenceSummary(grouped, 'experiment-1').independent_sample_n, 1);
});

test('V5 strategy identity and guidance hash are stable but plan-sensitive', () => {
  const definition = { contract_version: 5, strategy_id: 'ignored', version: 1, change_dimension: 'opening_clarity', reader_behavior_hypothesis: '读者更快理解', goal: 'relevant_reach', topic_scope: ['ai'], format_scope: ['short_post'], surface_scope: ['for_you'], required_materials: [], primary_metric_definition_id: 'post.impressions', observation_window: { kind: 'age_window', value: '24h', tolerance_hours: 2 }, comparison_requirements: ['same_topic'], cost_boundary: 'low', risk_boundary: 'no guarantee', rule_refs: ['rule-1'], created_at: T };
  assert.equal(actionStrategyIdentity(definition), actionStrategyIdentity({ ...definition, required_materials: ['draft'] }));
  assert.notEqual(strategyDefinitionHash(definition), strategyDefinitionHash({ ...definition, risk_boundary: 'medium' }));
  const output = { delivery_id: 'd', goal: 'relevant_reach', use: 'coaching', guidance_text: '建议', actions: ['调整开头'], rationale: ['更清楚'], observation_plan: ['24h'], gaps: [], deliverable_refs: ['proposal'], action_plan_hashes: ['a'.repeat(64)] };
  assert.notEqual(guidanceOutputContentHashV5(output), guidanceOutputContentHashV5({ ...output, action_plan_hashes: ['b'.repeat(64)] }));
});

test('new V5 schemas are strict JSON documents', async () => {
  for (const name of ['actions-v5.schema.json', 'coaching-v5.schema.json', 'guidance-v5.schema.json']) {
    const source = await readFile(new URL(`../schemas/${name}`, import.meta.url), 'utf8');
    assert.doesNotThrow(() => JSON.parse(source));
  }
});

test('F01 coaching signal context reads exact stored text, surface and post type', () => {
  const state = { post_entities: {}, post_versions: { pv1: { post_version_id: 'pv1', content_hash: 'c'.repeat(64), text: '第一行\n查看 https://example.com', post_type: 'reply', created_at: T, source_ref: 'source-1', context_coverage: { full_text: true }, media_refs: [] } }, content_analyses: {} };
  const request = { subject_ref: 'pv1', as_of: T, surface: 'following', coaching_request: { requested_post_version_refs: [], content_analysis_version: 'reader-v3' }, semantic_evidence: [], actual_review_receipts: [], selected_evidence_refs: [] };
  const built = buildCoachingSignalContext(state, request);
  assert.equal(built.post_type, 'reply');
  assert.equal(built.surface, 'following');
  assert.equal(built.signalSet.signals.text_length_chars.status, 'observed');
  assert.equal(built.signalSet.signals.newline_count.value, 1);
  assert.equal(built.signalSet.signals.has_link.value, true);
  assert.equal(built.signalSet.signals.reader_benefit_clear.status, 'unknown');
});

function strategy() {
  const base = { contract_version: 5, strategy_id: '', version: 1, change_dimension: 'opening_clarity', reader_behavior_hypothesis: '读者更快理解', goal: 'relevant_reach', topic_scope: ['ai'], format_scope: ['short_post'], surface_scope: ['for_you'], required_materials: ['draft'], primary_metric_definition_id: 'post.impressions', observation_window: { kind: 'age_window', value: '24h', tolerance_hours: 2 }, comparison_requirements: ['same_topic'], cost_boundary: 'low', risk_boundary: '不保证增长', rule_refs: ['rule-1'], created_at: T };
  base.strategy_id = `strategy-${actionStrategyIdentity(base).slice(0, 24)}`;
  return { ...base, strategy_hash: strategyDefinitionHash(base) };
}

function actionV5(proposalRef = 'proposal-v5', overrides = {}) {
  const base = { contract_version: 5, action_id: 'action-v5', priority: 1, strategy_version_ref: 'strategy-v1', originating_proposal_ref: proposalRef, goal: 'relevant_reach', use: 'current', objective: '验证清楚开头', target: 'content_series', change: '下一条同主题内容只调整开头，正文与媒体保持一致', why_now: '当前证据支持窄范围验证', account_evidence_refs: ['metric-1'], content_evidence_refs: ['content-1'], rule_version_refs: ['rule-1'], expected_direction: '帮助读者更快理解', effort: { level: 'low', basis: '只改开头' }, primary_metric_ref: 'metric-1', primary_metric_definition_id: 'post.impressions', guardrail_metric_refs: [], observation_window: { description: '发布后24小时' }, review_condition_or_due_at: '成熟24小时观测后复查', success_interpretation: '同口径描述性改善时继续验证', stop_or_revise_condition: '没有改善时停止或修订', uncertainties: ['样本少'], retry_reason: null, addresses_failure_refs: [], new_relevant_evidence_refs: [], status: 'proposed', ...overrides };
  return { ...base, plan_hash: actionPlanHash(base) };
}

function proposalV5(action = actionV5()) {
  const base = { contract_version: 5, proposal_id: 'proposal-v5', run_ref: 'run-v5', evidence_bundle_ref: 'bundle-v4', evidence_bundle_hash: 'b'.repeat(64), rule_context_ref: 'rules-v5', selected_rule_context_hash: 'c'.repeat(64), selected_operational_context_hash: 'd'.repeat(64), findings: [{ finding_id: 'finding-1', statement: '当前开头需验证', interpretation: '只支持窄试验', support_kind: 'target_metric', evidence_refs: ['metric-1'] }], actions: [action], gaps: [] };
  return { ...base, proposal_hash: coachingProposalHashV5(base) };
}

test('V5 proposal resolves exact strategy and materializes only the canonical proposed action', () => {
  const action = actionV5(), proposal = proposalV5(action), strategyV5 = strategy();
  const state = { schema_version: 5, strategy_definitions: { 'strategy-v1': strategyV5 }, actions: {}, experiments: {}, experiment_reviews: {}, coaching_reports: { 'proposal-v5': proposal } };
  const deps = { run: { run_id: 'run-v5', goal: { primary_goal: 'relevant_reach' }, use: 'current', selected_operational_context_hash: 'd'.repeat(64) }, evidence_bundle: { bundle_id: 'bundle-v4', evidence_bundle_hash: 'b'.repeat(64), evidence_index: { 'metric-1': {}, 'content-1': {}, 'rule-1': {} } }, rule_context: { context_id: 'rules-v5', selected_rule_context_hash: 'c'.repeat(64) }, state };
  assert.doesNotThrow(() => validateCoachingProposalV5(proposal, deps));
  const materialized = materializeCoachingActions(state, { proposal_ref: 'proposal-v5', actions: [action], created_at: T });
  assert.equal(materialized.result.contract_version, 5);
  assert.equal(materialized.nextState.actions['action-v5'].strategy_version_ref, 'strategy-v1');
  const altered = actionV5('proposal-v5', { stop_or_revise_condition: '立即停止' });
  assert.throws(() => materializeCoachingActions(state, { proposal_ref: 'proposal-v5', actions: [altered], created_at: T }), /exact proposed V5 action/);
});

test('A10 stable strategy identity blocks synonymous retry without actual failure and new-evidence refs', () => {
  const strategyV5 = strategy(), prior = actionV5('old-proposal', { action_id: 'old-action', change: '把第一句写得更明确', status: 'declined' });
  const state = { schema_version: 5, strategy_definitions: { 'strategy-v1': strategyV5 }, actions: { 'old-action': prior }, experiments: {}, experiment_reviews: {} };
  const run = { run_id: 'run-v5', goal: { primary_goal: 'relevant_reach' }, use: 'current', selected_operational_context_hash: 'd'.repeat(64) }, rule_context = { context_id: 'rules-v5', selected_rule_context_hash: 'c'.repeat(64) };
  const evidence_bundle = { bundle_id: 'bundle-v4', evidence_bundle_hash: 'b'.repeat(64), evidence_index: { 'metric-1': {}, 'metric-new': {}, 'content-1': {}, 'rule-1': {} } };
  assert.throws(() => validateCoachingProposalV5(proposalV5(actionV5()), { run, rule_context, evidence_bundle, state }), /actual prior failure/);
  const retry = actionV5('proposal-v5', { account_evidence_refs: ['metric-1', 'metric-new'], retry_reason: '出现新的同口径成熟观测', addresses_failure_refs: ['old-action'], new_relevant_evidence_refs: ['metric-new'] });
  assert.doesNotThrow(() => validateCoachingProposalV5(proposalV5(retry), { run, rule_context, evidence_bundle, state }));
});

test('semantic applicable checks require an approved exact actual host review file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xops-semantic-check-')),subjectHash='b'.repeat(64),base={purpose:'review_signals',subject_ref:'subject-1',subject_hash:subjectHash,subject_content_hash:subjectHash,decision:'approved',checks:{semantic_bound:true},issues:[],reviewer:'fixture-independent',generator_ref:'fixture-semantic-generator',reviewed_at:T},path=join(dir,'actual.json'),bytes=Buffer.from(JSON.stringify(base));await writeFile(path,bytes);
  const receipt={contract_version:5,receipt_id:'semantic-review',...base,actual_result_ref:path,actual_result_sha256:createHash('sha256').update(bytes).digest('hex'),actual_result_hash:null,data_mode:'fixture',tool_name:'fixture-review',host_call_ref:null},application={subject_ref:'subject-1',actual_input_hash:subjectHash,checks:[{check_type:'semantic',status:'applicable',review_ref:receipt.receipt_id}]};
  await assert.doesNotReject(verifySemanticChecksV5({host_media_receipts:{[receipt.receipt_id]:receipt}},application,{verifyHostReviewV5}));
  await assert.rejects(verifySemanticChecksV5({host_media_receipts:{}},application,{verifyHostReviewV5}),/saved actual semantic review/);
  const deniedActual={...base,decision:'revision_required',checks:{semantic_bound:false},issues:['语义不成立']},deniedBytes=Buffer.from(JSON.stringify(deniedActual)),denied={...receipt,receipt_id:'semantic-denied',...deniedActual,actual_result_ref:join(dir,'denied.json'),actual_result_sha256:createHash('sha256').update(deniedBytes).digest('hex')};await writeFile(denied.actual_result_ref,deniedBytes);
  await assert.rejects(verifySemanticChecksV5({host_media_receipts:{[denied.receipt_id]:denied}},{...application,checks:[{check_type:'semantic',status:'applicable',review_ref:denied.receipt_id}]},{verifyHostReviewV5}),/denied semantic review/);
});
