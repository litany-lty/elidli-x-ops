import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {createHash} from 'node:crypto';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { activateKnowledgeUpdateV5, inspectKnowledgeCheckoutV5, proposeKnowledgeUpdateV5, verifyKnowledgeSourceMaterialsV5 } from '../scripts/lib/knowledge-updates.mjs';
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

test('review: knowledge check rejects uncommitted source bytes at an otherwise current HEAD',()=>{
  const root=mkdtempSync(join(tmpdir(),'xops-reviewed-source-')),remote=join(root,'remote.git');
  git(root,['init']);git(root,['config','user.email','fixture@example.com']);git(root,['config','user.name','Fixture']);git(root,['init','--bare',remote]);
  git(root,['remote','add','origin','https://github.com/fixture/source.git']);git(root,['config',`url.${remote}.insteadOf`,'https://github.com/fixture/source.git']);
  writeFileSync(join(root,'source.rs'),'pub const VALUE: u8 = 1;\n');git(root,['add','source.rs']);git(root,['commit','-m','source']);git(root,['push','origin','HEAD:master']);git(root,['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/master']);
  const head=git(root,['rev-parse','HEAD']),clean=inspectKnowledgeCheckoutV5({checkout_dir:root,repo:'fixture/source',prior_head:head,paths:['source.rs','removed.rs']});
  assert.equal(clean.status,'unchanged');
  const material=Buffer.from(JSON.stringify({candidate_commit:head,files:clean.files.map(({path,status,sha256})=>({path,status,sha256}))}));writeFileSync(join(root,'review.json'),material);
  const prior={dependencies:[{dependency_id:'removed',path:'removed.rs',source_visibility:'public'}],facts:{}};
  const candidate={dependencies:[{dependency_id:'score',path:'source.rs',source_visibility:'public',material_hash:clean.files[0].sha256,evidence_material_path:'review.json',evidence_content_hash:canonicalHash(null)}],facts:{},artifacts:{}};
  candidate.dependencies[0].evidence_content_hash=createHash('sha256').update(material).digest('hex');
  assert.doesNotThrow(()=>verifyKnowledgeSourceMaterialsV5(prior,candidate,clean,root));

  writeFileSync(join(root,'source.rs'),'pub const VALUE: u8 = 99;\n');
  const changed=inspectKnowledgeCheckoutV5({checkout_dir:root,repo:'fixture/source',prior_head:head,paths:['source.rs']});
  assert.equal(changed.status,'check_failed');assert.match(changed.error,/committed|dirty|source bytes/i);
});

test('review: candidate source cannot be approved from matching HEAD strings alone',()=>{
  const head='c'.repeat(40),current={catalog:{artifact_refs:[],fact_version_refs:[],rule_version_refs:[],catalog_id:'prior',catalog_content_hash:'a'.repeat(64)},dependencies:[],rules:{},facts:{},artifacts:{}};
  const candidate={catalog:{artifact_refs:[],fact_version_refs:[],rule_version_refs:[],catalog_id:'candidate',catalog_content_hash:'b'.repeat(64),upstream:{commit:head}},dependencies:[{dependency_id:'score',path:'score.rs',material_hash:'d'.repeat(64),evidence_material_path:'evidence.txt',evidence_content_hash:'e'.repeat(64),source_visibility:'public',wiring_status:'wired_reviewed'}],rules:{},facts:{},artifacts:{}};
  const base={contract_version:5,check_id:'check',repo:'fixture/source',checked_at:'2026-10-27T05:00:00Z',observed_head:head,remote_head:head,status:'changed',files:[],error:null},check={...base,check_hash:canonicalHash(base)};
  assert.throws(()=>proposeKnowledgeUpdateV5(current,candidate,check),/source|file|binding|coverage/i);
});

test('review: checked upstream bytes override unchanged candidate metadata for impact',()=>{
  const priorHead='a'.repeat(40),head='b'.repeat(40),priorHash='c'.repeat(64),actualHash='d'.repeat(64);
  const dependency={dependency_id:'score',path:'score.rs',material_hash:priorHash,evidence_material_path:'evidence.txt',evidence_content_hash:'e'.repeat(64),source_visibility:'public',wiring_status:'wired_reviewed'};
  const rule={rule_version_id:'rule-score',fact_version_refs:[],dependency_ids:['score'],review_status:'approved'};
  const current={catalog:{artifact_refs:[],fact_version_refs:[],rule_version_refs:['rule-score'],catalog_id:'prior',catalog_content_hash:'f'.repeat(64),upstream:{commit:priorHead}},dependencies:[dependency],rules:{'rule-score':rule},facts:{},artifacts:{}};
  const candidate={catalog:{artifact_refs:[],fact_version_refs:[],rule_version_refs:['rule-score'],catalog_id:'candidate',catalog_content_hash:'1'.repeat(64),upstream:{commit:head}},dependencies:[structuredClone(dependency)],rules:{'rule-score':structuredClone(rule)},facts:{},artifacts:{}};
  const base={contract_version:5,check_id:'check',repo:'fixture/source',checked_at:'2026-10-27T05:00:00Z',prior_head:priorHead,observed_head:head,remote_head:head,status:'changed',files:[{path:'score.rs',status:'present',sha256:actualHash,git_blob_oid:'2'.repeat(40),commit:head}],error:null};
  const check={...base,check_hash:canonicalHash(base)},proposal=proposeKnowledgeUpdateV5(current,candidate,check);
  assert.doesNotThrow(()=>validate('KnowledgeUpdateProposalV5',proposal));
  assert.deepEqual(proposal.dependency_diff.modified,['score']);
  assert.deepEqual(proposal.affected_rule_version_refs,['rule-score']);
  assert.deepEqual(proposal.gaps,['score']);
  assert.deepEqual(proposal.impact_limitations,[{dependency_id:'score',path:'score.rs',reason:'candidate_metadata_stale'}]);
  assert.deepEqual(proposal.source_bindings.map(({source_ref,file_sha256,material_hash})=>({source_ref,file_sha256,material_hash})),[{source_ref:'dependency:score',file_sha256:actualHash,material_hash:priorHash}]);
});

test('review: unchecked registered paths block activation instead of asserting no impact',()=>{
  const priorHead='a'.repeat(40),head='b'.repeat(40),dependency={dependency_id:'score',path:'score.rs',material_hash:'c'.repeat(64),source_visibility:'public',wiring_status:'wired_reviewed'};
  const current={catalog:{artifact_refs:[],fact_version_refs:[],rule_version_refs:[],catalog_id:'prior',catalog_content_hash:'d'.repeat(64),upstream:{commit:priorHead}},dependencies:[dependency],rules:{},facts:{},artifacts:{}};
  const candidate={catalog:{artifact_refs:[],fact_version_refs:[],rule_version_refs:[],catalog_id:'candidate',catalog_content_hash:'e'.repeat(64),upstream:{commit:head}},dependencies:[structuredClone(dependency)],rules:{},facts:{},artifacts:{}};
  const base={contract_version:5,check_id:'check',repo:'fixture/source',checked_at:'2026-10-27T05:00:00Z',prior_head:priorHead,observed_head:head,remote_head:head,status:'changed',files:[],error:null},check={...base,check_hash:canonicalHash(base)};
  const proposal=proposeKnowledgeUpdateV5(current,candidate,check);
  assert.deepEqual(proposal.impact_limitations,[{dependency_id:'score',path:'score.rs',reason:'not_checked_at_candidate_head'}]);
  assert.deepEqual(proposal.dependency_diff.potentially_modified,['score']);
  assert.deepEqual(proposal.gaps,['score']);
  const review={decision:'approved',purpose:'review_knowledge',subject_hash:proposal.proposal_hash,actual_result_hash:proposal.proposal_hash};
  assert.throws(()=>activateKnowledgeUpdateV5(current,candidate,proposal,{review_receipt:review,replay_results:[],check}),error=>error.code==='MISSING_EVIDENCE'&&error.path==='/gaps');
});
