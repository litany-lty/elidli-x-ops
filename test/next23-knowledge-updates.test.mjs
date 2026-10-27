import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { activateKnowledgeUpdateV5, computeKnowledgeImpactV5, dependencyDiffV5, inspectKnowledgeCheckoutV5, knowledgeReplayResultHashV5, proposeKnowledgeUpdateV5 } from '../scripts/lib/knowledge.mjs';

const T = '2026-10-27T03:00:00.000Z';
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

test('knowledge check records actual HEAD, file bytes and unchanged/changed/check_failed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'xops-knowledge-check-'));
  git(dir, ['init']); git(dir, ['config', 'user.email', 'fixture@example.com']); git(dir, ['config', 'user.name', 'Fixture']);
  const remote = join(mkdtempSync(join(tmpdir(), 'xops-knowledge-remote-')), 'remote.git'); git(dir, ['init', '--bare', remote]);
  git(dir, ['remote', 'add', 'origin', 'https://github.com/fixture/repo.git']); git(dir, ['config', `url.${remote}.insteadOf`, 'https://github.com/fixture/repo.git']);
  writeFileSync(join(dir, 'tracked.txt'), 'one\n'); git(dir, ['add', 'tracked.txt']); git(dir, ['commit', '-m', 'one']); git(dir, ['push', 'origin', 'HEAD:master']); git(dir,['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/master']);
  const head = git(dir, ['rev-parse', 'HEAD']);
  const unchanged = inspectKnowledgeCheckoutV5({ checkout_dir: dir, repo: 'fixture/repo', prior_head: head, paths: ['tracked.txt'], clock: T });
  assert.doesNotThrow(() => validate('KnowledgeCheckV5', unchanged));
  assert.equal(unchanged.status, 'unchanged'); assert.equal(unchanged.observed_head, head); assert.match(unchanged.files[0].sha256, /^[a-f0-9]{64}$/);
  writeFileSync(join(dir, 'tracked.txt'), 'two\n'); git(dir, ['commit', '-am', 'two']);
  assert.equal(inspectKnowledgeCheckoutV5({ checkout_dir: dir, repo: 'fixture/repo', prior_head: head, paths: ['tracked.txt'], clock: T }).status, 'check_failed');
  git(dir, ['push', 'origin', 'HEAD:master']);
  const changed=inspectKnowledgeCheckoutV5({ checkout_dir: dir, repo: 'fixture/repo', prior_head: head, paths: ['tracked.txt'], clock: T });assert.equal(changed.status, 'changed');assert.equal(changed.observed_head,changed.remote_head);
  assert.equal(inspectKnowledgeCheckoutV5({ checkout_dir: join(dir, 'missing'), repo: 'fixture/repo', prior_head: head, clock: T }).status, 'check_failed');
});

test('candidate impact includes add, modify, delete and move and activation recomputes it', () => {
  const currentDeps = [{ dependency_id: 'add-stays', path: 'a', value: 1 }, { dependency_id: 'modified', path: 'b', value: 1 }, { dependency_id: 'removed', path: 'c', value: 1 }, { dependency_id: 'moved', path: 'old', value: 1 }];
  const nextDeps = [{ dependency_id: 'add-stays', path: 'a', value: 1 }, { dependency_id: 'modified', path: 'b', value: 2 }, { dependency_id: 'moved', path: 'new', value: 1 }, { dependency_id: 'added', path: 'd', value: 1 }];
  assert.deepEqual(dependencyDiffV5(currentDeps, nextDeps), { added: ['added'], modified: ['modified'], removed: ['removed'], moved: [{ dependency_id: 'moved', from: 'old', to: 'new' }] });
  const rule = (id, dependencies) => ({ rule_version_id: id, dependency_ids: dependencies, review_status:'approved' });
  const current = { catalog: { catalog_id: 'current', catalog_content_hash: 'a'.repeat(64) }, dependencies: currentDeps, rules: { r1: rule('r1', ['modified']), r2: rule('r2', ['removed']) } };
  const candidate = { catalog: { catalog_id: 'candidate', catalog_content_hash: 'b'.repeat(64), upstream: { commit: 'c'.repeat(40) } }, dependencies: nextDeps.map(item => ({ ...item, wiring_status: 'reviewed', source_visibility: 'public' })), rules: { r1: rule('r1', ['modified']), r3: rule('r3', ['added']) } };
  const checkBase = { contract_version: 5, check_id: 'check', repo: 'fixture', checked_at: T, remote_url: 'fixture', remote_checked_at: T, prior_head: 'd'.repeat(40), observed_head: candidate.catalog.upstream.commit, remote_head: candidate.catalog.upstream.commit, status: 'changed', files: [], error: null };
  const check = { ...checkBase, check_hash: canonicalHash(checkBase) }, proposal = proposeKnowledgeUpdateV5(current, candidate, check);
  assert.doesNotThrow(() => validate('KnowledgeUpdateProposalV5', proposal));
  assert.deepEqual(computeKnowledgeImpactV5(current, candidate).affected_rule_version_refs, ['r1', 'r2', 'r3']);
  const replay_results = proposal.affected_rule_version_refs.map(ref => {const result={contract_version:5,replay_id:`replay-result-${ref}`,proposal_ref:proposal.proposal_id,rule_version_ref:ref,status:'passed',subject_hash:proposal.proposal_hash,review_ref:`replay-${ref}`,cases:['applicable','not_applicable','unknown'].map(expected=>({case_id:`${ref}-${expected}`,expected,actual:expected,status:'passed'}))};return{...result,replay_result_hash:knowledgeReplayResultHashV5(result)};});
  const activated = activateKnowledgeUpdateV5(current, candidate, proposal, { review_receipt: { receipt_id: 'review', purpose: 'review_knowledge', subject_hash: proposal.proposal_hash, actual_result_hash: proposal.proposal_hash, decision: 'approved' }, replay_results, activated_at: T });
  assert.doesNotThrow(() => validate('KnowledgeEventV5', activated.event));
  assert.deepEqual(activated.event.affected_rule_version_refs, ['r1', 'r2', 'r3']);
  const tampered = structuredClone(candidate); tampered.dependencies.find(item => item.dependency_id === 'modified').value = 3;
  assert.throws(() => activateKnowledgeUpdateV5(current, tampered, proposal, { review_receipt: { receipt_id: 'review', purpose: 'review_knowledge', subject_hash: proposal.proposal_hash, actual_result_hash: proposal.proposal_hash, decision: 'approved' }, replay_results, activated_at: T }), /immutable saved candidate/);
  const pending=structuredClone(candidate);pending.rules.r1.review_status='pending';assert.throws(()=>activateKnowledgeUpdateV5(current,pending,proposal,{review_receipt:{receipt_id:'review',purpose:'review_knowledge',subject_hash:proposal.proposal_hash,actual_result_hash:proposal.proposal_hash,decision:'approved'},replay_results,activated_at:T}),/without approved status/);
});
