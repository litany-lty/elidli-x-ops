import {goalSnapshotFromState} from './consumer-context.mjs';
import {canonicalHash} from './contracts.mjs';
import {knowledgeBundleFromState,buildRuleContextV4} from './knowledge.mjs';
import {commitState,putImmutable} from './state.mjs';
import {currentGuidance,resolveGuidanceSubject} from './v4-dispatch.mjs';

/** One final gate for all public payload versions. Internal drafting remains usable. */
export async function guardDeliveryV4(command,request,dir,result){
  let {state,data}=result;const p=request.payload;
  if(state?.schema_version!==4||!data)return result;
  let subjectRef,intent,use,contentReadiness;
  if(command==='content-step'&&['finalize','resume','restore'].includes(p.operation)){
    const run=state.content_runs[p.run_id];subjectRef=run?.active_pack_ref;
    intent=run?.delivery_intent??'operational_optimize';use=run?.delivery_use??'operational_guidance';contentReadiness=data.pack_readiness??{readiness:data.run?.status==='ready'?'ready':'incomplete'};
  }else if(command==='coach-step'){if(p.operation==='prepare')return{state,data:{...data,task_readiness:'not_ready',guidance_required:true}};subjectRef=data.proposal_id??data.run?.report_ref;if(!subjectRef)return{state,data:{...data,task_readiness:'not_ready',guidance_required:true,source_compatibility:{contract_version:p.contract_version,run_ref:data.run?.run_id??request.run_id}}};intent='coach';use='coaching';contentReadiness={readiness:p.operation==='propose'||data.run_result?.execution_status==='complete'?'ready':'incomplete'};
  }else if(command==='review'){if(p.contract_version!==4)return{state,data:{...data,...(data.run_result?{run_result:{...data.run_result,execution_status:'partial',limitations:[...(data.run_result.limitations??[]),'Current operational guidance requires independent review']}}:{}),task_readiness:'not_ready',guidance_required:true,user_summary:'当前为兼容版本的复盘计算，完整运营指导尚需独立审核。'}};subjectRef=p.event?.type==='close'?p.event.review_id:data.review_computation?.computation_id??p.event?.computation_ref;intent='review';use='performance_review';contentReadiness={readiness:'ready'};
  }else if(command==='news-step'&&p.operation==='finalize'){subjectRef=request.run_id??p.run_id;intent='news';use='topic_selection';contentReadiness={readiness:data.run_result?.execution_status==='complete'?'ready':'incomplete'};
  }else if(command==='record'&&p.operation==='draft_review'){subjectRef=`${p.data.draft.draft_id}:${p.data.draft.revision}`;intent=p.data.review_receipt.delivery_intent??'operational_optimize';use=intent==='plain_edit'?'plain_edit':'operational_guidance';contentReadiness={readiness:p.data.review_receipt.decision==='approved'?'ready':'needs_review'};
  }else if(command==='draft-check'){return{state,data:{...data,task_readiness:p.delivery_intent==='plain_edit'&&data.readiness==='ready'?'ready':'not_ready',guidance_required:p.delivery_intent!=='plain_edit',next_actions:p.delivery_intent==='plain_edit'?[]:['保存精确稿件，再选择规则并审核完整运营建议']}};
  }else return result;
  if(!subjectRef)return{state,data:{...data,task_readiness:'not_ready',guidance_required:true,limitations:[...(data.limitations??[]),'Exact deliverable subject is missing']}};
  const expectedGoal=goalSnapshotFromState(state);
  const subject=resolveGuidanceSubject(state,subjectRef),active=knowledgeBundleFromState(state);
  let context=Object.values(state.rule_contexts??{}).find(c=>c.subject_ref===subjectRef&&c.intent===intent&&c.use===use&&c.catalog_ref===active.catalog.catalog_id&&c.catalog_content_hash===active.catalog.catalog_content_hash&&canonicalHash(c.goal)===canonicalHash(expectedGoal));
  if(!context){
    const input={run_id:request.run_id??p.run_id??subjectRef,intent,use,goal:expectedGoal,subject_ref:subjectRef,cutoff:p.as_of??state.coaching_runs[p.proposal?.run_ref??request.run_id??subjectRef]?.cutoff??state.coaching_runs[p.run_id??request.run_id]?.request?.analysis_cutoff??state.review_computations[p.event?.computation_ref??subjectRef]?.computation_request?.as_of??state.runs[subjectRef]?.cutoff_at};
    if(!input.cutoff)throw new Error('A frozen task cutoff is required');
    input.context_id=`rule-context-${canonicalHash({...input,subject_hash:subject.content_hash,catalog_hash:active.catalog.catalog_content_hash}).slice(0,24)}`;
    context=buildRuleContextV4(input,knowledgeBundleFromState(state));
    state=await commitState(dir,state.revision,working=>{putImmutable(working.rule_contexts,context.context_id,context);return working;});
  }
  const gate=await currentGuidance(state,subjectRef,{intent,use,goal:expectedGoal,content_readiness:contentReadiness});
  data={...data,...gate,rule_context:context};
  if(gate.task_readiness!=='ready'&&gate.guidance_required){
    data.user_summary='当前内容与依据已保存，运营指导还需要对完整建议进行独立审核。';
    if(data.run_result)data.run_result={...data.run_result,execution_status:'partial',limitations:[...(data.run_result.limitations??[]),'Operational guidance has no current independent approval']};
  }
  return{state,data};
}
