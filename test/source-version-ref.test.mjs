import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeUrl } from './helpers/runtime.mjs';

const { checkDraft } = await import(runtimeUrl('scripts/lib/draft.mjs'));
const { createDefaultConfig, resolveConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));
const T = '2026-10-26T04:00:00Z';

test('a registered synthetic source-version original_ref can complete the normal draft check', () => {
  const versionId = 'source-version-fixture';
  const claimId = 'claim-fixture';
  const text = 'The fixture API added a synthetic response field.';
  const config = createDefaultConfig();
  const state = {
    drafts: {},
    user_facts: {},
    raw_receipts: { 'receipt-fixture': { status: 'succeeded' } },
    sources: { 'source-fixture': { record: { source_id: 'source-fixture' }, versions: { [versionId]: { source_version_id: versionId, raw_receipt_ref: 'receipt-fixture', read_status: 'read', material_kind: 'official_document', captured_text: text } }, latest_version_id: versionId } },
    claims: { [claimId]: { claim_id: claimId, support_status: 'supported', source_version_ids: [versionId] } },
  };
  const input = { draft_id: null, revision: 1, parent_revision: null, card_id: null, original_text: null, original_ref: versionId, format: 'short_post', texts: [text], fact_mapping: [{ text_index: 0, start: 0, end: text.length, claim_ids: [claimId], user_fact_ids: [] }], semantic_review: null };
  const context = { state, effective_config: resolveConfig(config, null, T), data_mode: 'fixture' };
  const first = checkDraft(input, context, T);
  input.draft_id = first.draft.draft_id;
  input.semantic_review = { text_hashes: first.draft.text_hashes, kept_user_fact_ids: [], claim_ids: [claimId], new_claims_check: 'No additional claims', stance_voice_notes: ['Synthetic fixture'], reviewer: 'fixture-reviewer', reviewed_at: T, decision: 'approve' };
  const result = checkDraft(input, context, T);
  assert.equal(result.validity, 'ready');
  assert.equal(result.draft.original_ref, versionId);
  assert.equal(result.text_checks[0].valid, true);
});
