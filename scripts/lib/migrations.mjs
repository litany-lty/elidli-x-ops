import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { canonicalHash, textHash, validate, ContractError } from './contracts.mjs';
import { validateState, commitState, v2Collections, v3Collections, v4Collections } from './state.mjs';
import { legacyImportFromState, mergeImport } from './imports.mjs';

import { buildExperimentPlanView } from './review.mjs';
import { seedKnowledgeState } from './knowledge-state.mjs';

const byteHash=value=>createHash('sha256').update(value).digest('hex');
const fail = (code,path,message) => { throw new ContractError(code,path,message); };

export function planMigration(v1State) {
  validateState(v1State);
  if (v1State.schema_version !== 1) fail('SCHEMA_VERSION','/schema_version','Migration preview requires a V1 state');
  const counts = Object.fromEntries(['posts','snapshots','sources','drafts','adoptions','publications','rule_versions','runs'].map(k=>[k,Object.keys(v1State[k]).length]));
  const cards = new Map();
  for (const run of Object.values(v1State.runs)) for (const card of run.cards ?? []) {
    if (cards.has(card.card_id) && canonicalHash(cards.get(card.card_id)) !== canonicalHash(card)) fail('OBSERVATION_CONFLICT','/cards','A legacy card ID identifies conflicting cards');
    cards.set(card.card_id,card);
  }
  counts.news_cards = cards.size;
  const preview = {contract_version:2,preview_id:`migration:${canonicalHash(v1State)}`,source_hash:canonicalHash(v1State),source_revision:v1State.revision,target_version:2,counts,
    limitations:['旧报告保持 V1 合同；未知系列、定义、期间保持 legacy_unresolved，不据此宣称跨来源可比。'],preview_hash:''};
  preview.preview_hash = canonicalHash({...preview,preview_hash:undefined});
  return validate('MigrationPreviewV2',preview);
}

export function applyMigration(v1State, frozenPreview) {
  const preview = planMigration(v1State);
  if (canonicalHash(preview) !== canonicalHash(frozenPreview)) fail('STATE_CONFLICT','/preview_hash','Migration preview no longer identifies this state');
  let state = {...structuredClone(v1State),schema_version:2,...Object.fromEntries(v2Collections.map(k=>[k,{}]))};
  const normalized = legacyImportFromState(v1State);
  if (normalized) {
    state.import_artifacts[normalized.import_batch.artifact_sha256]={artifact_sha256:normalized.import_batch.artifact_sha256,path:`migration:${preview.preview_id}`,source_ref:normalized.import_batch.source_ref,material_kind:'canonical_json'};
    state = mergeImport(state,normalized).nextState;
  }
  // Retain all V1 objects and exact IDs; V2 views are additional interpretations.
  for (const key of ['runs','sources','raw_receipts','claims','drafts','adoptions','publications','posts','snapshots','reviews','rule_versions']) {
    if (canonicalHash(state[key]) !== canonicalHash(v1State[key])) fail('STATE_CONFLICT',`/${key}`,'Migration changed legacy evidence');
  }
  state.migration_receipts[preview.preview_id] = {migration_id:preview.preview_id,preview_hash:preview.preview_hash,source_hash:preview.source_hash,source_revision:preview.source_revision,target_revision:preview.source_revision+1};
  validateState(state);
  return state;
}

export async function migrateState(dir,payload,expectedRevision) {
  fail('MIGRATION_REQUIRED','/contract_version','State migration now requires the contract 4 preview/apply entry');
  /* c8 ignore next */
  const raw = await readFile(join(dir,'account-state.json'),'utf8');
  const state = JSON.parse(raw);
  if (state.schema_version === 2 && payload.operation === 'apply') {
    const receipt = Object.values(state.migration_receipts).find(r=>r.preview_hash===payload.preview.preview_hash);
    if (receipt) return {state,data:{migration_receipt:receipt,idempotent:true}};
    fail('STATE_CONFLICT','/preview_hash','This V2 state was not created by the requested migration');
  }
  const preview = planMigration(state);
  if (payload.operation === 'preview') return {state,data:{migration_preview:preview}};
  if (canonicalHash(preview)!==canonicalHash(payload.preview)) fail('STATE_CONFLICT','/preview','Frozen migration preview differs');
  const backupDir = resolve(payload.backup_directory);
  // Backups belong to the account's private directory, never a public worktree.
  const rel = relative(resolve(dir),backupDir);
  if (rel.startsWith('..') || rel === '') fail('INVALID_INPUT','/backup_directory','Use a backup subdirectory inside the private account state directory');
  await mkdir(backupDir,{recursive:true,mode:0o700});
  const backupPath = join(backupDir,`v1-${byteHash(raw)}.json`);
  try { await writeFile(backupPath,raw,{flag:'wx',mode:0o600}); }
  catch (error) { if(error.code!=='EEXIST')throw error; if(byteHash(await readFile(backupPath,'utf8'))!==byteHash(raw))fail('RECEIPT_CONFLICT','/backup','Existing backup differs'); }
  const next = await commitState(dir,expectedRevision,current=>{
    const migrated=applyMigration(current,payload.preview);
    for(const artifact of Object.values(migrated.import_artifacts))if(artifact.path===`migration:${preview.preview_id}`) {artifact.path=backupPath;artifact.artifact_sha256=byteHash(raw);}
    return migrated;
  },{migration:true});
  return {state:next,data:{migration_receipt:{...next.migration_receipts[preview.preview_id],backup_path:backupPath,backup_sha256:byteHash(raw)},idempotent:false,persistence_status:'unverified'}};
}

export function planMigrationV3(state) {
  validateState(state);
  if(![1,2].includes(state.schema_version))fail('SCHEMA_VERSION','/schema_version','State 3 needs no conversion');
  const preview={contract_version:3,preview_id:`migration3:${canonicalHash(state)}`,source_hash:canonicalHash(state),source_revision:state.revision,source_version:state.schema_version,target_version:3,rule_version:'state3@1',counts:Object.fromEntries(Object.entries(state).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v)).map(([k,v])=>[k,Object.keys(v).length])),limitations:['历史 ID 和对象保持不变；旧批准不自动取得 state 3 就绪状态。'],preview_hash:''};
  preview.preview_hash=canonicalHash({...preview,preview_hash:undefined});return validate('MigrationPreviewV3',preview);
}

export function applyMigrationV3(state,preview) {
  if(canonicalHash(planMigrationV3(state))!==canonicalHash(preview))fail('STATE_CONFLICT','/preview','Migration source changed');
  const original=structuredClone(state);
  let next=state.schema_version===1?applyMigration(state,planMigration(state)):structuredClone(state);
  next.schema_version=3;
  for(const key of v3Collections)next[key]??={};
  for(const [key,value] of Object.entries(original))if(value&&typeof value==='object'&&key!=='migration_receipts'&&canonicalHash(value)!==canonicalHash(next[key]))fail('STATE_CONFLICT',`/${key}`,'Legacy objects must not change during migration');
  for(const experiment of Object.values(next.experiments??{})) {
    const view=buildExperimentPlanView(next,experiment);
    next.experiment_plan_views[view.plan_view_id]=view;
  }
  next.migration_receipts[preview.preview_id]={migration_id:preview.preview_id,preview_hash:preview.preview_hash,source_hash:preview.source_hash,source_revision:preview.source_revision,target_revision:preview.source_revision+1,target_version:3};
  return validateState(next);
}

export async function migrateStateV3(dir,payload,expectedRevision,{verifyReadback=null}={}) {
  fail('MIGRATION_REQUIRED','/contract_version','State migration now requires the contract 4 preview/apply entry');
  /* c8 ignore next */
  const file=join(dir,'account-state.json'),raw=await readFile(file,'utf8'),state=JSON.parse(raw);
  if(state.schema_version===3){
    const receipt=Object.values(state.migration_receipts).find(r=>r.target_version===3&&(!payload.preview||r.preview_hash===payload.preview.preview_hash));
    if(!receipt)fail('STATE_CONFLICT','/preview','No matching state 3 migration receipt');
    const loaded=validateState(JSON.parse(await readFile(file,'utf8')));
    let verified=true;try{if(!receipt.backup_path||byteHash(await readFile(receipt.backup_path))!==receipt.backup_sha256||canonicalHash(JSON.parse(await readFile(receipt.inventory_path,'utf8')))!==receipt.inventory_hash)verified=false;}catch{verified=false;}
    return {state:loaded,data:{migration_status:verified?'verified':'committed_unverified',migration_receipt:receipt,idempotent:true,persistence_status:verified?'saved':'unverified'}};
  }
  const preview=planMigrationV3(state);
  if(payload.operation==='preview')return{state,data:{migration_preview:preview}};
  if(payload.operation!=='apply'||!payload.preview||!payload.backup_directory)fail('INVALID_INPUT','/payload','Apply needs frozen preview and private backup directory');
  if(canonicalHash(preview)!==canonicalHash(payload.preview))fail('STATE_CONFLICT','/preview','Frozen preview is stale');
  const backupDir=resolve(payload.backup_directory),rel=relative(resolve(dir),backupDir);
  if(rel.startsWith('..')||!rel)fail('INVALID_INPUT','/backup_directory','Backup must be inside private account state');
  await mkdir(backupDir,{recursive:true,mode:0o700});
  const backupPath=join(backupDir,`state${state.schema_version}-${byteHash(raw)}.json`);
  const inventory={state_sha256:byteHash(raw),artifacts:[...Object.values(state.import_artifacts??{}).map(a=>({ref:a.path,sha256:a.artifact_sha256})),...Object.values(state.media_assets??{}).flatMap(e=>Object.values(e.versions).map(a=>({ref:a.artifact_ref,sha256:a.byte_sha256}))) ]};
  for(const entry of inventory.artifacts){if(!entry.ref.startsWith('/'))continue;const bytes=await readFile(entry.ref);if(byteHash(bytes)!==entry.sha256)fail('PERSIST_FAILED','/inventory','Dependency bytes changed before migration');}
  for(const [path,data] of [[backupPath,raw],[`${backupPath}.inventory.json`,JSON.stringify(inventory,null,2)]]){
    try{await writeFile(path,data,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST'||byteHash(await readFile(path))!==byteHash(data))throw error;}
  }
  const next=await commitState(dir,expectedRevision,current=>{const migrated=applyMigrationV3(current,payload.preview);Object.assign(migrated.migration_receipts[preview.preview_id],{backup_path:backupPath,backup_sha256:byteHash(raw),inventory_path:`${backupPath}.inventory.json`,inventory_hash:canonicalHash(inventory)});return migrated;},{migration:true});
  try{if(verifyReadback)await verifyReadback(next);const readback=validateState(JSON.parse(await readFile(file,'utf8')));if(canonicalHash(next)!==canonicalHash(readback))throw Error('Readback mismatch');return{state:readback,data:{migration_status:'verified',migration_receipt:{...next.migration_receipts[preview.preview_id],backup_path:backupPath,backup_sha256:byteHash(raw),inventory_hash:canonicalHash(inventory)},idempotent:false,persistence_status:'saved'}};}
  catch{return{state:next,data:{migration_status:'committed_unverified',migration_receipt:next.migration_receipts[preview.preview_id],persistence_status:'unverified',next_actions:[{kind:'migrate',target_ref:preview.preview_id,required_inputs:[],can_resume:true,requires_user_input:false,reason:'转换已提交，仅续做回读验证',operation:'resume_verify'}]}};}
}

export function previewMigrationV4(state) {
  validateState(state);
  if(![1,2,3].includes(state.schema_version))fail('SCHEMA_VERSION','/schema_version','State 4 needs no conversion');
  const recheck_items=[];
  if(Object.keys(state.adoptions??{}).length||Object.keys(state.reviews??{}).length)recheck_items.push('legacy_approvals_need_guidance_recheck');
  if(Object.keys(state.experiments??{}).length||Object.keys(state.experiment_reviews??{}).length)recheck_items.push('legacy_experiments_need_v4_review_binding');
  if(Object.values(state.content_runs??{}).some(run=>!['complete','failed'].includes(run.status)))recheck_items.push('active_content_runs_need_current_readiness_recheck');
  const preview={contract_version:4,preview_id:`migration4:${canonicalHash(state)}`,source_hash:canonicalHash(state),source_revision:state.revision,source_version:state.schema_version,target_version:4,rule_version:'state4@1',counts:Object.fromEntries(Object.entries(state).filter(([,value])=>value&&typeof value==='object'&&!Array.isArray(value)).map(([key,value])=>[key,Object.keys(value).length])),recheck_items,limitations:['历史 V2/V3 对象、ID 与批准保持原义；新知识、指导和采集约束需由 state 4 新记录证明。'],preview_hash:''};
  preview.preview_hash=canonicalHash({...preview,preview_hash:undefined});
  return validate('MigrationPreviewV4',preview);
}

export function applyMigrationV4(state,preview) {
  if(canonicalHash(previewMigrationV4(state))!==canonicalHash(preview))fail('STATE_CONFLICT','/preview','Migration source changed');
  const originalReceipts=structuredClone(state.migration_receipts??{});
  let next=state.schema_version===3?structuredClone(state):applyMigrationV3(state,planMigrationV3(state));
  next.schema_version=4;
  for(const key of [...v2Collections,...v3Collections,...v4Collections])next[key]??={};
  next.migration_receipts=originalReceipts;
  for(const artifact of Object.values(next.import_artifacts))artifact.source_refs=[...new Set([...(artifact.source_refs??[]),artifact.source_ref].filter(Boolean))].sort();
  seedKnowledgeState(next);
  for(const [id,artifact] of Object.entries(state.import_artifacts??{})){
    const migrated=next.import_artifacts[id];if(!migrated)fail('STATE_CONFLICT',`/import_artifacts/${id}`,'Migration removed a legacy import artifact');
    const before=structuredClone(artifact),after=structuredClone(migrated),beforeRefs=new Set(before.source_refs??[]),afterRefs=new Set(after.source_refs??[]);delete before.source_refs;delete after.source_refs;
    if(canonicalHash(before)!==canonicalHash(after)||[...beforeRefs].some(ref=>!afterRefs.has(ref))||[...afterRefs].some(ref=>!beforeRefs.has(ref)&&ref!==artifact.source_ref))fail('STATE_CONFLICT',`/import_artifacts/${id}`,'Migration may only append the legacy source_ref to source_refs');
  }
  for(const [key,value] of Object.entries(state))if(value&&typeof value==='object'&&!['migration_receipts','rule_versions_v2','import_artifacts'].includes(key)&&canonicalHash(value)!==canonicalHash(next[key]))fail('STATE_CONFLICT',`/${key}`,'Legacy objects must not change during migration');
  next.migration_receipts[preview.preview_id]={migration_id:preview.preview_id,preview_hash:preview.preview_hash,source_hash:preview.source_hash,source_revision:preview.source_revision,source_version:preview.source_version,target_revision:preview.source_revision+1,target_version:4,rule_version:preview.rule_version,recheck_items:structuredClone(preview.recheck_items)};
  return validateState(next);
}

function migrationInventory(state,raw) {
  const imported=Object.values(state.import_artifacts??{}).map(artifact=>({ref:artifact.path,sha256:artifact.artifact_sha256}));
  const media=Object.values(state.media_assets??{}).flatMap(entry=>Object.values(entry.versions??{}).map(asset=>({ref:asset.artifact_ref,sha256:asset.byte_sha256})));
  return {state_sha256:byteHash(raw),artifacts:[...imported,...media]};
}

async function verifyMigrationReceipt(receipt) {
  try {
    if(!receipt?.backup_path||byteHash(await readFile(receipt.backup_path))!==receipt.backup_sha256)return false;
    const inventory=JSON.parse(await readFile(receipt.inventory_path,'utf8'));
    return canonicalHash(inventory)===receipt.inventory_hash;
  } catch { return false; }
}

export async function migrateStateV4(dir,payload,expectedRevision,{verifyReadback=null}={}) {
  const file=join(dir,'account-state.json'),raw=await readFile(file,'utf8'),state=validateState(JSON.parse(raw));
  if(state.schema_version===4){
    const receipt=Object.values(state.migration_receipts).find(item=>item.target_version===4&&payload.preview&&item.preview_hash===payload.preview.preview_hash);
    if(!receipt)fail('STATE_CONFLICT','/preview','No matching state 4 migration receipt');
    const verified=await verifyMigrationReceipt(receipt);
    return {state,data:{migration_status:verified?'verified':'committed_unverified',migration_receipt:receipt,idempotent:payload.operation==='apply',persistence_status:verified?'saved':'unverified'}};
  }
  const preview=previewMigrationV4(state);
  if(payload.operation==='preview')return{state,data:{migration_preview:preview}};
  if(payload.operation!=='apply'||!payload.preview||!payload.backup_directory)fail('INVALID_INPUT','/payload','Apply needs frozen preview and private backup directory');
  if(canonicalHash(preview)!==canonicalHash(payload.preview))fail('STATE_CONFLICT','/preview','Frozen preview is stale');
  const backupDir=resolve(payload.backup_directory),rel=relative(resolve(dir),backupDir);
  if(rel.startsWith('..')||!rel)fail('INVALID_INPUT','/backup_directory','Backup must be inside private account state');
  await mkdir(backupDir,{recursive:true,mode:0o700});
  const backupPath=join(backupDir,`state${state.schema_version}-${byteHash(raw)}.json`),inventory=migrationInventory(state,raw),inventoryPath=`${backupPath}.inventory.json`,inventoryText=JSON.stringify(inventory,null,2);
  for(const entry of inventory.artifacts){if(!entry.ref?.startsWith('/'))continue;const bytes=await readFile(entry.ref);if(byteHash(bytes)!==entry.sha256)fail('PERSIST_FAILED','/inventory','Dependency bytes changed before migration');}
  for(const [path,data] of [[backupPath,raw],[inventoryPath,inventoryText]])try{await writeFile(path,data,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST'||byteHash(await readFile(path))!==byteHash(data))throw error;}
  const next=await commitState(dir,expectedRevision,current=>{const migrated=applyMigrationV4(current,payload.preview);Object.assign(migrated.migration_receipts[preview.preview_id],{backup_path:backupPath,backup_sha256:byteHash(raw),inventory_path:inventoryPath,inventory_hash:canonicalHash(inventory)});return migrated;},{migration:true});
  try{if(verifyReadback)await verifyReadback(next);const readback=validateState(JSON.parse(await readFile(file,'utf8')));if(canonicalHash(next)!==canonicalHash(readback))throw Error('Readback mismatch');return{state:readback,data:{migration_status:'verified',migration_receipt:readback.migration_receipts[preview.preview_id],idempotent:false,persistence_status:'saved'}};}
  catch{return{state:next,data:{migration_status:'committed_unverified',migration_receipt:next.migration_receipts[preview.preview_id],idempotent:false,persistence_status:'unverified',next_actions:[{kind:'migrate',target_ref:preview.preview_id,required_inputs:[],can_resume:true,requires_user_input:false,reason:'转换已提交，仅续做回读验证',operation:'resume_verify'}]}};}
}
