import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalHash, ContractError, validate } from '../scripts/lib/contracts.mjs';
import { collectionScopeHash, dispatchCollectionV4, normalizeHostBinding, verifyCollectionMaterialV4 } from '../scripts/lib/collection.mjs';

const T='2026-10-27T00:00:00Z', accountRef='x-user:42';
const bytesHash=value=>createHash('sha256').update(value).digest('hex');
const tool=tool_name=>({tool_name,request_template:{},supported_filters:[]});
const host={contract_version:4,binding_id:'host-v4',binding_version:'4',host_name:'fixture-host',data_mode:'fixture',search:tool('search'),read:tool('read'),raw_formats:['text_string'],node_execution:'node',working_directory:'/private',persistence:{provider:'local_filesystem',save_method:'atomic',restore_method:'read',persistent:true},browser:{family:'chrome',browser_ref:'browser-1',session_ref:'session-1',verified_receipt_ref:'browser-proof'},device:{device_ref:'mac-1',kind:'desktop',os:'macOS'},runtime:{runtime_ref:'runtime-1',location:'local'},tool_mappings:{tab_read:'read'},capabilities:[{capability:'tab_read',declared:'available',verified:'verified',last_receipt_ref:'browser-proof'}],file_transfer:{declared:'available',source_runtime_ref:'runtime-1',target_runtime_ref:'runtime-1',method:'same_runtime',last_verified_receipt_ref:'transfer-proof'}};
const baseState=()=>({schema_version:4,revision:7,account:{handle:'target',profile_url:'https://x.com/target',user_id:'42',identity_basis:'user_provided'},import_batches:{},collection_runs:{},collection_scopes:{},collection_receipts_v4:{}});
const prepare=(run_id='collection-1',historical_as_of=null)=>({contract_version:4,operation:'prepare',run_id,target_account_ref:accountRef,requested_period:{start:'2026-09-29',end_exclusive:'2026-10-27'},historical_as_of,budget:{max_posts:100,max_deep_reads:12,max_pages:10,max_seconds:600},host_binding:host,predecessor_run_id:null,as_of:T});
const coverage={completeness:'partial',successful_items:20,failed_items:0,deduplicated_items:2,earliest_item_at:'2026-10-01T00:00:00Z',latest_item_at:'2026-10-26T00:00:00Z',has_more:false,stop_reason:'source_exhausted',required_metric_ids:['account.impressions'],missing_metric_ids:[],limitations:['fixture_only']};
function scope(run_id='collection-1',overrides={}){const value={contract_version:4,scope_id:`scope-${run_id}`,run_id,requested_period:{start:'2026-09-29',end_exclusive:'2026-10-27'},actual_period:{start:'2026-09-29',end_exclusive:'2026-10-27'},source_calendar:'gregorian_source_dates',source_timezone:{status:'unknown',value:null,evidence_ref:null},view:'overview',filter:null,sort:'newest',field_definitions:[{source_field:'Impressions',definition_id:'account.impressions',mapping_status:'verified'}],distribution:'total',aggregation_basis:'event_period',capture_started_at:'2026-10-27T01:00:00Z',capture_completed_at:'2026-10-27T01:05:00Z',measurement_as_of:null,export_generated_at:'2026-10-27T00:55:00Z',coverage,scope_hash:'',...overrides};value.scope_hash=collectionScopeHash(value);return value;}
const locator=(text,start=0)=>({method:'host_transcript',result_ref:'result.json',start,end:start+text.length,exact_text:text});
function identity(session=accountRef,analytics=accountRef){return{browser_ref:'browser-1',session_ref:'session-1',tab_ref:'tab-1',observed_at:'2026-10-27T01:02:00Z',target_profile:{status:'verified',account_ref:accountRef,locator:locator('target')},session_account:{status:session===accountRef?'verified':'mismatch',account_ref:session,locator:locator('session',10)},analytics_account:{status:analytics===accountRef?'verified':'mismatch',account_ref:analytics,locator:locator('analytics',20)}};}
function receipt(run_id='collection-1',overrides={}){return{contract_version:4,receipt_id:`receipt-${run_id}`,run_id,binding_id:host.binding_id,capability:'analytics_visible',status:'succeeded',reason_code:null,scope_ref:`scope-${run_id}`,identity_evidence:identity(),download_transfer:null,tool_name:'read',host_call_ref:'call-1',actual_result_ref:'result.json',actual_result_sha256:'a'.repeat(64),source_ref:`source-${run_id}`,material_kind:'json',material_byte_sha256:'b'.repeat(64),material_byte_size:100,material_mime_type:'application/json',capture_started_at:'2026-10-27T01:00:00Z',capture_completed_at:'2026-10-27T01:05:00Z',data_mode:'fixture',next_action:null,user_action_required:false,...overrides};}
const verified=receipt=>({receipt_id:receipt.receipt_id,actual_result_ref:receipt.actual_result_ref,actual_result_sha256:receipt.actual_result_sha256,material_byte_sha256:receipt.material_byte_sha256,material_byte_size:receipt.material_byte_size,material_mime_type:receipt.material_mime_type,capture_completed_at:receipt.capture_completed_at,locators_verified:true,download_verified:receipt.download_transfer?.status==='completed'});

test('HostBindingV4 normalizes to the legacy core without claiming unverified capabilities',()=>{
 const normalized=normalizeHostBinding(host);assert.equal(normalized.legacy.binding_id,host.binding_id);assert.equal(normalized.browser.family,'chrome');
 const legacy=normalizeHostBinding(normalized.legacy);assert.equal(legacy.browser.family,'unknown');assert.deepEqual(legacy.capabilities,[]);
});

test('Collection V4 strict contracts accept the frozen payload and nested evidence',()=>{
 const p=prepare(),prepared=dispatchCollectionV4(baseState(),p).result.run,s=scope(),r=receipt();
 assert.doesNotThrow(()=>validate('CollectionPreparePayloadV4',p));
 assert.doesNotThrow(()=>validate('CollectionRunV4',prepared));
 assert.doesNotThrow(()=>validate('CollectionScopeV4',s));
 assert.doesNotThrow(()=>validate('CollectionReceiptV4',r));
});

test('actual material verifier reads bytes, detects MIME and checks bounded identity locators',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'xops-collection-'));
 try{
  const content=Buffer.from(JSON.stringify({target:accountRef,session:accountRef,analytics:accountRef})),file=join(dir,'material.json');writeFileSync(file,content);
  let state=dispatchCollectionV4(baseState(),prepare('collection-file')).nextState,s=scope('collection-file'),r=receipt('collection-file',{actual_result_ref:file,actual_result_sha256:bytesHash(content),material_byte_sha256:bytesHash(content),material_byte_size:content.length,material_mime_type:'application/json'});
  let cursor=0;for(const subject of ['target_profile','session_account','analytics_account']){const start=content.toString().indexOf(accountRef,cursor);cursor=start+accountRef.length;r.identity_evidence[subject].locator={method:'host_transcript',result_ref:file,start,end:cursor,exact_text:accountRef};}
  const payload={contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-file',scope:s,receipt:r,as_of:T},verified=await verifyCollectionMaterialV4(payload,state);
  assert.equal(verified.actual_result_sha256,bytesHash(content));assert.equal(verified.material_mime_type,'application/json');assert.equal(verified.locators_verified,true);
  const broken=structuredClone(payload);broken.receipt.identity_evidence.target_profile.locator.end+=1;
  await assert.rejects(verifyCollectionMaterialV4(broken,state),/bounded actual content/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('A-C01/A-C02 prepare freezes target and scope; successful private material needs both identities',()=>{
 let state=baseState(),step=dispatchCollectionV4(state,prepare());state=step.nextState;assert.equal(step.result.run.analysis_cutoff,null);
 const s=scope(),r=receipt();step=dispatchCollectionV4(state,{contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-1',scope:s,receipt:r,as_of:T},{verified_material:verified(r)});state=step.nextState;assert.equal(state.collection_runs['collection-1'].stage,'collecting');
 const wrong=receipt('collection-2',{receipt_id:'wrong',scope_ref:'scope-collection-2',identity_evidence:identity(accountRef,'x-user:other')});let other=dispatchCollectionV4(baseState(),prepare('collection-2')).nextState;
 assert.throws(()=>dispatchCollectionV4(other,{contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-2',scope:scope('collection-2'),receipt:wrong,as_of:T},{verified_material:verified(wrong)}),error=>error instanceof ContractError&&error.code==='ACCOUNT_MISMATCH');
 const changed=scope('collection-1',{view:'content'});assert.throws(()=>dispatchCollectionV4(state,{contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-1',scope:changed,receipt:{...r,receipt_id:'r2',scope_ref:changed.scope_id},as_of:T},{verified_material:{...verified(r),receipt_id:'r2'}}),/Scope hash|Immutable|changed/);
});

test('A-C05/A-C09 honest fixture degradation preserves a mismatch receipt without claiming material',()=>{
 let state=dispatchCollectionV4(baseState(),prepare('collection-limited')).nextState,s=scope('collection-limited');
 const r=receipt('collection-limited',{status:'account_mismatch',reason_code:'ACCOUNT_MISMATCH',identity_evidence:identity(accountRef,'x-user:other'),material_byte_sha256:null,material_byte_size:null,material_mime_type:null,next_action:'切换并重新核对 Analytics 账号',user_action_required:true});
 const step=dispatchCollectionV4(state,{contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-limited',scope:s,receipt:r,as_of:T},{verified_material:verified(r)});
 assert.equal(step.result.receipt.data_mode,'fixture');assert.deepEqual(step.result.run.material_receipt_refs,[]);assert.equal(step.result.run.stop_reason,'ACCOUNT_MISMATCH');assert.deepEqual(step.result.run.pending_actions,['切换并重新核对 Analytics 账号']);
});

function collected(run_id='collection-1',historical_as_of=null,receiptOverrides={}){
 let state=dispatchCollectionV4(baseState(),prepare(run_id,historical_as_of)).nextState;const s=scope(run_id),r=receipt(run_id,receiptOverrides);
 state=dispatchCollectionV4(state,{contract_version:4,operation:'ingest',result_kind:'material',run_id,scope:s,receipt:r,as_of:T},{verified_material:verified(r)}).nextState;
 const batch={import_batch_id:`batch-${run_id}`,account_identity_ref:accountRef,source_ref:r.source_ref,artifact_sha256:r.material_byte_sha256};state.import_batches[batch.import_batch_id]=batch;
 const importReceipt={import_batch_id:batch.import_batch_id,idempotent:false,entity_refs:[],version_refs:[],observation_refs:['obs'],source_series_refs:['series'],row_counts:{}},importPath=`/private/import-${run_id}.json`,verifiedImport={receipt:importReceipt,receipt_hash:canonicalHash(importReceipt),actual_result_ref:importPath};
 const seal={contract_version:4,operation:'ingest',result_kind:'seal',run_id,scope_ref:s.scope_id,material_receipt_refs:[r.receipt_id],import_links:[{material_receipt_ref:r.receipt_id,import_batch_ref:batch.import_batch_id,import_receipt_path:importPath,import_receipt_hash:canonicalHash(importReceipt)}],as_of:'2026-10-27T01:10:00Z'};
 return{state,s,r,batch,importReceipt,verifiedImport,seal};
}

test('A-C03/A-C06 seal binds actual imports, freezes max capture cutoff and is idempotent',()=>{
 const x=collected(),context={verified_import_receipts:{[x.batch.import_batch_id]:x.verifiedImport}};assert.doesNotThrow(()=>validate('CollectionIngestSealPayloadV4',x.seal));let step=dispatchCollectionV4(x.state,x.seal,context),sealed=step.nextState;
 assert.equal(sealed.collection_runs[x.seal.run_id].analysis_cutoff,x.r.capture_completed_at);assert.equal(step.changed,true);
 step=dispatchCollectionV4(sealed,x.seal,context);assert.equal(step.changed,false);assert.strictEqual(step.nextState,sealed);
 const bad=collected('collection-bad');bad.state.import_batches[bad.batch.import_batch_id].artifact_sha256='c'.repeat(64);
 assert.throws(()=>dispatchCollectionV4(bad.state,bad.seal,{verified_import_receipts:{[bad.batch.import_batch_id]:bad.verifiedImport}}),/not bound to the material/);
 const historical=collected('collection-history','2026-10-01T00:00:00Z'),h=dispatchCollectionV4(historical.state,historical.seal,{verified_import_receipts:{[historical.batch.import_batch_id]:historical.verifiedImport}}).nextState;
 assert.equal(h.collection_runs['collection-history'].analysis_cutoff,'2026-10-01T00:00:00Z');
});

test('A-C03 default cutoff is the latest accepted capture, not prepare/import/seal time',()=>{
 const x=collected('collection-multi'),later=receipt('collection-multi',{receipt_id:'receipt-later',actual_result_ref:'later.json',actual_result_sha256:'c'.repeat(64),source_ref:'source-later',material_byte_sha256:'d'.repeat(64),capture_started_at:'2026-10-27T02:00:00Z',capture_completed_at:'2026-10-27T02:05:00Z'});
 let state=dispatchCollectionV4(x.state,{contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-multi',scope:x.s,receipt:later,as_of:T},{verified_material:verified(later)}).nextState;
 const batch={import_batch_id:'batch-later',account_identity_ref:accountRef,source_ref:later.source_ref,artifact_sha256:later.material_byte_sha256},importReceipt={import_batch_id:batch.import_batch_id,idempotent:false,entity_refs:[],version_refs:[],observation_refs:['later'],source_series_refs:['later-series'],row_counts:{}},importPath='/private/import-later.json',verifiedLater={receipt:importReceipt,receipt_hash:canonicalHash(importReceipt),actual_result_ref:importPath};state.import_batches[batch.import_batch_id]=batch;
 const seal={...x.seal,material_receipt_refs:[x.r.receipt_id,later.receipt_id],import_links:[...x.seal.import_links,{material_receipt_ref:later.receipt_id,import_batch_ref:batch.import_batch_id,import_receipt_path:importPath,import_receipt_hash:canonicalHash(importReceipt)}]};
 const sealed=dispatchCollectionV4(state,seal,{verified_import_receipts:{[x.batch.import_batch_id]:x.verifiedImport,[batch.import_batch_id]:verifiedLater}}).nextState;
 assert.equal(sealed.collection_runs['collection-multi'].analysis_cutoff,'2026-10-27T02:05:00Z');
});

test('A-C04 completed exports require non-empty identical transferred bytes and reject HTML',()=>{
 let state=dispatchCollectionV4(baseState(),prepare('collection-export')).nextState,s=scope('collection-export');
 const transfer={status:'completed',download_handle_ref:'download-1',source_runtime_ref:'mac',source_scope_ref:s.scope_id,original_filename:'analytics.csv',original_byte_size:10,original_byte_sha256:'d'.repeat(64),download_completed_at:'2026-10-27T01:03:00Z',transfer_method:'upload',execution_runtime_ref:'cloud',execution_file_ref:'/private/analytics.csv',execution_byte_size:10,execution_byte_sha256:'e'.repeat(64),transferred_at:'2026-10-27T01:04:00Z'};
 const r=receipt('collection-export',{capability:'analytics_export',scope_ref:s.scope_id,download_transfer:transfer,material_mime_type:'text/html'});
 assert.throws(()=>dispatchCollectionV4(state,{contract_version:4,operation:'ingest',result_kind:'material',run_id:'collection-export',scope:s,receipt:r,as_of:T},{verified_material:{...verified(r),download_verified:true}}),/identical non-empty|HTML/);
});

test('A-C07 finalize and resume are read-only and only current verified persistence completes',()=>{
 const x=collected(),sealed=dispatchCollectionV4(x.state,x.seal,{verified_import_receipts:{[x.batch.import_batch_id]:x.verifiedImport}}).nextState,payload={contract_version:4,operation:'finalize',run_id:x.seal.run_id,as_of:T};
 let step=dispatchCollectionV4(sealed,payload,{});assert.equal(step.result.status,'partial');assert.equal(step.changed,false);assert.strictEqual(step.nextState,sealed);
 const persistence={actual_readback_verified:true,state_revision:sealed.revision,state_hash:canonicalHash(sealed),receipt_ref:'persistence-1'};step=dispatchCollectionV4(sealed,payload,{persistence_verified:persistence});assert.equal(step.result.status,'complete');assert.equal(step.result.persistence_receipt_ref,'persistence-1');
 const resume=dispatchCollectionV4(sealed,{...payload,operation:'resume'},{persistence_verified:persistence});assert.equal(resume.result.status,'complete');assert.equal(resume.result.resumed,true);assert.strictEqual(resume.nextState,sealed);
 assert.equal(dispatchCollectionV4(sealed,payload,{persistence_verified:{...persistence,state_hash:'f'.repeat(64)}}).result.status,'partial');
});
