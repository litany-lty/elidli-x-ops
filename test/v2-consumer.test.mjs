import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeUrl } from './helpers/runtime.mjs';

const { buildConsumerContext } = await import(runtimeUrl('scripts/lib/consumer-context.mjs'));
const { checkDraft } = await import(runtimeUrl('scripts/lib/draft.mjs'));

const goal = { primary_goal: 'clicks', goal_notes: 'synthetic site visits', source: 'user_confirmed' };

function fixtureState() {
  return {
    schema_version: 2,
    config: { content: {
      primary_goal: 'clicks', goal_notes: 'synthetic site visits', allowed_formats: ['short_post', 'thread', 'reply'],
      voice_samples: [{ sample_id: 'voice-1', text: 'synthetic voice', source_ref: 'source-voice', confirmed_by_user: true }],
    } },
    preference_meta: { '/content/primary_goal': { basis: 'user' } },
    sources: { 'source-voice': { record: { source_id: 'source-voice' } } },
    post_versions: { 'version-1': {
      post_version_id: 'version-1', post_key: 'x:1', content_hash: 'content-hash', context_hash: 'context-hash', text: 'synthetic historical text',
    } },
    content_analyses: { 'analysis-1': {
      analysis_id: 'analysis-1', post_version_ref: 'version-1', content_hash: 'content-hash', context_hash: 'context-hash', analysis_version: 'v1', issues: ['synthetic issue'],
      primary_topic: 'synthetic topic', intended_reader: 'synthetic reader', reader_problem: 'synthetic problem', post_purpose: 'explain',
      context_coverage: { full_text: true, parent: 'not_applicable', quote: 'not_applicable', thread: 'not_applicable', media: 'not_seen', linked_source: 'not_applicable' },
      strengths: ['specific scope'], uncertainties: ['media not seen'],
    } },
    actions: {
      'action-accepted': { action_id: 'action-accepted', status: 'accepted', objective: 'clicks', target: 'content_series', change: 'synthetic accepted action', why_now: 'synthetic evidence', uncertainties: [] },
      'action-proposed': { action_id: 'action-proposed', status: 'proposed', objective: 'clicks', target: 'content_series', change: 'not yet selected', why_now: 'pending', uncertainties: [] },
    },
    evidence_bundles: { 'bundle-1': { bundle_id: 'bundle-1', goal_snapshot: goal } },
    coaching_reports: { 'report-1': { report_id: 'report-1', bundle_id: 'bundle-1', actions: [{ action_id: 'action-accepted' }, { action_id: 'action-proposed' }] } },
    experiments: {
      'experiment-1': { experiment_id: 'experiment-1', status: 'closed' },
      'experiment-active': {
        experiment_id: 'experiment-active', goal: 'clicks', hypothesis: 'synthetic hypothesis', single_primary_change: 'change one link promise',
        status: 'proposed', planned_primary_metric: { definition_id: 'post.url_clicks', evidence_ref: null },
        planned_review_condition: 'after three synthetic posts', known_confounders: ['topic'], linked_publication_ids: [],
      },
    },
    experiment_reviews: { 'experiment-review-1': {
      review_id: 'experiment-review-1', experiment_id: 'experiment-1', conclusion: 'revise', reason: 'synthetic result',
      metric_results: [{ metric_definition_id: 'post.url_clicks', value: 2, selected_observation_refs: ['snap-1:url_clicks'], status: 'available', reasons: [] }],
      evidence_refs: ['snap-1:url_clicks'],
    } },
    drafts: {}, claims: {}, user_facts: {}, raw_receipts: {},
  };
}

test('consumer context contains only current, recoverable personal evidence and changes with its bytes', () => {
  const state = fixtureState();
  const context = buildConsumerContext(state, { intent: 'draft', goal_snapshot: goal });
  assert.deepEqual(context.content_analysis_refs, ['analysis-1']);
  assert.deepEqual(context.voice_sample_refs, ['voice-1']);
  assert.deepEqual(context.prior_action_refs, ['action-accepted', 'action-proposed']);
  assert.deepEqual(context.active_experiment_refs, ['experiment-active']);
  assert.deepEqual(context.experiment_review_refs, ['experiment-review-1']);
  assert.deepEqual(context.refs, ['action-accepted', 'action-proposed', 'analysis-1', 'experiment-active', 'experiment-review-1', 'voice-1']);
  assert.deepEqual(context.limitations, []);

  state.actions['action-accepted'].change = 'changed personal evidence';
  assert.notEqual(buildConsumerContext(state, { intent: 'draft', goal_snapshot: goal }).context_hash, context.context_hash);
  assert.notEqual(buildConsumerContext(state, { intent: 'news', goal_snapshot: goal }).context_hash, context.context_hash);
});

test('consumer keeps prior analysis as history and selects the latest reviewed interpretation',()=>{
  const state=fixtureState();
  state.content_analyses['analysis-1'].reviewed_at='2026-10-25T00:00:00Z';
  state.content_analyses['analysis-2']={...state.content_analyses['analysis-1'],analysis_id:'analysis-2',analysis_version:'v2',reviewed_at:'2026-10-26T00:00:00Z',issues:['scope corrected']};
  const context=buildConsumerContext(state,{intent:'news',goal_snapshot:goal});
  assert.deepEqual(context.content_analysis_refs,['analysis-2']);
  assert.equal(Object.keys(state.content_analyses).length,2);
});

test('draft check returns the current personalization context and rejects a stale inherited hash', () => {
  const state = fixtureState();
  const context = buildConsumerContext(state, { intent: 'draft', goal_snapshot: goal });
  const input = {
    draft_id: null, revision: 1, parent_revision: null, card_id: null,
    personal_context_hash: context.context_hash,
    original_text: 'synthetic original', original_ref: null, format: 'short_post', texts: ['synthetic revision one'],
    fact_mapping: [], semantic_review: null,
  };
  const first = checkDraft(input, { state, effective_config: { config: state.config }, data_mode: 'fixture', goal_snapshot: goal }, '2026-10-26T04:00:00Z');
  assert.equal(first.draft.personal_context_hash, context.context_hash);
  assert.equal(first.personalization_context.context_hash, context.context_hash);
  state.drafts[first.draft.draft_id] = { latest_revision: 1, revisions: { 1: first.draft } };
  state.actions['action-accepted'].change = 'changed after first check';
  assert.throws(() => checkDraft({ ...input, draft_id: first.draft.draft_id, revision: 2, parent_revision: 1, personal_context_hash: null, texts: ['synthetic revision two'] },
    { state, effective_config: { config: state.config }, data_mode: 'fixture', goal_snapshot: goal }, '2026-10-26T05:00:00Z'),
  error => error.code === 'STALE_DRAFT' && error.path === '/payload/draft_input/personal_context_hash');
});

test('missing personal history stays an explicit limitation instead of becoming fake evidence', () => {
  const state = fixtureState();
  state.content_analyses = {};
  state.config.content.voice_samples = [];
  state.experiment_reviews = {};
  const context = buildConsumerContext(state, { intent: 'news', goal_snapshot: goal });
  assert.deepEqual(context.refs, ['action-accepted', 'action-proposed', 'experiment-active']);
  assert.equal(context.limitations.length, 3);
});

test('proposed guidance and active experiments remain plans, not effect results', () => {
  const state = fixtureState();
  const context = buildConsumerContext(state, { intent: 'news', goal_snapshot: goal });
  const action = context.items.find(item => item.ref === 'action-proposed');
  const experiment = context.items.find(item => item.ref === 'experiment-active');
  assert.equal(action.value.status, 'proposed');
  assert.equal(action.value.goal_matches_current, true);
  assert.equal(experiment.kind, 'active_experiment');
  assert.equal(experiment.value.status, 'proposed');
  assert.equal(experiment.value.is_effect_result, false);
  assert.ok(!context.experiment_review_refs.includes('experiment-active'));
});

test('an active experiment state transition changes the frozen consumer hash', () => {
  const state = fixtureState();
  const proposed = buildConsumerContext(state, { intent: 'draft', goal_snapshot: goal });
  state.experiments['experiment-active'].status = 'accepted';
  const accepted = buildConsumerContext(state, { intent: 'draft', goal_snapshot: goal });
  assert.notEqual(accepted.context_hash, proposed.context_hash);
  assert.equal(accepted.items.find(item => item.ref === 'experiment-active').value.status, 'accepted');
});
