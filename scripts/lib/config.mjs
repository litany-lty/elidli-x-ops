import { Temporal } from '@js-temporal/polyfill';
import { canonicalHash, ContractError, validate } from './contracts.mjs';

const DEFAULT_CONFIG = Object.freeze({
  schema_version: 1,
  account: { handle: 'your_handle', profile_url: 'https://x.com/your_handle', user_id: null, identity_basis: 'user_provided' },
  timezone: 'Asia/Shanghai',
  output_language: 'zh-CN',
  content: {
    audience: null, audience_regions: [], primary_goal: 'relevant_reach', goal_notes: null,
    topics: null, voice_samples: [], style_notes: [], allowed_formats: ['short_post', 'thread', 'reply']
  },
  news: {
    core_topics: null, exploration_topics: [], excluded_topics: [], entities: [], source_languages: ['zh', 'en'],
    event_regions: ['global'], preferred_sources: [], restricted_sources: [], excluded_sources: [],
    content_types: ['announcement', 'release', 'update', 'research', 'case', 'industry_change', 'discussion', 'correction'],
    window: { mode: 'rolling', hours: 24 }, allow_out_of_window: false, rumor_policy: 'watch_only',
    max_queries: 8, verification_queries_reserved: 3, max_source_reads: 12, verification_reads_reserved: 4,
    max_candidate_urls: 24, max_events_to_verify: 6, max_discovery_rounds: 2, soft_budget_seconds: 300,
    max_topic_cards: 3, max_draft_variants: 2, new_paid_api_budget_usd: 0
  },
  history: { dedupe_scope: 'account', previously_recommended: 'require_new_angle_or_update' }
});

const DEFAULT_EXPLICIT_PREFERENCES_V5 = Object.freeze({
  short_text_on_images: null,
  image_usage: null,
  available_minutes_per_post: null,
  topic_boundaries: []
});

export function createDefaultConfig(account = undefined) {
  const config = structuredClone(DEFAULT_CONFIG);
  if (account) config.account = normalizeAccount(account);
  return validate('ConfigV1', config);
}

export function migrateConfigV5(config) {
  if (config?.schema_version === 5) return validate('ConfigV5', config);
  const current = validate('ConfigV1', config ?? createDefaultConfig());
  return validate('ConfigV5', {
    ...structuredClone(current),
    schema_version: 5,
    content: { ...structuredClone(current.content), preferences: structuredClone(DEFAULT_EXPLICIT_PREFERENCES_V5) }
  });
}

export function createDefaultConfigV5(account = undefined) {
  return migrateConfigV5(createDefaultConfig(account));
}

export function resolveConfig(base, patch, asOf) {
  const originalType = base?.schema_version === 5 ? 'ConfigV5' : 'ConfigV1';
  const original = validate(originalType, base ?? createDefaultConfig());
  const patchType = originalType === 'ConfigV5' ? 'ConfigPatchV5' : 'ConfigPatch';
  const checkedPatch = patch === null || patch === undefined ? null : validate(patchType, patch);
  const instant = normalizeInstant(asOf, '/as_of');
  const config = checkedPatch ? applyConfigPatch(original, checkedPatch) : original;
  const window = resolveWindow(config.news.window, config.timezone, instant);
  const effective = {
    config,
    patch: checkedPatch,
    window,
    as_of: instant.toString(),
    config_hash: canonicalHash(config),
    assumptions: []
  };
  return validate(originalType === 'ConfigV5' ? 'EffectiveConfigV5' : 'EffectiveConfig', effective);
}

export function applyConfigPatch(base, patch) {
  const next = structuredClone(base);
  patch.operations.forEach((operation, index) => {
    const segments = operation.path.slice(1).split('/').map(unescapePointer);
    const target = segments.slice(0, -1).reduce((current, segment) => {
      if (!current || !Object.hasOwn(current, segment)) throw new ContractError('INVALID_INPUT', `/operations/${index}/path`, `unknown patch path: ${operation.path}`);
      return current[segment];
    }, next);
    const key = segments.at(-1);
    if(operation.op==='set'&&segments.length===2&&segments[0]==='content'&&['recipe_defaults','visual_preferences','recipe_locations','delivery_preferences'].includes(key)&&!Object.hasOwn(target,key))target[key]=key==='recipe_locations'?[]:{};
    if (!target || !Object.hasOwn(target, key)) throw new ContractError('INVALID_INPUT', `/operations/${index}/path`, `unknown patch path: ${operation.path}`);
    const current = target[key];
    if (operation.op === 'set') target[key] = structuredClone(operation.value);
    else if (operation.op === 'inherit') target[key] = null;
    else if (operation.op === 'clear') {
      if (!Array.isArray(current)) throw new ContractError('INVALID_INPUT', `/operations/${index}`, 'clear requires an array field');
      target[key] = [];
    } else if (operation.op === 'append') {
      if (!Array.isArray(current)) throw new ContractError('INVALID_INPUT', `/operations/${index}`, 'append requires an array field');
      const additions = Array.isArray(operation.value) ? operation.value : [operation.value];
      target[key] = dedupe([...current, ...structuredClone(additions)]);
    } else if (operation.op === 'remove') {
      if (!Array.isArray(current)) throw new ContractError('INVALID_INPUT', `/operations/${index}`, 'remove requires an array field');
      const removals = Array.isArray(operation.value) ? operation.value : [operation.value];
      const keys = new Set(removals.map(identityKey));
      target[key] = current.filter(value => !keys.has(identityKey(value)));
    }
  });
  return validate(next.schema_version === 5 ? 'ConfigV5' : 'ConfigV1', next);
}

function normalizeAccount(account) {
  const handle = String(account.handle ?? '').replace(/^@/, '');
  return {
    handle,
    profile_url: account.profile_url ?? `https://x.com/${handle}`,
    user_id: account.user_id ?? null,
    identity_basis: account.identity_basis ?? 'user_provided'
  };
}

function dedupe(values) {
  const seen = new Set();
  return values.filter(value => {
    const key = identityKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function identityKey(value) {
  if (value && typeof value === 'object') {
    if (Object.hasOwn(value, 'entity_id')) return `entity:${value.entity_id}`;
    if (Object.hasOwn(value, 'kind') && Object.hasOwn(value, 'value')) return `source:${canonicalSourceRule(value)}`;
    return `object:${canonicalHash(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

function canonicalSourceRule(rule) {
  if (rule.kind === 'domain') return `domain:${rule.value.toLowerCase().replace(/\.$/, '')}:${rule.include_subdomains}`;
  const url = new URL(rule.value);
  return `url_prefix:${url.origin.toLowerCase()}${normalizePath(url.pathname)}`;
}

function unescapePointer(value) {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function normalizeInstant(value, path) {
  try { return Temporal.Instant.from(value); }
  catch { throw new ContractError('INVALID_INPUT', path, 'expected an ISO 8601 instant with an offset'); }
}

function resolveWindow(window, timezone, asOf) {
  let start;
  let end = asOf;
  if (window.mode === 'rolling') {
    start = asOf.subtract({ hours: window.hours });
  } else if (window.mode === 'calendar_day') {
    const date = Temporal.PlainDate.from(window.date);
    start = date.toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from('00:00') }).toInstant();
    const dayEnd = date.add({ days: 1 }).toZonedDateTime({ timeZone: timezone, plainTime: Temporal.PlainTime.from('00:00') }).toInstant();
    end = Temporal.Instant.compare(dayEnd, asOf) < 0 ? dayEnd : asOf;
  } else {
    start = Temporal.Instant.from(window.start);
    const requestedEnd = Temporal.Instant.from(window.end);
    end = Temporal.Instant.compare(requestedEnd, asOf) < 0 ? requestedEnd : asOf;
  }
  if (Temporal.Instant.compare(start, end) >= 0) throw new ContractError('INVALID_INPUT', '/news/window', 'window has no elapsed interval at as_of');
  return { start: start.toString(), end: end.toString() };
}

export function matchSource(urlValue, sourceRules) {
  let url;
  try { url = new URL(urlValue); }
  catch { throw new ContractError('INVALID_INPUT', '/url', 'source URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ContractError('INVALID_INPUT', '/url', 'source URL must use HTTP or HTTPS');
  if (Array.isArray(sourceRules)) {
    sourceRules.forEach((rule, index) => validateRule(rule, `/${index}`));
    return sourceRules.some(rule => matchesRule(url, rule));
  }
  const preferred = sourceRules.preferred_sources ?? [];
  const restricted = sourceRules.restricted_sources ?? [];
  const excluded = sourceRules.excluded_sources ?? [];
  preferred.forEach((rule, index) => validateRule(rule, `/preferred_sources/${index}`));
  restricted.forEach((rule, index) => validateRule(rule, `/restricted_sources/${index}`));
  excluded.forEach((rule, index) => validateRule(rule, `/excluded_sources/${index}`));
  const restrictedMatch = restricted.length === 0 || restricted.some(rule => matchesRule(url, rule));
  const excludedMatch = excluded.some(rule => matchesRule(url, rule));
  return {
    allowed: restrictedMatch && !excludedMatch,
    restricted_match: restrictedMatch,
    excluded_match: excludedMatch,
    preferred_match: preferred.some(rule => matchesRule(url, rule))
  };
}

function validateRule(rule, path) {
  try { validate('SourceRule', rule); }
  catch (error) { if (error instanceof ContractError) error.path = `${path}${error.path === '/' ? '' : error.path}`; throw error; }
}

function matchesRule(url, rule) {
  if (rule.kind === 'domain') {
    const expected = rule.value.toLowerCase().replace(/\.$/, '');
    const actual = url.hostname.toLowerCase().replace(/\.$/, '');
    return actual === expected || (rule.include_subdomains && actual.endsWith(`.${expected}`));
  }
  const prefix = new URL(rule.value);
  if (url.origin.toLowerCase() !== prefix.origin.toLowerCase()) return false;
  const expectedPath = normalizePath(prefix.pathname);
  const actualPath = normalizePath(url.pathname);
  return actualPath.startsWith(expectedPath);
}

function normalizePath(pathname) {
  const path = pathname.replace(/\/{2,}/g, '/');
  return path.endsWith('/') ? path : `${path}/`;
}
