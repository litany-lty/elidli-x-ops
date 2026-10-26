import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { canonicalHash, textHash, validate, ContractError } from './contracts.mjs';
import { validateState, commitState, v2Collections } from './state.mjs';
import { legacyImportFromState, mergeImport } from './imports.mjs';

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
  const backupPath = join(backupDir,`v1-${textHash(raw)}.json`);
  try { await writeFile(backupPath,raw,{flag:'wx',mode:0o600}); }
  catch (error) { if(error.code!=='EEXIST')throw error; if(textHash(await readFile(backupPath,'utf8'))!==textHash(raw))fail('RECEIPT_CONFLICT','/backup','Existing backup differs'); }
  const next = await commitState(dir,expectedRevision,current=>{
    const migrated=applyMigration(current,payload.preview);
    for(const artifact of Object.values(migrated.import_artifacts))if(artifact.path===`migration:${preview.preview_id}`) {artifact.path=backupPath;artifact.artifact_sha256=textHash(raw);}
    return migrated;
  },{migration:true});
  return {state:next,data:{migration_receipt:{...next.migration_receipts[preview.preview_id],backup_path:backupPath,backup_sha256:textHash(raw)},idempotent:false,persistence_status:'unverified'}};
}
