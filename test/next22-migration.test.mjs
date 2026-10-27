import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { initializeState, loadState, commitState, v4Collections } from '../scripts/lib/state.mjs';
import { previewMigrationV5, applyMigrationV5, migrateStateV5, previewMigrationV4, applyMigrationV4 } from '../scripts/lib/migrations.mjs';

const preserved=['account','sources','raw_receipts','claims','drafts','adoptions','publications','posts','snapshots','reviews','rule_versions'];
const entry=fileURLToPath(new URL('../scripts/x-ops.mjs',import.meta.url));
async function setup(version){const dir=await mkdtemp(join(tmpdir(),`xops-state${version}-v4-`)),state=initializeState(createDefaultConfig(),version);state.revision=1;await writeFile(join(dir,'account-state.json'),`${JSON.stringify(state,null,2)}\n`);return{dir,state};}
async function invokeMigration(dir,payload,allowed=[0]){const state=await loadState(dir),input=join(dir,`${crypto.randomUUID()}.input.json`),output=join(dir,`${crypto.randomUUID()}.output.json`);await writeFile(input,JSON.stringify({schema_version:1,run_id:null,expected_revision:state.revision,payload}));const proc=spawnSync(process.execPath,[entry,'state-migrate','--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'}),envelope=JSON.parse(proc.stdout);assert.ok(allowed.includes(proc.status),JSON.stringify(envelope.errors));return envelope;}

test('A-V01 fresh initialization is state5 with every V4 collection',()=>{
 const state=initializeState(createDefaultConfig());assert.equal(state.schema_version,5);for(const key of v4Collections)assert.ok(state[key]&&typeof state[key]==='object',key);assert.ok(Object.keys(state.knowledge_catalogs).length>0);assert.ok(Object.keys(state.knowledge_artifacts).length>0);assert.ok(Object.keys(state.operational_rules).length>0);
});

for(const version of [1,2,3])test(`A-V01 state${version} preview/apply migrates directly to state5 and preserves old IDs`,async()=>{
 const {dir,state}=await setup(version),before=Object.fromEntries(preserved.map(key=>[key,canonicalHash(state[key])])),preview=previewMigrationV5(state);
 assert.equal(preview.source_version,version);assert.equal(preview.target_version,5);assert.equal(preview.source_revision,1);
 const inMemory=applyMigrationV5(state,preview);assert.equal(inMemory.schema_version,5);assert.equal(inMemory.revision,1);
 const result=await migrateStateV5(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);assert.equal(result.state.schema_version,5);assert.equal(result.state.revision,2);assert.equal(result.data.migration_status,'verified');
 for(const [key,hash] of Object.entries(before))assert.equal(canonicalHash(result.state[key]),hash,key);
 const projected=structuredClone(result.state.config);projected.schema_version=state.config.schema_version;delete projected.content.preferences;assert.equal(canonicalHash(projected),canonicalHash(state.config),'prior config fields remain unchanged');
 const persisted=await loadState(dir);assert.equal(persisted.schema_version,5);for(const key of v4Collections)assert.ok(persisted[key]&&typeof persisted[key]==='object',key);
 const again=await migrateStateV5(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);assert.equal(again.data.idempotent,true);assert.equal(again.state.revision,2);
});

test('A-V02 old states are readable but ordinary writes and intermediate migration targets are rejected',async()=>{
 const {dir}=await setup(3);assert.equal((await loadState(dir)).schema_version,3);
 await assert.rejects(commitState(dir,1,state=>state),error=>error.code==='MIGRATION_REQUIRED');
 await assert.rejects(commitState(dir,1,state=>({...state,schema_version:3}),{migration:true}),error=>error.code==='SCHEMA_VERSION');
 assert.equal((await loadState(dir)).schema_version,3);
});

test('A-V03 stale preview or interrupted readback never writes an intermediate state',async()=>{
 const {dir,state}=await setup(2),preview=previewMigrationV5(state),path=join(dir,'account-state.json'),before=await readFile(path,'utf8');
 await assert.rejects(migrateStateV5(dir,{operation:'apply',preview:{...preview,source_revision:2},backup_directory:join(dir,'backups')},1),error=>error.code==='STATE_CONFLICT');assert.equal(await readFile(path,'utf8'),before);
 const interrupted=await migrateStateV5(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1,{verifyReadback:async()=>{throw Error('controlled');}});assert.equal(interrupted.state.schema_version,5);assert.equal(interrupted.data.migration_status,'committed_unverified');assert.equal((await loadState(dir)).schema_version,5);
 const resumed=await migrateStateV5(dir,{operation:'resume_verify',preview},2);assert.equal(resumed.data.migration_status,'verified');assert.equal(resumed.state.revision,2);
});

test('A-V01 legacy import artifact gains only source_refs while existing refs remain intact',()=>{
 const state=initializeState(createDefaultConfig(),3);state.revision=1;state.import_artifacts.legacy={artifact_sha256:'a'.repeat(64),path:'/private/legacy.material',source_ref:'legacy-source',material_kind:'canonical_json'};
 const migrated=applyMigrationV4(state,previewMigrationV4(state));assert.deepEqual(migrated.import_artifacts.legacy,{...state.import_artifacts.legacy,source_refs:['legacy-source']});
 const withRefs=structuredClone(state);withRefs.import_artifacts.legacy.source_refs=['earlier-source','legacy-source'];const preserved=applyMigrationV4(withRefs,previewMigrationV4(withRefs));assert.deepEqual(preserved.import_artifacts.legacy.source_refs,['earlier-source','legacy-source']);
});

test('A-V01 real CLI previews and commits state3 directly to seeded state5',async()=>{
 const {dir}=await setup(3),previewEnvelope=await invokeMigration(dir,{contract_version:5,operation:'preview'}),preview=previewEnvelope.data.migration_preview;assert.equal(preview.source_version,3);assert.equal(preview.target_version,5);
 const applied=await invokeMigration(dir,{contract_version:5,operation:'apply',preview,backup_directory:join(dir,'backups')});assert.equal(applied.data.migration_status,'verified');
 const restored=await loadState(dir);assert.equal(restored.schema_version,5);assert.ok(Object.keys(restored.knowledge_catalogs).length>0);assert.ok(Object.keys(restored.operational_rules).length>0);assert.ok(Object.keys(restored.rule_versions_v2).length>0);
});
