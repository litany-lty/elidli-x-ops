import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './helpers/runtime.mjs';

const { createDefaultConfig } = await import(runtimeUrl('scripts/lib/config.mjs'));
const { initializeState, loadState } = await import(runtimeUrl('scripts/lib/state.mjs'));
const { previewMigrationV5, applyMigrationV5 } = await import(runtimeUrl('scripts/lib/migrations.mjs'));
const { canonicalHash } = await import(runtimeUrl('scripts/lib/contracts.mjs'));
const entry = fileURLToPath(runtimeUrl('scripts/x-ops.mjs')), T = '2026-10-27T00:00:00Z';
const account = { handle: 'fixture_controller', profile_url: 'https://x.com/fixture_controller', user_id: '42', identity_basis: 'user_provided' };

async function invoke(dir, command, payload, ok = true) {
  const state = await loadState(dir), id = crypto.randomUUID(), input = join(dir, `${id}.in.json`), output = join(dir, `${id}.out.json`); await writeFile(input, JSON.stringify({ schema_version: 1, run_id: null, expected_revision: state.revision, payload }));
  const proc = spawnSync(process.execPath, [entry, command, '--input', input, '--output', output, '--state-dir', dir], { encoding: 'utf8' }), envelope = JSON.parse(proc.stdout); if (ok) assert.ok([0, 3].includes(proc.status), JSON.stringify(envelope.errors)); else assert.notEqual(proc.status, 0); return envelope;
}

async function state5Dir() {
  const dir = await mkdtemp(join(tmpdir(), 'xops-controller-')), source = initializeState(createDefaultConfig(account), 4); source.revision = 1; const state = applyMigrationV5(source, previewMigrationV5(source)); await writeFile(join(dir, 'account-state.json'), `${JSON.stringify(state)}\n`); return dir;
}

test('A25 old data/content/collection payloads persist and reload in state 5', async () => {
  const dir = await state5Dir(), material = join(dir, 'archive.json'); await writeFile(material, '{"posts":[{"id":"9","text":"旧入口正文","created_at":"2026-10-20T00:00:00Z"}]}\n');
  const importBase = { contract_version: 2, operation: 'preview', material_path: material, material_kind: 'archive_posts', source_ref: 'archive-source', declared_context: { account_identity_ref: 'x-user:42', measurement_context: { observed_at: null, source_timezone: null, basis: 'archive', definition_context: 'controller-test' } } }, preview = await invoke(dir, 'data-import', importBase);
  await invoke(dir, 'data-import', { ...importBase, operation: 'commit', preview_hash: preview.data.import_preview.preview_hash });
  let restored = await loadState(dir); assert.equal(restored.post_versions[restored.post_entities['x:9'].current_version_ref].text, '旧入口正文');
  const host = { contract_version: 4, binding_id: 'host-v4', binding_version: '4', host_name: 'fixture-host', data_mode: 'fixture', search: { tool_name: 'search', request_template: {}, supported_filters: [] }, read: { tool_name: 'read', request_template: {}, supported_filters: [] }, raw_formats: ['text_string'], node_execution: 'node', working_directory: dir, persistence: { provider: 'local_filesystem', save_method: 'atomic', restore_method: 'read', persistent: true }, browser: { family: 'chrome', browser_ref: 'browser', session_ref: 'session', verified_receipt_ref: 'browser-proof' }, device: { device_ref: 'mac', kind: 'desktop', os: 'macOS' }, runtime: { runtime_ref: 'runtime', location: 'local' }, tool_mappings: { tab_read: 'read' }, capabilities: [{ capability: 'tab_read', declared: 'available', verified: 'verified', last_receipt_ref: 'browser-proof' }], file_transfer: { declared: 'available', source_runtime_ref: 'runtime', target_runtime_ref: 'runtime', method: 'same_runtime', last_verified_receipt_ref: 'transfer-proof' } };
  await invoke(dir, 'collection-step', { contract_version: 4, operation: 'prepare', run_id: 'collection-old-v4', target_account_ref: 'x-user:42', requested_period: { start: '2026-09-29', end_exclusive: '2026-10-27' }, historical_as_of: null, budget: { max_posts: 10, max_deep_reads: 2, max_pages: 2, max_seconds: 60 }, host_binding: host, predecessor_run_id: null, as_of: T }); restored = await loadState(dir); assert.equal(restored.collection_runs['collection-old-v4'].target_account_ref, 'x-user:42');
  const recipeData = { schema_version: 1, recipe_id: 'text', recipe_version: '1', name: '纯文本', applicable_goals: ['说明更新'], required_materials: [], editorial_structure: ['正文'], visual_roles: ['none'], default_deliverables: ['text'], quality_checks: ['事实准确'], editable_preferences: [] }, recipe = { contract_version: 3, source_kind: 'builtin', source_ref: 'fixture', recipe_ref: 'text@1', recipe_id: 'text', recipe_version: '1', recipe_hash: canonicalHash(recipeData), recipe: recipeData }, briefBase = { contract_version: 3, brief_id: 'brief-old-v3', brief_revision: 1, parent_revision: null, original_request_ref: 'request', goal: '说明更新', audience: '开发者', language: 'zh-CN', publishing_format: 'short_post', editorial_type: 'custom', recipe_ref: recipe.recipe_ref, recipe_version: recipe.recipe_version, visual_request: { role: 'none', count: 0, style: { tone: '克制', palette: [], density: 'balanced', font_notes: '', reference_style: null }, reference_material_refs: [], slots: [] }, must_preserve: [], must_avoid: [], required_deliverables: ['text'], personalization_mode: 'none', used_context_refs: [], context_selection_hash: null, material_refs: [], claim_refs: [], assumptions: [], blockers: [], preference_provenance: { goal: 'request', audience: 'request', visual_style: 'request' } }, brief = { ...briefBase, brief_hash: canonicalHash(briefBase) };
  await invoke(dir, 'content-step', { contract_version: 3, operation: 'prepare', brief, recipe, capabilities: {}, budget: 1, base_pack_ref: null, as_of: T }); restored = await loadState(dir); assert(Object.values(restored.content_runs).some(run => run.brief_revision_ref === 'brief-old-v3:1'));
});

test('A27 persistent config and feedback commit atomically while run resolve stays temporary', async () => {
  const dir = await state5Dir(), before = await loadState(dir), patch = { schema_version: 5, scope: 'persistent', expected_revision: before.revision, operations: [{ op: 'set', path: '/content/preferences/short_text_on_images', value: true }] };
  await invoke(dir, 'config', { contract_version: 5, operation: 'update', patch, source_quote: '以后图片少放字', source_ref: 'chat:controller', as_of: T });
  let saved = await loadState(dir), events = Object.values(saved.feedback_events); assert.equal(saved.config.content.preferences.short_text_on_images, true); assert.equal(events.length, 1); assert.equal(events[0].source_quote, '以后图片少放字');
  const resolved = await invoke(dir, 'config', { contract_version: 5, operation: 'resolve', patch: { schema_version: 5, scope: 'run', operations: [{ op: 'set', path: '/content/preferences/short_text_on_images', value: false }] }, as_of: T }); assert.equal(resolved.data.config.content.preferences.short_text_on_images, false);
  saved = await loadState(dir); assert.equal(saved.config.content.preferences.short_text_on_images, true); assert.equal(Object.keys(saved.feedback_events).length, 1); assert.equal((await readFile(join(dir, 'account-state.json'), 'utf8')).includes('以后图片少放字'), true);
});
