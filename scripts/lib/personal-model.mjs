import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { applyConfigPatch, createDefaultConfigV5, migrateConfigV5 } from './config.mjs';
import { experimentEvidenceSummary, publicationCreatedAtV4 } from './experiments.mjs';
import { resolveSubject } from './subjects.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const values=value=>Object.values(value??{});
const accountRef=state=>state.account?.user_id??`handle:${state.account?.handle}`;
const unique=items=>[...new Set(items.filter(Boolean))].sort();

function instant(value,path){
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))fail('INVALID_INPUT',path,'Expected an ISO instant');
  return new Date(parsed).toISOString();
}

function patternHashInput(pattern){
  const input={
    account_ref:pattern.account_ref,scope:pattern.scope,strategy_version_ref:pattern.strategy_version_ref,
    metric_definition:pattern.metric_definition,observation_window:pattern.observation_window,
    publication_refs:pattern.publication_refs,observation_refs:pattern.observation_refs,
    experiment_review_refs:pattern.experiment_review_refs,valid_n:pattern.valid_n,
    independent_publication_count:pattern.independent_publication_count,coverage:pattern.coverage,
    comparability:pattern.comparability,effect_kind:pattern.effect_kind,result_direction:pattern.result_direction,
    dispersion:pattern.dispersion,alternative_explanations:pattern.alternative_explanations,
    counter_evidence_refs:pattern.counter_evidence_refs,limitations:pattern.limitations,
    evidence_status:pattern.evidence_status,statement:pattern.statement,
    selection_policy_version:pattern.selection_policy_version
  };
  if(pattern.algorithm_dependency_versions!==undefined)input.algorithm_dependency_versions=pattern.algorithm_dependency_versions;
  return input;
}

export const personalPatternContentHash=pattern=>canonicalHash(patternHashInput(pattern));

function strategyAlgorithmDependencies(state,strategy,experiment){
  const action=state.actions?.[experiment.originating_action_id],refs=unique([...(action?.rule_version_refs??[]),...(strategy.rule_refs??[])]);
  if(!refs.length)return{};
  const proposal=action?.originating_proposal_ref&&state.coaching_reports?.[action.originating_proposal_ref],run=proposal&&state.coaching_runs?.[proposal.run_ref],contextRef=proposal?.rule_context_ref??run?.rule_context_ref,context=contextRef&&state.rule_contexts?.[contextRef];
  if(context?.contract_version!==5){
    const allEvents=values(state.knowledge_events),events=allEvents.filter(item=>item.event_type==='activated'),retired=new Set(allEvents.filter(item=>item.event_type==='retired').map(item=>item.catalog_ref)),superseded=new Set(events.map(item=>item.prior_catalog_ref).filter(Boolean)),active=events.filter(item=>!retired.has(item.catalog_ref)&&!superseded.has(item.catalog_ref)),catalog=active.length===1&&state.knowledge_catalogs?.[active[0].catalog_ref];
    if(!catalog||refs.some(ref=>!catalog.rule_version_refs?.includes(ref)))fail('MISSING_EVIDENCE','/strategy_version_ref','Pattern algorithm dependencies require the originating RuleContext or active saved catalog');
    const dependencyMap=Object.fromEntries((catalog.dependencies??[]).map(item=>[item.dependency_id,item])),rules={},facts={},dependencies={};for(const ref of refs){const rule=state.operational_rules?.[ref];if(!rule)fail('MISSING_EVIDENCE','/strategy_version_ref',`Saved algorithm rule is missing: ${ref}`);rules[ref]=canonicalHash(rule);for(const factRef of rule.fact_version_refs??[]){const fact=state.rule_versions_v2?.[factRef];if(!fact)fail('MISSING_EVIDENCE','/strategy_version_ref',`Saved algorithm fact is missing: ${factRef}`);facts[factRef]=canonicalHash(fact);}for(const dependencyId of rule.dependency_ids??[]){const dependency=dependencyMap[dependencyId];if(!dependency)fail('MISSING_EVIDENCE','/strategy_version_ref',`Saved algorithm dependency is missing: ${dependencyId}`);dependencies[dependencyId]=canonicalHash(dependency);}}
    return{source_rule_context_ref:null,source_catalog_ref:catalog.catalog_id,rules,facts,dependencies};
  }
  const selections=new Map((context.selections??[]).map(item=>[item.rule_version_ref,item])),rules={},facts={},dependencies={};
  for(const ref of refs){
    const selected=selections.get(ref),hash=context.selected_rule_hashes?.[ref];
    if(!selected||!hash)fail('MISSING_EVIDENCE','/strategy_version_ref',`Originating RuleContext did not select strategy rule: ${ref}`);
    rules[ref]=hash;for(const factRef of selected.fact_version_refs??[]){const value=context.selected_fact_hashes?.[factRef];if(!value)fail('MISSING_EVIDENCE','/strategy_version_ref',`Originating RuleContext lacks fact hash: ${factRef}`);facts[factRef]=value;}for(const dependencyId of selected.dependency_ids??[]){const value=context.selected_dependency_hashes?.[dependencyId];if(!value)fail('MISSING_EVIDENCE','/strategy_version_ref',`Originating RuleContext lacks dependency hash: ${dependencyId}`);dependencies[dependencyId]=value;}
  }
  return{source_rule_context_ref:contextRef,source_catalog_ref:context.catalog_ref,rules,facts,dependencies};
}

function resultDirection(metricResults){
  const differences=metricResults.map(item=>item.difference).filter(Number.isFinite);
  if(!differences.length||differences.every(value=>value===0))return'inconclusive';
  if(differences.every(value=>value>=0)&&differences.some(value=>value>0))return'positive';
  if(differences.every(value=>value<=0)&&differences.some(value=>value<0))return'negative';
  return'mixed';
}

function evidenceStatus(conclusion,direction){
  if(conclusion==='stop'&&direction==='negative')return'refuted';
  if(conclusion==='revise'||direction==='mixed')return'mixed';
  return'insufficient'; // continue is a next-step decision, never proof of support.
}

function reviewedWindowIsMature(state,plan,computation,publicationRefs){
  const cutoff=Date.parse(computation.computation_request?.as_of),window=plan.window;
  if(!Number.isFinite(cutoff)||!window)return false;
  if(window.kind==='period')return Number.isFinite(Date.parse(window.end_exclusive))&&cutoff>=Date.parse(window.end_exclusive);
  if(window.kind!=='age_window'||!Number.isFinite(window.target_hours)||!Number.isFinite(window.tolerance_hours))return false;
  return publicationRefs.every(ref=>{
    const publication=state.publications[ref],created=Date.parse(publicationCreatedAtV4(state,publication));
    return Number.isFinite(created)&&cutoff>=created+(window.target_hours+window.tolerance_hours)*3_600_000;
  });
}

export function proposePersonalPatternV5(state,input){
  const review=state.experiment_reviews?.[input.experiment_review_ref];
  const experiment=review&&state.experiments?.[review.experiment_id];
  const computation=review&&state.review_computations?.[review.computation_ref];
  const plan=review&&state.experiment_plan_views?.[review.plan_view_ref];
  const strategy=state.strategy_definitions?.[input.strategy_version_ref];
  if(review?.contract_version!==4||review.result_trust!=='verified'||experiment?.status!=='closed'||computation?.contract_version!==4||!plan)fail('MISSING_EVIDENCE','/experiment_review_ref','A closed verified review and its frozen computation are required');
  if(!strategy)fail('MISSING_EVIDENCE','/strategy_version_ref','The saved strategy version is required');
  const publicationRefs=unique(experiment.linked_publication_ids??[]);
  if(!publicationRefs.length||publicationRefs.some(ref=>!state.publications?.[ref]))fail('MISSING_EVIDENCE','/publication_refs','Actual stored publications are required');
  const action=state.actions?.[experiment.originating_action_id];
  if(action&&['profile','data_collection'].includes(action.target))fail('INVALID_EVIDENCE_REF','/experiment_review_ref','Non-post actions do not enter the publication effect model');
  if(!reviewedWindowIsMature(state,plan,computation,publicationRefs))fail('WINDOW_PENDING','/experiment_review_ref','The frozen publication observation window is not mature');
  const evidenceSummary=experimentEvidenceSummary(state,experiment.experiment_id),actualPublicationCount=evidenceSummary.independent_publication_n,validN=evidenceSummary.independent_sample_n;
  const observationRefs=unique(computation.metric_results.flatMap(item=>item.target_observation_refs??[]));
  if(!observationRefs.length||computation.target_selection?.completeness!=='complete'||computation.computation_request?.coverage_bindings?.some(item=>item.completeness!=='complete'))fail('REQUESTED_OUTPUT_INCOMPLETE','/experiment_review_ref','Mature observations and complete coverage are required');
  if(!input.statement?.trim()||!input.alternative_explanations?.length)fail('INVALID_INPUT','/statement','A scoped statement and alternative explanations are required');
  if(input.scope?.goal!==undefined&&canonicalHash(input.scope.goal)!==canonicalHash(experiment.goal))fail('INVALID_EVIDENCE_REF','/scope/goal','Pattern scope cannot broaden or change the reviewed goal');
  const bounded=(requested,allowed,path)=>{const values=unique(requested??[]),limit=unique(allowed??[]);if(limit.length&&values.some(value=>!limit.includes(value)))fail('INVALID_EVIDENCE_REF',path,'Pattern scope cannot exceed the executed strategy scope');return values.length?values:limit;};
  const patternScope={goal:structuredClone(experiment.goal),topics:bounded(input.scope?.topics,strategy.topic_scope,'/scope/topics'),formats:bounded(input.scope?.formats,strategy.format_scope,'/scope/formats'),surfaces:bounded(input.scope?.surfaces,strategy.surface_scope,'/scope/surfaces'),use:input.scope?.use??action?.use??null};
  const direction=resultDirection(computation.metric_results);
  const base={
    contract_version:5,pattern_version_id:input.pattern_version_id,pattern_chain_id:input.pattern_chain_id,
    account_ref:accountRef(state),scope:patternScope,
    strategy_version_ref:input.strategy_version_ref,algorithm_dependency_versions:strategyAlgorithmDependencies(state,strategy,experiment),metric_definition:structuredClone(plan.metric_requirements?.find(item=>item.role==='primary')??experiment.planned_primary_metric),
    observation_window:structuredClone(plan.window),publication_refs:publicationRefs,observation_refs:observationRefs,
    experiment_review_refs:[review.review_id],valid_n:validN,independent_publication_count:actualPublicationCount,
    coverage:structuredClone(computation.target_selection),comparability:structuredClone(computation.comparability),
    effect_kind:validN>1?'association':'descriptive',result_direction:direction,dispersion:input.dispersion??null,
    alternative_explanations:[...input.alternative_explanations],counter_evidence_refs:unique(input.counter_evidence_refs??[]),
    limitations:unique(input.limitations??[]),evidence_status:evidenceStatus(review.interpretation?.conclusion,direction),
    lifecycle_status:'candidate',statement:input.statement.trim(),selection_policy_version:input.selection_policy_version??'personal-v5',
    candidate_ref:null,pattern_review_ref:null,supersedes_ref:null,created_at:instant(input.created_at,'/created_at'),reviewed_at:null,activated_at:null
  };
  return validate('PersonalPatternV5',{...base,pattern_content_hash:personalPatternContentHash(base)});
}

function activeHeads(state,chainId){
  const chain=values(state.personal_patterns).filter(item=>item.contract_version===5&&item.pattern_chain_id===chainId&&item.lifecycle_status==='active');
  const superseded=new Set(values(state.personal_patterns).filter(item=>item.contract_version===5&&item.pattern_chain_id===chainId).map(item=>item.supersedes_ref).filter(Boolean));
  return chain.filter(item=>!superseded.has(item.pattern_version_id));
}

export function activatePersonalPatternV5(state,input,{actual_review_receipts={}}={}){
  const candidate=state.personal_patterns?.[input.candidate_ref];
  if(candidate?.contract_version!==5||candidate.lifecycle_status!=='candidate')fail('INVALID_EVIDENCE_REF','/candidate_ref','A saved immutable candidate is required');
  if(personalPatternContentHash(candidate)!==candidate.pattern_content_hash)fail('STALE_BUNDLE','/candidate_ref','Candidate content changed after proposal');
  const actual=actual_review_receipts[input.actual_review_receipt_ref];
  if(!actual||actual.purpose!=='review_pattern'||actual.subject_ref!==candidate.pattern_version_id||(actual.content_hash??actual.subject_content_hash)!==candidate.pattern_content_hash)fail('INVALID_EVIDENCE_REF','/actual_review_receipt_ref','Actual pattern review must bind the exact candidate and content hash');
  if(actual.decision!=='approved')fail('INVALID_EVIDENCE_REF','/actual_review_receipt_ref','Only an approved actual pattern review may activate a candidate');
  const heads=activeHeads(state,candidate.pattern_chain_id);
  if(heads.length>1)fail('STATE_CONFLICT','/pattern_chain_id','Pattern chain has conflicting active heads');
  const review={contract_version:5,receipt_id:input.actual_review_receipt_ref,pattern_ref:candidate.pattern_version_id,pattern_content_hash:candidate.pattern_content_hash,actual_review_receipt_ref:input.actual_review_receipt_ref,decision:'approved',issues:[...(actual.issues??[])],reviewed_at:instant(actual.actual_at??actual.actual_date??actual.reviewed_at,'/actual_review_receipt/reviewed_at')};
  validate('PatternReviewReceiptV5',review);
  const active={...structuredClone(candidate),pattern_version_id:input.pattern_version_id,lifecycle_status:'active',candidate_ref:candidate.pattern_version_id,pattern_review_ref:review.receipt_id,supersedes_ref:heads[0]?.pattern_version_id??null,reviewed_at:review.reviewed_at,activated_at:instant(input.activated_at,'/activated_at')};
  validate('PersonalPatternV5',active);
  return{pattern:active,review};
}

function feedbackHash(event){const copy=structuredClone(event);delete copy.event_hash;return canonicalHash(copy);}

function storeFeedback(next,event){
  next.feedback_events??={};
  const old=next.feedback_events[event.feedback_id];
  if(old&&canonicalHash(old)!==canonicalHash(event))fail('STATE_CONFLICT','/feedback_id','Feedback ID identifies different content');
  next.feedback_events[event.feedback_id]=event;
}

function resolutionRefExists(state,ref){
  if(!ref)return false;
  if(state.host_media_receipts?.[ref]||state.draft_review_receipts?.[ref])return true;
  try{resolveSubject(state,ref);return true;}catch{return false;}
}

function latestFailureEvents(state){
  const latest=new Map();
  for(const event of values(state.feedback_events)){
    if(event.contract_version!==5||!['quality_failure','execution_failure'].includes(event.type)||!event.dedupe_key)continue;
    if(event.resolved_by_ref&&!resolutionRefExists(state,event.resolved_by_ref))continue;
    const key=`${event.type}:${event.dedupe_key}`,previous=latest.get(key);
    if(!previous||event.recorded_at>previous.recorded_at||(event.recorded_at===previous.recorded_at&&event.feedback_id>previous.feedback_id))latest.set(key,event);
  }
  return latest;
}

export function unresolvedFailureEventsV5(state){
  return [...latestFailureEvents(state).values()].filter(event=>!event.resolved_by_ref).map(event=>structuredClone(event));
}

export function applyExplicitPreferencePatch(state,patch,meta){
  const next=structuredClone(state);
  if(meta.persistence!=='long_term')fail('INVALID_INPUT','/persistence','Atomic preference patch is only for long-term preferences');
  let config=next.config;
  if(config.schema_version!==5&&(patch.operations??[]).some(item=>item.path.startsWith('/content/preferences/')))config=migrateConfigV5(config);
  const normalizedPatch={...structuredClone(patch),schema_version:config.schema_version===5?5:1,scope:'persistent'};
  config=applyConfigPatch(config,normalizedPatch);
  const base={contract_version:5,feedback_id:meta.feedback_id,type:'explicit_preference',account_ref:accountRef(next),source_quote:meta.source_quote,source_ref:meta.source_ref,scope:structuredClone(meta.scope),persistence:'long_term',operations:structuredClone(normalizedPatch.operations),supersedes_ref:meta.supersedes_ref??null,retracts_ref:meta.retracts_ref??null,committed_revision:(next.revision??0)+1,recorded_at:instant(meta.recorded_at,'/recorded_at')};
  const event=validate('FeedbackEventV5',{...base,event_hash:feedbackHash(base)});
  next.config=config;updatePreferenceHeads(next,normalizedPatch.operations.map(operation=>operation.path),event,meta.source_ref);storeFeedback(next,event);return{state:next,event};
}

function pointerValue(value,path){
  return path.slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~')).reduce((current,key)=>current?.[key],value);
}

function pointersOverlap(left,right){return left===right||left.startsWith(`${right}/`)||right.startsWith(`${left}/`);}

function updatePreferenceHeads(state,paths,event,source){
  state.preference_meta??={};
  for(const path of paths){const affected=new Set([path,...Object.keys(state.preference_meta).filter(existing=>pointersOverlap(existing,path))]);for(const ref of affected)state.preference_meta[ref]={...(state.preference_meta[ref]??{}),basis:'user',source,confirmed_at:event.recorded_at,feedback_head_ref:event.feedback_id,committed_revision:event.committed_revision};}
}

function explicitEventsForPath(state,path){
  return values(state.feedback_events).filter(event=>event.contract_version===5&&event.type==='explicit_preference'&&event.persistence==='long_term'&&event.operations?.some(operation=>pointersOverlap(operation.path,path)));
}

function inferredFieldHead(state,path,target){
  const metaHead=state.preference_meta?.[path]?.feedback_head_ref;
  if(metaHead)return{ref:metaHead,basis:'preference_meta'};
  const committed=explicitEventsForPath(state,path).filter(event=>Number.isSafeInteger(event.committed_revision));
  if(committed.length){const revision=Math.max(...committed.map(event=>event.committed_revision)),heads=committed.filter(event=>event.committed_revision===revision);if(heads.length===1)return{ref:heads[0].feedback_id,basis:'committed_revision'};return{ref:null,basis:'ambiguous_same_commit'};}
  const superseded=new Set(),queue=[target.feedback_id];while(queue.length){const ref=queue.shift();for(const event of explicitEventsForPath(state,path))if(event.supersedes_ref===ref&&!superseded.has(event.feedback_id)){superseded.add(event.feedback_id);queue.push(event.feedback_id);}}
  if(superseded.size)return{ref:[...superseded][0],basis:'explicit_supersedes'};
  if(explicitEventsForPath(state,path).some(event=>event.feedback_id!==target.feedback_id))return{ref:null,basis:'ambiguous_legacy_history'};
  const operation=target.operations.find(item=>item.path===path),expected=operation?.op==='set'?operation.value:operation?.op==='inherit'?null:operation?.op==='clear'?[]:undefined;
  if(expected!==undefined&&canonicalHash(pointerValue(state.config,path))===canonicalHash(expected))return{ref:target.feedback_id,basis:'current_config_matches'};
  return{ref:null,basis:'ambiguous_legacy_history'};
}

/** Append a retraction and derive any config reset from the saved field chain, never from caller patch data. */
export function forgetExplicitPreferenceV5(state,input){
  const target=state.feedback_events?.[input.target_ref];
  if(target?.contract_version!==5||target.type!=='explicit_preference'||target.persistence!=='long_term')fail('INVALID_EVIDENCE_REF','/target_ref','Forget requires a saved long-term explicit preference event');
  const existingRetraction=values(state.feedback_events).find(event=>event.contract_version===5&&event.type==='explicit_preference'&&event.retracts_ref===target.feedback_id);
  if(existingRetraction)return{state:structuredClone(state),event:structuredClone(existingRetraction),deduplicated:true,applied_paths:[]};
  const paths=unique(target.operations.map(operation=>operation.path)),heads=new Map(paths.map(path=>[path,inferredFieldHead(state,path,target)]));
  const appliedPaths=paths.filter(path=>heads.get(path).ref===target.feedback_id),preservedPaths=paths.filter(path=>heads.get(path).ref!==target.feedback_id);
  const defaults=createDefaultConfigV5(state.account),operations=appliedPaths.map(path=>{
    const value=pointerValue(defaults,path);
    if(value===undefined)fail('INVALID_EVIDENCE_REF','/target_ref',`No canonical default exists for preference field ${path}`);
    return{op:'set',path,value:structuredClone(value)};
  });
  const next=structuredClone(state);
  if(operations.length)next.config=applyConfigPatch(next.config.schema_version===5?next.config:migrateConfigV5(next.config),{schema_version:5,scope:'persistent',operations});
  const base={contract_version:5,feedback_id:input.feedback_id,type:'explicit_preference',account_ref:accountRef(next),source_quote:input.source_quote,source_ref:input.source_ref,scope:structuredClone(target.scope),persistence:'long_term',operations,retracted_paths:paths,applied_paths:appliedPaths,preserved_paths:preservedPaths,supersedes_ref:null,retracts_ref:target.feedback_id,committed_revision:(next.revision??0)+1,recorded_at:instant(input.recorded_at,'/recorded_at')};
  const event=validate('FeedbackEventV5',{...base,event_hash:feedbackHash(base)});updatePreferenceHeads(next,appliedPaths,event,input.source_ref);storeFeedback(next,event);return{state:next,event,deduplicated:false,applied_paths:appliedPaths,preserved_paths:preservedPaths};
}

export function recordFeedbackV5(state,input){
  if(input.type==='explicit_preference'&&input.persistence==='long_term')return applyExplicitPreferencePatch(state,input.patch,input);
  const next=structuredClone(state),base={...structuredClone(input),contract_version:5,account_ref:accountRef(state),recorded_at:instant(input.recorded_at,'/recorded_at')};
  delete base.patch;
  if(base.type==='explicit_preference')base.operations=structuredClone(input.patch?.operations??input.operations??[]);
  if(base.type==='output_feedback'){
    if(!base.response)fail('INVALID_INPUT','/response','No response is inferred when the user simply did not adopt an output');
    base.inference_strength='weak';
  }
  if(['quality_failure','execution_failure'].includes(base.type)){
    const latest=latestFailureEvents(next).get(`${base.type}:${base.dedupe_key}`);
    if(base.resolved_by_ref){
      if(!resolutionRefExists(next,base.resolved_by_ref))fail('INVALID_EVIDENCE_REF','/resolved_by_ref','Resolution reference must exist');
      if(!latest)fail('MISSING_EVIDENCE','/dedupe_key','Resolution requires an earlier failure with the same type and dedupe key');
      if(latest.resolved_by_ref===base.resolved_by_ref)return{state:next,event:structuredClone(latest),deduplicated:true};
    }else if(latest&&!latest.resolved_by_ref)return{state:next,event:structuredClone(latest),deduplicated:true};
  }
  const event=validate('FeedbackEventV5',{...base,event_hash:feedbackHash(base)});storeFeedback(next,event);return{state:next,event,deduplicated:false};
}

export function retirePersonalPatternV5(state,input){
  const previous=state.personal_patterns?.[input.pattern_ref];
  if(previous?.contract_version!==5||!['active','contradicted','stale'].includes(previous.lifecycle_status))fail('INVALID_EVIDENCE_REF','/pattern_ref','A current V5 pattern version is required');
  if(!['contradicted','stale','retired'].includes(input.lifecycle_status))fail('INVALID_INPUT','/lifecycle_status','Forget must append contradicted, stale, or retired');
  const next={...structuredClone(previous),pattern_version_id:input.pattern_version_id,lifecycle_status:input.lifecycle_status,counter_evidence_refs:unique([...previous.counter_evidence_refs,...(input.counter_evidence_refs??[])]),limitations:unique([...previous.limitations,input.reason]),candidate_ref:null,pattern_review_ref:null,supersedes_ref:previous.pattern_version_id,created_at:instant(input.at,'/at'),reviewed_at:null,activated_at:null};
  next.pattern_content_hash=personalPatternContentHash(next);return validate('PersonalPatternV5',next);
}
