import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runtimeUrl } from './helpers/runtime.mjs';

const { checkDraft } = await import(runtimeUrl('scripts/lib/draft.mjs'));
const { buildReview, buildReviewV2, resolveCardExact, reviewV2RunResult } = await import(runtimeUrl('scripts/lib/review.mjs'));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/account-complete.json', import.meta.url), 'utf8'));
const asOf = fixture.cutoff;

function draftInput(text, overrides = {}) {
  return {
    draft_id: null,
    revision: 1,
    parent_revision: null,
    card_id: 'card3',
    original_text: 'synthetic original',
    original_ref: null,
    format: 'short_post',
    texts: [text],
    fact_mapping: [],
    semantic_review: null,
    ...overrides,
  };
}

function draftContext(state = { drafts: {}, claims: {}, sources: {}, user_facts: {} }) {
  return {
    state,
    data_mode: 'fixture',
    effective_config: { config: { content: { allowed_formats: ['short_post', 'thread', 'reply'] } } },
  };
}

test('V2-31: an ordinary revision inherits its exact news card and cannot rebind it', () => {
  const first = checkDraft(draftInput('synthetic first revision'), draftContext(), asOf).draft;
  const state = { drafts: { [first.draft_id]: { latest_revision: 1, revisions: { 1: first } } }, claims: {}, sources: {}, user_facts: {} };
  const revision = draftInput('synthetic second revision', {
    draft_id: first.draft_id,
    revision: 2,
    parent_revision: 1,
    card_id: null,
  });
  assert.equal(checkDraft(revision, draftContext(state), asOf).draft.card_id, 'card3');
  revision.card_id = 'card1';
  assert.throws(() => checkDraft(revision, draftContext(state), asOf), error =>
    error.code === 'STALE_DRAFT' && error.path === '/payload/draft_input/card_id');
});

test('V2-32: exact card resolution reports missing and conflicting records without a first-card fallback', () => {
  const card1 = { card_id: 'card1', event_id: 'event1', claim_ids: [], angle: 'first' };
  const card3 = { card_id: 'card3', event_id: 'event3', claim_ids: [], angle: 'wanted' };
  const state = { runs: { one: { run_id: 'one', cards: [card1, card3] } } };
  assert.equal(resolveCardExact(state, 'card3').card.angle, 'wanted');
  assert.equal(resolveCardExact(state, 'missing').status, 'missing');
  state.runs.two = { run_id: 'two', cards: [{ ...card3, angle: 'contradiction' }] };
  const conflict = resolveCardExact(state, 'card3');
  assert.equal(conflict.status, 'conflicting');
  assert.equal(conflict.card, null);
});

function v1PostAndSnapshot() {
  const [postId, createdAt, postType, ...numbers] = fixture.rows[0];
  const post = {
    post_key: `x:${postId}`,
    post_id: postId,
    account_id: null,
    author_handle: fixture.account.handle,
    url: `https://x.example/${fixture.account.handle}/status/${postId}`,
    created_at: createdAt,
    text: 'synthetic review body',
    post_type: postType,
    edit_history_ids: [],
    thread_root_id: null,
    primary_topic: 'tools',
    topic_tags: ['tools'],
    source_ref: fixture.source.source_id,
  };
  const sourceB = { ...structuredClone(fixture.source), source_id: 'src-fixture-analytics', locator: 'fixture://analytics' };
  const value = number => ({ value: number, availability: 'observed', precision: 'exact', raw_value: String(number) });
  const metrics = Object.fromEntries(fixture.metric_names.map((name, index) => [name, value(numbers[index])]));
  const snapshot = {
    snapshot_id: 'snap-cross-source',
    entity_type: 'post',
    entity_id: post.post_key,
    account_id: null,
    captured_at: new Date(Date.parse(createdAt) + 24 * 3_600_000).toISOString(),
    source_ref: sourceB.source_id,
    metric_scope: 'public_total',
    aggregation_level: 'post',
    aggregation_window: 'cumulative',
    metrics,
  };
  return { post, snapshot, sourceB };
}

test('V2-05/V2-31: review joins archive text to Analytics metrics and keeps card3 through revision 2', () => {
  const { post, snapshot, sourceB } = v1PostAndSnapshot();
  const policy = {
    cutoff: asOf,
    windows_days: [7, 28],
    age_windows: [{ target_hours: 24, tolerance_hours: 2 }],
    group_by: ['post_type', 'primary_topic'],
    requested_metrics: fixture.metric_names,
    metric_scope: 'public_total',
    source_selection: [fixture.source.source_id],
  };
  const state = {
    account: fixture.account,
    posts: { [post.post_key]: post },
    snapshots: { [snapshot.snapshot_id]: snapshot },
    sources: {
      [fixture.source.source_id]: { record: fixture.source },
      [sourceB.source_id]: { record: sourceB },
    },
    adoptions: { adopt2: { adoption_id: 'adopt2', draft_id: 'draft-news', revision: 2 } },
    publications: { pub2: { publication_id: 'pub2', adoption_id: 'adopt2', post_id: post.post_id, url: post.url, confirmed_by: 'fixture', data_mode: 'fixture' } },
    drafts: { 'draft-news': { latest_revision: 2, revisions: {
      1: { draft_id: 'draft-news', revision: 1, parent_revision: null, card_id: 'card3' },
      2: { draft_id: 'draft-news', revision: 2, parent_revision: 1, card_id: null },
    } } },
    runs: {
      news: { run_id: 'news', cards: [
        { card_id: 'card1', event_id: 'event1', claim_ids: [], angle: 'wrong' },
        { card_id: 'card3', event_id: 'event3', claim_ids: ['claim3'], angle: 'exact' },
      ] },
      edit: { run_id: 'edit', draft_refs: [{ draft_id: 'draft-news', revision: 2 }], cards: [] },
    },
    events: { event3: { event_id: 'event3', source_version_ids: ['version3'] } },
    claims: { claim3: { claim_id: 'claim3', source_version_ids: ['version4'] } },
  };
  const result = buildReview({
    account: fixture.account,
    analysis_cutoff: asOf,
    publication_ids: ['pub2'],
    post_ids: [],
    snapshot_ids: [],
    requested_scope: { mode: 'sample', selection_policy: policy, requested_outputs: ['content', 'latest', 'age_matched'] },
    data_mode: 'fixture',
  }, state);
  assert.equal(result.source_angle_links[0].card_id, 'card3');
  assert.equal(result.source_angle_links[0].angle, 'exact');
  assert.deepEqual(result.source_angle_links[0].source_version_ids, ['version3', 'version4']);
  assert.ok(result.selected_observations.some(item => item.selected_snapshot_id === snapshot.snapshot_id));
  assert.ok(result.descriptive_statistics.metric_groups.some(group => group.source_id === sourceB.source_id));
});

test('V2 review uses stable post identity across source materials and keeps conclusions semantic', () => {
  const postId = '777';
  const postKey = `x:${postId}`;
  const versionId = 'post-version-777';
  const state = {
    account: fixture.account,
    post_entities: { [postKey]: {
      post_key: postKey, post_id: postId, author_id: null, author_handle: fixture.account.handle,
      handle_aliases: [], edit_chain_ids: [], current_version_ref: versionId, evidence_refs: ['source-archive'],
    } },
    post_versions: { [versionId]: {
      post_version_id: versionId, post_key: postKey, content_hash: 'synthetic-content-hash', text: 'synthetic archive body',
      created_at: '2026-10-23T00:00:00Z', url: `https://x.example/${fixture.account.handle}/status/${postId}`,
      source_ref: 'source-archive', source_locator: 'fixture://archive/777',
      context_coverage: { full_text: true, parent: false, quote: false, thread: false, media: false, linked_source: false },
      parent_post_key: null, quoted_post_key: null, thread_root_key: null, media_refs: [],
    } },
    post_aliases: {},
    snapshots_v2: { analytics777: {
      snapshot_id: 'analytics777', contract_version: 2, entity_type: 'post', entity_id: postKey, account_id: null,
      source_ref: 'source-analytics', source_series_id: 'series-analytics', source_locator: 'row:777',
      observed_at: '2026-10-24T00:00:00Z', period: null, aggregation_basis: 'lifetime_as_of',
      distribution: 'total', surface: 'all', cohort_definition_ref: null, revision_status: 'confirmed', supersedes_snapshot_id: null,
      metrics: { impressions: { definition_id: 'post.impressions', value: 321, value_kind: 'count', unit: 'count', precision: 'exact', raw_display: '321', source_field_path: 'Impressions', availability: 'observed', evidence_locator: 'row:777:Impressions' } },
    } },
    source_series: {},
    adoptions: { adopt777: { adoption_id: 'adopt777', draft_id: 'draft777', revision: 2 } },
    publications: { pub777: { publication_id: 'pub777', adoption_id: 'adopt777', post_id: postId } },
    drafts: { draft777: { latest_revision: 2, revisions: {
      1: { draft_id: 'draft777', revision: 1, parent_revision: null, card_id: 'card3' },
      2: { draft_id: 'draft777', revision: 2, parent_revision: 1, card_id: null },
    } } },
    runs: { news: { run_id: 'news', cards: [{ card_id: 'card3', event_id: 'event3', claim_ids: [], angle: 'exact' }] } },
    events: { event3: { event_id: 'event3', source_version_ids: [] } },
    claims: {},
    experiments: { exp777: {
      experiment_id: 'exp777', status: 'running', linked_publication_ids: ['pub777'],
      planned_primary_metric: { definition_id: 'post.impressions', evidence_ref: 'metric-baseline' },
    } },
  };
  const reviewInput = {
    contract_version: 2,
    account: fixture.account,
    analysis_cutoff: asOf,
    publication_ids: ['pub777'],
    post_keys: [],
    experiment_id: 'exp777',
    analysis_request: { requested_outputs: ['publication_cohort'], requested_metric_definition_ids: ['post.impressions'] },
  };
  const result = buildReviewV2(reviewInput, state);
  assert.equal(result.account_analysis.post_cohort_results[0].value, 321);
  assert.deepEqual(result.account_analysis.post_cohort_results[0].selected_observation_refs, ['analytics777:impressions']);
  assert.equal(result.source_angle_links[0].card_id, 'card3');
  assert.equal(result.source_angle_links[0].card_resolution, 'resolved');
  assert.equal(result.semantic_review_required, true);
  assert.equal(result.experiment_execution.executed, true);
  assert.equal(result.experiment_execution.observation_state, 'mature');
  assert.equal(Object.hasOwn(result, 'conclusion'), false);
  assert.equal(reviewV2RunResult(reviewInput, result, state).execution_status, 'partial');

  const historyOnlyInput = { ...reviewInput, experiment_id: null };
  const historyOnly = buildReviewV2(historyOnlyInput, state);
  assert.equal(reviewV2RunResult(historyOnlyInput, historyOnly, state).execution_status, 'complete');
});
