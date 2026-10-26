import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runtimeUrl } from './helpers/runtime.mjs';

const {createDefaultConfig}=await import(runtimeUrl('scripts/lib/config.mjs'));
const {initializeState,loadState}=await import(runtimeUrl('scripts/lib/state.mjs'));
const {canonicalHash,textHash}=await import(runtimeUrl('scripts/lib/contracts.mjs'));
const {resolveGuidanceSubject}=await import(runtimeUrl('scripts/lib/v4-dispatch.mjs'));
const {catalogContentHash,applicationProposalHash}=await import(runtimeUrl('scripts/lib/knowledge.mjs'));
const {guidanceOutputContentHash,guidanceReviewSubjectHash}=await import(runtimeUrl('scripts/lib/guidance.mjs'));
const entry=fileURLToPath(runtimeUrl('scripts/x-ops.mjs')),packageDir=fileURLToPath(new URL('../assets/algorithm-knowledge/',import.meta.url));
const T='2026-10-27T03:00:00Z',account={handle:'fixture_guidance22',profile_url:'https://x.com/fixture_guidance22',user_id:null,identity_basis:'user_provided'};
const sha=value=>createHash('sha256').update(value).digest('hex');

function runCli(command,payload,dir,{runId=null}={}){
  const state=JSON.parse(spawnSync(process.execPath,['-e',`process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(dir,'account-state.json'))},'utf8'))`],{encoding:'utf8'}).stdout),input=join(dir,`request-${randomUUID()}.json`),output=join(dir,`output-${randomUUID()}.json`);
  writeFileSync(input,JSON.stringify({schema_version:1,run_id:runId,expected_revision:state.revision,payload}));
  const proc=spawnSync(process.execPath,[entry,command,'--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'});
  assert.equal(proc.error,undefined);return{exitCode:proc.status,envelope:JSON.parse(proc.stdout)};
}

async function fixture(){const dir=await mkdtemp(join(tmpdir(),'xops-guidance-cli-')),state=initializeState(createDefaultConfig(account),4);state.revision=1;await writeFile(join(dir,'account-state.json'),`${JSON.stringify(state,null,2)}\n`);return dir;}
function semantic(text){return{text_hashes:[textHash(text)],kept_user_fact_ids:[],claim_ids:[],new_claims_check:'未添加未映射主张',stance_voice_notes:['保留原判断'],reviewer:'fixture-draft-reviewer',reviewed_at:T,decision:'approve'};}
function draftPayload(text,{draftId=null,actual=null,deliveryIntent='operational_optimize'}={}){return{contract_version:3,draft_input:{draft_id:draftId,revision:1,parent_revision:null,card_id:null,original_text:text,original_ref:null,format:'short_post',texts:[text],fact_mapping:[],semantic_review:semantic(text)},personalization_mode:'none',personal_context_selection:null,supersedes_receipt_ref:null,...(actual?{actual_review_receipt_ref:actual}:{}),delivery_intent:deliveryIntent,as_of:T};}
async function recordDraftActual(dir,subjectHash,id='draft-actual'){
  const path=join(dir,`${id}.json`),actual={subject_hash:subjectHash,decision:'approve',review:semantic('给正在选工具的人：先核对数据口径。')},bytes=Buffer.from(JSON.stringify(actual));await writeFile(path,bytes);
  const receipt={receipt_id:id,status:'succeeded',operation:'review_draft',tool_name:'fixture-draft-review',host_call_ref:`call:${id}`,actual_result_ref:path,actual_result_sha256:sha(bytes),captured_at:T,binding_id:'fixture-binding',data_mode:'fixture',subject_hash:subjectHash};
  const result=runCli('record',{contract_version:3,operation:'host_media_receipt',data:receipt},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));return receipt;
}
async function saveOperationalDraft(dir){
  const text='给正在选工具的人：先核对数据口径。';let payload=draftPayload(text),result=runCli('draft-check',payload,dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.guidance_required,true);assert.equal(result.envelope.data.task_readiness,'not_ready');
  const preview=result.envelope.data,actual=await recordDraftActual(dir,preview.review_receipt.subject_hash);payload=draftPayload(text,{draftId:preview.draft.draft_id,actual:actual.receipt_id});result=runCli('draft-check',payload,dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.readiness,'ready');assert.equal(result.envelope.data.task_readiness,'not_ready');
  const ready=result.envelope.data;result=runCli('record',{contract_version:3,operation:'draft_review',data:{draft:ready.draft,review_receipt:ready.review_receipt},as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.guidance_required,true);assert.equal(result.envelope.data.task_readiness,'not_ready');return{draft:ready.draft,review:ready.review_receipt,context:result.envelope.data.rule_context,subjectRef:`${ready.draft.draft_id}:${ready.draft.revision}`};
}
async function candidatePackage(dir){const target=join(dir,'candidate-package');await cp(packageDir,target,{recursive:true});const path=join(target,'catalog.json'),catalog=JSON.parse(await readFile(path,'utf8'));catalog.catalog_id='x-algorithm-candidate-fixture';catalog.catalog_version='1.2.0';const eventPath=join(target,catalog.activation_event_path),event=JSON.parse(await readFile(eventPath,'utf8'));event.catalog_ref=catalog.catalog_id;event.event_id='candidate-event-fixture';event.event_type='candidate_update';await writeFile(eventPath,JSON.stringify(event));catalog.catalog_content_hash=catalogContentHash(catalog,catalog.dependencies);await writeFile(path,`${JSON.stringify(catalog,null,2)}\n`);return{target,catalog};}
async function recordGuidanceActual(dir,{id,subjectHash,decision,checks,issues,generator='independent-guidance-review'}){const path=join(dir,`${id}.json`),actual={subject_hash:subjectHash,decision,checks,issues,generator_ref:generator},bytes=Buffer.from(JSON.stringify(actual));await writeFile(path,bytes);const receipt={contract_version:4,receipt_id:id,operation:'review_guidance',subject_hash:subjectHash,actual_result_ref:path,actual_result_sha256:sha(bytes),generator_ref:generator,tool_name:'fixture-guidance-review',data_mode:'fixture',decision,checks,issues,reviewed_at:T};const result=runCli('record',{contract_version:4,operation:'guidance_review_result',data:receipt,as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));return receipt;}

test('knowledge CLI keeps candidates inactive and guidance records survive a fresh process with an exact task gate',async()=>{
 const dir=await fixture();try{
  let result=runCli('knowledge-step',{contract_version:4,operation:'seed',as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.catalog.catalog_id,'x-algorithm-public-v4');
  result=runCli('knowledge-step',{contract_version:4,operation:'explain',as_of:T},dir);assert.equal(result.exitCode,0);assert.equal(result.envelope.data.catalog.catalog_id,'x-algorithm-public-v4');
  const saved=await saveOperationalDraft(dir),candidate=await candidatePackage(dir);
  result=runCli('knowledge-step',{contract_version:4,operation:'seed',package_dir:candidate.target,as_of:T},dir);assert.notEqual(result.exitCode,0);assert.equal(result.envelope.errors[0].code,'INVALID_INPUT');
  const selectInput={context_id:'candidate-select-check',run_id:'draft-guidance',intent:'draft',goal:'relevant_reach',use:'operational_guidance',subject_ref:saved.subjectRef,cutoff:T,explicit_rule_version_refs:['operational-op01-v1'],signals:{has_body:{value:true,unit:'flag'},reader_benefit_clear:{value:false,unit:'flag'}}};
  result=runCli('knowledge-step',{contract_version:4,operation:'select',package_dir:candidate.target,input:selectInput,as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.catalog_ref,'x-algorithm-public-v4');
  result=runCli('knowledge-step',{contract_version:4,operation:'propose-update',package_dir:candidate.target,head_commit:candidate.catalog.upstream.commit,as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));const proposal=result.envelope.data;
  result=runCli('knowledge-step',{contract_version:4,operation:'activate',package_dir:candidate.target,proposal,review_receipt:{receipt_id:'candidate-review-denied',subject_hash:candidate.catalog.catalog_content_hash,decision:'revision_required'},case_results:[],as_of:T},dir);assert.notEqual(result.exitCode,0);assert.equal(result.envelope.errors[0].code,'MISSING_EVIDENCE');
  result=runCli('knowledge-step',{contract_version:4,operation:'explain',as_of:T},dir);assert.equal(result.envelope.data.catalog.catalog_id,'x-algorithm-public-v4');

  let state=await loadState(dir),context=state.rule_contexts[saved.context.context_id]??saved.context;assert.equal(context.catalog_ref,'x-algorithm-public-v4');const ruleRef=context.selections[0].rule_version_ref,subjectHash=resolveGuidanceSubject(state,saved.subjectRef).content_hash;
  const application={contract_version:4,application_id:'application-cli',context_ref:context.context_id,selected_rule_context_hash:context.selected_rule_context_hash,subject_ref:saved.subjectRef,actual_input_hash:subjectHash,rule_version_refs:[ruleRef],checks:[{check_id:'actual-copy',check_type:'semantic',status:'applicable',reviewed_input_hash:subjectHash,inspected_refs:[saved.subjectRef],finding:'开头已明确读者'}],findings:['开头已明确读者'],actions:[{action_id:'keep-opening',rule_version_ref:ruleRef,disposition:'keep',text:'保持当前明确开头',deliverable_refs:[saved.subjectRef]}],keep_unchanged_reason:'原稿已经清楚',validation_plan:'发布后按同一窗口观察有效回复',deliverable_refs:[saved.subjectRef],application_proposal_hash:''};application.application_proposal_hash=applicationProposalHash(application);
  result=runCli('record',{contract_version:4,operation:'rule_application',data:application,as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));
  const output={contract_version:4,output_id:'guidance-cli',delivery_id:'delivery-cli',goal:context.goal,use:context.use,guidance_text:'保持当前开头；它已经说明目标读者。发布后按同一窗口观察有效回复。目前无法确认内部推荐条件。',actions:['保持当前开头'],rationale:['目标读者已经明确'],observation_plan:['同一窗口观察有效回复'],gaps:['内部推荐条件未知'],deliverable_refs:[saved.subjectRef],generator_ref:'guidance-writer',output_content_hash:'',created_at:T};output.output_content_hash=guidanceOutputContentHash(output);
  result=runCli('record',{contract_version:4,operation:'guidance_output',data:output,as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));
  const binding={delivery_id:output.delivery_id,subject_ref:saved.subjectRef,subject_content_hash:subjectHash,output_material_ref:output.output_id,output_content_hash:output.output_content_hash,personal_context_selection_hash:context.personal_context_selection_hash,personal_context_absence_reason:context.personal_context_absence_reason,selected_rule_context_hash:context.selected_rule_context_hash,application_ref:application.application_id,application_proposal_hash:application.application_proposal_hash},reviewSubject=guidanceReviewSubjectHash(binding);
  const deniedActual=await recordGuidanceActual(dir,{id:'guidance-actual-denied',subjectHash:reviewSubject,decision:'revision_required',checks:{action_matches:false,evidence_bounded:true},issues:['动作与交付不一致']});
  const falseApproval={contract_version:4,receipt_id:'guidance-false-approved',...binding,review_subject_hash:reviewSubject,actual_review_receipt_ref:deniedActual.receipt_id,decision:'approved',checks:{action_matches:true,evidence_bounded:true},issues:[],reviewed_at:T,supersedes_receipt_ref:null};result=runCli('record',{contract_version:4,operation:'guidance_receipt',data:falseApproval,as_of:T},dir);assert.notEqual(result.exitCode,0);assert.equal(result.envelope.errors[0].code,'RECEIPT_CONFLICT');
  const approvedActual=await recordGuidanceActual(dir,{id:'guidance-actual-approved',subjectHash:reviewSubject,decision:'approved',checks:{action_matches:true,evidence_bounded:true},issues:[]}),approved={...falseApproval,receipt_id:'guidance-approved',actual_review_receipt_ref:approvedActual.receipt_id};result=runCli('record',{contract_version:4,operation:'guidance_receipt',data:approved,as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));
  result=runCli('record',{contract_version:3,operation:'draft_review',data:{draft:saved.draft,review_receipt:saved.review},as_of:T},dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.guidance_readiness.readiness,'ready');assert.equal(result.envelope.data.task_readiness,'ready');
  state=await loadState(dir);assert(state.guidance_receipts[approved.receipt_id]);assert.equal(state.guidance_receipts[falseApproval.receipt_id],undefined);assert.equal(state.rule_applications[application.application_id].application_proposal_hash,application.application_proposal_hash);

  const plain=draftPayload('只做普通润色。',{deliveryIntent:'plain_edit'});result=runCli('draft-check',plain,dir);assert.equal(result.exitCode,0,JSON.stringify(result.envelope.errors));assert.equal(result.envelope.data.guidance_required,false);assert.equal(result.envelope.data.task_readiness,'not_ready');assert.equal(result.envelope.data.readiness,'needs_review');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('live guidance review cannot claim a future execution time',async()=>{
 const {verifyGuidanceActual}=await import(runtimeUrl('scripts/lib/v4-dispatch.mjs'));
 const receipt={contract_version:4,receipt_id:'future-review-negative-fixture',operation:'review_guidance',subject_hash:'b'.repeat(64),actual_result_ref:'/fixture/future-result-not-read.json',actual_result_sha256:'a'.repeat(64),generator_ref:'independent-fixture',tool_name:'fixture-review',data_mode:'live',decision:'approved',checks:{read:true},issues:[],reviewed_at:new Date(Date.now()+60000).toISOString()};
 await assert.rejects(verifyGuidanceActual(receipt),error=>error.code==='INVALID_INPUT'&&error.path==='/reviewed_at');
});
