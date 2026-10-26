import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig, resolveConfig } from '../scripts/lib/config.mjs';
import { initializeState, saveDraft } from '../scripts/lib/state.mjs';
import { textHash, canonicalHash } from '../scripts/lib/contracts.mjs';
import { checkDraftV3, evaluateDraftReadiness } from '../scripts/lib/draft.mjs';
const T='2026-10-26T12:00:00Z';
function setup(){const state=initializeState(createDefaultConfig());const context={state,effective_config:resolveConfig(state.config,null,T)};return{state,context};}
function payload(text='保留判断，先核对数据。'){return{contract_version:3,draft_input:{draft_id:null,revision:1,parent_revision:null,card_id:null,original_text:text,original_ref:null,format:'short_post',texts:[text],fact_mapping:[],semantic_review:{text_hashes:[textHash(text)],claim_ids:[],kept_user_fact_ids:[],new_claims_check:'无新增个人经历或数据',stance_voice_notes:['保留原判断'],reviewer:'independent-review',reviewed_at:T,decision:'approve'}},personalization_mode:'none',personal_context_selection:null,supersedes_receipt_ref:null,as_of:T};}
function approve(p,context){const prepared=checkDraftV3(p,context);p.draft_input.draft_id=prepared.draft.draft_id;p.actual_review_receipt_ref='actual-'+prepared.review_receipt.subject_hash;context.state.host_media_receipts[p.actual_review_receipt_ref]={receipt_id:p.actual_review_receipt_ref,status:'succeeded',operation:'review_draft',subject_hash:prepared.review_receipt.subject_hash};return checkDraftV3(p,context);}
test('E27 same text can save a new audit without modifying historical draft or receipt',()=>{
 const {state,context}=setup(),p=payload();let result=approve(p,context);saveDraft(state,result.draft);state.draft_review_receipts[result.review_receipt.receipt_id]=result.review_receipt;const oldHash=canonicalHash(state.drafts),oldReceipt=canonicalHash(result.review_receipt);const ref=result.review_receipt.draft_ref;
 p.draft_input.draft_id=ref.draft_id;p.supersedes_receipt_ref=result.review_receipt.receipt_id;p.as_of='2026-10-26T13:00:00Z';result=approve(p,context);saveDraft(state,result.draft);state.draft_review_receipts[result.review_receipt.receipt_id]=result.review_receipt;
 assert.equal(canonicalHash(state.drafts),oldHash);assert.equal(canonicalHash(state.draft_review_receipts[p.supersedes_receipt_ref]),oldReceipt);assert.equal(evaluateDraftReadiness(ref,null,state).readiness,'ready');assert.equal(evaluateDraftReadiness(ref,p.supersedes_receipt_ref,state).readiness,'needs_review');
});
test('E28 pure editing completes, missing personalized context cannot ready',()=>{const {context}=setup();assert.equal(approve(payload(),context).readiness,'ready');const p=payload();p.personalization_mode='evidence_bound';assert.equal(checkDraftV3(p,context).readiness,'needs_review');});
