import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig }=await import(runtimeUrl('scripts/lib/config.mjs'));
const { initializeState, loadState }=await import(runtimeUrl('scripts/lib/state.mjs'));
const { textHash }=await import(runtimeUrl('scripts/lib/contracts.mjs'));
const account={handle:'fixture_archive_cli',profile_url:'https://x.com/fixture_archive_cli',user_id:'9000001',identity_basis:'user_provided'};
const entry=fileURLToPath(runtimeUrl('scripts/x-ops.mjs'));

async function invoke(command,payload,dir,allowed=[0,3,4]){
 const state=await loadState(dir),stamp=crypto.randomUUID(),input=join(dir,`${stamp}.input.json`),output=join(dir,`${stamp}.output.json`);
 await writeFile(input,JSON.stringify({schema_version:1,run_id:null,expected_revision:state.revision,payload}));
 const proc=spawnSync(process.execPath,[entry,command,'--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'});
 assert.equal(proc.error,undefined);const envelope=JSON.parse(proc.stdout);assert.ok(allowed.includes(proc.status),JSON.stringify(envelope.errors));return{envelope,exit_code:proc.status};
}

test('E01 real CLI archive object preview commit reload and analysis preserve exact file bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xops-next-archive-')),state=initializeState(createDefaultConfig(account),5);state.revision=1;
 await writeFile(join(dir,'account-state.json'),JSON.stringify(state)+'\n');
 const bytes='{"posts":[{"id":"9001","text":"历史正文","created_at":"2026-10-20T00:00:00Z","post_type":"reply","parent_post_key":"x:8001"}]}\n',material=join(dir,'archive-posts.json');await writeFile(material,bytes);
 const base={contract_version:2,operation:'preview',material_path:material,material_kind:'archive_posts',source_ref:'archive-material',declared_context:{account_identity_ref:'x-user:9000001',measurement_context:{observed_at:null,source_timezone:null,basis:'archive',definition_context:'archive-posts-json'}}};
 const preview=await invoke('data-import',base,dir,[0]);assert.equal(preview.envelope.data.import_preview.artifact_sha256,textHash(bytes));assert.equal(preview.envelope.data.import_preview.row_count,1);
 const committed=await invoke('data-import',{...base,operation:'commit',preview_hash:preview.envelope.data.import_preview.preview_hash},dir,[0]);assert.equal(committed.envelope.data.import_receipt.entity_refs.length,1);
 const restored=await loadState(dir),entity=restored.post_entities['x:9001'];assert.ok(entity);assert.equal(restored.post_versions[entity.current_version_ref].text,'历史正文');
 assert.deepEqual(new Set(Object.values(restored.post_metadata_facts).map(f=>f.field)),new Set(['created_at','post_type','parent_post_key']));
 const artifact=Object.values(restored.import_artifacts).find(item=>item.source_ref==='archive-material');assert.equal(await readFile(artifact.path,'utf8'),bytes);assert.equal(artifact.artifact_sha256,textHash(bytes));
 const analysis=await invoke('account-analyze',{contract_version:2,as_of:'2026-10-27T00:00:00Z',request:{requested_outputs:['publication_cohort'],publication_periods:[{period_id:'week',created_start:'2026-10-20T00:00:00Z',created_end_exclusive:'2026-10-27T00:00:00Z'}],requested_metric_definition_ids:['post.impressions'],target_post_keys:['x:9001'],selection_policy:{version:'next-v3'}}},dir,[4]);
 assert.equal(analysis.envelope.data.account_result.publication_structure[0].total,1);assert.equal(analysis.envelope.data.account_result.deliverable_status.publication_cohort,'unavailable');assert.match(analysis.envelope.data.run_result.limitations.join(' '),/requested_calculations|compatible observations/i);
});

test('E01 invalid archive JSON reports a precise material error and leaves state unchanged',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xops-next-archive-bad-')),state=initializeState(createDefaultConfig(account),5);state.revision=1;await writeFile(join(dir,'account-state.json'),JSON.stringify(state)+'\n');
 const material=join(dir,'bad.json');await writeFile(material,'{"posts":[');const before=await readFile(join(dir,'account-state.json'),'utf8');
 const result=await invoke('data-import',{contract_version:2,operation:'preview',material_path:material,material_kind:'archive_posts',source_ref:'bad',declared_context:{account_identity_ref:'x-user:9000001',measurement_context:{observed_at:null,source_timezone:null,basis:'archive',definition_context:'archive-posts-json'}}},dir,[2]);
 assert.equal(result.envelope.errors[0].code,'INVALID_INPUT');assert.equal(result.envelope.errors[0].path,'/material');assert.equal(await readFile(join(dir,'account-state.json'),'utf8'),before);
});

test('E04 edited post body and old-ID observation survive separate CLI imports and reload as one entity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xops-next-edit-')),state=initializeState(createDefaultConfig(account),5);state.revision=1;await writeFile(join(dir,'account-state.json'),JSON.stringify(state)+'\n');
 const bodyPath=join(dir,'edited.json'),body='{"posts":[{"post_id":"2","text":"edited body","created_at":"2026-10-20T00:00:00Z","edit_history_ids":["1","2"]}]}\n';await writeFile(bodyPath,body);
 const context={account_identity_ref:'x-user:9000001',measurement_context:{observed_at:null,source_timezone:null,basis:'archive',definition_context:'edited-history'}};
 const bodyBase={contract_version:2,operation:'preview',material_path:bodyPath,material_kind:'archive_posts',source_ref:'edited-body',declared_context:context},bodyPreview=await invoke('data-import',bodyBase,dir,[0]);await invoke('data-import',{...bodyBase,operation:'commit',preview_hash:bodyPreview.envelope.data.import_preview.preview_hash},dir,[0]);
 const metricPath=join(dir,'old-metric.json'),metric=JSON.stringify({observations:[{entity_type:'post',entity_id:'1',account_id:'9000001',metric_key:'impressions',definition_id:'post.impressions',value:80,value_kind:'count',unit:'count',precision:'exact',availability:'observed',observed_at:'2026-10-21T00:00:00Z',aggregation_basis:'lifetime_as_of',distribution:'organic',surface:'all'}],coverage:{views:{content:'obtained'},completeness:'complete',has_more:false,stop_reason:'source_exhausted',successful_items:1,failed_items:0}})+'\n';await writeFile(metricPath,metric);
 const metricBase={contract_version:2,operation:'preview',material_path:metricPath,material_kind:'canonical_json',source_ref:'old-id-metric',declared_context:{account_identity_ref:'x-user:9000001',measurement_context:{observed_at:'2026-10-21T00:00:00Z',source_timezone:null,basis:'api',definition_context:'official-v2'}}},metricPreview=await invoke('data-import',metricBase,dir,[0]);await invoke('data-import',{...metricBase,operation:'commit',preview_hash:metricPreview.envelope.data.import_preview.preview_hash},dir,[0]);
 const restored=await loadState(dir);assert.deepEqual(Object.keys(restored.post_entities),['x:2']);assert.equal(restored.post_aliases['x:1'],'x:2');assert.equal(Object.values(restored.snapshots_v2)[0].entity_id,'x:1');assert.equal(restored.post_versions[restored.post_entities['x:2'].current_version_ref].text,'edited body');assert.equal(Object.hasOwn(Object.values(restored.snapshots_v2)[0],'post_version_ref'),false);
});
