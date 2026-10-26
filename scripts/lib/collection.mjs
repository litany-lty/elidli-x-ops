import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, isAbsolute } from 'node:path';
import { canonicalHash, textHash, validate, ContractError } from './contracts.mjs';

export async function verifyCollectionReceipt(receipt,account) {
  validate('CollectionReceiptV2',receipt);
  const raw=await readFile(receipt.actual_result_ref,'utf8');
  if(textHash(raw)!==receipt.actual_result_sha256)throw new ContractError('RECEIPT_CONFLICT','/actual_result_sha256','Actual host result changed');
  if(receipt.status!=='succeeded')return receipt;
  const identity=account.user_id?`x-user:${account.user_id}`:`x-handle:${account.handle.toLowerCase()}`;
  if(receipt.account_identity_ref!==identity)throw new ContractError('ACCOUNT_MISMATCH','/account_identity_ref','Collection receipt identifies another account');
  const locator=receipt.identity_locator;
  if(raw.slice(locator.start,locator.end)!==locator.exact_text || !locator.exact_text.includes(account.user_id??account.handle))throw new ContractError('INVALID_EVIDENCE_REF','/identity_locator','Identity must be located in the actual host result');
  const material=receipt.material_locator;
  if(raw.slice(material.start,material.end)!==material.exact_text)throw new ContractError('INVALID_EVIDENCE_REF','/material_locator','Material must be located in the actual host result');
  return {...receipt,result_hash:canonicalHash(JSON.parse(raw))};
}

export const COLLECTION_V4_COLLECTIONS = Object.freeze(['collection_runs','collection_scopes','collection_receipts_v4']);

const fail = (code,path,message) => { throw new ContractError(code,path,message,false); };
const unique = values => [...new Set(values)].sort();
const byteHash = bytes => createHash('sha256').update(bytes).digest('hex');

function targetAccountRef(account) {
  return account.user_id ? `x-user:${account.user_id}` : `x-handle:${account.handle.toLowerCase()}`;
}

function putImmutable(collection,id,value,path) {
  if(collection[id] && canonicalHash(collection[id])!==canonicalHash(value))fail('RECEIPT_CONFLICT',path,`Immutable identity conflict: ${id}`);
  if(collection[id])return false;
  collection[id]=structuredClone(value);
  return true;
}

function withCollections(state) {
  const next=structuredClone(state);
  for(const key of COLLECTION_V4_COLLECTIONS)next[key]??={};
  return next;
}

function detectedMime(path,bytes) {
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';
  const prefix=bytes.subarray(0,512).toString('utf8').trimStart().toLowerCase(),extension=extname(path).toLowerCase();
  if(prefix.startsWith('<!doctype html')||prefix.startsWith('<html'))return'text/html';
  if(extension==='.csv')return'text/csv';
  if(extension==='.json'){try{JSON.parse(bytes.toString('utf8'));return'application/json';}catch{return'application/octet-stream';}}
  return'text/plain';
}

async function verifyIdentityLocators(identity,actualResultRef) {
  const locators=['target_profile','session_account','analytics_account'].map(key=>identity[key].locator).filter(Boolean),cache=new Map();
  for(const locator of locators){
    if(!isAbsolute(locator.result_ref))fail('INVALID_EVIDENCE_REF','/identity_evidence/locator/result_ref','Identity evidence must use an actual absolute result path');
    if(!cache.has(locator.result_ref))cache.set(locator.result_ref,(await readFile(locator.result_ref)).toString('utf8'));
    const material=cache.get(locator.result_ref);
    if(locator.start<0||locator.end<=locator.start||locator.end>material.length||material.slice(locator.start,locator.end)!==locator.exact_text)fail('INVALID_EVIDENCE_REF','/identity_evidence/locator','Identity locator does not match bounded actual content');
  }
  if(!locators.length)fail('INVALID_EVIDENCE_REF','/identity_evidence','At least the target identity needs an actual locator');
  return locators.every(locator=>locator.result_ref===actualResultRef)||locators.every(locator=>cache.has(locator.result_ref));
}

export async function verifyCollectionMaterialV4(payload,state) {
  if(payload?.contract_version!==4||payload.operation!=='ingest'||payload.result_kind!=='material')fail('INVALID_INPUT','/payload','Expected CollectionIngestMaterialPayloadV4');
  const {receipt}=payload,run=state.collection_runs?.[payload.run_id];
  if(!run)fail('INVALID_EVIDENCE_REF','/run_id','Collection run is missing');
  if(!isAbsolute(receipt.actual_result_ref))fail('INVALID_EVIDENCE_REF','/receipt/actual_result_ref','Actual collection result must be a recoverable absolute file');
  let bytes;try{bytes=await readFile(receipt.actual_result_ref);}catch{fail('INVALID_EVIDENCE_REF','/receipt/actual_result_ref','Actual collection result cannot be read');}
  const actualHash=byteHash(bytes),mime=detectedMime(receipt.actual_result_ref,bytes);
  if(actualHash!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/receipt/actual_result_sha256','Actual collection result bytes changed');
  if(receipt.status==='succeeded'&&(actualHash!==receipt.material_byte_sha256||bytes.length!==receipt.material_byte_size||mime!==receipt.material_mime_type))fail('RECEIPT_CONFLICT','/receipt/material_byte_sha256','Material byte hash, size or MIME differs from the actual file');
  const locatorsVerified=await verifyIdentityLocators(receipt.identity_evidence,receipt.actual_result_ref);
  let downloadVerified=false;
  if(receipt.download_transfer?.status==='completed'){
    const ref=receipt.download_transfer.execution_file_ref;
    if(!ref||!isAbsolute(ref))fail('TRANSFER_REQUIRED','/receipt/download_transfer/execution_file_ref','Completed transfer needs a readable execution-side file');
    let transferred;try{transferred=await readFile(ref);}catch{fail('TRANSFER_REQUIRED','/receipt/download_transfer/execution_file_ref','Execution-side transferred file cannot be read');}
    if(byteHash(transferred)!==receipt.download_transfer.execution_byte_sha256||transferred.length!==receipt.download_transfer.execution_byte_size)fail('RECEIPT_CONFLICT','/receipt/download_transfer','Execution-side file differs from transfer receipt');
    downloadVerified=true;
  }
  return{receipt_id:receipt.receipt_id,actual_result_ref:receipt.actual_result_ref,actual_result_sha256:actualHash,material_byte_sha256:receipt.material_byte_sha256,material_byte_size:receipt.material_byte_size,material_mime_type:receipt.material_mime_type,capture_completed_at:receipt.capture_completed_at,locators_verified:locatorsVerified,download_verified:downloadVerified};
}

export function normalizeHostBinding(binding) {
  if(binding?.contract_version===4){
    const legacy={binding_id:binding.binding_id,binding_version:binding.binding_version,host_name:binding.host_name,data_mode:binding.data_mode,search:structuredClone(binding.search),read:structuredClone(binding.read),raw_formats:[...binding.raw_formats],node_execution:binding.node_execution,working_directory:binding.working_directory,persistence:structuredClone(binding.persistence)};
    if(binding.account_collection)legacy.account_collection=structuredClone(binding.account_collection);
    if(binding.media_capabilities)legacy.media_capabilities=structuredClone(binding.media_capabilities);
    return{legacy,browser:structuredClone(binding.browser),device:structuredClone(binding.device),runtime:structuredClone(binding.runtime),tool_mappings:structuredClone(binding.tool_mappings),capabilities:structuredClone(binding.capabilities),file_transfer:structuredClone(binding.file_transfer)};
  }
  return{legacy:structuredClone(binding),browser:{family:'unknown',session_ref:null,verified_receipt_ref:null},device:{device_ref:'unknown',kind:'unknown'},runtime:{runtime_ref:'legacy',location:'unknown'},tool_mappings:{},capabilities:[],file_transfer:{declared:'unverified',source_runtime_ref:null,target_runtime_ref:null,method:null,last_verified_receipt_ref:null}};
}

export function collectionScopeHash(scope) {
  const copy=structuredClone(scope);delete copy.scope_id;delete copy.scope_hash;
  return canonicalHash(copy);
}

function prepareCollection(state,payload) {
  const next=withCollections(state), requestHash=canonicalHash({target_account_ref:payload.target_account_ref,requested_period:payload.requested_period,historical_as_of:payload.historical_as_of,budget:payload.budget,host_binding:payload.host_binding,predecessor_run_id:payload.predecessor_run_id});
  const existing=next.collection_runs[payload.run_id];
  if(existing){
    if(existing.request_hash!==requestHash)fail('STATE_CONFLICT','/run_id','Collection run ID already identifies another frozen request');
    return{nextState:state,result:{run:structuredClone(existing),idempotent:true},changed:false};
  }
  if(payload.target_account_ref!==targetAccountRef(state.account))fail('ACCOUNT_MISMATCH','/target_account_ref','Collection target differs from state account');
  if(payload.predecessor_run_id && !next.collection_runs[payload.predecessor_run_id])fail('INVALID_EVIDENCE_REF','/predecessor_run_id','Predecessor collection run is missing');
  const run={contract_version:4,run_id:payload.run_id,target_account_ref:payload.target_account_ref,requested_period:structuredClone(payload.requested_period),historical_as_of:payload.historical_as_of,budget:structuredClone(payload.budget),host_binding:structuredClone(payload.host_binding),request_hash:requestHash,stage:'prepared',active_scope_ref:null,scope_refs:[],receipt_refs:[],material_receipt_refs:[],import_batch_refs:[],analysis_cutoff:payload.historical_as_of,coverage:null,seal_hash:null,stop_reason:null,pending_actions:['verify_identity_and_scope'],predecessor_run_id:payload.predecessor_run_id,resume_version:1,prepared_at:payload.as_of};
  next.collection_runs[run.run_id]=run;
  return{nextState:next,result:{run:structuredClone(run),idempotent:false},changed:true};
}

function requireVerifiedMaterial(receipt,verified) {
  if(!verified || verified.receipt_id!==receipt.receipt_id || verified.locators_verified!==true)fail('INVALID_EVIDENCE_REF','/context/verified_material','Actual material and identity locators must be verified outside the payload');
  for(const key of ['actual_result_ref','actual_result_sha256','capture_completed_at'])if(verified[key]!==receipt[key])fail('RECEIPT_CONFLICT',`/receipt/${key}`,`Verified material differs at ${key}`);
  for(const key of ['material_byte_sha256','material_byte_size','material_mime_type'])if((verified[key]??null)!==(receipt[key]??null))fail('RECEIPT_CONFLICT',`/receipt/${key}`,`Verified material differs at ${key}`);
}

function identityMatches(run,receipt) {
  const identity=receipt.identity_evidence;
  if(identity.target_profile.account_ref!==run.target_account_ref)fail('ACCOUNT_MISMATCH','/receipt/identity_evidence/target_profile','Target profile identity differs from the run');
  const privateCapability=['analytics_visible','analytics_export','label_report'].includes(receipt.capability);
  if(receipt.status==='account_mismatch'){
    if(identity.session_account.status!=='mismatch'&&identity.analytics_account.status!=='mismatch')fail('ACCOUNT_MISMATCH','/receipt/identity_evidence','Account mismatch status requires actual mismatching identity evidence');
    return;
  }
  if(privateCapability && ['succeeded','partial'].includes(receipt.status) && (identity.session_account.account_ref!==run.target_account_ref || identity.analytics_account.account_ref!==run.target_account_ref))fail('ACCOUNT_MISMATCH','/receipt/identity_evidence','Private analytics requires separately verified session and Analytics owner identities');
}

function verifyDownload(receipt,verified) {
  const transfer=receipt.download_transfer;
  if(receipt.capability!=='analytics_export'){
    if(transfer!==null)fail('INVALID_INPUT','/receipt/download_transfer','Non-download material must use null download_transfer');
    return;
  }
  if(!transfer)fail('REQUESTED_OUTPUT_INCOMPLETE','/receipt/download_transfer','Export material requires download status');
  if(transfer.status!=='completed')return;
  if(transfer.original_byte_size<1 || transfer.execution_byte_size<1 || transfer.original_byte_sha256!==transfer.execution_byte_sha256)fail('RECEIPT_CONFLICT','/receipt/download_transfer','Completed transfer requires identical non-empty source and execution bytes');
  if(receipt.material_mime_type==='text/html')fail('UNSUPPORTED_RESPONSE','/receipt/material_mime_type','HTML response cannot be accepted as an export file');
  if(verified.download_verified!==true)fail('INVALID_EVIDENCE_REF','/context/verified_material/download_verified','Completed download and transfer require external byte verification');
}

function ingestMaterial(state,payload,context) {
  const next=withCollections(state),run=next.collection_runs[payload.run_id];
  if(!run)fail('INVALID_EVIDENCE_REF','/run_id','Collection run is missing');
  if(run.stage==='sealed')fail('STATE_CONFLICT','/run_id','Sealed runs are immutable; create a successor run for new material');
  const {scope,receipt}=payload;
  if(receipt.run_id!==run.run_id || receipt.scope_ref!==scope.scope_id)fail('INVALID_EVIDENCE_REF','/receipt','Material receipt must bind this run and scope');
  if(receipt.binding_id!==run.host_binding.binding_id || receipt.data_mode!==run.host_binding.data_mode)fail('INVALID_EVIDENCE_REF','/receipt/binding_id','Receipt must come from the frozen host binding and data mode');
  if(scope.run_id!==run.run_id || canonicalHash(scope.requested_period)!==canonicalHash(run.requested_period))fail('SCOPE_UNVERIFIED','/scope','Scope does not preserve the frozen request');
  if(collectionScopeHash(scope)!==scope.scope_hash)fail('SCOPE_UNVERIFIED','/scope/scope_hash','Scope hash does not match its frozen fields');
  if(scope.source_timezone.status==='unknown'&&(scope.source_timezone.value!==null||scope.source_timezone.evidence_ref!==null))fail('SCOPE_UNVERIFIED','/scope/source_timezone','Unknown source timezone must remain unknown');
  if(scope.coverage.completeness==='complete'&&(scope.coverage.has_more===true||scope.coverage.missing_metric_ids.length))fail('COVERAGE_PARTIAL','/scope/coverage','Complete coverage cannot retain more pages or missing required metrics');
  if(receipt.capability==='public_posts'&&scope.coverage.successful_items>run.budget.max_posts)fail('BUDGET_EXHAUSTED','/scope/coverage/successful_items','Collected posts exceed the frozen run budget');
  if(run.active_scope_ref && run.active_scope_ref!==scope.scope_id)fail('SCOPE_UNVERIFIED','/scope_ref','Identity/date/view/filter/sort changed; create a new collection run');
  requireVerifiedMaterial(receipt,context.verified_material);
  identityMatches(run,receipt);
  verifyDownload(receipt,context.verified_material);
  if(receipt.status==='succeeded'){
    if(receipt.reason_code!==null||!receipt.material_byte_sha256||!receipt.material_byte_size||!receipt.material_mime_type)fail('REQUESTED_OUTPUT_INCOMPLETE','/receipt','Successful material requires non-empty verified bytes and no failure reason');
  }else if(!receipt.reason_code||!receipt.next_action)fail('REQUESTED_OUTPUT_INCOMPLETE','/receipt','Limited or failed collection requires an exact reason and one next action');
  const scopeAdded=putImmutable(next.collection_scopes,scope.scope_id,scope,'/scope');
  const receiptAdded=putImmutable(next.collection_receipts_v4,receipt.receipt_id,receipt,'/receipt');
  if(!scopeAdded&&!receiptAdded)return{nextState:state,result:{run:structuredClone(run),receipt:structuredClone(receipt),idempotent:true},changed:false};
  run.active_scope_ref=scope.scope_id;
  run.scope_refs=unique([...run.scope_refs,scope.scope_id]);
  run.receipt_refs=unique([...run.receipt_refs,receipt.receipt_id]);
  if(receipt.status==='succeeded')run.material_receipt_refs=unique([...run.material_receipt_refs,receipt.receipt_id]);
  run.stage='collecting';
  run.stop_reason=receipt.status==='succeeded'?run.stop_reason:receipt.reason_code;
  run.pending_actions=receipt.status==='succeeded'?['import_material_then_seal']:[receipt.next_action];
  run.resume_version+=1;
  return{nextState:next,result:{run:structuredClone(run),receipt:structuredClone(receipt),idempotent:false},changed:true};
}

function verifyImportLink(state,run,link,verifiedReceipts) {
  const material=state.collection_receipts_v4[link.material_receipt_ref],batch=state.import_batches?.[link.import_batch_ref],verified=verifiedReceipts?.[link.import_batch_ref];
  if(!material || material.run_id!==run.run_id || material.status!=='succeeded')fail('INVALID_EVIDENCE_REF','/seal/import_links','Import link has no successful material receipt');
  if(!batch || batch.import_batch_id!==link.import_batch_ref)fail('INVALID_EVIDENCE_REF','/seal/import_links','Import batch is missing');
  if(batch.account_identity_ref!==run.target_account_ref)fail('ACCOUNT_MISMATCH','/seal/import_links','Import batch belongs to another account');
  if(batch.source_ref!==material.source_ref || batch.artifact_sha256!==material.material_byte_sha256)fail('RECEIPT_CONFLICT','/seal/import_links','Import batch is not bound to the material source and bytes');
  if(!verified || verified.actual_result_ref!==link.import_receipt_path || verified.receipt_hash!==link.import_receipt_hash || verified.receipt?.import_batch_id!==batch.import_batch_id || canonicalHash(verified.receipt)!==link.import_receipt_hash)fail('INVALID_EVIDENCE_REF','/context/verified_import_receipts','Actual ImportReceipt sidecar does not match the seal link');
}

function ingestSeal(state,payload,context) {
  const next=withCollections(state),run=next.collection_runs[payload.run_id];
  if(!run)fail('INVALID_EVIDENCE_REF','/run_id','Collection run is missing');
  if(payload.scope_ref!==run.active_scope_ref)fail('SCOPE_UNVERIFIED','/scope_ref','Seal must use the active immutable scope');
  const scope=next.collection_scopes[payload.scope_ref];
  if(!scope)fail('INVALID_EVIDENCE_REF','/scope_ref','Seal scope is missing');
  for(const link of payload.import_links)verifyImportLink(next,run,link,context.verified_import_receipts);
  const linkedMaterials=unique(payload.import_links.map(item=>item.material_receipt_ref));
  if(linkedMaterials.length!==payload.import_links.length || unique(payload.import_links.map(item=>item.import_batch_ref)).length!==payload.import_links.length)fail('INVALID_INPUT','/seal/import_links','Seal import links must be one-to-one');
  if(canonicalHash(linkedMaterials)!==canonicalHash(unique(payload.material_receipt_refs)))fail('INVALID_EVIDENCE_REF','/material_receipt_refs','Every sealed material must have one actual import link');
  const cutoff=run.historical_as_of??linkedMaterials.map(ref=>next.collection_receipts_v4[ref].capture_completed_at).reduce((latest,current)=>!latest||Date.parse(current)>Date.parse(latest)?current:latest,null);
  if(!cutoff)fail('REQUESTED_OUTPUT_INCOMPLETE','/analysis_cutoff','No accepted capture can establish the default cutoff');
  const sealHash=canonicalHash({run_id:run.run_id,scope_ref:scope.scope_id,material_receipt_refs:linkedMaterials,import_links:payload.import_links,analysis_cutoff:cutoff,coverage:scope.coverage});
  if(run.seal_hash){
    if(run.seal_hash!==sealHash)fail('STATE_CONFLICT','/seal','Sealed run cannot be changed; create a successor run');
    return{nextState:state,result:{run:structuredClone(run),idempotent:true},changed:false};
  }
  run.stage='sealed';run.seal_hash=sealHash;run.analysis_cutoff=cutoff;run.coverage=structuredClone(scope.coverage);run.material_receipt_refs=linkedMaterials;run.import_batch_refs=unique(payload.import_links.map(item=>item.import_batch_ref));run.stop_reason=scope.coverage.stop_reason;run.pending_actions=['actual_readback_record_persistence_then_finalize'];run.resume_version+=1;
  return{nextState:next,result:{run:structuredClone(run),idempotent:false},changed:true};
}

function persistenceCurrent(state,verified) {
  return Boolean(verified?.actual_readback_verified===true && verified.state_revision===state.revision && verified.state_hash===canonicalHash(state) && verified.receipt_ref);
}

function deriveReadOnly(state,payload,context,resume=false) {
  const run=state.collection_runs?.[payload.run_id];
  if(!run)fail('INVALID_EVIDENCE_REF','/run_id','Collection run is missing');
  const sealed=run.stage==='sealed' && Boolean(run.seal_hash);
  for(const ref of run.import_batch_refs)if(!state.import_batches?.[ref])fail('INVALID_EVIDENCE_REF','/import_batch_refs','A sealed import batch is no longer available');
  const persisted=sealed&&persistenceCurrent(state,context.persistence_verified);
  const status=persisted?'complete':'partial';
  const reason=persisted?null:sealed?'PERSIST_FAILED':'COVERAGE_PARTIAL';
  const nextAction=persisted?null:sealed?'实际回读 → record/persistence_receipt → collection-step/finalize':'继续缺失材料/导入并显式seal';
  return{nextState:state,changed:false,result:{run_id:run.run_id,status,stage:run.stage,analysis_cutoff:run.analysis_cutoff,scope_refs:[...run.scope_refs],receipt_refs:[...run.receipt_refs],material_receipt_refs:[...run.material_receipt_refs],import_batch_refs:[...run.import_batch_refs],coverage:structuredClone(run.coverage),stop_reason:run.stop_reason,reason_code:reason,next_actions:nextAction?[nextAction]:[],user_action_required:false,resume_version:run.resume_version,resumed:resume,persistence_receipt_ref:persisted?context.persistence_verified.receipt_ref:null}};
}

export function dispatchCollectionV4(state,payload,context={}) {
  if(payload?.contract_version!==4)fail('SCHEMA_VERSION','/contract_version','Collection V4 requires contract_version 4');
  if(payload.operation==='prepare')return prepareCollection(state,payload);
  if(payload.operation==='ingest'&&payload.result_kind==='material')return ingestMaterial(state,payload,context);
  if(payload.operation==='ingest'&&payload.result_kind==='seal')return ingestSeal(state,payload,context);
  if(payload.operation==='finalize')return deriveReadOnly(state,payload,context,false);
  if(payload.operation==='resume')return deriveReadOnly(state,payload,context,true);
  fail('INVALID_INPUT','/operation','Unsupported collection V4 operation');
}
