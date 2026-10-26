import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runtimeUrl } from './helpers/runtime.mjs';
const { importAccount, analyzeAccount } = await import(runtimeUrl('scripts/lib/account.mjs'));
const { buildReview } = await import(runtimeUrl('scripts/lib/review.mjs'));

const raw = JSON.parse(readFileSync(new URL('./fixtures/account-complete.json', import.meta.url), 'utf8'));
const rawPartial = JSON.parse(readFileSync(new URL('./fixtures/account-partial.json', import.meta.url), 'utf8'));
const expected = JSON.parse(readFileSync(new URL('./fixtures/account-expected.json', import.meta.url), 'utf8'));
const T = raw.cutoff;
const source = raw.source;
const account = raw.account;
const rows = raw.rows;
const metricNames = raw.metric_names;
const value = number => ({ value: number, availability: 'observed', precision: 'exact', raw_value: String(number) });

function post(row) {
  return {
    post_key: `x:${row[0]}`, post_id: row[0], account_id: null, author_handle: 'fixture_complete', url: `https://x.example/fixture_complete/status/${row[0]}`,
    created_at: row[1], text: `fixture text ${row[0]}`, post_type: row[2], edit_history_ids: [], thread_root_id: null,
    primary_topic: 'tools', topic_tags: ['tools'], source_ref: source.source_id
  };
}
function postSnapshot(row) {
  const metrics = Object.fromEntries(metricNames.map((name, index) => [name, value(row[index + 3])]));
  return {
    snapshot_id: `snap-${row[0]}-24h`, entity_type: 'post', entity_id: `x:${row[0]}`, account_id: null,
    captured_at: new Date(Date.parse(row[1]) + 24 * 3_600_000).toISOString(), source_ref: source.source_id,
    metric_scope: 'public_total', aggregation_level: 'post', aggregation_window: 'cumulative', metrics
  };
}
function follower(id, at, count) {
  return { snapshot_id: id, entity_type: 'account', entity_id: 'handle:fixture_complete', account_id: null, captured_at: at,
    source_ref: source.source_id, metric_scope: 'public_total', aggregation_level: 'account', aggregation_window: 'cumulative', metrics: { followers: value(count) } };
}
function fixture() {
  const posts = rows.map(post);
  const snapshots = rows.map(postSnapshot);
  posts.push(structuredClone(posts[1]));
  snapshots.push(structuredClone(snapshots[1]));
  for (const [id, count] of Object.entries(raw.late_impressions)) {
    const row = rows.find(item => item[0] === id);
    const later = postSnapshot(row);
    later.snapshot_id = `snap-${id}-late`;
    later.captured_at = '2026-10-24T18:00:00Z';
    later.metrics.impressions = value(count);
    snapshots.push(later);
  }
  snapshots.push(...raw.followers.map(([at, count], index) => follower(`followers-${index}`, at, count)));
  const policy = { cutoff: T, windows_days: [7, 28], age_windows: [{ target_hours: 24, tolerance_hours: 2 }],
    group_by: ['post_type', 'primary_topic'], requested_metrics: metricNames, metric_scope: 'public_total', source_selection: [source.source_id] };
  return {
    schema_version: 1, account, analysis_cutoff: T,
    requested_scope: { mode: 'full', selection_policy: policy, requested_outputs: ['content', 'latest', 'age_matched', 'comparison'] },
    coverage: { requested_start: '2026-08-30T00:00:00Z', requested_end: T, observed_oldest: '2026-09-10T12:00:00Z', observed_newest: '2026-10-23T12:00:00Z',
      source_mode: 'fixture', status: 'source_window_complete', pages_read: 1, has_more: false, stop_reason: 'window_complete', raw_item_count: 9,
      deduplicated_count: 8, metric_available_counts: { impressions: 8 } },
    posts, snapshots, source_refs: [source], data_mode: 'fixture'
  };
}
function metric(result, metricName, window) {
  return result.metric_groups.find(item => item.metric === metricName && item.window === window);
}
function ratio(result, period) {
  return result.paired_ratios.find(item => item.period === period && item.window === 'age:24h' && item.post_type === 'original');
}

test('ACC-POS computes the independent expected values through production functions', () => {
  const input = fixture();
  const imported = importAccount(input);
  assert.equal(imported.posts.length, 8);
  assert.equal(imported.posts[0].post_id, expected['ACC-POS'].large_post_id);
  const result = analyzeAccount(imported, imported.requested_scope.selection_policy);
  const want = expected['ACC-POS'];
  for (const [period, count] of Object.entries(want.post_counts)) assert.equal(result.post_counts[period].total, count);
  assert.deepEqual(result.post_counts.current_7.by_post_type, want.current_7_post_types);
  assert.deepEqual({ sum: metric(result, 'impressions', 'current_7:age:24h:original').sum, median: metric(result, 'impressions', 'current_7:age:24h:original').median }, want.current_7_original_24h_impressions);
  assert.deepEqual({ sum: metric(result, 'impressions', 'previous_7:age:24h:original').sum, median: metric(result, 'impressions', 'previous_7:age:24h:original').median }, want.previous_7_original_24h_impressions);
  assert.equal(metric(result, 'visible_interactions', 'current_7:age:24h:original').sum, want.visible_interactions.current_7);
  assert.equal(metric(result, 'visible_interactions', 'previous_7:age:24h:original').sum, want.visible_interactions.previous_7);
  assert.ok(Math.abs(ratio(result, 'current_7').value - want.interaction_impression_ratios.current_7) <= want.interaction_impression_ratios.tolerance);
  assert.ok(Math.abs(ratio(result, 'previous_7').value - want.interaction_impression_ratios.previous_7) <= want.interaction_impression_ratios.tolerance);
  assert.equal(metric(result, 'impressions', 'current_7:latest:all').sum, want.current_7_all_latest_impressions_sum);
  const changes = Object.fromEntries(result.follower_changes.map(item => [`${item.window_days}:${item.period}`, item.net_change]));
  assert.deepEqual(changes, want.follower_changes);
});

test('age selection keeps missing distinct from zero and marks immature posts pending', () => {
  const input = fixture();
  input.requested_scope.mode = 'sample';
  input.coverage.status = 'sample';
  input.posts = input.posts.slice(0, 3);
  input.posts[2].created_at = rawPartial.posts[2].created_at;
  input.snapshots = input.snapshots.filter(item => item.entity_type !== 'post' || ['x:9007199254740993', 'x:102', 'x:103'].includes(item.entity_id));
  input.snapshots = input.snapshots.filter(item => !item.snapshot_id.endsWith('-late'));
  for (const snapshot of input.snapshots.filter(item => item.entity_type === 'post')) snapshot.metrics.impressions = { value: null, availability: 'not_provided', precision: 'unknown', raw_value: null };
  const third = input.snapshots.find(item => item.entity_id === 'x:103');
  third.captured_at = rawPartial.posts[2].captured_at;
  third.snapshot_id = 'snap-103-8h';
  const result = analyzeAccount(input, input.requested_scope.selection_policy);
  assert.equal(result.selection_log.find(item => item.post_key === 'x:103' && item.view === 'age:24h').status, 'pending');
  assert.equal(metric(result, 'impressions', 'current_7:age:24h:original').sum, expected['ACC-PART'].impressions_sum);
  assert.equal(ratio(result, 'current_7').value, expected['ACC-PART'].impression_ratio);
});

test('CSV import requires explicit mappings and preserves large IDs as strings', () => {
  const context = fixture();
  context.source_refs=[];
  const csv = 'id,created,text,type,captured,impressions\n9007199254740993,2026-10-18T12:00:00Z,hello,original,2026-10-19T12:00:00Z,1000\n';
  const mapping = { schema_version: 1, mapping_id: 'map-1', columns: { post_id: 'id', created_at: 'created', text: 'text', post_type: 'type', captured_at: 'captured', 'metric.impressions': 'impressions' },
    constants: { author_handle: 'fixture_complete', metric_scope: 'public_total', aggregation_level: 'post', aggregation_window: 'cumulative' },
    time_formats: { created_at: { format: 'iso8601', timezone: 'UTC' }, captured_at: { format: 'iso8601', timezone: 'UTC' } }, missing_tokens: ['', 'NA'], source_record: source };
  const result = importAccount({ csv_text: csv, account_context: { ...context, posts: undefined, snapshots: undefined } }, mapping);
  assert.equal(result.posts[0].post_id, '9007199254740993');
  assert.equal(result.snapshots[0].metrics.impressions.value, 1000);
  assert.equal(result.source_refs.at(-1).raw_material.csv_text, csv);
  assert.equal(result.source_refs.at(-1).raw_material.mapping.mapping_id, 'map-1');
});

test('CSV time parsing uses the declared IANA timezone and rejects undeclared mapping fields', () => {
  const context = fixture();
  context.source_refs=[];
  const csv = 'id,created,text,captured,impressions\n201,2026-10-18 20:00:00,local time,2026-10-19 20:00:00,10\n';
  const mapping = { schema_version: 1, mapping_id: 'map-local', columns: { post_id: 'id', created_at: 'created', text: 'text', captured_at: 'captured', 'metric.impressions': 'impressions' },
    constants: { author_handle: 'fixture_complete', post_type: 'original', metric_scope: 'public_total', aggregation_level: 'post', aggregation_window: 'cumulative' },
    time_formats: { created_at: { format: 'yyyy-MM-dd HH:mm:ss', timezone: 'Asia/Shanghai' }, captured_at: { format: 'yyyy-MM-dd HH:mm:ss', timezone: 'Asia/Shanghai' } },
    missing_tokens: ['', 'NA'], source_record: source };
  const result = importAccount({ csv_text: csv, account_context: { ...context, posts: undefined, snapshots: undefined } }, mapping);
  assert.equal(result.posts[0].created_at, '2026-10-18T12:00:00Z');
  assert.equal(result.snapshots[0].captured_at, '2026-10-19T12:00:00Z');
  const unknown = structuredClone(mapping);
  unknown.columns.unregistered_metric = 'impressions';
  assert.throws(() => importAccount({ csv_text: csv, account_context: context }, unknown), error => error.code === 'MAPPING_REQUIRED');
  const missingTimeRule = structuredClone(mapping);
  delete missingTimeRule.time_formats.created_at;
  assert.throws(() => importAccount({ csv_text: csv, account_context: context }, missingTimeRule), error => error.code === 'MAPPING_REQUIRED');
});

test('conflicts, scope isolation, equidistant selection and wrong-account followers stay isolated', () => {
  const input = fixture();
  const secondSource = { ...source, source_id: 'src-second', locator: 'fixture:second' };
  input.source_refs.push(secondSource);
  input.requested_scope.selection_policy.source_selection.push(secondSource.source_id);
  const first = input.snapshots.find(item => item.snapshot_id === 'snap-9007199254740993-24h');
  first.captured_at = '2026-10-19T11:30:00Z';
  const conflict = structuredClone(first);
  conflict.snapshot_id = 'snap-conflict';
  conflict.source_ref = secondSource.source_id;
  conflict.metrics.impressions = value(9999);
  input.snapshots.push(conflict);
  const late = structuredClone(first);
  late.snapshot_id = 'snap-late-equidistant';
  late.captured_at = '2026-10-19T12:30:00Z';
  input.snapshots.push(late);
  const organic = structuredClone(first);
  organic.snapshot_id = 'snap-organic';
  organic.metric_scope = 'organic';
  organic.metrics.likes = value(500);
  input.snapshots.push(organic);
  input.snapshots.push({ ...follower('wrong-account', T, 9999), entity_id: 'handle:somebody_else' });
  const result = analyzeAccount(input, input.requested_scope.selection_policy);
  assert.equal(result.selection_log.find(item => item.post_key === 'x:9007199254740993' && item.view === 'age:24h').selected_snapshot_id, 'snap-9007199254740993-24h');
  assert.ok(result.metric_groups.some(item => item.metric === 'impressions' && item.excluded_records.some(record => record.reason === 'cross_source_conflict')));
  assert.ok(!result.metric_groups.some(item => item.selected_snapshot_ids.includes('snap-organic')));
  assert.ok(result.limitations.some(item => item.includes('身份不匹配')));
  assert.equal(result.follower_changes.find(item => item.window_days === 7 && item.period === 'current').net_change, 10);
});

test('source, aggregation window and primary topic form separate metric and comparison groups', () => {
  const input = fixture();
  const first = input.snapshots.find(item => item.snapshot_id === 'snap-9007199254740993-24h');
  const interval = structuredClone(first);
  interval.snapshot_id = 'snap-interval';
  interval.aggregation_window = { start: '2026-10-18T12:00:00Z', end: '2026-10-19T12:00:00Z' };
  interval.metrics.impressions = value(777);
  input.snapshots.push(interval);
  const result = analyzeAccount(input, input.requested_scope.selection_policy);
  assert.equal(metric(result, 'impressions', 'current_7:age:24h:original').sum, 3000);
  assert.equal(metric(result, 'impressions', 'current_7:age:24h:topic:tools').sum, 3500);
  const intervalGroup = result.metric_groups.find(item => item.metric === 'impressions' && item.aggregation_window?.start === interval.aggregation_window.start && item.group_by === 'post_type' && item.group_value === 'original');
  assert.equal(intervalGroup.sum, 777);
  assert.ok(result.comparisons.every(item => item.source_id === source.source_id));
});

test('followers reject cross-source count conflicts and label non-boundary observations by actual interval', () => {
  const input=fixture(),other={...source,source_id:'src-followers-other'};
  input.source_refs.push(other);input.requested_scope.selection_policy.source_selection.push(other.source_id);
  input.snapshots.push({...follower('conflicting-followers',T,9999),source_ref:other.source_id});
  const conflicted=analyzeAccount(input).follower_changes.find(item=>item.window_days===7&&item.period==='current');
  assert.equal(conflicted.net_change,null);assert.equal(conflicted.exact,false);
  const observed=fixture();observed.snapshots=observed.snapshots.filter(item=>item.entity_type!=='account');
  observed.snapshots.push(follower('actual-start','2026-10-19T00:00:00Z',100),follower('actual-end','2026-10-24T00:00:00Z',110));
  const actual=analyzeAccount(observed).follower_changes.find(item=>item.window_days===7&&item.period==='current');
  assert.equal(actual.net_change,10);assert.equal(actual.exact,false);assert.equal(actual.start_at,'2026-10-19T00:00:00Z');assert.equal(actual.end_at,'2026-10-24T00:00:00Z');
});

test('outliers retain median and total, and a higher per-post result can accompany a lower batch total', () => {
  function batch(current,previous=[]) {
    const input=fixture();input.posts=[];input.snapshots=[];
    let index=0;
    for(const [values,daysAgo] of [[current,3],[previous,10]])for(const impressions of values) {
      const row=[String(201+index++),new Date(Date.parse(T)-daysAgo*86400000).toISOString(),'original',impressions,0,0,0,0,0,0,0];
      input.posts.push(post(row));input.snapshots.push(postSnapshot(row));
    }
    input.coverage.raw_item_count=index;input.coverage.deduplicated_count=index;return analyzeAccount(input);
  }
  const outlier=metric(batch([100,200,300,10000]),'impressions','current_7:age:24h:original');
  assert.equal(outlier.sum,10600);assert.equal(outlier.median,250);
  const smaller=batch([1000,1000],[500,500,500,500,500]);
  assert.equal(metric(smaller,'impressions','current_7:age:24h:original').median,1000);
  assert.equal(metric(smaller,'impressions','previous_7:age:24h:original').median,500);
  assert.equal(metric(smaller,'impressions','current_7:age:24h:original').sum,2000);
  assert.equal(metric(smaller,'impressions','previous_7:age:24h:original').sum,2500);
});

test('account IDs, offset instants and explicit edit chains are enforced', () => {
  const unsupportedWindow=fixture();unsupportedWindow.requested_scope.selection_policy.windows_days=[1];
  assert.throws(()=>analyzeAccount(unsupportedWindow),error=>error.code==='INVALID_INPUT'&&error.path==='/selection_policy/windows_days');
  const input = fixture();
  input.account.user_id = '123';
  input.posts[0].account_id = '999';
  assert.throws(() => analyzeAccount(input, input.requested_scope.selection_policy), error => error.code === 'IDENTITY_MISMATCH');
  const localCutoff = fixture();
  localCutoff.analysis_cutoff = '2026-10-25T00:00:00';
  localCutoff.requested_scope.selection_policy.cutoff = localCutoff.analysis_cutoff;
  assert.throws(() => analyzeAccount(localCutoff, localCutoff.requested_scope.selection_policy), error => error.code === 'INVALID_INPUT');
  const edits = fixture();
  const latest = edits.posts[0];
  latest.edit_history_ids = ['100', latest.post_id];
  const older = structuredClone(latest);
  older.post_id = '100';
  older.post_key = 'x:100';
  older.url = 'https://x.example/fixture_complete/status/100';
  edits.posts.push(older);
  const imported = importAccount(edits);
  assert.equal(imported.posts.length, 8);
  assert.ok(imported.posts.some(post => post.post_id === latest.post_id));
  assert.ok(!imported.posts.some(post => post.post_id === '100'));
});

test('review joins the exact publication and adopted draft revision, then reuses account statistics', () => {
  const input = fixture();
  const onePost = input.posts[0];
  const state = {
    posts: { [onePost.post_key]: onePost },
    snapshots: Object.fromEntries(input.snapshots.filter(item => item.entity_id === onePost.post_key).map(item => [item.snapshot_id, item])),
    sources: { [source.source_id]: { record: source } },
    adoptions: { adopt1: { adoption_id: 'adopt1', draft_id: 'draft1', revision: 2 } },
    publications: { pub1: { publication_id: 'pub1', adoption_id: 'adopt1', post_id: onePost.post_id, url: onePost.url, confirmed_by: 'fixture', data_mode: 'fixture' } },
    drafts: { draft1: { revisions: { 2: { draft_id: 'draft1', revision: 2, card_id: 'card1' } }, latest_revision: 2 } },
    runs: { run1: { run_id: 'run1', draft_refs: [{ draft_id: 'draft1', revision: 2 }], card_ids: ['card1'], cards: [{ card_id: 'card1', event_id: 'event1', claim_ids: ['claim1'], angle: '解释适用范围' }] } },
    events: { event1: { event_id: 'event1', source_version_ids: ['version1'] } },
    claims: { claim1: { claim_id: 'claim1', source_version_ids: ['version1', 'version2'] } }
  };
  const result = buildReview({ account, analysis_cutoff: T, publication_ids: ['pub1'], post_ids: [], snapshot_ids: [],
    requested_scope: { mode: 'sample', selection_policy: input.requested_scope.selection_policy, requested_outputs: ['content', 'latest', 'age_matched'] },
    data_mode: 'fixture' }, state);
  assert.deepEqual(result.publication_links[0], { publication_id: 'pub1', post_id: onePost.post_id, adoption_id: 'adopt1', draft_id: 'draft1', revision: 2 });
  assert.deepEqual(result.source_angle_links[0], { publication_id: 'pub1', draft_id: 'draft1', revision: 2, card_id: 'card1', event_id: 'event1', claim_ids: ['claim1'], source_version_ids: ['version1', 'version2'], angle: '解释适用范围' });
  assert.equal(result.descriptive_statistics.post_counts.current_7.total, 1);
  assert.equal(result.semantic_review_required, true);
});
