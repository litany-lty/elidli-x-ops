import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeUrl } from './helpers/runtime.mjs';
const {checkDraft}=await import(runtimeUrl('scripts/lib/draft.mjs'));

const asOf = '2026-10-26T04:00:00Z';
const baseContext = {
  effective_config: { config: { content: { allowed_formats: ['short_post', 'thread', 'reply'] } } },
  data_mode: 'fixture',
  state: {
    drafts: {},
    user_facts: {
      'fact-1': {
        user_fact_id: 'fact-1',
        text: '目前仅自己使用，未统计节省时间',
        source_ref: 'source-user',
        material_locator: 'paragraph-1',
        recorded_at: '2026-10-26T03:00:00Z',
      },
    },
    claims: {},
    sources: {'source-user':{record:{source_id:'source-user',kind:'fixture',locator:'fixture:user-original',retrieved_at:asOf,description:'Registered synthetic user original',metric_mapping:{},raw_material:'目前仅自己使用，未统计节省时间'},versions:{},latest_version_id:null}},
  },
};

function inputFor(text, semanticReview = null) {
  return {
    draft_id: null,
    revision: 1,
    parent_revision: null,
    card_id: null,
    original_text: '我把重复任务拆成步骤后交给工具。目前只有自己在用，也没统计节省时间。',
    original_ref: 'source-user',
    format: 'short_post',
    texts: [text],
    fact_mapping: [{ text_index: 0, start: 0, end: text.length, claim_ids: [], user_fact_ids: ['fact-1'] }],
    semantic_review: semanticReview,
  };
}

test('DRAFT-POS: final text must be checked, reviewed and bound to current hashes', () => {
  const text = '把重复的数据整理任务拆成几个明确步骤，再交给工具完成。现在只是我自己在用，还没统计节省了多少时间。我的体会是：先把流程写清楚，再考虑自动化。';
  const first = checkDraft(inputFor(text), baseContext, asOf);
  assert.equal(first.validity, 'unverified');
  assert.equal(first.semantic_status, 'missing');
  assert.equal(first.text_checks[0].valid, true);
  assert.equal(first.text_checks[0].text_hash, first.draft.text_hashes[0]);

  const review = {
    text_hashes: first.draft.text_hashes,
    kept_user_fact_ids: ['fact-1'],
    claim_ids: [],
    new_claims_check: '未发现新增外部事实或未经用户提供的效果数字',
    stance_voice_notes: ['保留克制语气', '保留仅自己使用且未统计效果的边界'],
    reviewer: 'fixture-reviewer',
    reviewed_at: asOf,
    decision: 'approve',
  };
  const reviewedInput = inputFor(text, review);
  reviewedInput.draft_id = first.draft.draft_id;
  const final = checkDraft(reviewedInput, baseContext, asOf);
  assert.equal(final.draft.draft_id, first.draft.draft_id);
  assert.equal(final.validity, 'ready');
  assert.equal(final.semantic_status, 'approved');
  assert.equal(final.evidence_status, 'supported');
});

test('B03: URL, emoji and a changed suffix alter the hash and are re-counted', () => {
  const text = '流程先写清楚，再自动化。🧭 https://example.com/path?q=1';
  const first = checkDraft(inputFor(text), baseContext, asOf);
  const changed = checkDraft(inputFor(`${text} 1/2`), baseContext, asOf);
  assert.notEqual(first.draft.text_hashes[0], changed.draft.text_hashes[0]);
  assert.notEqual(first.text_checks[0].weighted_length, changed.text_checks[0].weighted_length);
});

test('B03: text beyond the official weighted limit needs revision', () => {
  const text = '界'.repeat(281);
  const result = checkDraft(inputFor(text), baseContext, asOf);
  assert.equal(result.text_checks[0].valid, false);
  assert.equal(result.validity, 'needs_revision');
});

test('ordinary post boundaries, NFC and complex emoji use the actual twitter-text rules', () => {
  for(const [text,length,valid] of [['a'.repeat(280),280,true],['a'.repeat(281),281,false],['中'.repeat(140),280,true],['中'.repeat(141),282,false]]) {
    const result=checkDraft(inputFor(text),baseContext,asOf);
    assert.equal(result.text_checks[0].weighted_length,length);assert.equal(result.text_checks[0].valid,valid);
  }
  const composed=checkDraft(inputFor('café'),baseContext,asOf),decomposed=checkDraft(inputFor('cafe\u0301'),baseContext,asOf);
  assert.equal(composed.text_checks[0].weighted_length,4);assert.equal(decomposed.text_checks[0].weighted_length,4);assert.notEqual(composed.draft.text_hashes[0],decomposed.draft.text_hashes[0]);
  assert.equal(checkDraft(inputFor('中👨‍👩‍👧‍👦 https://example.com/path'),baseContext,asOf).text_checks[0].weighted_length,28);
});

test('revision cannot reuse the previous checked text', () => {
  const text = '先梳理流程，再考虑自动化。';
  const initial = checkDraft(inputFor(text), baseContext, asOf);
  const state = structuredClone(baseContext.state);
  state.drafts[initial.draft.draft_id] = {
    latest_revision: 1,
    revisions: { 1: initial.draft },
  };
  const revision = {
    ...inputFor(text),
    draft_id: initial.draft.draft_id,
    revision: 2,
    parent_revision: 1,
  };
  assert.throws(
    () => checkDraft(revision, { ...baseContext, state }, asOf),
    (error) => error.code === 'STALE_DRAFT',
  );
});

test('saved revision can be rechecked but cannot change text in place', () => {
  const text = '先梳理流程，再考虑自动化。';
  const initial = checkDraft(inputFor(text), baseContext, asOf);
  const state = structuredClone(baseContext.state);
  state.drafts[initial.draft.draft_id] = {
    latest_revision: 1,
    revisions: { 1: initial.draft },
  };
  const recheck = {
    ...inputFor(text),
    draft_id: initial.draft.draft_id,
    revision: 1,
    parent_revision: null,
  };
  assert.equal(checkDraft(recheck, { ...baseContext, state }, asOf).draft.draft_id, initial.draft.draft_id);
  recheck.texts = [`${text} 新增文字`];
  recheck.fact_mapping[0].end = recheck.texts[0].length;
  assert.throws(
    () => checkDraft(recheck, { ...baseContext, state }, asOf),
    (error) => error.code === 'STALE_DRAFT',
  );
});

test('invalidated external claim prevents ready status', () => {
  const text = '这个接口的请求标识保留 24 小时。';
  const state = structuredClone(baseContext.state);
  state.claims['claim-1'] = {
    claim_id: 'claim-1',
    kind: 'fact',
    support_status: 'invalidated',
    source_version_ids: ['version-1'],
  };
  state.sources['source-1'] = {
    versions: {
      'version-1': {
        source_version_id: 'version-1',
        raw_receipt_ref: 'receipt-1',
        read_status: 'read',
        material_kind: 'official_document',
      },
    },
  };
  state.raw_receipts = { 'receipt-1': { status: 'succeeded' } };
  const input = inputFor(text);
  input.fact_mapping = [{ text_index: 0, start: 0, end: text.length, claim_ids: ['claim-1'], user_fact_ids: [] }];
  const first = checkDraft(input, { ...baseContext, state }, asOf);
  input.semantic_review = {
    text_hashes: first.draft.text_hashes,
    kept_user_fact_ids: [],
    claim_ids: ['claim-1'],
    new_claims_check: '无',
    stance_voice_notes: [],
    reviewer: 'fixture-reviewer',
    reviewed_at: asOf,
    decision: 'approve',
  };
  const final = checkDraft(input, { ...baseContext, state }, asOf);
  assert.equal(final.evidence_status, 'invalidated');
  assert.equal(final.validity, 'needs_revision');
});
