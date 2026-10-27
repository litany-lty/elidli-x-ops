import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { applyMigrationV5, previewMigrationV5 } from '../scripts/lib/migrations.mjs';
import { commitState, initializeState, loadState, v5Collections, validateState } from '../scripts/lib/state.mjs';
import { CURRENT_STATE_VERSION } from '../scripts/lib/state-version.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const currentEntry = join(repo, 'scripts/x-ops.mjs');

async function migrateCall(dir, payload, allowed = [0]) {
  const state = await loadState(dir), input = join(dir, `${crypto.randomUUID()}.input.json`), output = join(dir, `${crypto.randomUUID()}.output.json`);
  await writeFile(input, JSON.stringify({ schema_version: 1, run_id: null, expected_revision: state.revision, payload }));
  const result = spawnSync(process.execPath, [currentEntry, 'state-migrate', '--input', input, '--output', output, '--state-dir', dir], { encoding: 'utf8' }), envelope = JSON.parse(result.stdout);
  assert.ok(allowed.includes(result.status), JSON.stringify(envelope.errors));
  return envelope;
}

function stateAt(version = 4) {
  const state = initializeState(createDefaultConfig({ handle: 'state_fixture', profile_url: 'https://x.com/state_fixture', user_id: null, identity_basis: 'user_provided' }), version);
  state.revision = 1;
  state.preference_meta.fixture = { value: 'preserve-exactly' };
  return validateState(state);
}

test('CURRENT_STATE_VERSION is 5 after phase-A evidence and migration preserves legacy objects', () => {
  assert.equal(CURRENT_STATE_VERSION, 5);
  assert.equal(initializeState(createDefaultConfig()).schema_version, 5);
  const current = stateAt(4), before = Object.fromEntries(Object.entries(current).filter(([key, value]) => value && typeof value === 'object' && !['config', 'account', 'migration_receipts'].includes(key)).map(([key, value]) => [key, canonicalHash(value)]));
  const preview = previewMigrationV5(current), migrated = applyMigrationV5(current, preview);
  assert.equal(migrated.schema_version, 5);
  assert.equal(migrated.config.schema_version, 5);
  for (const key of v5Collections) assert.deepEqual(migrated[key], {});
  for (const [key, hash] of Object.entries(before)) assert.equal(canonicalHash(migrated[key]), hash, key);
  assert.equal(migrated.knowledge_catalogs['x-algorithm-public-v4'].catalog_content_hash, '51cef794aba149f525719ee8cc7178cbd4f76353bffff185267e4a38d9d8c5c8');
  assert.doesNotThrow(() => validateState(migrated));
  migrated.action_decisions.execution_fixture={contract_version:5,execution_id:'execution_fixture',action_id:'action_fixture',action_plan_hash:'a'.repeat(64),execution_kind:'data_collection',execution_evidence_refs:['receipt:fixture'],executed_at:'2026-10-27T04:00:00Z',actual_cost:{amount:0,currency:null,basis:'fixture'},feedback:{status:'completed',summary:'Fixture non-post execution'}};
  assert.doesNotThrow(()=>validateState(migrated));
});

test('state 1/2/3 migrate in memory through V4 without an intermediate persisted state', () => {
  for (const version of [1, 2, 3]) {
    const source = stateAt(version), preview = previewMigrationV5(source), migrated = applyMigrationV5(source, preview);
    assert.equal(migrated.schema_version, 5);
    assert.equal(migrated.migration_receipts[preview.preview_id].source_version, version);
    assert.ok(Object.keys(migrated.knowledge_catalogs).length > 0);
    assert.deepEqual(migrated.strategy_definitions, {});
  }
});

test('state 5 apply keeps backup/hash/readback evidence and normal writer targets 5', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xops-state5-apply-')), state = stateAt(4), file = join(dir, 'account-state.json');
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  const preview = previewMigrationV5(state), backup = join(dir, 'backups');
  const applied = await migrateCall(dir, { contract_version: 5, operation: 'apply', preview, backup_directory: backup });
  assert.equal(applied.data.migration_status, 'verified');
  const migrated = await loadState(dir);
  assert.equal(migrated.schema_version, 5);
  assert.equal(existsSync(applied.data.migration_receipt.backup_path), true);
  const committed = await commitState(dir, migrated.revision, working => {working.preference_meta.after_promotion={value:true};return working;});
  assert.equal(committed.schema_version, 5);
  assert.equal(committed.preference_meta.after_promotion.value, true);
});

test('the 91d8cae writer rejects a state 5 file and leaves its exact bytes unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'xops-old-writer-')), archive = join(root, 'archive'), account = join(root, 'account');
  mkdirSync(archive, { recursive: true }); mkdirSync(account, { recursive: true });
  const tar = execFileSync('git', ['archive', '91d8cae'], { cwd: repo, maxBuffer: 100 * 1024 * 1024 });
  const untar = spawnSync('tar', ['-x', '-C', archive], { input: tar });
  assert.equal(untar.status, 0, untar.stderr?.toString());
  symlinkSync(join(repo, 'node_modules'), join(archive, 'node_modules'), 'dir');
  const state = applyMigrationV5(stateAt(4), previewMigrationV5(stateAt(4))), file = join(account, 'account-state.json'), bytes = `${JSON.stringify(state, null, 2)}\n`;
  writeFileSync(file, bytes, { mode: 0o600 });
  const script = `import {loadState} from ${JSON.stringify(pathToFileURL(join(archive, 'scripts/lib/state.mjs')).href)}; await loadState(${JSON.stringify(account)});`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /Unsupported state version/);
  assert.equal(readFileSync(file, 'utf8'), bytes);
});
