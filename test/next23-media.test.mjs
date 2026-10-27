import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalHash, textHash } from '../scripts/lib/contracts.mjs';
import { createDefaultConfigV5 } from '../scripts/lib/config.mjs';
import { advanceContent, loadContentRecipe } from '../scripts/lib/content.mjs';
import { checkDraftV5 } from '../scripts/lib/draft.mjs';
import { inspectMediaBytes } from '../scripts/lib/media.mjs';
import { mediaSourceHash, validateMediaSourceV5, verifyMediaSourceReceiptV5 } from '../scripts/lib/media-sources.mjs';

const T='2026-10-27T02:00:00Z',account={handle:'fixture_media23',profile_url:'https://x.com/fixture_media23',user_id:null,identity_basis:'user_provided'};
const png=()=>{const bytes=new Uint8Array(24);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const view=new DataView(bytes.buffer);view.setUint32(16,1200);view.setUint32(20,800);return bytes;};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const recipe=loadContentRecipe(JSON.parse(readFileSync(new URL('../assets/content-recipes/comparison.json',import.meta.url))),{recipe_ref:'comparison@1.0.0'});
function source(overrides={}){const base={source_id:'user-image',source_kind:'user_file',locator:'/private/input.png',acquired_at:T,inspected_at:T,quality:'full_original',usage_status:'confirmed',usage_evidence_refs:['user-provided'],attribution:null,event_refs:[],claim_refs:[],edit_relation:'original',...overrides};return{...base,source_hash:mediaSourceHash(base)};}
function state(){const text='真实截图说明。';return{schema_version:5,account,config:createDefaultConfigV5(account),content_briefs:{},recipe_versions:{},media_assets:{},asset_review_receipts:{},content_packs:{},preview_artifacts:{},pack_review_receipts:{},content_runs:{},drafts:{draft1:{latest_revision:1,revisions:{1:{draft_id:'draft1',revision:1,parent_revision:null,card_id:null,original_text:text,original_ref:null,format:'short_post',texts:[text],fact_mapping:[],semantic_review:null,length_checks:[],text_hashes:[textHash(text)],validity:'ready',personal_context_hash:null}}}},sources:{},claims:{},user_facts:{},draft_review_receipts:{},host_media_receipts:{},inspiration_sessions:{}};}
function brief(operation,mediaSource=source(),assetRef=null){const value={contract_version:5,brief_id:'brief-v5',brief_revision:1,parent_revision:null,original_request_ref:'request1',goal:'解释真实截图',audience:'开发者',language:'zh-CN',publishing_format:'short_post',editorial_type:'tutorial',recipe_ref:recipe.recipe_ref,recipe_version:recipe.recipe_version,visual_request:{role:'annotated_screenshot',count:1,style:{tone:'克制',palette:[],density:'sparse',font_notes:'少字',reference_style:null},reference_material_refs:[],slots:[{slot_id:'slot1',draft_text_index:0,position_in_post:0,role:'annotated_screenshot',purpose:'展示真实界面',required_data_refs:[]}]},must_preserve:[],must_avoid:[],required_deliverables:['images','alt'],personalization_mode:'none',used_context_refs:[],context_selection_hash:null,material_refs:[],claim_refs:[],assumptions:[],blockers:[],preference_provenance:{visual_style:'confirmed_preference'},operational_context_hash:null,media_operations:[{slot_id:'slot1',operation,source:mediaSource,existing_asset_ref:assetRef,inspiration_ref:null,intended_use:'真实界面说明',required_attribution:null,limitations:[]}],brief_hash:''};value.brief_hash=canonicalHash({...value,brief_hash:undefined});return value;}

test('A18 thumbnail/temp URL stays a candidate while acquired inspected original verifies exact bytes',()=>{
  assert.throws(()=>validateMediaSourceV5(source({quality:'thumbnail'}),{deliverable:true}),/not a deliverable original/);
  const bytes=png(),s=source(),receipt={contract_version:5,receipt_id:'media-host1',status:'succeeded',operation:'inspect_asset',tool_name:'fixture-view',host_call_ref:'call1',actual_result_ref:'/private/input.png',actual_result_sha256:hash(bytes),captured_at:T,binding_id:'fixture',data_mode:'fixture',input_hash:'a'.repeat(64),source_hash:s.source_hash,viewed:true,result_kind:'media_asset'};
  assert.doesNotThrow(()=>verifyMediaSourceReceiptV5(receipt,{file_bytes:bytes,source:s,input_hash:'a'.repeat(64)}));
  assert.throws(()=>verifyMediaSourceReceiptV5({...receipt,actual_result_sha256:'0'.repeat(64)},{file_bytes:bytes,source:s,input_hash:'a'.repeat(64)}),/bytes differ/);
});

test('A18 user image remains actionable without image generation and inspection costs no generation budget',()=>{
  const current=state();let result=advanceContent(current,{contract_version:5,operation:'prepare',brief:brief('inspect_asset'),recipe,capabilities:{image_view:'verified',image_generate:'unavailable'},budget:0,base_pack_ref:null,as_of:T},'content-v5');
  const item=result.result.run.work_items[0];assert.equal(item.operation,'inspect_asset');assert.equal(item.status,'pending');assert.equal(item.generation_cost,0);assert.equal(result.result.run.budget.reserved,0);
  const bytes=png(),receipt={contract_version:5,receipt_id:'inspect-host',status:'succeeded',operation:'inspect_asset',tool_name:'fixture-view',host_call_ref:'call-inspect',actual_result_ref:'/private/input.png',actual_result_sha256:hash(bytes),captured_at:T,binding_id:'fixture',data_mode:'fixture',input_hash:item.input_hash,source_hash:source().source_hash,viewed:true,result_kind:'media_asset'},asset=inspectMediaBytes(bytes,{asset_id:'asset-inspected',asset_version:1,artifact_ref:'/private/asset-inspected.png',origin_kind:'user_provided',source_refs:['user-image'],tool_receipt_ref:receipt.receipt_id,created_at:T,persistence_receipt_ref:'persist-inspected'});
  result=advanceContent(current,{contract_version:5,operation:'ingest',run_id:'content-v5',work_item_id:item.work_item_id,result_kind:'media_asset',asset_path:asset.artifact_ref,origin_kind:asset.origin_kind,source_refs:asset.source_refs,tool_receipt_ref:receipt.receipt_id,created_at:T,persistence_receipt_ref:asset.persistence_receipt_ref,visible_text_observation:[],data_spec_ref:null,as_of:T},'content-v5',{actual_tool_receipt:receipt,ingested_asset:asset,asset_persisted:true});assert.equal(result.result.run.work_items[0].status,'succeeded');assert.equal(result.result.run.budget.used,0);
  const slot={slot_id:'slot1',draft_text_index:0,text_anchor_hash:textHash('真实截图说明。'),position_in_post:0,asset_ref:{asset_id:'asset-inspected',asset_version:1},alt:'真实界面截图',visible_text_and_region_mapping:[],claim_and_user_fact_bindings:[],data_spec_hash:null,used_evidence_versions:[]};
  result=advanceContent(current,{contract_version:5,operation:'compose',run_id:'content-v5',draft_ref:{draft_id:'draft1',revision:1},draft_text_hashes:[textHash('真实截图说明。')],draft_evidence_mapping_hash:canonicalHash([]),personal_context_selection_hash:null,media_slots:[slot],as_of:T},'content-v5',{evaluate_draft:()=>({readiness:'ready',evidence_mapping_hash:canonicalHash([]),personal_context_selection_hash:null,text_hashes:[textHash('真实截图说明。')],unmet_requirements:[]})});assert.equal(result.result.pack.media_slots[0].asset_ref.asset_id,'asset-inspected');
});

test('reusing an existing persisted asset is immediately available and does not consume generation budget',()=>{
  const current=state(),asset=inspectMediaBytes(png(),{asset_id:'asset1',asset_version:1,artifact_ref:'/private/asset1.png',origin_kind:'user_provided',source_refs:['user-image'],tool_receipt_ref:'old-receipt',created_at:T,persistence_receipt_ref:'persist1'});current.media_assets.asset1={versions:{1:asset},latest_version:1};
  const result=advanceContent(current,{contract_version:5,operation:'prepare',brief:brief('reuse_asset',source(),{asset_id:'asset1',asset_version:1}),recipe,capabilities:{image_generate:'unavailable'},budget:0,base_pack_ref:null,as_of:T},'reuse-v5');
  const item=result.result.run.work_items[0];assert.equal(item.status,'succeeded');assert.deepEqual(item.result_refs,['asset1:1']);assert.equal(result.result.run.budget.reserved,0);
});

test('content V5 actually consumes the explicit short-text image preference',()=>{
  const current=state(),b=brief('inspect_asset');b.personalization_mode='evidence_bound';b.used_context_refs=['preference'];b.context_selection_hash='c'.repeat(64);b.operational_context_hash='d'.repeat(64);b.visual_request.style.density='dense';b.brief_hash=canonicalHash({...b,brief_hash:undefined});
  const payload={contract_version:5,operation:'prepare',brief:b,recipe,capabilities:{image_view:'verified'},budget:0,base_pack_ref:null,as_of:T},context={operational_context:{selected_context_hash:'d'.repeat(64),explicit_preferences:{short_text_on_images:true},temporary_overrides:{}}};
  assert.throws(()=>advanceContent(current,payload,'preference-v5',context),/less text on images/);
});

test('A20-A21 good original can remain unchanged and unsupported long formats stay explicit',()=>{
  const current=state(),text='原稿已经清楚。',prescriptionBase={mode:'keep',changes:[],keep_reason:'原稿已经清楚且事实完整',scope_constraint:'只给建议'},prescription={...prescriptionBase,prescription_hash:canonicalHash(prescriptionBase)},rationaleBase={recommended_format:'short_post',information_density:'low',reader_task:'快速理解结论',available_asset_refs:[],available_minutes:null,account_capability:'short_post/thread/reply',personal_evidence_refs:[],unsupported_formats:['native_article','platform_long_post']},rationale={...rationaleBase,rationale_hash:canonicalHash(rationaleBase)};
  const result=checkDraftV5({contract_version:5,subject_ref:'account',draft_input:{draft_id:null,revision:1,parent_revision:null,card_id:null,original_text:text,original_ref:null,format:'short_post',texts:[text],fact_mapping:[],semantic_review:null},edit_request:{requested_mode:'suggest_only',scope_constraint:'只给建议',prescription,format_rationale:rationale},personalization_mode:'none',delivery_intent:'plain_edit',actual_review_receipt_ref:null,as_of:T},{state:current,effective_config:{config:current.config}});
  assert.equal(result.edit_prescription.mode,'keep');assert.deepEqual(result.format_rationale.unsupported_formats,['native_article','platform_long_post']);assert.equal(result.draft.texts[0],text);
});
