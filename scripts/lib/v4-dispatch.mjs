import {actionPlanHash,actionPlanContent,actionOriginatingProposalRef,materializeCoachingActions,finalizeMaterializedCoaching} from './actions.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {goalSnapshotFromState,validatePersonalContextSelection} from './consumer-context.mjs';
import {evaluateDraftReadiness} from './draft.mjs';
import {validate,canonicalHash,ContractError} from './contracts.mjs';
import {commitState,putImmutable,persistenceStatus} from './state.mjs';
import {loadKnowledgeCatalog,knowledgeBundleFromState,buildRuleContextV4,validateRuleApplication,proposeKnowledgeUpdate,activateKnowledgeCatalog} from './knowledge.mjs';
import {seedKnowledgeState} from './knowledge-state.mjs';
import {validateGuidanceOutput,validateGuidanceReceipt,evaluateCurrentDeliverable} from './guidance.mjs';
import {prepareCoachingV4,validateCoachingProposalV4} from './coaching.mjs';
import {buildReviewComputationV4} from './review.mjs';
import {applyExperimentTransitionV4,buildPersonalPatternFromReviewV4,createExperimentFromAction} from './experiments.mjs';
const fail=(code,path,message)=>{throw new ContractError(code,path,message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function validateContextPersonal(state,context){
  if(!context.personal_context_selection_hash){if(context.personal_context_selection)fail('RECEIPT_CONFLICT','/personal_context_selection','Personal selection must have its actual hash');return;}
  if(!context.personal_context_selection)fail('MISSING_EVIDENCE','/personal_context_selection','Actual personal selection must be saved with this context');
  const selection=validatePersonalContextSelection(state,context.personal_context_selection,{goal_hash:canonicalHash(context.goal),brief_or_use_hash:canonicalHash({intent:context.intent,use:context.use,subject_ref:context.subject_ref}),requested_use:context.use,post_version_refs:[],selection_policy_version:'personal-context-v3'});
  if(selection.selection_hash!==context.personal_context_selection_hash)fail('RECEIPT_CONFLICT','/personal_context_selection_hash','Personal context does not bind the actual selected evidence');
}
export function resolveGuidanceSubject(state,ref){
  for(const key of ['drafts','content_packs'])for(const [id,entry] of Object.entries(state[key]??{}))for(const [revision,value]of Object.entries(entry.revisions??{}))if(ref===`${id}:${revision}`){if(key==='content_packs')return{ref,content_hash:value.pack_content_hash};const current=evaluateDraftReadiness({draft_id:id,revision:Number(revision)},null,state);return{ref,content_hash:canonicalHash({texts:value.texts,format:value.format,original_text:value.original_text,original_ref:value.original_ref,evidence_mapping_hash:current.evidence_mapping_hash,personal_context_selection_hash:current.personal_context_selection_hash})};}
  const report=state.coaching_reports?.[ref];
  if(report?.actions)return{ref,content_hash:canonicalHash({report,action_plans:report.actions.map(a=>state.actions[a.action_id]?actionPlanContent(state.actions[a.action_id]):{missing_action:a.action_id})})};
  for(const key of ['coaching_runs','coaching_reports','review_computations','experiment_reviews','topic_cards','analyses','runs'])if(state[key]?.[ref])return{ref,content_hash:canonicalHash(state[key][ref])};
  fail('MISSING_EVIDENCE','/subject_ref','The exact deliverable must exist before guidance is frozen');
}
export async function verifyGuidanceActual(receipt){
  validate('HostGuidanceReviewReceiptV4',receipt);
  if(receipt.data_mode==='live'&&Date.parse(receipt.reviewed_at)>Date.now())fail('INVALID_INPUT','/reviewed_at','A live review cannot claim a future execution time');
  const bytes=await readFile(receipt.actual_result_ref);
  if(hash(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/actual_result_sha256','Independent review bytes changed');
  const actual=JSON.parse(bytes.toString('utf8'));
  for(const key of ['subject_hash','decision','checks','issues','generator_ref'])if(canonicalHash(actual[key])!==canonicalHash(receipt[key]))fail('RECEIPT_CONFLICT',`/${key}`,'Recorded independent review differs from the actual result');
  return receipt;
}
export async function currentGuidance(state,subjectRef,{intent,use,goal=goalSnapshotFromState(state),content_readiness}={}){
  if(state.schema_version===5){const {currentGuidanceV5}=await import('./v5-dispatch.mjs');const gate=await currentGuidanceV5(state,subjectRef,{intent,use,goal});return{content_readiness,guidance_readiness:gate,guidance_required:use!=='plain_edit',task_readiness:gate.readiness==='ready'&&content_readiness?.readiness==='ready'?'ready':'not_ready',limitations:[]};}
  const subject=resolveGuidanceSubject(state,subjectRef),active=knowledgeBundleFromState(state);
  const contexts=Object.values(state.rule_contexts??{}).filter(c=>{try{validateContextPersonal(state,c);}catch{return false;}if(canonicalHash(c.goal)!==canonicalHash(goal)||c.subject_ref!==subjectRef||intent&&c.intent!==intent||use&&c.use!==use)return false;if(c.catalog_ref===active.catalog.catalog_id&&c.catalog_content_hash===active.catalog.catalog_content_hash)return true;if(!c.signals)return false;return buildRuleContextV4({...c,signals:c.signals},active).selected_rule_context_hash===c.selected_rule_context_hash;});
  const receiptList=Object.values(state.guidance_receipts??{}),superseded=new Set(receiptList.map(r=>r.supersedes_receipt_ref).filter(Boolean));
  const candidates=receiptList.filter(r=>r.subject_ref===subjectRef&&r.subject_content_hash===subject.content_hash&&!superseded.has(r.receipt_id)).map(receipt=>{
    const application=state.rule_applications[receipt.application_ref],context=contexts.find(c=>c.context_id===application?.context_ref),output=state.guidance_outputs[receipt.output_material_ref];return{receipt,application,context,output};
  }).filter(x=>x.context&&x.output&&x.application.actual_input_hash===subject.content_hash).sort((a,b)=>Date.parse(b.output.created_at)-Date.parse(a.output.created_at));
  const selected=candidates[0],conflict=selected&&candidates.some(c=>c!==selected&&c.output.created_at===selected.output.created_at&&c.output.output_content_hash!==selected.output.output_content_hash);
  const actualReviewReceipts={},limitations=[];
  for(const r of Object.values(state.host_media_receipts??{}))if(r.contract_version===4)try{actualReviewReceipts[r.receipt_id]=await verifyGuidanceActual(r);}catch(error){limitations.push({code:error.code??'MISSING_EVIDENCE',receipt_ref:r.receipt_id,reason:error.message});}
  const gate=evaluateCurrentDeliverable({intent:intent??selected?.context.intent,use:use??selected?.context.use,content_readiness,guidance:conflict?{}:{subject,application:selected?.application,context:selected?.context,output:selected?.output,receipts:receiptList,actualReviewReceipts}});
  return{...gate,limitations};
}
export async function approvedProposalActionView(state,proposalRef){
  const report=state.coaching_reports?.[proposalRef];if(!report)fail('MISSING_EVIDENCE','/proposal_ref','Saved proposal is required');
  const run=state.coaching_runs[report.run_ref],original=state.rule_contexts[run?.rule_context_ref],goal=original?.goal??goalSnapshotFromState(state),use=original?.use??run?.use??'coaching';
  const gate=await currentGuidance(state,proposalRef,{intent:'coach',use,goal,content_readiness:{readiness:'ready'}});
  const hashes=report.actions.map(a=>{const action=state.actions[a.action_id];if(!action)fail('MISSING_EVIDENCE','/actions','Complete action plans must be materialized before approval');return actionPlanHash(action);});
  return {readiness:gate.task_readiness==='ready'?'ready':'needs_review',subject_ref:proposalRef,action_plan_hashes:hashes,active_receipt_ref:gate.guidance_readiness.active_receipt_ref};
}
export async function approvedActionView(state,actionId){
  if(state.schema_version===5){const {approvedActionViewV5}=await import('./v5-dispatch.mjs');return approvedActionViewV5(state,actionId);}
  const proposalRef=actionOriginatingProposalRef(state,actionId);return proposalRef?approvedProposalActionView(state,proposalRef):null;
}
export async function dispatchV4(command,request,dir,state){
  const p=request.payload;
  if(command==='state-migrate'){const {migrateStateV4}=await import('./migrations.mjs');return migrateStateV4(dir,p,request.expected_revision);}
  if(!state||![4,5].includes(state.schema_version))fail('MIGRATION_REQUIRED','/schema_version','Preview and apply state 4 migration before new work');
  if(command==='review'){
    let result;const next=await commitState(dir,request.expected_revision,working=>{
      if(p.operation==='compute'){const plan=working.experiment_plan_views[p.plan_view_ref];if(!plan)fail('MISSING_EVIDENCE','/plan_view_ref','Plan view missing');result=buildReviewComputationV4(working,plan,p);putImmutable(working.review_computations,result.computation_id,result);return working;}
      const advanced=applyExperimentTransitionV4(working,p.event);result={experiment:advanced.experiments[p.event.experiment_id]};return advanced;
    });return{state:next,data:p.operation==='compute'?{review_computation:result}:result};
  }
  if(command==='coach-step'){
    if(p.operation==='finalize'){const proof=await approvedProposalActionView(state,p.proposal_ref);return{state,data:finalizeMaterializedCoaching(state,{proposal_ref:p.proposal_ref,action_ids:p.action_ids,approved_guidance:proof})};}
    if(p.operation==='materialize'){let result;const next=await commitState(dir,request.expected_revision,working=>{const advanced=materializeCoachingActions(working,{proposal_ref:p.proposal_ref,actions:p.actions,created_at:p.as_of});result=advanced.result;return advanced.nextState;});return{state:next,data:result};}
    let result;const next=await commitState(dir,request.expected_revision,working=>{
      const bundle=knowledgeBundleFromState(working);
      if(p.operation==='prepare'){result=prepareCoachingV4(working,p.request,{catalog:bundle});putImmutable(working.coaching_runs,result.run.run_id,result.run);putImmutable(working.evidence_bundles,result.evidence_bundle.bundle_id,result.evidence_bundle);putImmutable(working.rule_contexts,result.rule_context.context_id,result.rule_context);return working;}
      const proposal=p.proposal,run=working.coaching_runs[proposal.run_ref];if(!run)fail('MISSING_EVIDENCE','/run_ref','Prepare this coaching run first');result=validateCoachingProposalV4(proposal,{run,state:working,evidence_bundle:working.evidence_bundles[run.evidence_bundle_ref],rule_context:working.rule_contexts[run.rule_context_ref]});putImmutable(working.coaching_reports,result.proposal_id,result);return working;
    });return{state:next,data:{...result,guidance_readiness:'needs_review',task_readiness:'not_ready'}};
  }
  if(command==='knowledge-step'){
    const bundle=loadKnowledgeCatalog(p.package_dir);
    if(p.operation==='explain'){const active=knowledgeBundleFromState(state);return{state,data:{catalog:active.catalog,coverage:active.catalog.coverage,rules:active.rules,limitations:['Only the explicitly reviewed source subset is verified; production-effective configuration is unknown.']}};}
    let result;const next=await commitState(dir,request.expected_revision,working=>{
      if(p.operation==='seed'){if(p.package_dir)fail('INVALID_INPUT','/package_dir','Seed uses only the installed verified package; candidates require reviewed activation');const current=Object.keys(working.knowledge_catalogs).length?knowledgeBundleFromState(working):null;if(!current)seedKnowledgeState(working);const active=current??knowledgeBundleFromState(working);result={catalog:active.catalog,coverage:active.catalog.coverage};}
      else if(p.operation==='select'){validateContextPersonal(working,p.input);result=validate('RuleContextV4',buildRuleContextV4(p.input,knowledgeBundleFromState(working)));resolveGuidanceSubject(working,result.subject_ref);putImmutable(working.rule_contexts,result.context_id,result);}
      else if(p.operation==='propose-update'){result=proposeKnowledgeUpdate(knowledgeBundleFromState(working),bundle,{checked_at:p.as_of,head_commit:p.head_commit});putImmutable(working.knowledge_events,result.event.event_id,result.event);}
      else if(p.operation==='activate'){if(canonicalHash(p.proposal?.candidate_catalog)!==canonicalHash(bundle.catalog))fail('RECEIPT_CONFLICT','/proposal/candidate_catalog','Activation must use the exact verified candidate package');result=activateKnowledgeCatalog(knowledgeBundleFromState(working),p.proposal,{review_receipt:p.review_receipt,case_results:p.case_results});seedKnowledgeState(working,bundle,{activate:false});putImmutable(working.knowledge_events,result.event.event_id,result.event);}
      return working;
    });return{state:next,data:result};
  }
  if(command==='collection-step'){
    const {dispatchCollectionV4,verifyCollectionMaterialV4}=await import('./collection.mjs');
    const context={};
    if(p.operation==='ingest'&&p.result_kind==='material')context.verified_material=await verifyCollectionMaterialV4(p,state);
    if(p.operation==='ingest'&&p.result_kind==='seal'){context.verified_import_receipts={};for(const link of p.import_links){const raw=JSON.parse(await readFile(link.import_receipt_path,'utf8'));const receipt=raw.data?.import_receipt??raw;context.verified_import_receipts[link.import_batch_ref]={actual_result_ref:link.import_receipt_path,receipt,receipt_hash:canonicalHash(receipt)};}}
    if(['finalize','resume'].includes(p.operation)){let saved=null;try{saved=JSON.parse(await readFile(new URL('file://'+dir+'/persistence-receipt.json'),'utf8'));}catch{}context.persistence_verified={state_revision:state.revision,state_hash:canonicalHash(state),actual_readback_verified:await persistenceStatus(dir,state)==='saved',receipt_ref:saved?`persistence-sha256:${canonicalHash(saved)}`:null};}
    const advanced=dispatchCollectionV4(state,p,context);if(!advanced.changed)return{state,data:advanced.result};
    const next=await commitState(dir,request.expected_revision,()=>advanced.nextState);return{state:next,data:advanced.result};
  }
  if(command==='record'){
    if(p.operation==='experiment_plan'){const proof=await approvedActionView(state,p.data.originating_action_id);let result;const next=await commitState(dir,request.expected_revision,working=>{const advanced=createExperimentFromAction(working,{experiment:p.data,approved_guidance:proof});result=advanced.result;return advanced.nextState;});return{state:next,data:result};}
    const d=p.data;let next=await commitState(dir,request.expected_revision,async working=>{
      if(p.operation==='guidance_review_result'){await verifyGuidanceActual(d);putImmutable(working.host_media_receipts,d.receipt_id,d);}
      else if(p.operation==='rule_application'){const context=working.rule_contexts[d.context_ref];if(!context)fail('MISSING_EVIDENCE','/context_ref','Rule selection is missing');validateContextPersonal(working,context);const personalUsed=d.checks.some(check=>check.inspected_refs.some(ref=>working.user_facts[ref]||working.post_versions[ref]||working.content_analyses[ref]));if(personalUsed&&!context.personal_context_selection_hash)fail('MISSING_EVIDENCE','/context_ref','Checks consuming personal account material must bind the actual personal selection');const active=knowledgeBundleFromState(working);if(context.catalog_ref!==active.catalog.catalog_id||context.catalog_content_hash!==active.catalog.catalog_content_hash)fail('STALE_BUNDLE','/context_ref','Re-select rules from the active catalog');const subject=resolveGuidanceSubject(working,d.subject_ref);if(subject.content_hash!==d.actual_input_hash)fail('STALE_BUNDLE','/actual_input_hash','Rule checks must bind the current exact deliverable');validateRuleApplication(d,context,knowledgeBundleFromState(working));putImmutable(working.rule_applications,d.application_id,d);}
      else if(p.operation==='guidance_output'){validateGuidanceOutput(d);for(const ref of d.deliverable_refs)resolveGuidanceSubject(working,ref);putImmutable(working.guidance_outputs,d.output_id,d);}
      else if(p.operation==='guidance_receipt'){const output=working.guidance_outputs[d.output_material_ref],application=working.rule_applications[d.application_ref],context=working.rule_contexts[application?.context_ref],actual=working.host_media_receipts[d.actual_review_receipt_ref];if(!output||!application||!context||!actual)fail('MISSING_EVIDENCE','/data','Guidance dependencies must be saved first');await verifyGuidanceActual(actual);validateGuidanceReceipt(d,{output,application,context,subject:resolveGuidanceSubject(working,d.subject_ref),actualReviewReceipt:actual,receipts:Object.values(working.guidance_receipts)});putImmutable(working.guidance_receipts,d.receipt_id,d);}
      else if(p.operation==='personal_pattern'){const actual=buildPersonalPatternFromReviewV4(working,{...d,review_ref:d.review_refs[0]});if(canonicalHash(actual)!==canonicalHash(d))fail('RECEIPT_CONFLICT','/data','Personal pattern differs from verified review');putImmutable(working.personal_patterns,d.pattern_id,d);}
      return working;
    });return{state:next,data:{record_refs:[d.receipt_id??d.application_id??d.output_id??d.pattern_id],state_revision:next.revision}};
  }
  fail('INVALID_INPUT','/command','Unsupported state 4 command');
}
