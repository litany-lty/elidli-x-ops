import { canonicalHash, ContractError } from './contracts.mjs';
import { activatePersonalPatternV5, forgetExplicitPreferenceV5, proposePersonalPatternV5, recordFeedbackV5, retirePersonalPatternV5, unresolvedFailureEventsV5 } from './personal-model.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};

export function personalStep(state,payload,context={}){
  if(state?.schema_version!==5)fail('MIGRATION_REQUIRED','/state/schema_version','personal-step requires state 5');
  if(payload?.contract_version!==5)fail('INVALID_INPUT','/contract_version','personal-step requires contract version 5');
  if(payload.operation==='inspect')return{state:structuredClone(state),result:{account_ref:state.account?.user_id??`handle:${state.account?.handle}`,config:structuredClone(state.config),patterns:Object.values(state.personal_patterns??{}).filter(item=>item.contract_version===5),feedback_events:Object.values(state.feedback_events??{}),unresolved_failures:unresolvedFailureEventsV5(state)}};
  if(payload.operation==='propose-pattern'){
    const next=structuredClone(state),pattern=proposePersonalPatternV5(next,payload.pattern);next.personal_patterns??={};
    const old=next.personal_patterns[pattern.pattern_version_id];if(old&&canonicalHash(old)!==canonicalHash(pattern))fail('STATE_CONFLICT','/pattern_version_id','Pattern version ID identifies different content');
    next.personal_patterns[pattern.pattern_version_id]=pattern;return{state:next,result:{pattern}};
  }
  if(payload.operation==='activate-pattern'){
    const next=structuredClone(state),activated=activatePersonalPatternV5(next,payload.activation,context);next.personal_patterns[activated.pattern.pattern_version_id]=activated.pattern;return{state:next,result:activated};
  }
  if(payload.operation==='record-feedback'){
    const recorded=recordFeedbackV5(state,payload.feedback);return{state:recorded.state,result:{event:recorded.event,deduplicated:recorded.deduplicated??false}};
  }
  if(payload.operation==='forget'){
    if(payload.target_kind==='pattern'){
      const next=structuredClone(state),pattern=retirePersonalPatternV5(next,payload.pattern);next.personal_patterns[pattern.pattern_version_id]=pattern;return{state:next,result:{pattern}};
    }
    if(payload.target_kind==='feedback'){
      const recorded=forgetExplicitPreferenceV5(state,{...payload.feedback,target_ref:payload.target_ref});return{state:recorded.state,result:{event:recorded.event,deduplicated:recorded.deduplicated,applied_paths:recorded.applied_paths,preserved_paths:recorded.preserved_paths??[]}};
    }
  }
  fail('INVALID_INPUT','/operation','Unsupported personal-step operation');
}
