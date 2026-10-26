import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig }=await import(runtimeUrl('scripts/lib/config.mjs'));
const { initializeState, loadState }=await import(runtimeUrl('scripts/lib/state.mjs'));
const account={handle:'fixture_v22_cli',profile_url:'https://x.com/fixture_v22_cli',user_id:'220001',identity_basis:'user_provided'},entry=fileURLToPath(runtimeUrl('scripts/x-ops.mjs'));

async function invoke(command,payload,dir,allowed=[0]){
 const state=await loadState(dir),input=join(dir,`${crypto.randomUUID()}.input.json`),output=join(dir,`${crypto.randomUUID()}.output.json`);
 await writeFile(input,JSON.stringify({schema_version:1,run_id:null,expected_revision:state.revision,payload}));
 const proc=spawnSync(process.execPath,[entry,command,'--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'}),envelope=JSON.parse(proc.stdout);assert.equal(proc.error,undefined);assert.ok(allowed.includes(proc.status),JSON.stringify(envelope.errors));return envelope;
}
async function init(prefix){const dir=await mkdtemp(join(tmpdir(),prefix)),state=initializeState(createDefaultConfig(account),4);state.revision=1;await writeFile(join(dir,'account-state.json'),`${JSON.stringify(state)}\n`);return dir;}
async function commitFile(dir,path,source_ref,declared_context,material_kind='canonical_json'){
 const base={contract_version:2,operation:'preview',material_path:path,material_kind,source_ref,declared_context},preview=await invoke('data-import',base,dir);return invoke('data-import',{...base,operation:'commit',preview_hash:preview.data.import_preview.preview_hash},dir);
}

test('A-B01 real CLI preserves two logical sources for one physical byte artifact',async()=>{
 const dir=await init('xops-v22-sources-'),path=join(dir,'empty.json'),bytes='{"observations":[]}\n';await writeFile(path,bytes);
 const context={account_identity_ref:'x-user:220001',measurement_context:{observed_at:'2026-10-27T00:00:00Z',basis:'api',definition_context:'fixture'}};
 const first=await commitFile(dir,path,'source-a',context),retry=await commitFile(dir,path,'source-a',context),second=await commitFile(dir,path,'source-b',context),state=await loadState(dir),artifact=Object.values(state.import_artifacts)[0];
 assert.equal(first.data.import_receipt.idempotent,false);assert.equal(retry.data.import_receipt.idempotent,true);assert.equal(second.data.import_receipt.idempotent,true);
 assert.deepEqual(new Set(artifact.source_refs),new Set(['source-a','source-b']));assert.equal(Object.values(state.import_batches).length,1);assert.ok(Object.values(state.import_batches).some(batch=>batch.source_ref==='source-a'));
});

test('A-B05 real CLI reload and new-process account analysis retain old-ID metric value',async()=>{
 const dir=await init('xops-v22-alias-'),bodyPath=join(dir,'body.json'),metricPath=join(dir,'metric.json');
 await writeFile(bodyPath,'{"posts":[{"post_id":"2","text":"edited","created_at":"2026-10-20T00:00:00Z","post_type":"original","edit_history_ids":["1","2"]}]}\n');
 await commitFile(dir,bodyPath,'body',{account_identity_ref:'x-user:220001',measurement_context:{observed_at:null,basis:'archive',definition_context:'fixture'}},'archive_posts');
 await writeFile(metricPath,`${JSON.stringify({observations:[{entity_type:'post',entity_id:'1',account_id:'220001',metric_key:'impressions',definition_id:'post.impressions',value:80,value_kind:'count',unit:'count',precision:'exact',availability:'observed',observed_at:'2026-10-21T00:00:00Z',aggregation_basis:'lifetime_as_of',distribution:'organic',surface:'all'}],coverage:{completeness:'complete',has_more:false,successful_items:1,failed_items:0}})}\n`);
 await commitFile(dir,metricPath,'metric',{account_identity_ref:'x-user:220001',measurement_context:{observed_at:'2026-10-21T00:00:00Z',basis:'api',definition_context:'fixture'}});
 const result=await invoke('account-analyze',{contract_version:2,as_of:'2026-10-22T00:00:00Z',request:{requested_outputs:['publication_cohort'],requested_metric_definition_ids:['post.impressions'],target_post_keys:['x:2']}},dir,[0,3,4]);
 const all=result.data.account_result.post_cohort_results.find(item=>item.period_id==='all'&&item.post_type==='all'&&item.metric_definition_id==='post.impressions');assert.equal(all.median,80);assert.equal(all.sample.valid_n,1);assert.equal(result.data.account_result.publication_structure[0].total,1);
});
