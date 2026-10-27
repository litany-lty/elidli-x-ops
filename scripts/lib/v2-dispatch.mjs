import { approvedActionView } from './v4-dispatch.mjs';
import {actionRequiresCurrentApproval} from './actions.mjs';
import { canonicalStateInput } from './state-input.mjs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalHash, textHash, validate, summarizeRun, ContractError } from './contracts.mjs';
import { loadState, commitState, persistenceStatus } from './state.mjs';
import { inspectImport, normalizeImport, mergeImport, decodeImportMaterial } from './imports.mjs';
import { analyzeAccountV2 } from './account.mjs';
import { advanceCoaching, validateRuleVersionV2 } from './coaching.mjs';
import { applyExperimentTransition, applyActionDecision } from './experiments.mjs';
import { buildReviewV2, reviewV2RunResult } from './review.mjs';
import { migrateState } from './migrations.mjs';
import { verifyCollectionReceipt } from './collection.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message);};
const values=x=>Object.values(x??{});
function selectedRefs(value) {
  if(!value||typeof value!=='object')return[];
  return [...(value.selected_observation_refs??[]),...Object.values(value).flatMap(item=>typeof item==='object'?selectedRefs(item):[])];
}
export {canonicalStateInput} from './state-input.mjs';

export function coachingRunResult(state,runId,persistence='unverified') {
  const run=state.coaching_runs[runId];
  if(!run)fail('MISSING_EVIDENCE','/run_id','Coaching run is missing');
  const report=state.coaching_reports?.[run.report_ref];
  const bundle=state.evidence_bundles[run.active_bundle_id];
  const requested=bundle.requested_deliverables;
  const stages=requested.map(name=>({stage:name,required:true,status:report?.deliverable_status[name]==='complete'?'passed':'not_run',evidence_refs:report?[report.report_id]:[],reason:report?.deliverable_status[name]==='complete'?null:`${name} 尚未完成或材料不充分`}));
  stages.push({stage:'semantic_review',required:true,status:run.status==='delivered'?'passed':'not_run',evidence_refs:run.semantic_review?[run.semantic_review.review_id]:[],reason:run.status==='delivered'?null:'尚待当前提案独立语义复核'},
    {stage:'persistence',required:true,status:persistence==='saved'?'passed':'not_run',evidence_refs:[],reason:persistence==='saved'?null:'尚待真实保存回读凭据'});
  return summarizeRun(stages,{contract_version:2,requested_deliverables:requested},{run_id:runId,intent:'coaching',effective_config_hash:canonicalHash(state.config),as_of:run.request.analysis_cutoff,
    delivered_scope:{contract_version:2,requested_deliverables:requested.filter(name=>report?.deliverable_status[name]==='complete')},deliverable_refs:report?[report.report_id]:[],limitations:report?.limitations??bundle.computed_limitations,
    has_progress:true,has_findings:Boolean(report),persistence_status:persistence,stop_reason:run.status});
}

async function importData(payload,request,stateDir,state) {
  const bytes=await readFile(payload.material_path,'utf8');
  // JSON parsing never executes the optional archive JS wrapper.
  const {content}=decodeImportMaterial(payload.material_kind,Buffer.from(bytes));
  const material={kind:payload.material_kind,content,source_ref:payload.source_ref,raw_text:bytes,sha256:textHash(bytes)};
  const preview=inspectImport(material,payload.declared_context);
  if(payload.operation==='preview')return{state,data:{import_preview:preview}};
  if(!state)fail('MISSING_EVIDENCE','/state','Initialize the target account first');
  if(payload.preview_hash!==preview.preview_hash)fail('RECEIPT_CONFLICT','/preview_hash','Material or import interpretation changed after preview');
  const normalized=normalizeImport(preview,material,state.account,payload.declared_context);
  const artifactHash=textHash(bytes),path=join(stateDir,'artifacts',`${artifactHash}.material`);
  await mkdir(join(stateDir,'artifacts'),{recursive:true,mode:0o700});
  try {await writeFile(path,bytes,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;if(textHash(await readFile(path,'utf8'))!==artifactHash)fail('RECEIPT_CONFLICT','/artifact','Stored material differs');}
  let receipt;
  const next=await commitState(stateDir,request.expected_revision,working=>{
    const artifact=working.import_artifacts[preview.artifact_sha256];working.import_artifacts[preview.artifact_sha256]=artifact?{...artifact,source_refs:[...new Set([...(artifact.source_refs??[artifact.source_ref]),payload.source_ref])].sort()}:{artifact_sha256:artifactHash,path,source_ref:payload.source_ref,source_refs:[payload.source_ref],material_kind:payload.material_kind};
    const merged=mergeImport(working,normalized);receipt=merged.receipt;return merged.nextState;
  });
  return{state:next,data:{import_receipt:receipt,artifact_sha256:artifactHash}};
}

export async function dispatchV2(command,request,stateDir,state) {
  const payload=request.payload;
  if(command==='state-migrate')return migrateState(stateDir,payload,request.expected_revision);
  if(command==='data-import')return importData(payload,request,stateDir,state);
  if(!state)fail('MISSING_EVIDENCE','/state','Initialize the target account first');
  if(state.schema_version<2)fail('MIGRATION_REQUIRED','/state/schema_version','Preview and apply migration before V2 analysis');
  if(command==='account-analyze') {
    const result=analyzeAccountV2(canonicalStateInput(state,payload.as_of),payload.request);
    const deliverables=Object.keys(result.deliverable_status);
    const evidenceRefs=[...new Set(selectedRefs(result))];
    const progress=evidenceRefs.length>0||Object.values(result.deliverable_status).some(status=>status==='complete');
    const runResult=summarizeRun(deliverables.map(name=>({stage:name,required:true,status:result.deliverable_status[name]==='complete'?'passed':'failed',evidence_refs:[],reason:result.deliverable_status[name]==='complete'?null:'Requested calculation lacks compatible observations'})),{contract_version:2,requested_deliverables:deliverables},
      {run_id:request.run_id??`analysis:${canonicalHash(result)}`,intent:'account_analysis',effective_config_hash:canonicalHash(state.config),as_of:payload.as_of,delivered_scope:{contract_version:2,requested_deliverables:deliverables.filter(name=>result.deliverable_status[name]==='complete')},has_progress:progress,has_findings:progress,deliverable_refs:evidenceRefs,limitations:result.limitations,persistence_status:'unverified'});
    return{state,data:{account_result:result,run_result:runResult}};
  }
  if(command==='review') {const result=buildReviewV2(payload.review_input,state);return{state,data:{review_result:result,run_result:reviewV2RunResult(payload.review_input,result,state,request.run_id)}};}
  if(command==='coach-step') {
    if(payload.run_id&&request.run_id&&payload.run_id!==request.run_id)fail('STATE_CONFLICT','/run_id','Envelope and payload run IDs must match');
    let data;
    const next=await commitState(stateDir,request.expected_revision,working=>{const advanced=advanceCoaching(working,payload,request.run_id);data=advanced.result;return advanced.state;});
    data.state_revision=next.revision;
    data.run_result=coachingRunResult(next,data.run.run_id,await persistenceStatus(stateDir,next));
    return{state:next,data};
  }
  if(command==='record') {
    const actionId=payload.operation==='action_decision'?payload.data.action_id:payload.operation==='experiment'?state.experiments?.[payload.data.experiment_id]?.originating_action_id:null;
    const needsApproval=actionId&&actionRequiresCurrentApproval(state,actionId)&&((payload.operation==='action_decision'&&payload.data.decision==='accepted')||(payload.operation==='experiment'&&payload.data.type==='accept'));
    const approval=needsApproval?await approvedActionView(state,actionId):null;
    let refs=[];
    if(payload.operation==='collection_receipt')await verifyCollectionReceipt(payload.data,state.account);
    const next=await commitState(stateDir,request.expected_revision,working=>{
      if(payload.operation==='rule_version') {const rule=validateRuleVersionV2(payload.data,working);working.rule_versions_v2[rule.rule_version_id]=rule;refs=[rule.rule_version_id];return working;}
      if(payload.operation==='collection_receipt') {const receipt=payload.data,previous=working.collection_receipts[receipt.receipt_id];if(previous&&canonicalHash(previous)!==canonicalHash(receipt))fail('RECEIPT_CONFLICT','/receipt_id','Collection receipt is immutable');working.collection_receipts[receipt.receipt_id]=receipt;refs=[receipt.receipt_id];return working;}
      if(payload.operation==='experiment') {const result=applyExperimentTransition(working,payload.data,{...payload.actual_evidence,approved_guidance:approval});refs=[payload.data.experiment_id];return result;}
      if(payload.operation==='action_decision') {
        const result=applyActionDecision(working,payload.data,{approved_guidance:approval});refs=[payload.data.action_id];return result;
      }
      fail('INVALID_INPUT','/operation','Unsupported V2 record operation');
    });
    return{state:next,data:{record_refs:refs}};
  }
  fail('INVALID_INPUT','/command','Unsupported V2 command');
}
