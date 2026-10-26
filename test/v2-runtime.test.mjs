import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './helpers/runtime.mjs';
const {createDefaultConfig}=await import(runtimeUrl('scripts/lib/config.mjs'));
const {initializeState,loadState,registerSources}=await import(runtimeUrl('scripts/lib/state.mjs'));
const {canonicalHash,textHash}=await import(runtimeUrl('scripts/lib/contracts.mjs'));
const {validate,ContractError}=await import(runtimeUrl('scripts/lib/contracts.mjs'));
const {planMigration,migrateState}=await import(runtimeUrl('scripts/lib/migrations.mjs'));
const T='2026-10-26T04:00:00Z';
const account={handle:'fixture_runtime',profile_url:'https://x.com/fixture_runtime',user_id:null,identity_basis:'user_provided'};
test('all V2 command validators compile with strict schemas',()=>{
  for(const name of ['DataImportPayloadV2','StateMigratePayloadV2','CoachStepPayloadV2','RecordPayloadV2','AccountAnalyzePayloadV2','ReviewPayloadV2']) {
    assert.throws(()=>validate(name,null),error=>error instanceof ContractError,`${name} must reject null without a schema compilation error`);
  }
});
async function isolated(version=3) {
  const dir=await mkdtemp(join(tmpdir(),'xops-v2-runtime-'));
  const state=initializeState(createDefaultConfig(account),version);state.revision=1;
  await writeFile(join(dir,'account-state.json'),JSON.stringify(state)+'\n');return{dir,state};
}
async function invoke(command,payload,dir,{run_id=null,revision}={}) {
  const state=await loadState(dir),input=join(dir,'input.json'),output=join(dir,'output.json');
  await writeFile(input,JSON.stringify({schema_version:1,run_id,expected_revision:revision??state.revision,payload}));
  const proc=spawnSync(process.execPath,[fileURLToPath(runtimeUrl('scripts/x-ops.mjs')),command,'--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'});
  assert.equal(proc.error,undefined);return{exit_code:proc.status,envelope:JSON.parse(proc.stdout)};
}

test('V2-38 migration enters through V1, preserves bytes on failure, backs up and reapplies idempotently',async()=>{
  const {dir,state}=await isolated(1),before=await readFile(join(dir,'account-state.json'),'utf8');
  const preview=planMigration(state);
  const cliPreview=await invoke('state-migrate',{contract_version:2,operation:'preview'},dir);
  assert.equal(cliPreview.exit_code,0,JSON.stringify(cliPreview.envelope.errors));assert.equal(cliPreview.envelope.data.migration_preview.preview_hash,preview.preview_hash);
  await assert.rejects(migrateState(dir,{operation:'apply',preview:{...preview,source_hash:'changed'},backup_directory:join(dir,'backups')},1),/Frozen migration preview differs/);
  assert.equal(await readFile(join(dir,'account-state.json'),'utf8'),before);
  const first=await migrateState(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);
  assert.equal(first.state.schema_version,2);assert.equal(first.state.revision,2);
  assert.equal(await readFile(first.data.migration_receipt.backup_path,'utf8'),before);
  const second=await migrateState(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);
  assert.equal(second.data.idempotent,true);assert.equal(second.state.revision,2);
  const {dir:old}=await isolated(1);
  const blocked=await invoke('config',{operation:'update',patch:{schema_version:1,scope:'persistent',expected_revision:1,operations:[{op:'set',path:'/content/primary_goal',value:'clicks'}]},as_of:T},old);
  assert.equal(blocked.exit_code,4);assert.equal(blocked.envelope.errors[0].code,'MIGRATION_REQUIRED');
});

test('V2-01/02/19 CLI imports preserve byte identity, repeat idempotently and incomplete calculations return partial/3',async()=>{
  const {dir}=await isolated(),material=join(dir,'material.json');
  const content={posts:[{post_id:'100',text:'合成帖子',created_at:'2026-10-24T00:00:00Z',post_type:'original'}],observations:[{entity_type:'post',entity_id:'100',metric_key:'post.likes',value:2,precision:'exact',observed_at:'2026-10-26T00:00:00Z',aggregation_basis:'lifetime_as_of',distribution:'total',surface:'all'}]};
  const bytes=JSON.stringify(content,null,2)+'\n';await writeFile(material,bytes);
  const base={contract_version:2,operation:'preview',material_path:material,material_kind:'canonical_json',source_ref:'synthetic-material',declared_context:{account_identity_ref:'x-handle:fixture_runtime',measurement_context:{observed_at:null,source_timezone:null,basis:'declared'}}};
  const preview=await invoke('data-import',base,dir);assert.equal(preview.exit_code,0,JSON.stringify(preview.envelope.errors));
  assert.equal(preview.envelope.data.import_preview.artifact_sha256,textHash(bytes));
  const commit={...base,operation:'commit',preview_hash:preview.envelope.data.import_preview.preview_hash};
  const first=await invoke('data-import',commit,dir);assert.equal(first.exit_code,0,JSON.stringify(first.envelope.errors));
  const second=await invoke('data-import',commit,dir);assert.equal(second.exit_code,0,JSON.stringify(second.envelope.errors));
  assert.equal(second.envelope.data.import_receipt.idempotent,true);assert.equal(second.envelope.state_revision,first.envelope.state_revision);
  const result=await invoke('account-analyze',{contract_version:2,as_of:T,request:{requested_outputs:['publication_cohort','age_matched'],requested_metric_definition_ids:['post.likes','post.impressions'],age_windows:[{window_id:'24h',target_hours:24,tolerance_hours:2}]}},dir);
  assert.equal(result.exit_code,3,JSON.stringify(result.envelope));assert.equal(result.envelope.status,'partial');assert.equal(result.envelope.data.run_result.execution_status,'partial');
  const empty=await invoke('account-analyze',{contract_version:2,as_of:T,request:{requested_outputs:['age_matched'],requested_metric_definition_ids:['post.impressions'],age_windows:[{window_id:'24h',target_hours:24,tolerance_hours:2}]}},dir);
  assert.equal(empty.exit_code,4);assert.equal(empty.envelope.data.run_result.result_kind,'undetermined');
});

test('V2-37/39/42 coaching CLI returns committed revision, preserves incomplete scope and fresh process can resume',async()=>{
  const {dir}=await isolated();
  const request={contract_version:2,account_identity:account,requested_scope:{mode:'full'},requested_deliverables:['account_period','historical_content','next_actions'],analysis_cutoff:T,analysis_request:{requested_outputs:['account_period'],requested_metric_definition_ids:['account.impressions']},goal_snapshot:{primary_goal:'relevant_reach',goal_notes:null,source:'temporary_assumption'},constraint_snapshot:{time_budget:null,content_preferences:[],rejected_tactics:[]},selection_policy_version:'v2',requested_post_version_refs:[],available_material_refs:[],rule_version_refs:[],content_analysis_version:'reader-1',content_budget:{max_items:0},unresolved_questions:['尚未取得历史材料']};
  const prepared=await invoke('coach-step',{contract_version:2,operation:'prepare',request,as_of:T},dir,{run_id:'coach-runtime'});
  assert.equal(prepared.exit_code,3,JSON.stringify(prepared.envelope.errors));assert.equal(prepared.envelope.data.state_revision,prepared.envelope.state_revision);assert.equal(prepared.envelope.state_revision,2);
  const restored=await loadState(dir);assert.equal(restored.coaching_runs['coach-runtime'].active_bundle_hash,prepared.envelope.data.bundle.bundle_hash);
  const premature=await invoke('coach-step',{contract_version:2,operation:'finalize',run_id:'coach-runtime',proposal_hash:'old',as_of:T},dir,{run_id:'coach-runtime'});
  assert.equal(premature.exit_code,2);assert.notEqual(premature.envelope.status,'ok');
  assert.equal(canonicalHash(await loadState(dir)),canonicalHash(restored));
});
