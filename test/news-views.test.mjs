import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig, resolveConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));
const { initializeState } = await import(runtimeUrl('scripts/lib/state.mjs'));
const { initializeNews, finalizeRun } = await import(runtimeUrl('scripts/lib/news.mjs'));
const binding = JSON.parse(await readFile(new URL(runtimeUrl('assets/host-binding.codex-desktop.json')), 'utf8'));
binding.data_mode = 'fixture';
const T = '2026-10-26T04:00:00Z';

function fixtureRun() {
  const config = createDefaultConfig({ handle: 'fixture_views', profile_url: 'https://x.com/fixture_views', user_id: null, identity_basis: 'user_provided' });
  config.news.core_topics = ['API tools'];
  const effective = resolveConfig(config, null, T);
  const state = initializeState(config);
  const run = initializeNews({ task_text: 'fixture API news', requested_at: T, scope_patch: null, requested_outputs: ['cards'], data_mode: 'fixture' }, effective, binding, T);
  const eventId = 'event-view';
  const claimId = 'claim-view';
  const card = { card_id: 'card-view', event_id: eventId, claim_ids: [claimId], reader_value: 'Synthetic reader value', new_information: 'Synthetic update', angle: 'Historical view', heat_evidence_ids: [], selection_reason: 'Fixture selection', window_status: 'in_window' };
  run.plan = { plan_id: 'plan-view', run_id: run.run_id, required_coverage: [{ coverage_id: 'core-api', description: 'Fixture API coverage', priority: 1 }], tasks: [], backup_sources: [], assumptions: [] };
  run.tickets = { ticket: { ticket_id: 'ticket', purpose: 'discover', execution_state: 'succeeded' } };
  run.coverage = [{ coverage_id: 'core-api', status: 'completed', searched_ticket_ids: ['ticket'], read_ticket_ids: [], limitations: [] }];
  run.event_ids = [eventId];
  run.card_ids = [card.card_id];
  run.cards = [card];
  run.assessments = [{ new_events: [], event_assessments: [{ event_ref: { kind: 'existing', id: eventId }, relevant: true }], rejected_candidates: [], unresolved_candidates: [] }];
  state.events[eventId] = { event_id: eventId, event_key: 'fixture-view-event', event_time: { raw: '2026-10-26T03:00:00Z', instant: '2026-10-26T03:00:00Z', timezone: 'UTC', precision: 'instant', source_ref: 'source-version-view' } };
  state.claims[claimId] = { claim_id: claimId, event_id: eventId, support_status: 'invalidated' };
  return { state, run, eventId, claimId };
}

test('historical card views recheck current claim validity and the specific frozen half-open window', () => {
  const invalidated = fixtureRun();
  const oldView = finalizeRun(invalidated.run, { state: invalidated.state, persistence_status: 'saved' });
  assert.equal(invalidated.run.stage_results.find(stage => stage.stage === 'evidence').status, 'failed');
  assert.equal(oldView.execution_status, 'partial');

  const boundary = fixtureRun();
  boundary.state.claims[boundary.claimId].support_status = 'supported';
  boundary.state.events[boundary.eventId].event_time.instant = boundary.run.effective_config.window.end;
  const boundaryView = finalizeRun(boundary.run, { state: boundary.state, persistence_status: 'saved' });
  assert.equal(boundary.run.stage_results.find(stage => stage.stage === 'evidence').status, 'failed');
  assert.equal(boundaryView.execution_status, 'partial');
});
