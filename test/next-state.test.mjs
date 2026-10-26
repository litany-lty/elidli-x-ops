import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {initializeState,loadState,commitState} from '../scripts/lib/state.mjs';
import {createDefaultConfig} from '../scripts/lib/config.mjs';
import {planMigrationV3,migrateStateV3} from '../scripts/lib/migrations.mjs';
import {canonicalHash} from '../scripts/lib/contracts.mjs';
async function setup(version){const dir=await mkdtemp(join(tmpdir(),'xops-next-state-'));const state=initializeState(createDefaultConfig(),version);state.revision=1;await writeFile(join(dir,'account-state.json'),JSON.stringify(state));return{dir,state};}
for(const version of [1,2])test(`E30/E31 state${version}→3 is idempotent and preserves history`,async()=>{
 const {dir,state}=await setup(version),preview=planMigrationV3(state);const result=await migrateStateV3(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);assert.equal(result.state.schema_version,3);assert.equal(result.data.migration_status,'verified');assert.equal(canonicalHash(result.state.drafts),canonicalHash(state.drafts));const again=await migrateStateV3(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);assert.equal(again.state.revision,2);assert.equal(again.data.idempotent,true);assert.equal((await loadState(dir)).schema_version,3);
});
test('E30/E33 stale preview and invalid precommit mutation preserve the source state',async()=>{
 const {dir,state}=await setup(2),raw=await readFile(join(dir,'account-state.json'),'utf8');const preview=planMigrationV3(state);await assert.rejects(migrateStateV3(dir,{operation:'apply',preview:{...preview,source_revision:2},backup_directory:join(dir,'backups')},1),/stale/);assert.equal(await readFile(join(dir,'account-state.json'),'utf8'),raw);await assert.rejects(commitState(dir,1,current=>({...current,schema_version:4}),{migration:true}));assert.equal(await readFile(join(dir,'account-state.json'),'utf8'),raw);
});
test('state3 writer refuses unmigrated business writes and concurrent stale revisions',async()=>{
 const {dir,state}=await setup(2);await assert.rejects(commitState(dir,1,x=>x),/migration/);const preview=planMigrationV3(state);await migrateStateV3(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1);await assert.rejects(commitState(dir,1,x=>x),/State changed/);
});
test('E33 a postcommit verification failure resumes verification without converting or rolling back later revisions',async()=>{
 const {dir,state}=await setup(2),preview=planMigrationV3(state);
 const interrupted=await migrateStateV3(dir,{operation:'apply',preview,backup_directory:join(dir,'backups')},1,{verifyReadback:async()=>{throw Error('controlled readback interruption');}});
 assert.equal(interrupted.data.migration_status,'committed_unverified');assert.equal(interrupted.data.persistence_status,'unverified');assert.equal((await loadState(dir)).revision,2);
 await commitState(dir,2,current=>{current.preference_meta.verified_after_migration=true;return current;});
 const resumed=await migrateStateV3(dir,{operation:'resume_verify',preview},2);assert.equal(resumed.data.migration_status,'verified');assert.equal(resumed.state.revision,3);assert.equal(resumed.state.preference_meta.verified_after_migration,true);assert.ok(resumed.data.migration_receipt.backup_path);assert.ok(resumed.data.migration_receipt.inventory_hash);
});
test('E33 interruption after staging and before atomic rename leaves the original bytes intact',async()=>{
 const {dir}=await setup(3),file=join(dir,'account-state.json'),before=await readFile(file,'utf8');
 await assert.rejects(commitState(dir,1,current=>{current.preference_meta.pending_change=true;return current;},{stagedWriteHook:async()=>{throw Error('controlled interruption before rename');}}),/controlled interruption/);
 assert.equal(await readFile(file,'utf8'),before);assert.equal((await loadState(dir)).revision,1);
});
