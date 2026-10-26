import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));
const { initializeState, loadState, persistenceStatus } = await import(runtimeUrl('scripts/lib/state.mjs'));
const { canonicalHash, textHash } = await import(runtimeUrl('scripts/lib/contracts.mjs'));
const { coachingRunResult } = await import(runtimeUrl('scripts/lib/v2-dispatch.mjs'));
const T = '2026-10-26T04:00:00Z';
const account = { handle: 'fixture_coach_cli', profile_url: 'https://x.com/fixture_coach_cli', user_id: null, identity_basis: 'user_provided' };

async function isolated() {
  const dir = await mkdtemp(join(tmpdir(), 'xops-v2-coach-'));
  const state = initializeState(createDefaultConfig(account), 2); state.revision = 1;
  await writeFile(join(dir, 'account-state.json'), `${JSON.stringify(state)}\n`);
  return dir;
}

async function invoke(command, payload, dir, runId = null) {
  const state = await loadState(dir), input = join(dir, `input-${crypto.randomUUID()}.json`), output = join(dir, `output-${crypto.randomUUID()}.json`);
  await writeFile(input, JSON.stringify({ schema_version: 1, run_id: runId, expected_revision: state.revision, payload }));
  const proc = spawnSync(process.execPath, [fileURLToPath(runtimeUrl('scripts/x-ops.mjs')), command, '--input', input, '--output', output, '--state-dir', dir], { encoding: 'utf8' });
  assert.equal(proc.error, undefined);
  return { exit_code: proc.status, envelope: JSON.parse(proc.stdout) };
}

function analysis(work) {
  const text = '先说明一个具体问题，再给出三个可核查步骤。';
  return { contract_version: 2, analysis_id: 'content-cli-1', post_key: 'x:201', post_version_ref: work.post_version_ref, content_hash: work.content_hash, context_hash: work.context_hash, analysis_version: 'reader-v1', model_or_host_ref: 'host-content-review-1', reviewed_at: '2026-10-26T04:10:00Z', context_coverage: { full_text: true, parent: 'not_applicable', quote: 'not_applicable', thread: 'not_applicable', media: 'not_seen', linked_source: 'not_applicable' }, primary_topic: 'workflow', secondary_topics: [], intended_reader: '需要具体步骤的读者', reader_problem: '不知道怎样开始', post_purpose: 'explain', hook: { type: 'problem', exact_span: { start: 0, end: 10, text: text.slice(0, 10) }, promise: '给出步骤' }, delivery_evidence: [{ claim: '给出三个步骤', span: { start: 12, end: 21, text: text.slice(12, 21) } }], original_contribution: '整理可核查步骤', proof_type: 'reasoning', cta_type: 'none', media_dependency: 'unknown', context_dependency: 'standalone', strengths: ['问题具体'], issues: [], feature_evidence_spans: [{ start: 0, end: 10, text: text.slice(0, 10) }], uncertainties: ['media not_seen'], semantic_review_receipt_ref: 'content-semantic-1' };
}
function contentReceipt(item) { return { review_id: item.semantic_review_receipt_ref, post_version_ref: item.post_version_ref, content_hash: item.content_hash, context_hash: item.context_hash, analysis_version: item.analysis_version, reviewer: 'independent-content-review', reviewed_at: '2026-10-26T04:11:00Z', decision: 'approved' }; }

function coachingProposal(bundle) {
  const metric = Object.keys(bundle.evidence_index).find(ref => ref.startsWith('metric-result:account_period'));
  const action = { action_id: 'action-cli-1', priority: 1, objective: '验证具体开头', target: 'content_series', change: '下一条同主题原创只把开头改成一个具体问题，正文结构和媒体保持不变', why_now: '当前期间指标可作为观察基线，单变量修改能区分解释', account_evidence_refs: [metric], content_evidence_refs: [], rule_version_refs: [], expected_direction: '目标读者更快理解承诺', effort: { level: 'low', basis: '只修改一句开头' }, primary_metric_ref: metric, guardrail_metric_refs: [], observation_window: { description: '发布后24小时' }, review_condition_or_due_at: '取得成熟24小时观测后复查', success_interpretation: '同口径主要指标改善且讨论不下降时继续', stop_or_revise_condition: '两个可比样本无改善时修订', uncertainties: ['样本仍小'], status: 'proposed' };
  return { contract_version: 2, bundle_id: bundle.bundle_id, bundle_hash: bundle.bundle_hash, diagnosis: { diagnosis_id: 'diagnosis-cli-1', bundle_id: bundle.bundle_id, bundle_hash: bundle.bundle_hash, primary_question_or_bottleneck: '先验证开头承诺是否更具体', findings: [{ finding_id: 'finding-cli-1', statement: '当前期间曝光有可用观测', finding_type: 'observation', evidence_refs: [metric], applicable_scope: 'current period', interpretation: '该值可作为后续同口径观察基线', alternative_explanations: [], confidence_level: 'supported', confidence_basis: '平台期间观测', what_would_change_this_finding: '平台更正或发现口径冲突' }], computed_limitations_hash: canonicalHash(bundle.computed_limitations), analyst_limitations: [] }, actions: [action], experiment: { contract_version: 2, experiment_id: 'experiment-cli-1', originating_action_id: action.action_id, goal: '验证更具体的开头', hypothesis: '具体问题开头可能帮助目标读者理解承诺', single_primary_change: '只修改开头承诺', baseline_scope: { description: '已有同主题原创', refs: [] }, target_scope: { description: '下一条同主题原创', refs: [] }, inclusion_exclusion_rules: ['排除突发热点'], planned_primary_metric: { definition_id: 'account.impressions', evidence_ref: metric }, guardrails: [], age_window_or_period: { kind: 'age_window', value: '24h' }, planned_review_condition: '发布24小时且覆盖已核查', assignment_or_selection_method: '观察性前后比较', known_confounders: ['主题和发布时间'], success_interpretation: '主要指标改善且守护指标不降时继续观察', stop_condition: '两个可比样本无改善时修订', status: 'proposed', status_history: [{ status: 'proposed', at: '2026-10-26T04:20:00Z', basis_refs: [action.action_id], reason: null }], linked_publication_ids: [] } };
}

test('normal CLI coaching flow stays partial before receipt and restores complete action/experiment after verified persistence', async () => {
  const dir = await isolated(), material = join(dir, 'material.json');
  const content = { posts: [{ post_id: '201', text: '先说明一个具体问题，再给出三个可核查步骤。', post_type: 'original', created_at: '2026-10-25T00:00:00Z' }], observations: [{ entity_type: 'account', entity_id: 'handle:fixture_coach_cli', metric_key: 'account.impressions', value: 1800, value_kind: 'count', unit: 'count', precision: 'exact', observed_at: T, period: { start: '2026-10-19T04:00:00Z', end_exclusive: T, timezone: 'UTC', source_date_start: '2026-10-19', source_date_end_inclusive: '2026-10-25', raw_period_label: '7d', completeness: 'complete' }, aggregation_basis: 'event_period', distribution: 'total', surface: 'all' }] };
  const bytes = `${JSON.stringify(content)}\n`; await writeFile(material, bytes);
  const common = { contract_version: 2, material_path: material, material_kind: 'canonical_json', source_ref: 'synthetic-coach-material', declared_context: { account_identity_ref: 'x-handle:fixture_coach_cli', measurement_context: { observed_at: T, source_timezone: 'UTC', basis: 'declared' } } };
  const preview = await invoke('data-import', { ...common, operation: 'preview' }, dir);
  const committed = await invoke('data-import', { ...common, operation: 'commit', preview_hash: preview.envelope.data.import_preview.preview_hash }, dir);
  assert.equal(committed.exit_code, 0, JSON.stringify(committed.envelope.errors));
  const imported = await loadState(dir), versionRef = imported.post_entities['x:201'].current_version_ref;
  const request = { contract_version: 2, account_identity: account, requested_scope: { mode: 'full' }, requested_deliverables: ['account_period', 'historical_content', 'next_actions'], analysis_cutoff: T, analysis_request: { requested_outputs: ['account_period'], periods: [{ period_id: 'current', start: '2026-10-19T04:00:00Z', end_exclusive: T, timezone: 'UTC', completeness: 'complete' }], age_windows: [], requested_metric_definition_ids: ['account.impressions'], target_post_keys: ['x:201'], cohort: null, selection_policy: { version: 'policy-v1' } }, goal_snapshot: { primary_goal: 'relevant_reach', goal_notes: null, source: 'user_confirmed' }, constraint_snapshot: { time_budget: 'one post', content_preferences: [], rejected_tactics: [] }, selection_policy_version: 'policy-v1', requested_post_version_refs: [versionRef], available_material_refs: [], rule_version_refs: [], content_analysis_version: 'reader-v1', content_budget: { max_items: 1 }, unresolved_questions: [] };
  const runId = 'coach-cli-flow';
  let response = await invoke('coach-step', { contract_version: 2, operation: 'prepare', request, as_of: T }, dir, runId);
  assert.equal(response.exit_code, 3); const work = response.envelope.data.content_work_items.work_items[0];
  const analyzed = analysis(work);
  response = await invoke('coach-step', { contract_version: 2, operation: 'ingest', kind: 'content_analysis', run_id: runId, data: { analysis: analyzed, semantic_receipt: contentReceipt(analyzed) }, as_of: '2026-10-26T04:10:00Z' }, dir, runId);
  const proposal = coachingProposal(response.envelope.data.bundle);
  response = await invoke('coach-step', { contract_version: 2, operation: 'ingest', kind: 'coaching_proposal', run_id: runId, data: proposal, as_of: '2026-10-26T04:20:00Z' }, dir, runId);
  const proposalHash = response.envelope.data.proposal_hash;
  const semantic = { review_id: 'semantic-cli-1', reviewer: 'independent-host-pass', bundle_hash: proposal.bundle_hash, proposal_hash: proposalHash, analysis_version: 'semantic-v1', reviewed_at: '2026-10-26T04:30:00Z', decision: 'approved', checks: { evidence_supported: true, alternatives_preserved: true, causality_bounded: true, voice_preserved: true, actions_executable: true, metrics_available: true }, issues: [] };
  response = await invoke('coach-step', { contract_version: 2, operation: 'ingest', kind: 'semantic_review', run_id: runId, data: semantic, as_of: '2026-10-26T04:30:00Z' }, dir, runId);
  response = await invoke('coach-step', { contract_version: 2, operation: 'finalize', run_id: runId, proposal_hash: proposalHash, as_of: '2026-10-26T04:40:00Z' }, dir, runId);
  assert.equal(response.exit_code, 3); assert.deepEqual(response.envelope.data.coaching_report.deliverable_status, { account_period: 'complete', historical_content: 'complete', next_actions: 'complete' });
  let saved = await loadState(dir); const statePath = join(dir, 'account-state.json'), readback = join(dir, 'readback.json'), stateHash = canonicalHash(saved);
  await writeFile(readback, JSON.stringify({ artifact_id: statePath, state_revision: saved.revision, state_hash: stateHash }));
  response = await invoke('record', { operation: 'persistence_receipt', data: { provider: 'local_filesystem', artifact_id: statePath, version_id: null, state_revision: saved.revision, state_hash: stateHash, saved_at: '2026-10-26T04:41:00Z', host_call_ref: 'local-readback-1', actual_result_ref: readback }, as_of: '2026-10-26T04:41:00Z' }, dir, runId);
  assert.equal(response.exit_code, 0, JSON.stringify(response.envelope.errors)); assert.equal(response.envelope.data.run_result.execution_status, 'complete');
  saved = await loadState(dir);
  assert.equal(saved.actions['action-cli-1'].status, 'proposed'); assert.equal(saved.experiments['experiment-cli-1'].status, 'proposed');
  assert.equal((await persistenceStatus(dir, saved)), 'saved');
  assert.equal(coachingRunResult(saved, runId, 'saved').execution_status, 'complete');
});

test('empty requested history and unavailable Analytics never become complete through 0 equals 0', async () => {
  const dir = await isolated(), runId = 'coach-empty';
  const request = { contract_version: 2, account_identity: account, requested_scope: { mode: 'full' }, requested_deliverables: ['account_period', 'historical_content', 'next_actions'], analysis_cutoff: T, analysis_request: { requested_outputs: ['account_period'], periods: [], age_windows: [], requested_metric_definition_ids: ['account.impressions'], target_post_keys: [], cohort: null, selection_policy: { version: 'policy-v1' } }, goal_snapshot: { primary_goal: 'relevant_reach', goal_notes: null, source: 'temporary_assumption' }, constraint_snapshot: { time_budget: null, content_preferences: [], rejected_tactics: [] }, selection_policy_version: 'policy-v1', requested_post_version_refs: [], available_material_refs: [], rule_version_refs: [], content_analysis_version: 'reader-v1', content_budget: { max_items: 0 }, unresolved_questions: ['尚未取得私有数据'] };
  const prepared = await invoke('coach-step', { contract_version: 2, operation: 'prepare', request, as_of: T }, dir, runId);
  assert.equal(prepared.exit_code, 3); assert.equal(prepared.envelope.data.bundle.deliverable_status.account_period, 'unavailable');
  assert.equal(prepared.envelope.data.bundle.post_version_refs.length, 0);
  assert.notEqual(prepared.envelope.data.run_result.execution_status, 'complete');
});
