import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig, resolveConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));
const { initializeState } = await import(runtimeUrl('scripts/lib/state.mjs'));
const { initializeNews, advanceNews } = await import(runtimeUrl('scripts/lib/news.mjs'));
const binding = JSON.parse(await readFile(new URL(runtimeUrl('assets/host-binding.codex-desktop.json')), 'utf8'));
binding.data_mode = 'fixture';
const T = '2026-10-26T04:00:00Z';

test('a regional query keyword cannot qualify an event without recorded regional source evidence', () => {
  const config = createDefaultConfig({ handle: 'fixture_region', profile_url: 'https://x.com/fixture_region', user_id: null, identity_basis: 'user_provided' });
  config.news.core_topics = ['API tools'];
  config.news.event_regions = ['Japan'];
  const effective = resolveConfig(config, null, T);
  const state = initializeState(config);
  const run = initializeNews({ task_text: 'fixture Japan API news', requested_at: T, scope_patch: null, requested_outputs: ['cards'], data_mode: 'fixture' }, effective, binding, T);
  run.plan = { plan_id: 'plan-region', run_id: run.run_id, required_coverage: [], tasks: [], backup_sources: [], assumptions: [] };
  const eventId = 'event-region';
  const claimId = 'claim-region';
  state.events[eventId] = { event_id: eventId, event_key: 'fixture-region-event', event_kind: 'new_event', event_time: { raw: '2026-10-26T03:00:00Z', instant: '2026-10-26T03:00:00Z', timezone: 'UTC', precision: 'instant', source_ref: 'source-version-region' } };
  state.claims[claimId] = { claim_id: claimId, event_id: eventId, support_status: 'supported', locators: [] };
  run.event_ids = [eventId];
  run.assessments = [{ new_events: [], event_assessments: [{ event_ref: { kind: 'existing', id: eventId }, relevant: true }], rejected_candidates: [], unresolved_candidates: [] }];
  const card = { card_id: 'card-region', event_id: eventId, claim_ids: [claimId], reader_value: 'Synthetic reader value', new_information: 'Synthetic update', angle: 'Scope evidence', heat_evidence_ids: [], selection_reason: 'Fixture selection', window_status: 'in_window' };
  assert.throws(
    () => advanceNews(run, 'finalize', { cards: [card], draft_inputs: [], coverage: [], stop_reason: 'fixture_complete' }, { state, effective_config: effective, data_mode: 'fixture', as_of: T }),
    error => error.code === 'MISSING_EVIDENCE' && error.path === '/region_assessment',
  );
});
