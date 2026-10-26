import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { advanceCoaching, prepareCoaching, validateCoachingProposal, finalizeCoaching } from '../scripts/lib/coaching.mjs';
import { prepareContentAnalysis } from '../scripts/lib/post-content.mjs';

const account = { handle: 'fixture_coach', profile_url: 'https://x.com/fixture_coach', user_id: null, identity_basis: 'user_provided' };
const postText = '一个具体问题，以及三个可以核查的步骤。';
function state() {
  return {
    schema_version: 2, revision: 1, account,
    sources: {}, raw_receipts: {}, posts: {}, snapshots: {}, drafts: {}, adoptions: {}, publications: {}, actions: {}, experiments: {}, experiment_reviews: {},
    import_batches: {}, source_series: { series1: { source_series_id: 'series1' } }, post_aliases: {},
    post_entities: { 'x:101': { post_key: 'x:101', post_id: '101', author_id: null, author_handle: 'fixture_coach', handle_aliases: [], edit_chain_ids: [], current_version_ref: 'pv1', evidence_refs: ['src-post'] } },
    post_versions: { pv1: { post_version_id: 'pv1', post_key: 'x:101', content_hash: canonicalHash(postText), text: postText, post_type: 'original', created_at: '2026-10-25T00:00:00Z', url: 'https://x.com/fixture_coach/status/101', source_ref: 'src-post', source_locator: 'posts/0', context_coverage: { full_text: true, parent: false, quote: false, thread: false, media: false, linked_source: false }, parent_post_key: null, quoted_post_key: null, thread_root_key: null, media_refs: [] } },
    snapshots_v2: { snap1: { snapshot_id: 'snap1', contract_version: 2, entity_type: 'account', entity_id: 'handle:fixture_coach', account_id: null, source_ref: 'src-metrics', source_series_id: 'series1', source_locator: 'overview/impressions', observed_at: '2026-10-26T00:00:00Z', period: { start: '2026-10-19T00:00:00Z', end_exclusive: '2026-10-26T00:00:00Z', timezone: 'UTC', source_date_start: '2026-10-19', source_date_end_inclusive: '2026-10-25', raw_period_label: '7d', completeness: 'complete' }, aggregation_basis: 'event_period', distribution: 'total', surface: 'all', cohort_definition_ref: null, revision_status: 'confirmed', supersedes_snapshot_id: null, metrics: { impressions: { definition_id: 'account.impressions', value: 1200, value_kind: 'count', unit: 'count', precision: 'exact', raw_display: '1,200', source_field_path: 'overview.impressions', availability: 'observed', evidence_locator: 'overview/impressions' } } } },
    content_analyses: {}, coaching_runs: {}, evidence_bundles: {}, diagnoses: {}, coaching_reports: {}, rule_versions_v2: {}
  };
}

function request(goal = 'relevant_reach', maxItems = 1) {
  return {
    contract_version: 2, account_identity: account, requested_scope: { mode: 'full' }, requested_deliverables: ['account_period', 'historical_content', 'next_actions'], analysis_cutoff: '2026-10-26T00:00:00Z',
    analysis_request: { requested_outputs: ['account_period'], periods: [{ period_id: 'current', start: '2026-10-19T00:00:00Z', end_exclusive: '2026-10-26T00:00:00Z', timezone: 'UTC', completeness: 'complete' }], requested_metric_definition_ids: ['account.impressions'], age_windows: [], target_post_keys: ['x:101'], cohort: null, selection_policy: { version: 'policy-1' } },
    goal_snapshot: { primary_goal: goal, goal_notes: null, source: 'user_confirmed' }, constraint_snapshot: { time_budget: 'one post', content_preferences: [], rejected_tactics: [] }, selection_policy_version: 'policy-1', requested_post_version_refs: ['pv1'], available_material_refs: [], rule_version_refs: [], content_analysis_version: 'reader-v1', content_budget: { max_items: maxItems }, unresolved_questions: []
  };
}

function contentAnalysis(bundleWork) {
  return {
    contract_version: 2, analysis_id: 'ca1', post_key: 'x:101', post_version_ref: 'pv1', content_hash: bundleWork.content_hash, context_hash: bundleWork.context_hash, analysis_version: 'reader-v1', model_or_host_ref: 'host-1', reviewed_at: '2026-10-26T00:10:00Z', context_coverage: { full_text: true, parent: 'not_applicable', quote: 'not_applicable', thread: 'not_applicable', media: 'not_seen', linked_source: 'not_applicable' }, primary_topic: 'workflow', secondary_topics: [], intended_reader: '需要可执行步骤的读者', reader_problem: '缺少具体步骤', post_purpose: 'explain', hook: { type: 'problem', exact_span: { start: 0, end: 6, text: '一个具体问题' }, promise: '三个步骤' }, delivery_evidence: [{ claim: '给出步骤', span: { start: 9, end: 18, text: '三个可以核查的步骤' } }], original_contribution: '整理步骤', proof_type: 'reasoning', cta_type: 'none', media_dependency: 'unknown', context_dependency: 'standalone', strengths: ['具体'], issues: [], feature_evidence_spans: [{ start: 0, end: 6, text: '一个具体问题' }], uncertainties: ['media not_seen'], semantic_review_receipt_ref: 'content-review-1'
  };
}
function contentReceipt(item) { return { review_id: item.semantic_review_receipt_ref, post_version_ref: item.post_version_ref, content_hash: item.content_hash, context_hash: item.context_hash, analysis_version: item.analysis_version, reviewer: 'independent-content-review', reviewed_at: '2026-10-26T00:11:00Z', decision: 'approved' }; }

function proposal(bundle) {
  const metricRef = Object.keys(bundle.evidence_index).find(ref => ref.startsWith('metric-result:account_period'));
  const diagnosis = { diagnosis_id: 'diagnosis-1', bundle_id: bundle.bundle_id, bundle_hash: bundle.bundle_hash, primary_question_or_bottleneck: '当前先验证开头承诺是否更清楚', findings: [{ finding_id: 'finding-1', statement: '期间曝光有可用观测', finding_type: 'observation', evidence_refs: [metricRef], applicable_scope: 'current period', interpretation: '规模可作为后续观察基线', alternative_explanations: [], confidence_level: 'supported', confidence_basis: '平台期间观测', what_would_change_this_finding: '发现口径冲突或更正' }], computed_limitations_hash: canonicalHash(bundle.computed_limitations), analyst_limitations: [] };
  return { contract_version: 2, bundle_id: bundle.bundle_id, bundle_hash: bundle.bundle_hash, diagnosis, actions: [{ action_id: 'action-1', priority: 1, objective: '测试更明确的开头', target: 'content_series', change: '下一条同主题原创只把开头改成一个具体问题，正文和媒体形式保持一致', why_now: '已有期间规模基线，单变量修改便于区分解释', account_evidence_refs: [metricRef], content_evidence_refs: [], rule_version_refs: [], expected_direction: '保持规模并提高目标读者理解', effort: { level: 'low', basis: '只修改开头' }, primary_metric_ref: metricRef, guardrail_metric_refs: [], observation_window: { description: '发布后24小时' }, review_condition_or_due_at: '取得成熟24小时观测后复查', success_interpretation: '同口径指标改善时继续观察', stop_or_revise_condition: '两个可比样本无改善或讨论下降时修订', uncertainties: ['样本小'], status: 'proposed' }], experiment: null };
}

test('V2-29/30 computed limitations and concrete actions are mandatory', () => {
  const s = state();
  const limitedRequest = request();
  limitedRequest.analysis_request.periods[0].completeness = 'partial';
  const { bundle } = prepareCoaching(s, limitedRequest);
  assert.doesNotThrow(() => validate('EvidenceBundleV2', bundle));
  const good = proposal(bundle);
  assert.throws(() => validateCoachingProposal({ ...good, diagnosis: { ...good.diagnosis, computed_limitations_hash: canonicalHash([]) } }, bundle, s), /cannot be deleted/);
  assert.throws(() => validateCoachingProposal({ ...good, actions: [] }, bundle, s), /one to three/);
  assert.throws(() => validateCoachingProposal({ ...good, actions: [{ ...good.actions[0], change: '提高内容质量' }] }, bundle, s), /concrete/);
});

test('V2-35 a declined action cannot be repeated on the same evidence', () => {
  const s = state(), first = prepareCoaching(s, request()), prior = proposal(first.bundle);
  s.actions.old = { ...prior.actions[0], action_id: 'old', status: 'declined' };
  const { bundle } = prepareCoaching(s, request()), repeated = proposal(bundle);
  assert.throws(() => validateCoachingProposal(repeated, bundle, s), /needs new evidence/);
});

test('V2-37/42 controller invalidates proposals on new content and supports explicit limited scope', () => {
  let s = state();
  let step = advanceCoaching(s, { contract_version: 2, operation: 'prepare', request: request(), as_of: '2026-10-26T00:00:00Z' });
  s = step.state; const runId = step.result.run.run_id;
  assert.doesNotThrow(() => validate('CoachingRunV2', step.result.run));
  assert.equal(step.result.run.status, 'awaiting_content');
  const analyzed = contentAnalysis(step.result.content_work_items.work_items[0]);
  step = advanceCoaching(s, { contract_version: 2, operation: 'ingest', kind: 'content_analysis', run_id: runId, data: { analysis: analyzed, semantic_receipt: contentReceipt(analyzed) }, as_of: '2026-10-26T00:10:00Z' }, runId);
  s = step.state; assert.equal(step.result.run.status, 'evidence_ready');
  const good = proposal(step.result.bundle);
  step = advanceCoaching(s, { contract_version: 2, operation: 'ingest', kind: 'coaching_proposal', run_id: runId, data: good, as_of: '2026-10-26T00:20:00Z' }, runId);
  assert.equal(step.result.run.status, 'proposal_validated');
  const semantic = { review_id: 'sr1', reviewer: 'independent-host-pass', reviewed_at: '2026-10-26T00:30:00Z', bundle_hash: good.bundle_hash, proposal_hash: step.result.proposal_hash, analysis_version: 'semantic-v1', decision: 'approved', checks: { evidence_supported: true, alternatives_preserved: true, causality_bounded: true, voice_preserved: true, actions_executable: true, metrics_available: true }, issues: [] };
  const snapshotChanged = structuredClone(s);
  snapshotChanged.snapshots_v2.snap2 = { ...snapshotChanged.snapshots_v2.snap1, snapshot_id: 'snap2', observed_at: '2026-10-26T00:01:00Z', metrics: { impressions: { ...snapshotChanged.snapshots_v2.snap1.metrics.impressions, value: 1800, raw_display: '1,800' } } };
  assert.throws(() => finalizeCoaching(step.result.run.proposal, semantic, snapshotChanged), /Eligible account observations/);
  s.post_versions.pv1 = { ...s.post_versions.pv1, text: `${postText}补充`, content_hash: canonicalHash(`${postText}补充`) };
  assert.throws(() => finalizeCoaching(step.result.run.proposal, semantic, s), /Eligible account observations|Bound evidence changed/);

  s = state();
  step = advanceCoaching(s, { contract_version: 2, operation: 'prepare', request: request('relevant_reach', 0), as_of: '2026-10-26T00:00:00Z' });
  const limited = advanceCoaching(step.state, { contract_version: 2, operation: 'ingest', kind: 'evidence_scope', run_id: step.result.run.run_id, data: { unread_post_version_refs: ['pv1'], unavailable_reasons: ['内容预算已用完，仅读取0/1条'] }, as_of: '2026-10-26T00:05:00Z' }, step.result.run.run_id);
  assert.equal(limited.result.run.status, 'evidence_ready');
  assert.deepEqual(limited.result.bundle.scope_freeze.unread_post_version_refs, ['pv1']);
});

test('V2-47 content facts are reused while a goal change creates a new evidence bundle', () => {
  const s = state();
  const first = prepareCoaching(s, request('relevant_reach'));
  s.content_analyses.ca1 = contentAnalysis(first.content_work_items.work_items[0]);
  s.content_review_receipts = { 'content-review-1': contentReceipt(s.content_analyses.ca1) };
  const reach = prepareCoaching(s, request('relevant_reach'));
  const clicks = prepareCoaching(s, request('clicks'));
  assert.deepEqual(reach.bundle.content_analysis_refs, ['ca1']);
  assert.deepEqual(clicks.bundle.content_analysis_refs, ['ca1']);
  assert.notEqual(reach.bundle.bundle_hash, clicks.bundle.bundle_hash);
  assert.equal(clicks.content_work_items.work_items.length, 0);
});

test('content bundle selects only the requested approved analysis version while preserving older history', () => {
  const s = state(), initial = prepareCoaching(s, request()), v1 = contentAnalysis(initial.content_work_items.work_items[0]);
  const v2 = { ...v1, analysis_id: 'ca2', analysis_version: 'reader-v2', semantic_review_receipt_ref: 'content-review-2', reviewed_at: '2026-10-26T00:20:00Z' };
  s.content_analyses = { ca1: v1, ca2: v2 };
  s.content_review_receipts = { 'content-review-1': contentReceipt(v1), 'content-review-2': contentReceipt(v2) };
  const requestV2 = request(); requestV2.content_analysis_version = 'reader-v2';
  const prepared = prepareCoaching(s, requestV2);
  assert.deepEqual(prepared.bundle.content_analysis_refs, ['ca2']);
  assert.equal(prepared.content_work_items.work_items.length, 0);
  assert.equal(Object.keys(s.content_analyses).length, 2);
});

test('available source IDs resolve through private import artifact metadata and missing IDs reject', () => {
  const s = state();
  s.import_artifacts = { abc: { artifact_sha256: 'abc', source_ref: 'analytics-private', material_kind: 'analytics_csv', path: '/private/material.csv' } };
  const found = request(); found.available_material_refs = ['analytics-private'];
  assert.equal(prepareCoaching(s, found).bundle.evidence_index['analytics-private'].type, 'source_material');
  const missing = request(); missing.available_material_refs = ['missing-material'];
  assert.throws(() => prepareCoaching(s, missing), /not recoverable/);
});

test('grouped post and age metrics receive unique typed evidence references', () => {
  const s = state();
  s.snapshots_v2.post1 = { snapshot_id: 'post-snap1', contract_version: 2, entity_type: 'post', entity_id: 'x:101', account_id: null, source_ref: 'src-metrics', source_series_id: 'series1', source_locator: 'posts/0/impressions', observed_at: '2026-10-26T00:00:00Z', period: null, aggregation_basis: 'lifetime_as_of', distribution: 'total', surface: 'all', cohort_definition_ref: null, revision_status: 'confirmed', supersedes_snapshot_id: null, metrics: { impressions: { definition_id: 'post.impressions', value: 100, value_kind: 'count', unit: 'count', precision: 'exact', raw_display: '100', source_field_path: 'posts/0/impressions', availability: 'observed', evidence_locator: 'posts/0/impressions' } } };
  const grouped = request(); grouped.analysis_request.requested_outputs = ['publication_cohort', 'age_matched']; grouped.analysis_request.requested_metric_definition_ids = ['post.impressions']; grouped.analysis_request.age_windows = [{ window_id: '24h', target_hours: 24, tolerance_hours: 2 }];
  const bundle = prepareCoaching(s, grouped).bundle, refs = Object.keys(bundle.evidence_index);
  assert(refs.includes('metric-result:post_cohort:all:all:post.impressions'));
  assert(refs.includes('metric-result:post_cohort:all:original:post.impressions'));
  assert(refs.includes('metric-result:age_matched:all:all:24h:post.impressions'));
  assert(refs.includes('metric-result:age_matched:all:original:24h:post.impressions'));
});

test('V2-42 content budget is total per run and survives phased resume', () => {
  let s = state();
  const text2 = '第二条用于验证总预算。';
  s.post_entities['x:102'] = { ...s.post_entities['x:101'], post_key: 'x:102', post_id: '102', current_version_ref: 'pv2' };
  s.post_versions.pv2 = { ...s.post_versions.pv1, post_version_id: 'pv2', post_key: 'x:102', text: text2, content_hash: canonicalHash(text2), url: 'https://x.com/fixture_coach/status/102', source_locator: 'posts/1' };
  const limited = request('relevant_reach', 1); limited.requested_post_version_refs = ['pv1', 'pv2']; limited.analysis_request.target_post_keys = ['x:101', 'x:102'];
  let step = advanceCoaching(s, { contract_version: 2, operation: 'prepare', request: limited, as_of: '2026-10-26T00:00:00Z' });
  const runId = step.result.run.run_id, first = contentAnalysis(step.result.content_work_items.work_items[0]);
  step = advanceCoaching(step.state, { contract_version: 2, operation: 'ingest', kind: 'content_analysis', run_id: runId, data: { analysis: first, semantic_receipt: contentReceipt(first) }, as_of: '2026-10-26T00:10:00Z' }, runId);
  assert.equal(step.result.run.accepted_content_count, 1); assert.equal(step.result.run.status, 'awaiting_content');
  assert.equal(step.result.content_work_items.work_items.length, 0); assert.deepEqual(step.result.content_work_items.unread_post_version_refs, ['pv2']);
  const secondWork = prepareContentAnalysis([s.post_versions.pv2], { requested_post_version_refs: ['pv2'], analysis_version: 'reader-v1', max_items: 1 }, {}).work_items[0];
  const second = { ...contentAnalysis(secondWork), analysis_id: 'ca2', post_key: 'x:102', semantic_review_receipt_ref: 'content-review-2' };
  assert.throws(() => advanceCoaching(step.state, { contract_version: 2, operation: 'ingest', kind: 'content_analysis', run_id: runId, data: { analysis: second, semantic_receipt: contentReceipt(second) }, as_of: '2026-10-26T00:20:00Z' }, runId), /total new-content analysis budget/);
  const restored = structuredClone(step.state); assert.doesNotThrow(() => validate('CoachingRunV2', restored.coaching_runs[runId]));
  const frozen = advanceCoaching(restored, { contract_version: 2, operation: 'ingest', kind: 'evidence_scope', run_id: runId, data: { unread_post_version_refs: ['pv2'], unavailable_reasons: ['本轮内容预算1条已用完'] }, as_of: '2026-10-26T00:30:00Z' }, runId);
  assert.equal(frozen.result.run.status, 'evidence_ready'); assert.equal(frozen.result.run.accepted_content_count, 1);
});

test('coaching prepare, evidence, proposal, independent review and exact finalize form one recoverable run', () => {
  let step = advanceCoaching(state(), { contract_version: 2, operation: 'prepare', request: request(), as_of: '2026-10-26T00:00:00Z' });
  const runId = step.result.run.run_id;
  const analyzed = contentAnalysis(step.result.content_work_items.work_items[0]);
  step = advanceCoaching(step.state, { contract_version: 2, operation: 'ingest', kind: 'content_analysis', run_id: runId, data: { analysis: analyzed, semantic_receipt: contentReceipt(analyzed) }, as_of: '2026-10-26T00:10:00Z' }, runId);
  const proposed = proposal(step.result.bundle);
  step = advanceCoaching(step.state, { contract_version: 2, operation: 'ingest', kind: 'coaching_proposal', run_id: runId, data: proposed, as_of: '2026-10-26T00:20:00Z' }, runId);
  const proposalHash = step.result.proposal_hash;
  const review = { review_id: 'semantic-review-1', reviewer: 'independent-host-pass', bundle_hash: proposed.bundle_hash, proposal_hash: proposalHash, analysis_version: 'semantic-v1', reviewed_at: '2026-10-26T00:30:00Z', decision: 'approved', checks: { evidence_supported: true, alternatives_preserved: true, causality_bounded: true, voice_preserved: true, actions_executable: true, metrics_available: true }, issues: [] };
  assert.doesNotThrow(() => validate('SemanticReviewV2', review));
  step = advanceCoaching(step.state, { contract_version: 2, operation: 'ingest', kind: 'semantic_review', run_id: runId, data: review, as_of: '2026-10-26T00:30:00Z' }, runId);
  assert.throws(() => advanceCoaching(step.state, { contract_version: 2, operation: 'finalize', run_id: runId, proposal_hash: 'old-proposal', as_of: '2026-10-26T00:40:00Z' }, runId), /exact reviewed proposal/);
  step = advanceCoaching(step.state, { contract_version: 2, operation: 'finalize', run_id: runId, proposal_hash: proposalHash, as_of: '2026-10-26T00:40:00Z' }, runId);
  assert.equal(step.result.run.status, 'delivered');
  assert.equal(step.result.coaching_report.deliverable_status.next_actions, 'complete');
  assert.doesNotThrow(() => validate('CoachingReportV2', step.result.coaching_report));
});
