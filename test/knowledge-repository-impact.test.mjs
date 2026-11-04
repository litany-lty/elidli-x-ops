import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { inspectKnowledgeCheckoutV5, computeKnowledgeImpactV5, knowledgeSourceBindingsV5, knowledgeDependencyPathsV5 } from '../scripts/lib/knowledge-updates.mjs';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('full repository discovery includes unrequested adds, deletes, config and extensionless files', () => {
  const root = mkdtempSync(join(tmpdir(), 'xops-inventory-'));
  const remote = join(root, 'remote.git');
  git(root, ['init']); git(root, ['config', 'user.email', 'fixture@example.com']); git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['init', '--bare', remote]); git(root, ['remote', 'add', 'origin', remote]);
  for (const path of ['source.rs', 'old.rs', 'settings.yaml', 'BUILD']) writeFileSync(join(root, path), 'old\n');
  git(root, ['add', 'source.rs', 'old.rs', 'settings.yaml', 'BUILD']); git(root, ['commit', '-m', 'baseline']);
  const prior_head = git(root, ['rev-parse', 'HEAD']);
  rmSync(join(root, 'old.rs'));
  for (const path of ['new.rs', 'settings.yaml', 'BUILD']) writeFileSync(join(root, path), 'new\n');
  git(root, ['add', 'old.rs', 'new.rs', 'settings.yaml', 'BUILD']); git(root, ['commit', '-m', 'changes']);
  git(root, ['push', 'origin', 'HEAD:master']); git(root, ['--git-dir', remote, 'symbolic-ref', 'HEAD', 'refs/heads/master']);
  const check = inspectKnowledgeCheckoutV5({ checkout_dir: root, repo: remote, prior_head, paths: ['source.rs'] });
  assert.equal(check.status, 'changed');
  validate('KnowledgeCheckV5', check);
  assert.equal(check.inventory_scope, 'full_repository');
  assert.deepEqual(Object.fromEntries(check.repository_diff.map(item => [item.path, item.change])), { BUILD: 'M', 'new.rs': 'A', 'old.rs': 'D', 'settings.yaml': 'M' });
  assert.equal(check.files.find(file => file.path === 'old.rs').status, 'deleted');
  assert.equal(check.files.length, 5);
  const dep = { dependency_id: 'score', path: 'source.rs', caller_refs: ['settings.yaml', 'BUILD'], material_hash: check.files[0].sha256, source_visibility: 'public' };
  const current = { catalog: { upstream: { commit: prior_head } }, dependencies: [dep], rules: { score: { dependency_ids: ['score'] } } };
  const impact = computeKnowledgeImpactV5(current, current, check);
  assert.deepEqual(impact.affected_rule_version_refs, ['score']);
  assert.deepEqual(impact.dependency_diff.potentially_modified, ['score']);
  assert.deepEqual(new Set(impact.unreviewed_paths), new Set(['BUILD', 'new.rs', 'old.rs', 'settings.yaml']));
  assert.equal(impact.impact_limitations.filter(item => item.reason === 'caller_or_config_changed').length, 2);
  // Files outside the requested list must also be checked against committed bytes.
  writeFileSync(join(root, 'settings.yaml'), 'dirty\n');
  assert.equal(inspectKnowledgeCheckoutV5({ checkout_dir: root, repo: remote, prior_head, paths: ['source.rs'] }).status, 'check_failed');
  assert.equal(inspectKnowledgeCheckoutV5({ checkout_dir: root, repo: remote, prior_head: 'f'.repeat(40), paths: [] }).status, 'check_failed');
});

test('caller bindings include configuration, extensionless files and symbol-qualified references', () => {
  const head = 'a'.repeat(40), hash = 'b'.repeat(64);
  const dependency = { dependency_id: 'score', path: 'source.rs', material_hash: hash, source_visibility: 'public', caller_refs: ['settings.yaml', 'BUILD', 'caller.rs::build', 'caller.rs:L3-9'] };
  assert.deepEqual(knowledgeDependencyPathsV5(dependency), ['source.rs', 'settings.yaml', 'BUILD', 'caller.rs']);
  const base = { observed_head: head, files: ['source.rs', 'settings.yaml', 'BUILD', 'caller.rs'].map(path => ({ path, commit: head, status: 'present', sha256: hash, git_blob_oid: 'c'.repeat(40) })) };
  const check = { ...base, check_hash: canonicalHash(base) };
  const bindings = knowledgeSourceBindingsV5({ dependencies: [] }, { dependencies: [dependency] }, check);
  assert.deepEqual(new Set(bindings.map(item => item.path)), new Set(['source.rs', 'settings.yaml', 'BUILD', 'caller.rs']));
  const missing = { ...base, files: base.files.filter(item => item.path !== 'settings.yaml') };
  assert.throws(() => knowledgeSourceBindingsV5({ dependencies: [] }, { dependencies: [dependency] }, { ...missing, check_hash: canonicalHash(missing) }), /settings.yaml/);
});


test('inventory cannot claim coverage of a different active baseline or absent diff', () => {
  const current = { catalog: { upstream: { commit: 'a'.repeat(40) } }, dependencies: [], rules: {} };
  for (const check of [
    { inventory_scope: 'full_repository', repository_diff: [], prior_head: 'b'.repeat(40) },
    { inventory_scope: 'full_repository', prior_head: 'a'.repeat(40) }
  ]) assert.equal(computeKnowledgeImpactV5(current, current, check).inventory_scope, 'not_checked');
});
