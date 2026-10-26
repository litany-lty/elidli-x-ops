import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeUrl } from './helpers/runtime.mjs';
const { canonicalHash, ContractError, summarizeRun, textHash, validate } = await import(runtimeUrl('scripts/lib/contracts.mjs'));
const { createDefaultConfig, matchSource, resolveConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));

const AS_OF = '2026-10-26T04:00:00Z';

function patch(scope, operations, expected_revision = 0) {
  return { schema_version: 1, scope, expected_revision, operations };
}

test('default template is generic, complete and immutable across callers', () => {
  const first = createDefaultConfig();
  const second = createDefaultConfig();
  assert.equal(first.account.handle, 'your_handle');
  assert.equal(first.news.max_queries, 8);
  first.news.excluded_topics.push('mutated');
  assert.deepEqual(second.news.excluded_topics, []);
  assert.doesNotThrow(() => validate('ConfigV1', second));
});

test('run patch applies set/append/dedup/clear/inherit without mutating base', () => {
  const base = createDefaultConfig({ handle: 'fixture_account', profile_url: 'https://x.com/fixture_account', user_id: null, identity_basis: 'user_provided' });
  base.content.topics = ['API'];
  const effective = resolveConfig(base, patch('run', [
    { op: 'set', path: '/news/core_topics', value: ['API tools'] },
    { op: 'append', path: '/news/excluded_topics', value: ['娱乐', '娱乐'] },
    { op: 'clear', path: '/news/event_regions' },
    { op: 'set', path: '/news/event_regions', value: ['JP'] },
    { op: 'inherit', path: '/news/core_topics' }
  ]), AS_OF);
  assert.equal(effective.config.news.core_topics, null);
  assert.deepEqual(effective.config.news.excluded_topics, ['娱乐']);
  assert.deepEqual(effective.config.news.event_regions, ['JP']);
  assert.deepEqual(base.news.excluded_topics, []);
  assert.deepEqual(effective.window, { start: '2026-10-25T04:00:00Z', end: AS_OF });
  assert.equal(effective.config_hash, canonicalHash(effective.config));
});

test('one-off resolve patch does not require a state revision', () => {
  const oneOff = { schema_version: 1, scope: 'run', operations: [{ op: 'set', path: '/news/core_topics', value: ['API'] }] };
  assert.deepEqual(resolveConfig(createDefaultConfig(), oneOff, AS_OF).config.news.core_topics, ['API']);
});

test('calendar day freezes the Asia/Shanghai day at as_of', () => {
  const base = createDefaultConfig();
  base.news.window = { mode: 'calendar_day', date: '2026-10-26' };
  const result = resolveConfig(base, null, AS_OF);
  assert.deepEqual(result.window, { start: '2026-10-25T16:00:00Z', end: AS_OF });
});

test('calendar day respects the effective zone and a DST day rather than assuming 24 hours', () => {
  const tokyo=createDefaultConfig();tokyo.timezone='Asia/Tokyo';tokyo.news.window={mode:'calendar_day',date:'2026-10-26'};
  assert.equal(resolveConfig(tokyo,null,AS_OF).window.start,'2026-10-25T15:00:00Z');
  const ny=createDefaultConfig();ny.timezone='America/New_York';ny.news.window={mode:'calendar_day',date:'2026-11-01'};
  const day=resolveConfig(ny,null,'2026-11-02T05:00:00Z').window;
  assert.deepEqual(day,{start:'2026-11-01T04:00:00Z',end:'2026-11-02T05:00:00Z'});
});

test('future calendar day and conflicting source rules fail explicitly', () => {
  const future = createDefaultConfig();
  future.news.window = { mode: 'calendar_day', date: '2026-10-27' };
  assert.throws(() => resolveConfig(future, null, AS_OF), error => error instanceof ContractError && error.path === '/news/window');
  const conflict = createDefaultConfig();
  const rule = { kind: 'domain', value: 'example.com', include_subdomains: true };
  conflict.news.restricted_sources = [rule];
  conflict.news.excluded_sources = [rule];
  assert.throws(() => validate('ConfigV1', conflict), error => error.code === 'CONFIG_CONFLICT');
});

test('source matching respects hostname and path boundaries', () => {
  const domain = { kind: 'domain', value: 'example.com', include_subdomains: true };
  const prefix = { kind: 'url_prefix', value: 'https://example.com/releases/' };
  assert.equal(matchSource('https://docs.example.com/a', [domain]), true);
  assert.equal(matchSource('https://evil-example.com/a', [domain]), false);
  assert.equal(matchSource('https://example.com/releases/2.1', [prefix]), true);
  assert.equal(matchSource('https://example.com/releases-old/2.1', [prefix]), false);
  assert.deepEqual(matchSource('https://example.com/releases/2.1', {
    preferred_sources: [prefix], restricted_sources: [domain], excluded_sources: []
  }), { allowed: true, restricted_match: true, excluded_match: false, preferred_match: true });
});

test('strict schema rejects unknown fields and wrong schema version', () => {
  const unknown = { ...createDefaultConfig(), surprise: true };
  assert.throws(() => validate('ConfigV1', unknown), error => error.code === 'INVALID_INPUT');
  const wrong = createDefaultConfig();
  wrong.schema_version = 2;
  assert.throws(() => validate('ConfigV1', wrong), error => error.code === 'SCHEMA_VERSION');
});

test('invalid budgets, timezone and reversed windows do not silently resolve', () => {
  const badBudget=createDefaultConfig();badBudget.news.max_queries=-1;
  assert.throws(()=>resolveConfig(badBudget,null,AS_OF),{code:'INVALID_INPUT'});
  const badReserve=createDefaultConfig();badReserve.news.verification_reads_reserved=badReserve.news.max_source_reads+1;
  assert.throws(()=>resolveConfig(badReserve,null,AS_OF),{code:'INVALID_INPUT'});
  const badZone=createDefaultConfig();badZone.timezone='Invalid/Nowhere';
  assert.throws(()=>resolveConfig(badZone,null,AS_OF),{code:'INVALID_INPUT'});
  const badWindow=createDefaultConfig();badWindow.news.window={mode:'interval',start:AS_OF,end:'2026-10-25T04:00:00Z'};
  assert.throws(()=>resolveConfig(badWindow,null,AS_OF),{code:'INVALID_INPUT'});
});

test('hashes are deterministic while text hash preserves exact bytes', () => {
  assert.equal(canonicalHash({ b: 2, a: 1 }), canonicalHash({ a: 1, b: 2 }));
  assert.notEqual(textHash('a\n'), textHash('a'));
});

test('summary distinguishes partial progress, hard block and bounded no findings', () => {
  const common = { run_id: 'run-test', intent: 'content_optimization', effective_config_hash: 'a'.repeat(64), as_of: AS_OF,
    delivered_scope: { mode: 'draft_required' }, deliverable_refs: [], limitations: [], stop_reason: null, persistence_status: 'unverified' };
  const stages = [
    { stage: 'original_material', required: true, status: 'passed', evidence_refs: ['source-1'], reason: null },
    { stage: 'length_check', required: true, status: 'failed', evidence_refs: [], reason: 'not checked' }
  ];
  assert.equal(summarizeRun(stages, { mode: 'draft_required' }, { ...common, has_progress: true }).execution_status, 'partial');
  assert.equal(summarizeRun(stages, { mode: 'draft_required' }, { ...common, core_blocked: true }).execution_status, 'blocked');
  const passed = stages.map(stage => ({ ...stage, status: 'passed', reason: null }));
  const noFindings = summarizeRun(passed, { mode: 'draft_required' }, { ...common, definitive_no_findings: true });
  assert.equal(noFindings.execution_status, 'complete');
  assert.equal(noFindings.result_kind, 'no_findings');
});
