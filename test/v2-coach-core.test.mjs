import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { prepareContentAnalysis, validateContentAnalysis, isContentAnalysisCurrent } from '../scripts/lib/post-content.mjs';
import { applyExperimentTransition, validateExperimentPlan } from '../scripts/lib/experiments.mjs';
import { assessRuleHistoricalApplicability, validateRuleVersionV2 } from '../scripts/lib/coaching.mjs';

const version = {
  post_version_id: 'post-version-1', post_key: 'x:101', text: '具体问题开头，然后给出可核对的步骤。',
  content_hash: canonicalHash('具体问题开头，然后给出可核对的步骤。'), source_ref: 'source-post', evidence_refs: ['source-post'],
  context_coverage: { full_text: true, parent: false, quote: false, thread: false, media: false, linked_source: false },
  parent_post_key: null, quoted_post_key: null, thread_root_key: null, media_refs: []
};

function contentProposal(overrides = {}) {
  return {
    contract_version: 2, analysis_id: 'content-analysis-1', post_key: 'x:101', post_version_ref: 'post-version-1',
    content_hash: version.content_hash,
    context_hash: prepareContentAnalysis([version], { requested_post_version_refs: ['post-version-1'], analysis_version: 'reader-v1', max_items: 1 }, {}).work_items[0].context_hash,
    analysis_version: 'reader-v1', model_or_host_ref: 'host-review-1', reviewed_at: '2026-10-26T00:00:00Z',
    context_coverage: { full_text: true, parent: 'not_applicable', quote: 'not_applicable', thread: 'not_applicable', media: 'not_seen', linked_source: 'not_applicable' },
    primary_topic: 'tools', secondary_topics: [], intended_reader: '需要可复用方法的开发者', reader_problem: '不知道怎样拆解步骤', post_purpose: 'explain',
    hook: { type: 'question', exact_span: { start: 0, end: 6, text: '具体问题开头' }, promise: '给出可核对步骤' },
    delivery_evidence: [{ claim: '正文给出步骤', span: { start: 9, end: 17, text: '给出可核对的步骤' } }],
    original_contribution: '把方法整理为步骤', proof_type: 'reasoning', cta_type: 'none', media_dependency: 'unknown', context_dependency: 'standalone',
    strengths: ['开头具体'], issues: [], feature_evidence_spans: [{ start: 0, end: 6, text: '具体问题开头' }],
    uncertainties: ['media not_seen，未评价图片'], semantic_review_receipt_ref: 'semantic-content-1',
    ...overrides
  };
}
function contentReceipt(proposal) { return { review_id: proposal.semantic_review_receipt_ref, post_version_ref: proposal.post_version_ref, content_hash: proposal.content_hash, context_hash: proposal.context_hash, analysis_version: proposal.analysis_version, reviewer: 'independent-content-review', reviewed_at: '2026-10-26T00:01:00Z', decision: 'approved' }; }

test('V2-26/27 content work is bounded and stale analyses are not reused', () => {
  const prepared = prepareContentAnalysis([version], { requested_post_version_refs: ['post-version-1'], analysis_version: 'reader-v1', max_items: 0 }, {});
  assert.equal(prepared.work_items.length, 0);
  assert.deepEqual(prepared.unread_post_version_refs, ['post-version-1']);
  const proposed = contentProposal();
  const valid = validateContentAnalysis(proposed, { post_versions: { 'post-version-1': version } }, contentReceipt(proposed));
  assert.doesNotThrow(() => validate('PostContentAnalysisV2', valid));
  assert.equal(isContentAnalysisCurrent(valid, version), true);
  assert.equal(isContentAnalysisCurrent(valid, { ...version, text: `${version.text}补充`, content_hash: canonicalHash(`${version.text}补充`) }), false);
  assert.equal(isContentAnalysisCurrent(valid, { ...version, parent_post_key: 'x:parent-2' }), false);
});

test('V2-28 fabricated text spans and silent unread context are rejected', () => {
  const fabricated = contentProposal({ hook: { type: 'question', exact_span: { start: 0, end: 6, text: '虚构的文字呀' }, promise: 'x' } });
  assert.throws(() => validateContentAnalysis(fabricated, { post_versions: { 'post-version-1': version } }, contentReceipt(fabricated)), /does not match/);
  const silent = contentProposal({ context_coverage: { ...contentProposal().context_coverage, full_text: false }, uncertainties: [] });
  assert.throws(() => validateContentAnalysis(silent, { post_versions: { 'post-version-1': version } }, contentReceipt(silent)), /explicit uncertainty/);
  const truncated = { ...version, context_coverage: { ...version.context_coverage, full_text: false } };
  const bound = prepareContentAnalysis([truncated], { requested_post_version_refs: ['post-version-1'], analysis_version: 'reader-v1', max_items: 1 }, {}).work_items[0];
  const falseComplete = contentProposal({ context_hash: bound.context_hash });
  assert.throws(() => validateContentAnalysis(falseComplete, { post_versions: { 'post-version-1': truncated } }, contentReceipt(falseComplete)), /truncated text is complete/);
  assert.throws(() => validateContentAnalysis(contentProposal(), { post_versions: { 'post-version-1': version } }), /approved content review/);
});

function experiment() {
  return {
    contract_version: 2, experiment_id: 'experiment-1', originating_action_id: 'action-1', goal: 'test a clearer opening', hypothesis: '具体开头可能改善目标读者继续阅读',
    single_primary_change: '只修改开头承诺', baseline_scope: { description: 'previous comparable originals', refs: [] }, target_scope: { description: 'next comparable original', refs: [] },
    inclusion_exclusion_rules: ['同主题原创', '排除突发热点'], planned_primary_metric: { definition_id: 'post.impressions', evidence_ref: 'metric-1' }, guardrails: [],
    age_window_or_period: { kind: 'age_window', value: '24h' }, planned_review_condition: '发布24小时且观测成熟', assignment_or_selection_method: '前后观察性比较',
    known_confounders: ['发布时间'], success_interpretation: '主要指标改善且讨论不下降时继续观察', stop_condition: '两个可比样本无改善时修订',
    status: 'proposed', status_history: [{ status: 'proposed', at: '2026-10-26T00:00:00Z', basis_refs: ['action-1'], reason: null }], linked_publication_ids: []
  };
}

test('V2-33/34 experiment cannot execute or succeed without adoption, publication and mature data', () => {
  const plan = experiment();
  assert.doesNotThrow(() => validate('ExperimentPlanV2', plan));
  assert.equal(validateExperimentPlan(plan, { actions: { 'action-1': {} } }).status, 'proposed');
  const base = { experiments: { 'experiment-1': plan }, actions: { 'action-1': {} }, adoptions: {}, publications: {}, snapshots_v2: {}, experiment_reviews: {}, raw_receipts: { 'user-confirmation-1': { receipt_id: 'user-confirmation-1' } }, post_aliases: {}, post_entities: { 'x:101': { post_key: 'x:101', current_version_ref: 'pv101' } }, post_versions: { pv101: { post_version_id: 'pv101', post_key: 'x:101', created_at: '2026-10-26T02:00:00Z' } }, posts: {} };
  assert.throws(() => applyExperimentTransition(base, { event_id: 'event-1', experiment_id: 'experiment-1', type: 'accept', at: '2026-10-26T01:00:00Z' }), /explicit user or adoption evidence/);
  const accepted = applyExperimentTransition(base, { event_id: 'event-2', experiment_id: 'experiment-1', type: 'accept', at: '2026-10-26T01:00:00Z' }, { user_acceptance_ref: 'user-confirmation-1' });
  assert.equal(accepted.experiments['experiment-1'].status, 'accepted');
  assert.throws(() => applyExperimentTransition(accepted, { event_id: 'event-3', experiment_id: 'experiment-1', type: 'publish', at: '2026-10-26T02:00:00Z', publication_ids: ['missing'] }), /Missing actual evidence/);
  accepted.publications.pub1 = { publication_id: 'pub1', post_id: '101', recorded_at: '2026-10-26T02:05:00Z' };
  const running = applyExperimentTransition(accepted, { event_id: 'event-4', experiment_id: 'experiment-1', type: 'publish', at: '2026-10-26T02:00:00Z', publication_ids: ['pub1'] });
  assert.equal(running.experiments['experiment-1'].status, 'running');
  running.raw_receipts = { coverage1: { receipt_id: 'coverage1' } };
  assert.throws(() => applyExperimentTransition(running, { event_id: 'event-5', experiment_id: 'experiment-1', type: 'check_maturity', at: '2026-10-27T02:00:00Z' }, { coverage_receipt_ref: 'coverage1', required_observation_refs: [], pending_observation_refs: ['snap:with:colon:impressions'] }), /not mature/);
  running.snapshots_v2.other = { snapshot_id: 'snap:other', entity_type: 'post', entity_id: 'x:999', observed_at: '2026-10-27T02:00:00Z', metrics: { likes: { definition_id: 'post.likes', availability: 'observed', value: 99 } } };
  assert.throws(() => applyExperimentTransition(running, { event_id: 'event-bypass', experiment_id: 'experiment-1', type: 'check_maturity', at: '2026-10-27T02:00:00Z' }, { coverage_receipt_ref: 'coverage1', required_observation_refs: ['snap:other:likes'], pending_observation_refs: [] }), /planned available metric/);
  running.snapshots_v2.own = { snapshot_id: 'snap:own', entity_type: 'post', entity_id: 'x:101', observed_at: '2026-10-27T02:00:00Z', metrics: { impressions: { definition_id: 'post.impressions', availability: 'observed', value: 120 } } };
  const ready = applyExperimentTransition(running, { event_id: 'event-ready', experiment_id: 'experiment-1', type: 'check_maturity', at: '2026-10-27T02:00:00Z' }, { coverage_receipt_ref: 'coverage1', required_observation_refs: ['snap:own:impressions'], pending_observation_refs: [] });
  assert.equal(ready.experiments['experiment-1'].status, 'ready_for_review');
  const closed = applyExperimentTransition(running, { event_id: 'event-6', experiment_id: 'experiment-1', type: 'close', at: '2026-10-27T02:00:00Z' }, { coverage_receipt_ref: 'coverage1', review: { review_id: 'review-1', experiment_id: 'experiment-1', conclusion: 'inconclusive', mature_observation_refs: [], publication_ids: ['pub1'], reason: '观测缺失' } });
  assert.equal(closed.experiments['experiment-1'].status, 'closed');
  assert.equal(closed.experiment_reviews['review-1'].conclusion, 'inconclusive');
});

test('V2-36/48 rule evidence cannot be refreshed by timestamp or back-applied as fact', () => {
  const source = { content_hash: 'a'.repeat(64) };
  const old = { contract_version: 2, rule_id: 'r', rule_version_id: 'rv1', repo: 'https://github.com/example/r', commit: 'abc', path: 'rank.rs', symbol: 'score', source_material_ref: 'src', source_content_hash: source.content_hash, checked_at: '2026-10-26T00:00:00Z', publicly_available_from: '2026-10-20T00:00:00Z', applicable_surface: 'for_you', preconditions: ['candidate'], observed_behavior: 'predicts outcomes', inference_boundary: 'not a points formula', production_status: 'unknown', supersedes: null };
  const state = { sources: { src: source }, rule_versions_v2: { rv1: old } };
  assert.equal(validateRuleVersionV2(old, state).rule_version_id, 'rv1');
  assert.doesNotThrow(() => validate('RuleVersionV2', old));
  assert.throws(() => validateRuleVersionV2({ ...old, rule_version_id: 'rv2', checked_at: '2026-10-27T00:00:00Z', supersedes: 'rv1' }, state), /checked_at alone/);
  assert.equal(assessRuleHistoricalApplicability(old, '2026-10-01T00:00:00Z').status, 'unknown');
});
