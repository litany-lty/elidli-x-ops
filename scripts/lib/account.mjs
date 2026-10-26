import { parse } from 'csv-parse/sync';
import { Temporal } from '@js-temporal/polyfill';
import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { buildObservationIndex, deriveMetrics, METRIC_DEFINITIONS, validateMetricObservation } from './metrics.mjs';
import { selectMetricObservations } from './observation-selection.mjs';
import { resolvePostMetadataView } from './imports.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const POST_TYPES = new Set(['original', 'reply', 'quote', 'repost', 'unknown']);
const EXACT = value => value?.availability === 'observed' && value?.precision === 'exact' && Number.isSafeInteger(value?.value) && value.value >= 0;

function fail(code, path, message, retryable = false) {
  throw new ContractError(code, path, message, retryable);
}

function instant(value, path, nullable = false) {
  if (value === null && nullable) return null;
  try {
    return Number(Temporal.Instant.from(value).epochMilliseconds);
  } catch {
    fail('INVALID_INPUT', path, '必须是带偏移的有效 ISO 8601 时刻');
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function checkedAdd(a, b, path) {
  const value = a + b;
  if (!Number.isSafeInteger(value)) fail('NUMERIC_RANGE', path, '指标合计超出 JavaScript 安全整数范围');
  return value;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function quantile(values,fraction){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*fraction,lower=Math.floor(position),upper=Math.ceil(position);return lower===upper?sorted[lower]:sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);}

function normalizeHandle(value) {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

function clone(value) {
  return structuredClone(value);
}

function dedupePosts(posts) {
  const byKey = new Map();
  for (const post of posts) {
    if (!post?.post_key) fail('INVALID_INPUT', '/posts', 'post_key 不能为空');
    if (post.post_id !== null && post.post_key !== `x:${post.post_id}`) fail('INVALID_INPUT', `/posts/${post.post_key}`, '真实 post_id 必须使用 x:<post_id> 作为 post_key');
    const prior = byKey.get(post.post_key);
    if (prior && canonical(prior) !== canonical(post)) fail('INVALID_INPUT', `/posts/${post.post_key}`, '同一 post_key 出现不一致记录');
    if (!prior) byKey.set(post.post_key, clone(post));
  }
  const unique = [...byKey.values()];
  const byEditChain = new Map();
  for (const post of unique) {
    if (!post.edit_history_ids?.length) continue;
    const key = canonical(post.edit_history_ids);
    const group = byEditChain.get(key) ?? [];
    group.push(post);
    byEditChain.set(key, group);
  }
  const superseded = new Set();
  for (const group of byEditChain.values()) {
    if (group.length < 2) continue;
    const latestId = group[0].edit_history_ids.at(-1);
    const latest = group.filter(post => post.post_id === latestId);
    if (latest.length === 1) for (const post of group) if (post !== latest[0]) superseded.add(post.post_key);
  }
  return unique.filter(post => !superseded.has(post.post_key));
}

function dedupeSnapshots(snapshots) {
  const byId = new Map();
  const byExactRecord = new Map();
  for (const snapshot of snapshots) {
    const prior = byId.get(snapshot.snapshot_id);
    if (prior && canonical(prior) !== canonical(snapshot)) fail('INVALID_INPUT', `/snapshots/${snapshot.snapshot_id}`, '同一 snapshot_id 出现不一致记录');
    if (prior) continue;
    const fingerprint = canonical({ ...snapshot, snapshot_id: null });
    if (byExactRecord.has(fingerprint)) continue;
    byId.set(snapshot.snapshot_id, clone(snapshot));
    byExactRecord.set(fingerprint, snapshot.snapshot_id);
  }
  return [...byId.values()];
}

function sourceRecordForCsv(mapping, csvText) {
  const source = clone(mapping.source_record);
  if (!source?.source_id) fail('MAPPING_REQUIRED', '/mapping/source_record', 'CSV 映射必须提供 source_record');
  source.raw_material = { csv_text: csvText, mapping: clone(mapping), declared_source_raw_material: source.raw_material ?? null };
  return source;
}

const CSV_FIELDS = new Set([
  'post_id', 'created_at', 'text', 'author_handle', 'account_id', 'post_type', 'url', 'thread_root_id', 'primary_topic',
  'captured_at', 'metric_scope', 'aggregation_level', 'aggregation_window',
  ...['impressions', 'displayed_views', 'likes', 'replies', 'reposts', 'quotes', 'bookmarks', 'url_clicks', 'profile_clicks', 'attributed_follows'].map(name => `metric.${name}`)
]);

function validateMappingKeys(mapping) {
  for (const section of ['columns', 'constants']) {
    for (const field of Object.keys(mapping[section] ?? {})) if (!CSV_FIELDS.has(field)) fail('MAPPING_REQUIRED', `/mapping/${section}/${field}`, '未知的规范映射字段');
  }
  for (const field of Object.keys(mapping.time_formats ?? {})) if (!['created_at', 'captured_at'].includes(field)) fail('MAPPING_REQUIRED', `/mapping/time_formats/${field}`, '未知的时间字段');
}

function csvTime(raw, mapping, field, path) {
  if (raw === null || raw === undefined || raw === '') return null;
  const rule = mapping.time_formats?.[field];
  if (!rule) fail('MAPPING_REQUIRED', `/mapping/time_formats/${field}`, `${field} 必须声明格式和 IANA 时区`);
  const supported = new Set(['iso8601', 'iso_local', 'yyyy-MM-dd HH:mm:ss']);
  if (!supported.has(rule.format)) fail('MAPPING_REQUIRED', `/mapping/time_formats/${field}/format`, '不支持的时间格式');
  try {
    if (/([zZ]|[+-]\d{2}:\d{2})$/.test(String(raw))) return Temporal.Instant.from(String(raw)).toString();
    if (!rule.timezone) fail('MAPPING_REQUIRED', `/mapping/time_formats/${field}/timezone`, '本地时刻必须声明 IANA 时区');
    const normalized = String(raw).replace(' ', 'T');
    return Temporal.PlainDateTime.from(normalized).toZonedDateTime(rule.timezone).toInstant().toString();
  } catch (error) {
    if (error instanceof ContractError) throw error;
    fail('INVALID_INPUT', path, `${field} 无法按声明格式和时区解析`);
  }
}

function mapped(row, mapping, field) {
  const header = mapping.columns?.[field];
  const fromColumn = header === undefined ? undefined : row[header];
  const fromConstant = mapping.constants?.[field];
  if (fromColumn !== undefined && fromConstant !== undefined && String(fromColumn) !== String(fromConstant)) {
    fail('INVALID_INPUT', `/mapping/${field}`, 'CSV 列值与映射常量冲突');
  }
  const raw = fromColumn ?? fromConstant;
  return mapping.missing_tokens?.includes(raw) ? null : raw;
}

function metricValue(raw, path) {
  if (raw === undefined || raw === null || raw === '') return { value: null, availability: 'not_provided', precision: 'unknown', raw_value: raw ?? null };
  if (!/^(0|[1-9]\d*)$/.test(String(raw))) fail('INVALID_INPUT', path, 'CSV 精确计数只接受非负十进制整数');
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) fail('NUMERIC_RANGE', path, 'CSV 计数超出安全整数范围');
  return { value, availability: 'observed', precision: 'exact', raw_value: String(raw) };
}

function importCsv(input, mapping) {
  if (typeof input?.csv_text !== 'string' || !mapping) fail('MAPPING_REQUIRED', '/mapping', 'CSV 输入需要 csv_text 和明确 ColumnMapping');
  validate('ColumnMapping', mapping);
  validateMappingKeys(mapping);
  const required = ['post_id', 'created_at', 'text'];
  for (const field of required) if (mapping.columns?.[field] === undefined && mapping.constants?.[field] === undefined) fail('MAPPING_REQUIRED', `/mapping/columns/${field}`, `缺少 ${field} 映射`);
  let rows;
  try {
    rows = parse(input.csv_text, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: false });
  } catch (error) {
    fail('INVALID_INPUT', '/csv_text', `CSV 解析失败：${error.message}`);
  }
  const context = clone(input.account_context ?? {});
  const source = sourceRecordForCsv(mapping, input.csv_text);
  const posts = [];
  const snapshots = [];
  const importBatchKey = canonicalHash({account: context.account ?? null, csv_text: input.csv_text, mapping});
  const metricNames = ['impressions', 'displayed_views', 'likes', 'replies', 'reposts', 'quotes', 'bookmarks', 'url_clicks', 'profile_clicks', 'attributed_follows'];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const postId = mapped(row, mapping, 'post_id');
    const sourceId = source.source_id;
    const postKey = postId ? `x:${postId}` : `local:${sourceId}:${rowNumber}`;
    const createdAt = csvTime(mapped(row, mapping, 'created_at'), mapping, 'created_at', `/csv/${rowNumber}/created_at`);
    const author = mapped(row, mapping, 'author_handle') ?? context.account?.handle;
    const postType = mapped(row, mapping, 'post_type') ?? 'unknown';
    if (!POST_TYPES.has(postType)) fail('INVALID_INPUT', `/csv/${rowNumber}/post_type`, '不支持的 post_type');
    posts.push({
      post_key: postKey, post_id: postId || null, account_id: mapped(row, mapping, 'account_id') ?? context.account?.user_id ?? null,
      author_handle: author, url: mapped(row, mapping, 'url') ?? null, created_at: createdAt,
      text: mapped(row, mapping, 'text'), post_type: postType, edit_history_ids: [], thread_root_id: mapped(row, mapping, 'thread_root_id') ?? null,
      primary_topic: mapped(row, mapping, 'primary_topic') ?? null, topic_tags: [], source_ref: sourceId
    });
    const capturedRaw = mapped(row, mapping, 'captured_at');
    const capturedAt = capturedRaw === undefined || capturedRaw === null ? null : csvTime(capturedRaw, mapping, 'captured_at', `/csv/${rowNumber}/captured_at`);
    const hasMetric = metricNames.some(name => mapped(row, mapping, `metric.${name}`) !== undefined);
    if (capturedAt || hasMetric) {
      if (!capturedAt) fail('MAPPING_REQUIRED', `/csv/${rowNumber}/captured_at`, '指标列存在时必须映射 captured_at');
      const metrics = Object.fromEntries(metricNames.map(name => [name, metricValue(mapped(row, mapping, `metric.${name}`), `/csv/${rowNumber}/${name}`)]));
      snapshots.push({ snapshot_id: `csv:${importBatchKey}:${rowNumber}`, entity_type: 'post', entity_id: postKey,
        account_id: mapped(row, mapping, 'account_id') ?? context.account?.user_id ?? null, captured_at: capturedAt, source_ref: sourceId,
        metric_scope: mapped(row, mapping, 'metric_scope') ?? 'public_total', aggregation_level: mapped(row, mapping, 'aggregation_level') ?? 'post',
        aggregation_window: mapped(row, mapping, 'aggregation_window') ?? 'cumulative', metrics });
    }
  });
  return { ...context, schema_version: 1, posts, snapshots, source_refs: [...(context.source_refs ?? []), source] };
}

/** Import a canonical JSON AccountInput, or CSV text plus an explicit ColumnMapping. */
export function importAccount(input, mapping = null) {
  const result = typeof input?.csv_text === 'string' ? importCsv(input, mapping) : clone(input);
  result.posts = dedupePosts(result.posts ?? []);
  result.snapshots = dedupeSnapshots(result.snapshots ?? []);
  result.coverage = { ...result.coverage, raw_item_count: result.coverage?.raw_item_count ?? (input.posts?.length ?? result.posts.length), deduplicated_count: result.posts.length };
  validate('AccountInput', result);
  const sourceIds=new Set(result.source_refs.map(source=>source.source_id));
  if(sourceIds.size!==result.source_refs.length)fail('INVALID_INPUT','/source_refs','来源 ID 必须唯一');
  for(const record of [...result.posts,...result.snapshots])if(!sourceIds.has(record.source_ref))fail('MISSING_EVIDENCE','/source_ref','帖子或观测引用了未提供的来源');
  for(const id of result.requested_scope.selection_policy.source_selection)if(!sourceIds.has(id))fail('MISSING_EVIDENCE','/source_selection','选择策略引用了未提供的来源');
  return result;
}

function postPeriod(createdAt, cutoff) {
  if (createdAt === null) return null;
  const at = instant(createdAt, '/posts/created_at', true);
  if (at >= cutoff || at < cutoff - 56 * DAY) return null;
  if (at >= cutoff - 7 * DAY) return 'current_7';
  if (at >= cutoff - 14 * DAY) return 'previous_7';
  if (at >= cutoff - 28 * DAY) return 'current_28';
  return 'previous_28';
}

function periodIncludes(post, period, cutoff) {
  if (post.created_at === null) return false;
  const at = instant(post.created_at, `/posts/${post.post_key}/created_at`);
  const ranges = {
    current_7: [cutoff - 7 * DAY, cutoff], previous_7: [cutoff - 14 * DAY, cutoff - 7 * DAY],
    current_28: [cutoff - 28 * DAY, cutoff], previous_28: [cutoff - 56 * DAY, cutoff - 28 * DAY]
  };
  const [start, end] = ranges[period];
  return at >= start && at < end;
}

function postCounts(posts, cutoff) {
  const result = {};
  for (const period of ['current_7', 'previous_7', 'current_28', 'previous_28']) {
    const selected = posts.filter(post => periodIncludes(post, period, cutoff));
    const by_post_type = {};
    const by_primary_topic = {};
    for (const post of selected) {
      by_post_type[post.post_type] = (by_post_type[post.post_type] ?? 0) + 1;
      const topic = post.primary_topic ?? 'unknown';
      by_primary_topic[topic] = (by_primary_topic[topic] ?? 0) + 1;
    }
    result[period] = { total: selected.length, by_post_type, by_primary_topic, post_keys: selected.map(post => post.post_key) };
  }
  return result;
}

function semanticSnapshotKey(snapshot) {
  if (!snapshot.captured_at) return null;
  return canonical([snapshot.entity_type, snapshot.entity_id, snapshot.account_id, snapshot.captured_at, snapshot.metric_scope, snapshot.aggregation_level, snapshot.aggregation_window]);
}

function conflictIndex(snapshots) {
  const groups = new Map();
  for (const snapshot of snapshots) {
    const key = semanticSnapshotKey(snapshot);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(snapshot);
    groups.set(key, group);
  }
  const conflicts = new Map();
  for (const group of groups.values()) {
    if (new Set(group.map(item => item.source_ref)).size < 2) continue;
    const names = new Set(group.flatMap(item => Object.keys(item.metrics ?? {})));
    for (const name of names) {
      const exact = group.filter(item => EXACT(item.metrics?.[name]));
      if (new Set(exact.map(item => item.metrics[name].value)).size > 1) for (const item of exact) conflicts.set(`${item.snapshot_id}:${name}`, 'cross_source_conflict');
    }
  }
  return conflicts;
}

function validAccountSnapshot(snapshot, account) {
  if (snapshot.entity_type !== 'account') return true;
  const accepted = new Set([account.user_id, `handle:${normalizeHandle(account.handle)}`, normalizeHandle(account.handle)].filter(Boolean));
  return accepted.has(snapshot.entity_id) && (!snapshot.account_id || !account.user_id || snapshot.account_id === account.user_id);
}

function aggregationKey(snapshot) {
  return canonical([snapshot.source_ref, snapshot.aggregation_level, snapshot.aggregation_window]);
}

function byAggregationGroup(snapshots) {
  const groups = new Map();
  for (const snapshot of snapshots) {
    const key = aggregationKey(snapshot);
    const group = groups.get(key) ?? [];
    group.push(snapshot);
    groups.set(key, group);
  }
  return groups;
}

function chooseLatest(post, snapshots, cutoff, scope, sources) {
  const candidates = snapshots.filter(item => item.entity_type === 'post' && item.entity_id === post.post_key && item.captured_at && instant(item.captured_at, `/snapshots/${item.snapshot_id}/captured_at`) <= cutoff && item.metric_scope === scope && sources.has(item.source_ref));
  return [...byAggregationGroup(candidates).values()].map(group => group.sort((a, b) => instant(b.captured_at, '/snapshots/captured_at') - instant(a.captured_at, '/snapshots/captured_at'))[0]);
}

function chooseAge(post, snapshots, cutoff, ageWindow, scope, sources) {
  const created = instant(post.created_at, `/posts/${post.post_key}/created_at`, true);
  if (created === null) return [{ status: 'missing', reason: 'created_at_missing' }];
  const maturedAt = created + (ageWindow.target_hours + ageWindow.tolerance_hours) * HOUR;
  if (cutoff < maturedAt) return [{ status: 'pending', reason: 'age_window_not_mature' }];
  const candidates = snapshots.filter(item => item.entity_type === 'post' && item.entity_id === post.post_key && item.captured_at && item.metric_scope === scope && sources.has(item.source_ref))
    .map(item => ({ item, age: (instant(item.captured_at, `/snapshots/${item.snapshot_id}/captured_at`) - created) / HOUR }))
    .filter(({ age }) => Math.abs(age - ageWindow.target_hours) <= ageWindow.tolerance_hours);
  if (!candidates.length) return [{ status: 'missing', reason: 'age_window_missing' }];
  return [...byAggregationGroup(candidates.map(candidate => candidate.item)).values()].map(group => {
    const selected = group.map(item => ({ item, age: (instant(item.captured_at, `/snapshots/${item.snapshot_id}/captured_at`) - created) / HOUR }))
      .sort((a, b) => Math.abs(a.age - ageWindow.target_hours) - Math.abs(b.age - ageWindow.target_hours) || a.age - b.age)[0];
    return { status: 'selected', snapshot: selected.item, age_hours: selected.age };
  });
}

function stats(name, scope, window, sourceId, selected, conflicts, grouping, transform = null) {
  const values = [];
  const excluded_records = [];
  const selected_snapshot_ids = [];
  let missing_count = 0;
  for (const snapshot of selected) {
    selected_snapshot_ids.push(snapshot.snapshot_id);
    let value;
    if (transform) value = transform(snapshot, conflicts, excluded_records);
    else if (conflicts.has(`${snapshot.snapshot_id}:${name}`)) {
      excluded_records.push({ record_id: snapshot.snapshot_id, reason: 'cross_source_conflict' });
      value = null;
    } else value = EXACT(snapshot.metrics?.[name]) ? snapshot.metrics[name].value : null;
    if (value === null) missing_count += 1;
    else values.push(value);
  }
  let sum = null;
  if (values.length) sum = values.reduce((total, value) => checkedAdd(total, value, `/metric_groups/${name}`), 0);
  return { metric: name, scope, window, source_id: sourceId, aggregation_level: grouping.aggregation_level,
    aggregation_window: clone(grouping.aggregation_window), group_by: grouping.group_by, group_value: grouping.group_value,
    eligible_count: selected.length, valid_count: values.length,
    missing_count, sum, median: median(values), selected_snapshot_ids, excluded_records };
}

function visibleInteractions(snapshot, conflicts, excluded) {
  const names = ['likes', 'replies', 'reposts', 'quotes'];
  let total = 0;
  for (const name of names) {
    if (conflicts.has(`${snapshot.snapshot_id}:${name}`)) {
      excluded.push({ record_id: snapshot.snapshot_id, reason: `cross_source_conflict:${name}` });
      return null;
    }
    if (!EXACT(snapshot.metrics?.[name])) return null;
    total = checkedAdd(total, snapshot.metrics[name].value, `/snapshots/${snapshot.snapshot_id}/${name}`);
  }
  return total;
}

function aggregationSuffix(level, window) {
  return level === 'post' && window === 'cumulative' ? '' : `|${level}:${canonical(window)}`;
}

function groupWindow(period, view, groupBy, groupValue, level, aggregationWindow) {
  const group = groupBy === 'primary_topic' ? `topic:${groupValue}` : groupValue;
  return `${period}:${view}:${group}${aggregationSuffix(level, aggregationWindow)}`;
}

function groupSpecs(rows, requested) {
  const specs = [{ group_by: 'all', group_value: 'all', matches: () => true }];
  if (requested.includes('post_type')) {
    for (const value of POST_TYPES) specs.push({ group_by: 'post_type', group_value: value, matches: row => row.post.post_type === value });
  }
  if (requested.includes('primary_topic')) {
    const topics = [...new Set(rows.map(row => row.post.primary_topic ?? 'unknown'))];
    for (const value of topics) specs.push({ group_by: 'primary_topic', group_value: value, matches: row => (row.post.primary_topic ?? 'unknown') === value });
  }
  return specs;
}

function followerChanges(snapshots, account, cutoff, sources, limitations, conflicts) {
  const candidates = snapshots.filter(item => item.entity_type === 'account' && item.captured_at && item.metric_scope === 'public_total' && item.aggregation_level === 'account' && item.aggregation_window === 'cumulative' && sources.has(item.source_ref) && validAccountSnapshot(item, account) && EXACT(item.metrics?.followers) && !conflicts.has(`${item.snapshot_id}:followers`));
  const invalid = snapshots.filter(item => item.entity_type === 'account' && !validAccountSnapshot(item, account));
  if (invalid.length) limitations.push(`已拒绝 ${invalid.length} 条账号身份不匹配的粉丝快照`);
  const byBoundary = (at, source) => candidates.find(item => item.source_ref === source && instant(item.captured_at, `/snapshots/${item.snapshot_id}/captured_at`) === at);
  const result = [];
  for (const days of [7, 28]) {
    for (const [period, end] of [['current', cutoff], ['previous', cutoff - days * DAY]]) {
      const start = end - days * DAY;
      let match = null;
      for (const source of sources) {
        const startSnapshot = byBoundary(start, source);
        const endSnapshot = byBoundary(end, source);
        if (startSnapshot && endSnapshot) { match = { source, startSnapshot, endSnapshot }; break; }
      }
      let exact=Boolean(match);
      if(!match)for(const source of sources) {
        const observed=candidates.filter(item=>item.source_ref===source&&instant(item.captured_at,'/captured_at')>=start&&instant(item.captured_at,'/captured_at')<=end).sort((a,b)=>instant(a.captured_at,'/captured_at')-instant(b.captured_at,'/captured_at'));
        if(observed.length>=2&&observed[0].captured_at!==observed.at(-1).captured_at) {match={source,startSnapshot:observed[0],endSnapshot:observed.at(-1)};limitations.push(`followers ${days}天${period}仅报告两个实际观测时点之间的净变化，不是完整窗口净增`);break;}
      }
      result.push(match ? { window_days: days, period, start_snapshot_id: match.startSnapshot.snapshot_id, end_snapshot_id: match.endSnapshot.snapshot_id,
        source_id: match.source, start_at: match.startSnapshot.captured_at, end_at: match.endSnapshot.captured_at,
        start_value: match.startSnapshot.metrics.followers.value, end_value: match.endSnapshot.metrics.followers.value,
        net_change: match.endSnapshot.metrics.followers.value - match.startSnapshot.metrics.followers.value, exact }
        : { window_days: days, period, start_snapshot_id: null, end_snapshot_id: null, source_id: null, start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), start_value: null, end_value: null, net_change: null, exact: false });
    }
  }
  return result;
}

/** Calculate deterministic coverage, selection and statistics without semantic diagnosis. */
export function analyzeAccount(input, selectionPolicy = null) {
  const accountInput = importAccount(input);
  const policy = clone(selectionPolicy ?? accountInput.requested_scope.selection_policy);
  if(canonical(policy.windows_days)!==canonical([7,28]))fail('INVALID_INPUT','/selection_policy/windows_days','第一版发帖分析窗口固定为 [7,28]；单帖24h观测请使用 age_windows');
  const ageTargets=new Set();for(const age of policy.age_windows??[]){if(ageTargets.has(age.target_hours))fail('INVALID_INPUT','/selection_policy/age_windows','相同目标帖龄不能重复声明不同窗口');ageTargets.add(age.target_hours);}
  const cutoff = instant(policy?.cutoff ?? accountInput.analysis_cutoff, '/selection_policy/cutoff');
  if (new Date(cutoff).toISOString() !== new Date(instant(accountInput.analysis_cutoff, '/analysis_cutoff')).toISOString()) fail('INVALID_INPUT', '/selection_policy/cutoff', '选择策略 cutoff 必须与 AccountInput.analysis_cutoff 一致');
  const handle = normalizeHandle(accountInput.account.handle);
  for (const post of accountInput.posts) {
    if (normalizeHandle(post.author_handle) !== handle) fail('IDENTITY_MISMATCH', `/posts/${post.post_key}/author_handle`, '帖子作者与目标账号不一致');
    if (accountInput.account.user_id && post.account_id && post.account_id !== accountInput.account.user_id) fail('IDENTITY_MISMATCH', `/posts/${post.post_key}/account_id`, '帖子账号 ID 与目标账号不一致');
  }
  for(const snapshot of accountInput.snapshots)if(accountInput.account.user_id&&snapshot.account_id&&snapshot.account_id!==accountInput.account.user_id)fail('IDENTITY_MISMATCH',`/snapshots/${snapshot.snapshot_id}/account_id`,'观测账号 ID 与目标账号不一致');
  const sources = new Set(policy.source_selection ?? accountInput.source_refs.map(source => source.source_id));
  const scope = policy.metric_scope ?? 'public_total';
  const requestedMetrics = policy.requested_metrics ?? ['impressions', 'likes', 'replies', 'reposts', 'quotes'];
  const conflicts = conflictIndex(accountInput.snapshots.filter(item => sources.has(item.source_ref)));
  const limitations = [];
  if (conflicts.size) limitations.push('同一语义观测在不同来源出现精确值冲突；相关指标已从精确统计排除');
  const editMembership = new Map();
  for (const post of accountInput.posts) for (const id of post.edit_history_ids ?? []) {
    const keys = editMembership.get(id) ?? [];
    keys.push(post.post_key);
    editMembership.set(id, keys);
  }
  if ([...editMembership.values()].some(keys => new Set(keys).size > 1)) limitations.push('存在无法凭现有材料唯一归并的编辑关联；相关帖子已保留并单列');
  const selection_log = [];
  const selections = [];
  for (const post of accountInput.posts) {
    const periodNames = ['current_7', 'previous_7', 'current_28', 'previous_28'].filter(period => periodIncludes(post, period, cutoff));
    const latest = chooseLatest(post, accountInput.snapshots, cutoff, scope, sources);
    if (!latest.length) selection_log.push({ post_key: post.post_key, view: 'latest', status: 'missing', selected_snapshot_id: null,
      age_hours: null, reason: 'snapshot_missing', source_id: null, aggregation_level: null, aggregation_window: null });
    for (const snapshot of latest) {
      selection_log.push({ post_key: post.post_key, view: 'latest', status: 'selected', selected_snapshot_id: snapshot.snapshot_id,
        age_hours: post.created_at ? (instant(snapshot.captured_at, `/snapshots/${snapshot.snapshot_id}/captured_at`) - instant(post.created_at, `/posts/${post.post_key}/created_at`)) / HOUR : null,
        reason: null, source_id: snapshot.source_ref, aggregation_level: snapshot.aggregation_level, aggregation_window: clone(snapshot.aggregation_window) });
      for (const period of periodNames) selections.push({ post, period, view: 'latest', snapshot });
    }
    for (const age of policy.age_windows ?? [{ target_hours: 24, tolerance_hours: 2 }]) {
      for (const chosen of chooseAge(post, accountInput.snapshots, cutoff, age, scope, sources)) {
        selection_log.push({ post_key: post.post_key, view: `age:${age.target_hours}h`, target_hours: age.target_hours, status: chosen.status,
          selected_snapshot_id: chosen.snapshot?.snapshot_id ?? null, age_hours: chosen.age_hours ?? null, reason: chosen.reason ?? null,
          source_id: chosen.snapshot?.source_ref ?? null, aggregation_level: chosen.snapshot?.aggregation_level ?? null,
          aggregation_window: chosen.snapshot ? clone(chosen.snapshot.aggregation_window) : null });
        if (chosen.snapshot) for (const period of periodNames) selections.push({ post, period, view: `age:${age.target_hours}h`, snapshot: chosen.snapshot });
      }
    }
  }
  const metric_groups = [];
  const paired_ratios = [];
  const requestedGroups = policy.group_by ?? ['post_type', 'primary_topic'];
  for (const period of ['current_7', 'previous_7', 'current_28', 'previous_28']) {
    for (const view of ['latest', ...(policy.age_windows ?? [{ target_hours: 24 }]).map(age => `age:${age.target_hours}h`)]) {
      const periodRows = selections.filter(row => row.period === period && row.view === view);
      for (const aggregationSnapshots of byAggregationGroup(periodRows.map(row => row.snapshot)).values()) {
        const example = aggregationSnapshots[0];
        const rows = periodRows.filter(row => aggregationKey(row.snapshot) === aggregationKey(example));
        for (const group of groupSpecs(rows, requestedGroups)) {
          const selected = rows.filter(group.matches).map(row => row.snapshot);
          if (!selected.length) continue;
          const grouping = { aggregation_level: example.aggregation_level, aggregation_window: example.aggregation_window, group_by: group.group_by, group_value: group.group_value };
          const window = groupWindow(period, view, group.group_by, group.group_value, example.aggregation_level, example.aggregation_window);
          for (const metric of requestedMetrics) metric_groups.push(stats(metric, scope, window, example.source_ref, selected, conflicts, grouping));
          const interactions = stats('visible_interactions', scope, window, example.source_ref, selected, conflicts, grouping, visibleInteractions);
          metric_groups.push(interactions);
          let numerator = 0;
          let denominator = 0;
          const ratioIds = [];
          for (const snapshot of selected) {
            const visible = visibleInteractions(snapshot, conflicts, []);
            const exposure = conflicts.has(`${snapshot.snapshot_id}:impressions`) ? null : (EXACT(snapshot.metrics?.impressions) ? snapshot.metrics.impressions.value : null);
            if (visible !== null && exposure !== null && exposure > 0) {
              numerator = checkedAdd(numerator, visible, '/paired_ratios/numerator');
              denominator = checkedAdd(denominator, exposure, '/paired_ratios/denominator');
              ratioIds.push(snapshot.snapshot_id);
            }
          }
          paired_ratios.push({ name: 'visible_interactions_per_impression', period, post_type: group.group_by === 'post_type' ? group.group_value : 'all', source_id: example.source_ref,
            aggregation_level: example.aggregation_level, aggregation_window: clone(example.aggregation_window), group_by: group.group_by, group_value: group.group_value,
            numerator: ratioIds.length ? numerator : null, denominator: ratioIds.length ? denominator : null,
            value: ratioIds.length ? numerator / denominator : null, metric_scope: scope, window: view, selected_snapshot_ids: ratioIds,
            limitation: ratioIds.length ? '自定义可见互动计数，不等于 X 官方 engagements 或独立用户转化率' : '缺少同快照、同范围且分母大于零的配对数据' });
        }
      }
    }
  }
  const comparisons = [];
  for (const current of metric_groups.filter(item => item.window.startsWith('current_7:age:') && item.metric !== 'visible_interactions')) {
    const previous = metric_groups.find(item => item.metric === current.metric && item.window === current.window.replace(/^current_7:/, 'previous_7:') &&
      item.source_id === current.source_id && item.aggregation_level === current.aggregation_level && canonical(item.aggregation_window) === canonical(current.aggregation_window) &&
      item.group_by === current.group_by && item.group_value === current.group_value) ?? null;
    comparisons.push({ metric: current.metric, view: current.window.split(':').slice(1, 3).join(':'),
      post_type: current.group_by === 'post_type' ? current.group_value : 'all', source_id: current.source_id,
      aggregation_level: current.aggregation_level, aggregation_window: clone(current.aggregation_window), group_by: current.group_by, group_value: current.group_value,
      current_period: 'current_7', previous_period: 'previous_7', current_value: current.sum, previous_value: previous?.sum ?? null,
      difference: current.sum !== null && previous?.sum !== null && previous?.sum !== undefined ? current.sum - previous.sum : null });
  }
  const follower_changes = followerChanges(accountInput.snapshots, accountInput.account, cutoff, sources, limitations, conflicts);
  const hasBaseline = accountInput.posts.some(post => periodIncludes(post, 'previous_7', cutoff));
  const matureMissing = selection_log.some(item => item.view.startsWith('age:') && item.status === 'missing');
  const comparability = hasBaseline ? (matureMissing ? 'age_window_missing' : 'comparable') : 'no_baseline';
  if (accountInput.coverage.status === 'sample' || accountInput.coverage.status === 'unknown') limitations.push('输入不代表完整时间线；结果仅适用于已提供样本');
  const result = {
    account: clone(accountInput.account), cutoff: new Date(cutoff).toISOString(), coverage: { ...clone(accountInput.coverage), comparability },
    post_counts: postCounts(accountInput.posts, cutoff), metric_groups, paired_ratios, comparisons, follower_changes, selection_log, limitations
  };
  validate('AccountResult', result);
  return result;
}

function ms(value,path){try{return Number(Temporal.Instant.from(value).epochMilliseconds);}catch{fail('INVALID_INPUT',path,'Expected an ISO instant with offset');}}
function metricObservationRows(snapshots,metricId,index){const conflicted=new Set(index.conflicts.flatMap(c=>c.observation_refs)),superseded=new Set(index.superseded_observation_refs??[]);return snapshots.flatMap(snapshot=>Object.entries(snapshot.metrics).filter(([metricKey,metric])=>metric.definition_id===metricId&&!superseded.has(`${snapshot.snapshot_id}:${metricKey}`)).map(([metric_key,metric])=>({snapshot,metric_key,metric,ref:`${snapshot.snapshot_id}:${metric_key}`,conflict:conflicted.has(`${snapshot.snapshot_id}:${metric_key}`)})));}
function newestPerEntity(rows){const groups=new Map();for(const row of rows){const key=canonical([row.snapshot.entity_type,row.snapshot.entity_id,row.metric.definition_id,row.snapshot.aggregation_basis,row.snapshot.distribution,row.snapshot.surface,row.snapshot.period]);const old=groups.get(key);if(!old||String(row.snapshot.observed_at??'').localeCompare(String(old.snapshot.observed_at??''))>0||(!row.snapshot.observed_at&&!old.snapshot.observed_at&&row.ref<old.ref))groups.set(key,row);}return[...groups.values()];}
function summary(metricId,targets,rows,pending=new Set()){
 const selected=newestPerEntity(rows.filter(row=>targets.has(row.snapshot.entity_id))),counts=new Map();for(const row of selected)counts.set(row.snapshot.entity_id,(counts.get(row.snapshot.entity_id)??0)+1);const ambiguous=new Set([...counts].filter(([,count])=>count>1).map(([entityId])=>entityId)),valid=selected.filter(row=>!row.conflict&&!ambiguous.has(row.snapshot.entity_id)&&row.metric.availability==='observed'&&row.metric.value!==null),conflict=selected.filter(row=>row.conflict||ambiguous.has(row.snapshot.entity_id)),missing=[...targets].filter(id=>!selected.some(row=>row.snapshot.entity_id===id)&&!pending.has(id));
 const values=valid.map(row=>row.metric.value),sum=values.length?values.reduce((a,b)=>a+b,0):null,descending=[...values].sort((a,b)=>b-a),contribution=n=>sum>0?descending.slice(0,n).reduce((a,b)=>a+b,0)/sum:null;
 return{metric_definition_id:metricId,sample:{unit:'post',eligible_n:targets.size,selected_n:new Set(selected.map(row=>row.snapshot.entity_id)).size,valid_n:valid.length,missing_n:missing.length,pending_n:pending.size,conflict_n:new Set(conflict.map(row=>row.snapshot.entity_id)).size},value:sum,median:median(values),q1:quantile(values,.25),q3:quantile(values,.75),top_contribution:{top1:contribution(1),top3:contribution(3),top5:contribution(5)},selected_observation_refs:valid.map(row=>row.ref),excluded_refs:[...new Set([...conflict.map(row=>row.ref),...selected.filter(row=>row.metric.availability!=='observed').map(row=>row.ref)])],reasons:[...(missing.length?['missing_observations']:[]),...(pending.size?['immature_posts']:[]),...(conflict.length?['observation_conflicts_or_incompatible_scopes']:[]),...(valid.some(row=>row.snapshot.observed_at===null)?['observation_time_unknown_platform_reported']:[])]};
}

/** V2 account analysis keeps account-period, publication-cohort and age-matched outputs independent. */
export function analyzeAccountV2(input,request={}){
 if(input?.contract_version!==2)fail('SCHEMA_VERSION','/contract_version','V2 analysis requires contract_version 2');
 const cutoff=ms(input.analysis_cutoff,'/analysis_cutoff'),handle=normalizeHandle(input.account?.handle),aliases=input.post_aliases??{};const entities=(input.post_entities??[]).filter(entity=>!aliases[entity.post_key]||aliases[entity.post_key]===entity.post_key),metadataState={post_versions:Object.fromEntries((input.post_versions??[]).map(v=>[v.post_version_id,v])),post_metadata_facts:input.post_metadata_facts??{}},metadataConflicts=[];
 const versions=new Map((input.post_versions??[]).map(version=>{const projected=structuredClone(version);for(const field of ['created_at','post_type']){const view=resolvePostMetadataView(metadataState,version.post_version_id,field);if(view.status==='confirmed')projected[field]=view.value;else if(view.status==='conflicting'){metadataConflicts.push(`${version.post_version_id}:${field}`);projected[field]=field==='post_type'?'unknown':null;}}return[projected.post_version_id,projected];}));
 for(const entity of entities){if(input.account.user_id&&entity.author_id&&input.account.user_id!==entity.author_id)fail('ACCOUNT_MISMATCH',`/post_entities/${entity.post_key}/author_id`,'Post belongs to another account');if(!input.account.user_id&&entity.author_handle&&normalizeHandle(entity.author_handle)!==handle)fail('ACCOUNT_MISMATCH',`/post_entities/${entity.post_key}/author_handle`,'Post belongs to another account');}
 const definitions={...METRIC_DEFINITIONS,...(input.metric_definitions??{})},legacyObservationRefs=[],allSnapshots=[];
 for(const sourceSnapshot of input.snapshots??[]){const snapshot=structuredClone(sourceSnapshot),knownMetrics={};for(const [metricKey,metricValue] of Object.entries(snapshot.metrics??{})){if(definitions[metricValue.definition_id])knownMetrics[metricKey]=metricValue;else if(metricValue.definition_id.startsWith('legacy.v1.'))legacyObservationRefs.push(`${snapshot.snapshot_id}:${metricKey}`);else fail('METRIC_DEFINITION_UNRESOLVED',`/snapshots/${snapshot.snapshot_id}/metrics/${metricKey}/definition_id`,'Unknown metric definition');}if(Object.keys(knownMetrics).length)allSnapshots.push(validateMetricObservation({...snapshot,metrics:knownMetrics},definitions,input.account));}
 const futureSnapshots=allSnapshots.filter(snapshot=>snapshot.observed_at&&ms(snapshot.observed_at,'/snapshots/observed_at')>cutoff),snapshots=allSnapshots.filter(snapshot=>!snapshot.observed_at||ms(snapshot.observed_at,'/snapshots/observed_at')<=cutoff),postSnapshotsByEntity=new Map();for(const item of snapshots)if(item.entity_type==='post'&&item.observed_at){const items=postSnapshotsByEntity.get(item.entity_id)??[];items.push(item);postSnapshotsByEntity.set(item.entity_id,items);}const index=buildObservationIndex(snapshots,request.selection_policy??{}),requestedMetricIds=request.requested_metric_definition_ids??[...new Set(snapshots.flatMap(snapshot=>Object.values(snapshot.metrics).map(metric=>metric.definition_id)))];for(const definitionId of requestedMetricIds)if(!definitions[definitionId]&&!definitionId.startsWith('legacy.v1.'))fail('METRIC_DEFINITION_UNRESOLVED','/requested_metric_definition_ids','Unknown requested metric definition');const metricIds=requestedMetricIds.filter(definitionId=>definitions[definitionId]),accountMetricIds=metricIds.filter(definitionId=>definitions[definitionId].allowed_entity_types.includes('account'));const outputs=request.requested_outputs??['account_period','publication_cohort','age_matched'];
 const periods=request.periods??[],collectionCoverage=Array.isArray(input.coverage)?input.coverage:input.coverage?[input.coverage]:[],collectionPartial=collectionCoverage.some(item=>item?.completeness&&item.completeness!=='complete'||item?.has_more===true||Number(item?.failed_items??0)>0);const account_period_results=[];
 if(outputs.includes('account_period'))for(const period of periods){
  const exactRows=snapshots.filter(s=>s.entity_type==='account'&&s.period?.start===period.start&&s.period?.end_exclusive===period.end_exclusive&&period.start!==null);
  const calendarCandidates=snapshots.filter(s=>s.entity_type==='account'&&period.source_date_start&&s.period?.source_date_start&&s.period.source_date_start>=period.source_date_start&&s.period.source_date_start<=period.source_date_end_inclusive);
  const dailyRows=calendarCandidates.filter(s=>s.period.source_date_start===s.period.source_date_end_inclusive&&s.period.source_date_end_inclusive<=period.source_date_end_inclusive),crossBoundaryRows=calendarCandidates.length-dailyRows.length;
  const metrics=[];let periodEvidencePartial=false;
  for(const id of accountMetricIds){
   const exact=newestPerEntity(metricObservationRows(exactRows,id,index)).filter(row=>!row.conflict&&row.metric.availability==='observed'),daily=newestPerEntity(metricObservationRows(dailyRows,id,index)).filter(row=>!row.conflict&&row.metric.availability==='observed'),definition=(input.metric_definitions??METRIC_DEFINITIONS)[id];let value=null,status='unavailable',selected=[],reasons=[];
   const dailyDates=new Set(daily.map(row=>row.snapshot.period?.source_date_start).filter(Boolean)),dailyDistributions=new Set(daily.map(row=>row.snapshot.distribution)),expectedDays=period.source_date_start&&period.source_date_end_inclusive?Temporal.PlainDate.from(period.source_date_start).until(Temporal.PlainDate.from(period.source_date_end_inclusive)).days+1:null,dailyCompatible=dailyDistributions.size<=1&&dailyDates.size===daily.length;
   if(exact.length===1){value=exact[0].metric.value;status='available';selected=exact;if(daily.length)reasons.push('daily_series_used_for_reconciliation_not_added');}
   else if(exact.length>1){status='unresolved';reasons=['overlapping_period_observations_not_additive'];}
   else if(daily.length&&definition?.additivity==='additive_nonoverlap'&&dailyCompatible){value=daily.reduce((total,row)=>total+row.metric.value,0);status='available';selected=daily;if(expectedDays!==null&&dailyDates.size!==expectedDays){reasons.push('daily_series_has_coverage_gaps');periodEvidencePartial=true;}if(crossBoundaryRows)reasons.push('overlapping_or_cross_boundary_periods_excluded');if(daily.some(row=>row.snapshot.period?.completeness!=='complete'))reasons.push('daily_period_contains_partial_or_unknown_days');}
   else if(daily.length){status='unresolved';reasons=[definition?.additivity!=='additive_nonoverlap'?'metric_not_additive':'daily_series_overlaps_or_mixes_distribution'];}
   if(selected.some(row=>row.snapshot.observed_at===null))reasons.push('observation_time_unknown_platform_reported');
   if(selected.some(row=>row.snapshot.period?.completeness&&row.snapshot.period.completeness!=='complete'))periodEvidencePartial=true;
   metrics.push({metric_definition_id:id,value,selected_observation_refs:selected.map(row=>row.ref),status,reasons});
  }
  const instantPeriodOpen=Boolean(period.end_exclusive&&cutoff<ms(period.end_exclusive,'/period/end_exclusive'));
  const calendarPeriodOpen=Boolean(period.source_date_end_inclusive&&period.timezone&&Temporal.Instant.from(input.analysis_cutoff).toZonedDateTimeISO(period.timezone).toPlainDate().toString()<=period.source_date_end_inclusive);
  const periodIncomplete=collectionPartial||period.completeness!=='complete'||periodEvidencePartial||instantPeriodOpen||calendarPeriodOpen;
  account_period_results.push({period_id:period.period_id,start:period.start??null,end_exclusive:period.end_exclusive??null,timezone:period.timezone??null,completeness:periodIncomplete?'partial':'complete',metrics});
 }
 const cohort=request.cohort??null,targetKeys=new Set(request.target_post_keys??entities.map(entity=>entity.post_key));const cohortEntities=entities.filter(entity=>targetKeys.has(entity.post_key)&&(!cohort||(()=>{const version=versions.get(entity.current_version_ref);return version?.created_at&&ms(version.created_at,'/post_versions/created_at')>=ms(cohort.created_start,'/cohort/created_start')&&ms(version.created_at,'/post_versions/created_at')<ms(cohort.created_end_exclusive,'/cohort/created_end_exclusive')&&(!cohort.post_types?.length||cohort.post_types.includes(version.post_type??'unknown'));})()));
 const publicationPeriods=request.publication_periods?.length?request.publication_periods:[{period_id:'all',created_start:null,created_end_exclusive:null}],periodEntities=publicationPeriods.map(period=>({period,entities:cohortEntities.filter(entity=>{if(!period.created_start)return true;const version=versions.get(entity.current_version_ref);return version?.created_at&&ms(version.created_at,'/post_versions/created_at')>=ms(period.created_start,'/publication_periods/created_start')&&ms(version.created_at,'/post_versions/created_at')<ms(period.created_end_exclusive,'/publication_periods/created_end_exclusive');})}));
 const publicationMetrics=metricIds.filter(definitionId=>definitions[definitionId].allowed_entity_types.includes('post')),post_cohort_results=[],postRows=snapshots.filter(item=>item.entity_type==='post');
 const publication_structure=periodEntities.map(({period:publicationPeriod,entities:periodPosts})=>({period_id:publicationPeriod.period_id,total:periodPosts.length,by_post_type:Object.fromEntries([...new Set(periodPosts.map(entity=>versions.get(entity.current_version_ref)?.post_type??'unknown'))].map(type=>[type,periodPosts.filter(entity=>(versions.get(entity.current_version_ref)?.post_type??'unknown')===type).length]))}));
 if(outputs.includes('publication_cohort'))for(const {period:publicationPeriod,entities:periodPosts} of periodEntities){const types=['all',...new Set(periodPosts.map(entity=>versions.get(entity.current_version_ref)?.post_type??'unknown'))];for(const postType of types){const selectedEntities=postType==='all'?periodPosts:periodPosts.filter(entity=>(versions.get(entity.current_version_ref)?.post_type??'unknown')===postType),targets=new Set(selectedEntities.map(entity=>entity.post_key));for(const id of publicationMetrics)post_cohort_results.push({...summary(id,targets,metricObservationRows(postRows,id,index)),period_id:publicationPeriod.period_id,post_type:postType});}}
 const ageWindows=request.age_windows??[],age_matched_results=[];const ageIds=new Set();
 const selectorState={post_aliases:aliases,post_entities:Object.fromEntries(entities.map(entity=>[entity.post_key,entity])),post_versions:Object.fromEntries(versions),snapshots_v2:Object.fromEntries(snapshots.map(snapshot=>[snapshot.snapshot_id,snapshot]))};
 for(const window of ageWindows){
  if(!window.window_id||ageIds.has(window.window_id))fail('INVALID_INPUT','/age_windows','Age windows require unique window_id');ageIds.add(window.window_id);
  for(const {period:publicationPeriod,entities:periodPosts} of periodEntities){
   const types=['all',...new Set(periodPosts.map(entity=>versions.get(entity.current_version_ref)?.post_type??'unknown'))];
   for(const postType of types){
    const groupPosts=postType==='all'?periodPosts:periodPosts.filter(entity=>(versions.get(entity.current_version_ref)?.post_type??'unknown')===postType),entityKeys=groupPosts.map(entity=>entity.post_key);
    const shared=selectMetricObservations(selectorState,{scope:{entity_type:'post',entity_keys:entityKeys},window:{kind:'age_window',target_hours:window.target_hours,tolerance_hours:window.tolerance_hours},metric_requirements:publicationMetrics,as_of:input.analysis_cutoff,role:'target',selection_policy_version:request.selection_policy?.version??'v2-through-v3-selector'});
    const eligible=new Set(entityKeys),pending=new Set(shared.coverage.pending_keys.map(key=>key.slice(0,key.lastIndexOf(':post.')))),refs=new Set(shared.selected.map(item=>item.observation_ref)),chosen=snapshots.filter(snapshot=>Object.keys(snapshot.metrics).some(metricKey=>refs.has(`${snapshot.snapshot_id}:${metricKey}`)));
    const metrics=publicationMetrics.map(id=>summary(id,eligible,metricObservationRows(chosen,id,index),pending));
    age_matched_results.push({period_id:publicationPeriod.period_id,post_type:postType,window_id:window.window_id,target_hours:window.target_hours,tolerance_hours:window.tolerance_hours,metrics});
   }
  }
 }
 const comparisons=[];
 for(let i=1;i<account_period_results.length;i++)for(const current of account_period_results[i].metrics){
  const currentPeriod=periods[i],baselinePeriod=periods[i-1],baseline=account_period_results[i-1].metrics.find(metric=>metric.metric_definition_id===current.metric_definition_id);
  const instantDuration=currentPeriod.start&&baselinePeriod.start?(ms(currentPeriod.end_exclusive,'/period/end')-ms(currentPeriod.start,'/period/start'))===(ms(baselinePeriod.end_exclusive,'/period/end')-ms(baselinePeriod.start,'/period/start')):null;
  const dateDuration=currentPeriod.source_date_start&&baselinePeriod.source_date_start?Temporal.PlainDate.from(currentPeriod.source_date_start).until(Temporal.PlainDate.from(currentPeriod.source_date_end_inclusive)).days===Temporal.PlainDate.from(baselinePeriod.source_date_start).until(Temporal.PlainDate.from(baselinePeriod.source_date_end_inclusive)).days:null;
  const scopesCompatible=(instantDuration===true||dateDuration===true)&&(currentPeriod.timezone??null)===(baselinePeriod.timezone??null)&&currentPeriod.completeness==='complete'&&baselinePeriod.completeness==='complete'&&!current.reasons.includes('observation_time_unknown_platform_reported')&&!baseline?.reasons.includes('observation_time_unknown_platform_reported'),valuesAvailable=current.status==='available'&&baseline?.status==='available';
  const comparable=valuesAvailable&&scopesCompatible;
  const currentSample={unit:'account_period',eligible_n:1,selected_n:current.selected_observation_refs.length,valid_n:current.status==='available'?1:0,missing_n:current.status==='unavailable'?1:0,pending_n:0,conflict_n:current.status==='unresolved'?1:0},baselineSample={unit:'account_period',eligible_n:1,selected_n:baseline?.selected_observation_refs.length??0,valid_n:baseline?.status==='available'?1:0,missing_n:baseline?.status==='unavailable'?1:0,pending_n:0,conflict_n:baseline?.status==='unresolved'?1:0};
  comparisons.push({metric_definition_id:current.metric_definition_id,current_scope:currentPeriod.period_id,baseline_scope:baselinePeriod.period_id,current_sample:currentSample,baseline_sample:baselineSample,current_coverage:currentPeriod.completeness,baseline_coverage:baselinePeriod.completeness,current_value:current.value,baseline_value:baseline?.value??null,absolute_delta:comparable?current.value-baseline.value:null,relative_delta:comparable&&baseline.value!==0?(current.value-baseline.value)/baseline.value:null,descriptive_distribution:{current_median:current.value,baseline_median:baseline?.value??null,current_q1:null,current_q3:null,baseline_q1:null,baseline_q3:null},comparability_status:comparable?'compatible':valuesAvailable?'incompatible':'insufficient',reasons:comparable?[]:valuesAvailable?['period_length_or_timezone_mismatch']:['missing_or_unresolved_period'],selected_observation_refs:[...current.selected_observation_refs,...(baseline?.selected_observation_refs??[])]});
 }
 for(let i=1;i<publicationPeriods.length;i++)for(const currentResult of age_matched_results.filter(result=>result.period_id===publicationPeriods[i].period_id))for(const current of currentResult.metrics){const baselineResult=age_matched_results.find(result=>result.period_id===publicationPeriods[i-1].period_id&&result.window_id===currentResult.window_id&&result.post_type===currentResult.post_type),baseline=baselineResult?.metrics.find(metric=>metric.metric_definition_id===current.metric_definition_id),valuesAvailable=current.sample.valid_n>0&&(baseline?.sample.valid_n??0)>0,compatible=valuesAvailable;comparisons.push({metric_definition_id:current.metric_definition_id,current_scope:`${currentResult.period_id}:${currentResult.window_id}:${currentResult.post_type}`,baseline_scope:`${baselineResult?.period_id??publicationPeriods[i-1].period_id}:${currentResult.window_id}:${currentResult.post_type}`,current_sample:current.sample,baseline_sample:baseline?.sample??{unit:'post',eligible_n:0,selected_n:0,valid_n:0,missing_n:0,pending_n:0,conflict_n:0},current_coverage:current.sample.valid_n===current.sample.eligible_n?'complete':'partial',baseline_coverage:baseline&&baseline.sample.valid_n===baseline.sample.eligible_n?'complete':'partial',current_value:current.median,baseline_value:baseline?.median??null,absolute_delta:compatible?current.median-baseline.median:null,relative_delta:compatible&&baseline.median!==0?(current.median-baseline.median)/baseline.median:null,descriptive_distribution:{current_median:current.median,baseline_median:baseline?.median??null,current_q1:current.q1,current_q3:current.q3,baseline_q1:baseline?.q1??null,baseline_q3:baseline?.q3??null},comparability_status:compatible?'compatible':'insufficient',reasons:compatible?[]:['missing_pending_or_conflicting_age_matched_observations'],selected_observation_refs:[...current.selected_observation_refs,...(baseline?.selected_observation_refs??[])]});}
 const accountMetrics=account_period_results.flatMap(period=>period.metrics),ageMetrics=age_matched_results.flatMap(window=>window.metrics);
 const requestedStatus=(requested,items,complete)=>!requested?'not_requested':!items.some(complete.some)?'unavailable':items.every(complete.every)?'complete':'partial';
 const accountPeriodStatus=requestedStatus(outputs.includes('account_period'),accountMetrics,{some:item=>item.status==='available',every:item=>item.status==='available'});
 const deliverable_status={
  account_period:accountPeriodStatus==='complete'&&account_period_results.some(period=>period.completeness!=='complete')?'partial':accountPeriodStatus,
  publication_cohort:requestedStatus(outputs.includes('publication_cohort'),post_cohort_results,{some:item=>item.sample.valid_n>0,every:item=>item.sample.eligible_n>0&&item.sample.valid_n===item.sample.eligible_n&&!item.reasons.includes('observation_time_unknown_platform_reported')}),
  age_matched:requestedStatus(outputs.includes('age_matched'),ageMetrics,{some:item=>item.sample.valid_n>0,every:item=>item.sample.eligible_n>0&&item.sample.valid_n===item.sample.eligible_n})
 };
 const selection_log=[...index.selected.values()].map(item=>({status:'selected',observation_ref:`${item.snapshot.snapshot_id}:${item.metric_key}`,reason:null,policy_version:index.policy_version}));
 selection_log.push(...index.conflicts.map(conflict=>({status:'conflict',observation_refs:conflict.observation_refs,reason:conflict.reason,policy_version:index.policy_version})));
 const derived_metrics=deriveMetrics(snapshots,index);
 return{contract_version:2,account:clone(input.account),analysis_cutoff:input.analysis_cutoff,account_period_results,publication_structure,post_cohort_results,age_matched_results,comparisons,derived_metrics,selection_log,limitations:[...(legacyObservationRefs.length?[`${legacyObservationRefs.length} legacy V1 metric observations have unresolved definitions and were excluded from precise V2 statistics`]:[]),...(futureSnapshots.length?[`${futureSnapshots.length} observations after the analysis cutoff were excluded`]:[]),...(snapshots.some(snapshot=>snapshot.observed_at===null)?['Observations without observed_at are platform-reported values and are excluded from precise cutoff and age calculations']:[]),...(index.conflicts.length?['Conflicting equivalent observations were excluded']:[]),...(metadataConflicts.length?[`Post metadata conflicts were excluded: ${metadataConflicts.join(', ')}`]:[]),...(entities.some(entity=>entity.version_conflict_refs?.length)?['Post text versions conflict or differ without verified edit lineage; content conclusions require recheck']:[]),...(account_period_results.some(period=>period.completeness!=='complete')?['Partial or unknown periods are not unconditional full-period comparisons']:[])],deliverable_status};
}
