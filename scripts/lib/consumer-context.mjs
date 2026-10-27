import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { activeContentReceiptV3, isContentAnalysisCurrent } from './post-content.mjs';
import { resolvePostContext } from './imports.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const values = value => Object.values(value ?? {});

function currentContentAnalyses(state,{requested_use='current',post_version_refs=[]}={}) {
  const entityRefs=Object.values(state.post_entities??{}).map(entity=>entity.current_version_ref).filter(Boolean);
  const currentVersionRefs=new Set(entityRefs.length?entityRefs:Object.keys(state.post_versions??{}));
  const explicitRefs=new Set(post_version_refs);
  const current=values(state.content_analyses).filter(analysis => {
    const version = state.post_versions?.[analysis.post_version_ref];
    const included=requested_use==='historical_compare'?explicitRefs.has(analysis.post_version_ref):currentVersionRefs.has(analysis.post_version_ref);
    if(!included||!version)return false;
    if(analysis.contract_version===3){const context=resolvePostContext(state,analysis.post_version_ref,{}),receipt=activeContentReceiptV3(state,analysis);return analysis.content_hash===context.target_content_hash&&analysis.context_selection_hash===context.context_selection_hash&&(!receipt||receipt.decision==='approved');}
    return isContentAnalysisCurrent(analysis,version,analysis.analysis_version,state.post_versions);
  });
  const latest=new Map();
  for(const analysis of current.sort((a,b)=>(Date.parse(a.reviewed_at??'1970-01-01')-Date.parse(b.reviewed_at??'1970-01-01'))||a.analysis_id.localeCompare(b.analysis_id)))latest.set(analysis.post_version_ref,analysis);
  return [...latest.values()];
}

function actionGoalSnapshot(state, actionId) {
  const report = values(state.coaching_reports).find(item => item.actions?.some(action => action.action_id === actionId));
  return report ? state.evidence_bundles?.[report.bundle_id]?.goal_snapshot ?? null : null;
}

function goalBinding(goalSnapshot, currentGoal) {
  if (!goalSnapshot) return { goal_hash: null, goal_matches_current: null, applicability_limitation: '该动作缺少原目标绑定，不能直接视为适用于当前目标' };
  const matches = goalSnapshot.primary_goal === currentGoal.primary_goal && (goalSnapshot.goal_notes ?? null) === (currentGoal.goal_notes ?? null);
  return {
    goal_hash: canonicalHash(goalSnapshot),
    goal_matches_current: matches,
    applicability_limitation: matches ? null : '该动作来自不同目标，只能作为历史计划参考，不能直接沿用',
  };
}

export function goalSnapshotFromState(state, effectiveConfig = null) {
  const config = effectiveConfig?.config ?? effectiveConfig ?? state?.config;
  const content = config?.content;
  if (!content) fail('INVALID_INPUT', '/config/content', 'Effective content configuration is required');
  return validate('GoalSnapshotV2', {
    primary_goal: content.primary_goal,
    goal_notes: content.goal_notes,
    source: state.preference_meta?.['/content/primary_goal']?.basis === 'user' ? 'user_confirmed' : 'temporary_assumption',
  });
}

/** Freeze the current personal evidence that draft and news flows may consume. */
export function buildConsumerContext(state, { intent, goal_snapshot: goalSnapshot, requested_use='current', post_version_refs=[] }) {
  if (![2,3,4].includes(state?.schema_version)) fail('MIGRATION_REQUIRED', '/state/schema_version', 'Personalized draft and news context requires a V2, V3 or V4 state');
  if (!['draft', 'news'].includes(intent)) fail('INVALID_INPUT', '/intent', 'Consumer intent must be draft or news');
  validate('GoalSnapshotV2', goalSnapshot);

  if(!['current','historical_compare'].includes(requested_use))fail('INVALID_INPUT','/requested_use','Consumer use must be current or historical_compare');
  const analyses = currentContentAnalyses(state,{requested_use,post_version_refs}).sort((left, right) => left.analysis_id.localeCompare(right.analysis_id));
  const voiceSamples = (state.config?.content?.voice_samples ?? [])
    .filter(sample => sample.confirmed_by_user && state.sources?.[sample.source_ref])
    .sort((left, right) => left.sample_id.localeCompare(right.sample_id));
  const actions = values(state.actions).sort((left, right) => left.action_id.localeCompare(right.action_id));
  const activeExperiments = values(state.experiments)
    .filter(experiment => ['proposed', 'accepted', 'running', 'ready_for_review'].includes(experiment.status))
    .sort((left, right) => left.experiment_id.localeCompare(right.experiment_id));
  const reviews = values(state.experiment_reviews)
    .filter(review => state.experiments?.[review.experiment_id]?.status === 'closed' && (state.schema_version===2 || ([3,4].includes(review.contract_version) && review.result_trust === 'verified')))
    .sort((left, right) => left.review_id.localeCompare(right.review_id));
  const limitations = [];
  if (!analyses.length) limitations.push('没有与当前正文版本一致的历史内容分析；个性化内容判断只能作为编辑假设');
  if (!voiceSamples.length) limitations.push('没有带可恢复来源且经用户确认的声音样本；只能保留本次原稿语气');
  if (!reviews.length) limitations.push('没有已关闭且可复用的历史试验结果；不能把未完成计划当作效果证据');
  if (actions.some(action => !actionGoalSnapshot(state, action.action_id))) limitations.push('部分历史动作缺少原目标绑定；它们不能直接作为当前目标的个性化依据');

  const items = [
    ...analyses.map(item => ({
      kind: 'content_analysis', ref: item.analysis_id, content_hash: canonicalHash(item),
      value: {
        post_version_ref: item.post_version_ref,
        primary_topic: item.primary_topic,
        intended_reader: item.intended_reader,
        reader_problem: item.reader_problem,
        post_purpose: item.post_purpose,
        context_coverage: structuredClone(item.context_coverage),
        strengths: [...item.strengths], issues: [...item.issues], uncertainties: [...item.uncertainties],
      },
    })),
    ...voiceSamples.map(item => ({ kind: 'voice_sample', ref: item.sample_id, content_hash: canonicalHash(item), value: structuredClone(item) })),
    ...actions.map(item => ({
      kind: 'prior_action', ref: item.action_id, content_hash: canonicalHash(item),
      value: {
        objective: item.objective, target: item.target, change: item.change, why_now: item.why_now, status: item.status,
        uncertainties: [...item.uncertainties], ...goalBinding(actionGoalSnapshot(state, item.action_id), goalSnapshot),
      },
    })),
    ...activeExperiments.map(item => ({
      kind: 'active_experiment', ref: item.experiment_id, content_hash: canonicalHash(item),
      value: {
        goal: item.goal,
        hypothesis: item.hypothesis,
        single_primary_change: item.single_primary_change,
        status: item.status,
        planned_primary_metric: structuredClone(item.planned_primary_metric),
        planned_review_condition: item.planned_review_condition,
        known_confounders: [...item.known_confounders],
        linked_publication_ids: [...item.linked_publication_ids],
        is_effect_result: false,
      },
    })),
    ...reviews.map(item => ({
      kind: 'experiment_review', ref: item.review_id, content_hash: canonicalHash(item),
      value: [3,4].includes(item.contract_version)?{experiment_id:item.experiment_id,conclusion:item.interpretation?.conclusion??'inconclusive',reason:item.interpretation?.reason??'',metric_results:(state.review_computations?.[item.computation_ref]?.metric_results??[]).map(metric=>({metric_definition_id:metric.definition_id,value:metric.target_value,selected_observation_refs:[...metric.target_observation_refs],status:metric.target_value===null?'unavailable':'available',reasons:[]})),evidence_refs:[item.computation_ref,item.interpretation_receipt_ref].filter(Boolean)}:{ experiment_id: item.experiment_id, conclusion: item.conclusion, reason: item.reason, metric_results: structuredClone(item.metric_results), evidence_refs: [...item.evidence_refs] },
    })),
  ].sort((left, right) => left.ref.localeCompare(right.ref));
  const base = {
    contract_version: 2,
    intent,
    goal_hash: canonicalHash(goalSnapshot),
    goal_snapshot: structuredClone(goalSnapshot),
    content_analysis_refs: analyses.map(item => item.analysis_id),
    voice_sample_refs: voiceSamples.map(item => item.sample_id),
    prior_action_refs: actions.map(item => item.action_id),
    active_experiment_refs: activeExperiments.map(item => item.experiment_id),
    experiment_review_refs: reviews.map(item => item.review_id),
    refs: [...new Set([
      ...analyses.map(item => item.analysis_id),
      ...voiceSamples.map(item => item.sample_id),
      ...actions.map(item => item.action_id),
      ...activeExperiments.map(item => item.experiment_id),
      ...reviews.map(item => item.review_id),
    ])].sort(),
    items,
    limitations,
  };
  return validate('ConsumerContextV2', { ...base, context_hash: canonicalHash(base) });
}

function personalEvidence(state,ref){
  const candidates=[state.content_analyses?.[ref],state.actions?.[ref],state.experiment_reviews?.[ref],state.rule_versions_v2?.[ref],state.user_facts?.[ref],state.sources?.[ref]?.record,state.sources?.[ref]];
  const value=candidates.find(Boolean);if(!value)return null;
  if(state.content_analyses?.[ref]){
    const analysis=state.content_analyses[ref],version=state.post_versions?.[analysis.post_version_ref];
    if(!version)return null;
    if(analysis.contract_version===3){const context=resolvePostContext(state,analysis.post_version_ref,{}),receipt=activeContentReceiptV3(state,analysis);if(analysis.content_hash!==context.target_content_hash||analysis.context_selection_hash!==context.context_selection_hash||(receipt&&receipt.decision!=='approved'))return null;}
    else if(!isContentAnalysisCurrent(analysis,version,analysis.analysis_version,state.post_versions))return null;
  }
  if(state.experiment_reviews?.[ref]&&(![3,4].includes(value.contract_version)||value.result_trust!=='verified'))return null;
  return value;
}

function personalEvidencePurpose(state,ref){
  if(state.content_analyses?.[ref])return 'content_pattern';
  if(state.experiment_reviews?.[ref])return 'performance_result';
  if(state.rule_versions_v2?.[ref])return 'algorithm_rule';
  if(state.actions?.[ref])return 'goal_constraint';
  if(state.user_facts?.[ref]||state.sources?.[ref])return 'voice';
  return null;
}

/** Freeze only the personal evidence intentionally used by this draft/pack. */
export function resolvePersonalContextSelection(state,{goal_hash,brief_or_use_hash,selection_policy_version='personal-context-v3',selected=[]}={}){
  if(!goal_hash||!brief_or_use_hash)fail('INVALID_INPUT','/personal_context','Goal and intended use hashes are required');
  const normalized=[];
  for(const item of selected){
    if(!item?.ref||!item?.purpose)fail('INVALID_INPUT','/selected','Every personal reference needs a purpose');
    const value=personalEvidence(state,item.ref),requiredPurpose=personalEvidencePurpose(state,item.ref);
    if(!value)fail('INVALID_EVIDENCE_REF','/selected',`Personal evidence is missing, historical-only, or stale: ${item.ref}`);
    if(item.purpose!==requiredPurpose)fail('INVALID_EVIDENCE_REF','/selected',`${item.ref} cannot support personal purpose ${item.purpose}`);
    if(requiredPurpose==='goal_constraint'){
      const snapshot=actionGoalSnapshot(state,item.ref);
      if(!snapshot||canonicalHash(snapshot)!==goal_hash)fail('INVALID_EVIDENCE_REF','/selected',`${item.ref} belongs to another or unknown goal`);
    }
    normalized.push({ref:item.ref,purpose:item.purpose,hash:canonicalHash(value),limitations:[...(item.limitations??[])]});
  }
  normalized.sort((a,b)=>a.ref.localeCompare(b.ref)||a.purpose.localeCompare(b.purpose));
  const base={contract_version:3,goal_hash,brief_or_use_hash,selection_policy_version,selected:normalized};
  return{...base,selection_hash:canonicalHash(base)};
}

export function validatePersonalContextSelection(state,selection,expectedContext={}){
  const {goal_hash:expectedGoalHash=null,brief_or_use_hash:expectedUseHash=null,requested_use:expectedUse=null,post_version_refs:expectedPostVersionRefs=[],selection_policy_version:expectedPolicy=null}=expectedContext;
  if(state?.schema_version===4&&(!expectedGoalHash||!expectedUseHash||!expectedUse||!expectedPolicy))fail('INVALID_INPUT','/personal_context_selection','State 4 callers must supply the actual goal, use and selection policy');
  if(expectedGoalHash&&selection.goal_hash!==expectedGoalHash)fail('STALE_DRAFT','/personal_context_selection/goal_hash','Selected personal evidence belongs to another goal');
  if(expectedUseHash&&selection.brief_or_use_hash!==expectedUseHash)fail('STALE_DRAFT','/personal_context_selection/brief_or_use_hash','Selected personal evidence belongs to another task use');
  if(expectedPolicy&&selection.selection_policy_version!==expectedPolicy)fail('STALE_DRAFT','/personal_context_selection/selection_policy_version','Selected personal evidence used another policy');
  if(expectedUse==='historical_compare'){
    if(state?.schema_version===4&&!expectedPostVersionRefs.length)fail('INVALID_INPUT','/personal_context_selection','Historical comparison requires explicit post versions');
    const allowed=new Set(expectedPostVersionRefs);for(const item of selection.selected??[]){const analysis=state.content_analyses?.[item.ref];if(analysis&&!allowed.has(analysis.post_version_ref))fail('STALE_DRAFT','/personal_context_selection/selected','Historical content is outside the caller selected comparison set');}
  } else {
    const allowed=new Set(expectedPostVersionRefs),currentRefs=new Set(values(state.post_entities).map(item=>item.current_version_ref).filter(Boolean));
    for(const item of selection.selected??[]){const analysis=state.content_analyses?.[item.ref];if(analysis&&(!currentRefs.has(analysis.post_version_ref)||(allowed.size&&!allowed.has(analysis.post_version_ref))))fail('STALE_DRAFT','/personal_context_selection/selected','Historical content may only be used for an explicit historical comparison');}
  }
  const current=resolvePersonalContextSelection(state,selection);
  if(current.selection_hash!==selection.selection_hash)fail('STALE_DRAFT','/personal_context_selection','Selected personal evidence changed or became stale');
  return structuredClone(selection);
}

const accountRef=state=>state.account?.user_id??`handle:${state.account?.handle}`;
const unique=items=>[...new Set(items.filter(Boolean))].sort();

function scopeCompatibility(scope,{goal,topic_refs:topics,format,surface,use}){
  const reasons=[];
  const scopeGoal=scope?.goal?.primary_goal??scope?.goal,requestGoal=goal?.primary_goal??goal;
  if(scopeGoal!==undefined&&scopeGoal!==null&&canonicalHash(scopeGoal)!==canonicalHash(requestGoal))reasons.push('goal_mismatch');
  if(scope?.topics?.length&&!scope.topics.some(item=>topics.includes(item)))reasons.push('topic_mismatch');
  if(scope?.formats?.length&&(!format||!scope.formats.includes(format)))reasons.push('format_mismatch');
  if(scope?.surfaces?.length&&(!surface||!scope.surfaces.includes(surface)))reasons.push('surface_mismatch');
  if(scope?.use&&scope.use!==use)reasons.push('use_mismatch');
  return reasons;
}

function latestPatternHeads(patterns){
  const superseded=new Set(patterns.map(item=>item.supersedes_ref).filter(Boolean));
  return patterns.filter(item=>!superseded.has(item.pattern_version_id));
}

function contentEvidenceFingerprint(state,ref){
  let value=state.content_analyses?.[ref]??state.user_facts?.[ref]??state.post_versions?.[ref]??state.personal_patterns?.[ref]??state.sources?.[ref]?.record??state.sources?.[ref];
  const entity=state.post_entities?.[ref];if(entity?.current_version_ref)value={entity_ref:ref,current_version_ref:entity.current_version_ref,current_version:state.post_versions?.[entity.current_version_ref]??null};
  if(state.content_analyses?.[ref]){const analysis=state.content_analyses[ref],version=state.post_versions?.[analysis.post_version_ref],entity=version&&state.post_entities?.[version.post_key];value={analysis,selected_version:version??null,current_version_ref:entity?.current_version_ref??null,current_version:entity?.current_version_ref?state.post_versions?.[entity.current_version_ref]??null:null};}
  for(const source of values(state.sources))if(source.versions?.[ref])value={source_ref:source.record?.source_id??null,version:source.versions[ref],is_current:source.latest_version_id===ref};
  return{ref,content_hash:canonicalHash(value??null),available:Boolean(value)};
}

/** Select only bounded, currently relevant evidence for coach, draft, news, content, and review. */
export function buildOperationalContext(state,input){
  if(state?.schema_version!==5)fail('MIGRATION_REQUIRED','/state/schema_version','Operational context requires state 5');
  if(!['coach','draft','news','content','review'].includes(input?.intent))fail('INVALID_INPUT','/intent','Unknown operational context consumer');
  if(!input.use||!input.goal||!input.cutoff)fail('INVALID_INPUT','/operational_context','Use, full goal, and cutoff are required');
  const cutoffMs=Date.parse(input.cutoff);if(!Number.isFinite(cutoffMs))fail('INVALID_INPUT','/cutoff','Cutoff must be an ISO instant');
  const request={goal:input.goal,topic_refs:unique(input.topic_refs??[]),format:input.format??null,surface:input.surface??null,use:input.use};
  const ownAccount=accountRef(state),effectivePatterns=values(state.personal_patterns).filter(item=>{
    if(item.contract_version!==5||item.account_ref!==ownAccount)return false;
    const effectiveAt=item.lifecycle_status==='active'?item.activated_at:item.created_at;
    return effectiveAt&&Date.parse(effectiveAt)<=cutoffMs;
  });
  const relevant=[],excluded=[],selected=[],counter=[],indexedPatterns=[];
  for(const group of Map.groupBy(effectivePatterns,item=>item.pattern_chain_id).values()){
    const heads=latestPatternHeads(group),chainRelated=group.some(item=>scopeCompatibility(item.scope,request).length===0);
    if(chainRelated)indexedPatterns.push(...group);
    for(const head of heads){
      const reasons=scopeCompatibility(head.scope,request);
      if(reasons.length){if(chainRelated)excluded.push({pattern_version_ref:head.pattern_version_id,reasons});continue;}
      relevant.push(head);
    }
    const active=relevant.filter(item=>item.pattern_chain_id===group[0].pattern_chain_id&&item.lifecycle_status==='active');
    if(active.length===1)selected.push(active[0]);
    else if(active.length>1)for(const item of active)excluded.push({pattern_version_ref:item.pattern_version_id,reasons:['conflicting_active_heads']});
    for(const item of relevant.filter(item=>item.pattern_chain_id===group[0].pattern_chain_id&&['contradicted','stale'].includes(item.lifecycle_status)))counter.push(item.pattern_version_id,...item.counter_evidence_refs);
    for(const item of relevant.filter(item=>item.pattern_chain_id===group[0].pattern_chain_id&&item.lifecycle_status==='candidate'))excluded.push({pattern_version_ref:item.pattern_version_id,reasons:['pending_independent_pattern_review']});
  }
  const feedback=values(state.feedback_events).filter(item=>item.contract_version===5&&item.account_ref===ownAccount&&Date.parse(item.recorded_at)<=cutoffMs);
  const retracted=new Set(feedback.map(item=>item.retracts_ref).filter(Boolean));
  const superseded=new Set(feedback.map(item=>item.supersedes_ref).filter(Boolean));
  const inferred=feedback.filter(item=>item.type==='output_feedback'&&!retracted.has(item.feedback_id)&&!superseded.has(item.feedback_id)&&scopeCompatibility(item.scope,request).length===0).map(item=>({feedback_ref:item.feedback_id,response:item.response,reason:item.reason,strength:'weak',scope:item.scope}));
  const contentConfig=state.config.content??{},explicit={...structuredClone(contentConfig.preferences??{}),style_notes:structuredClone(contentConfig.style_notes??[]),voice_samples:structuredClone(contentConfig.voice_samples??[]),audience:contentConfig.audience??null,audience_regions:structuredClone(contentConfig.audience_regions??[]),topics:structuredClone(contentConfig.topics??null),allowed_formats:structuredClone(contentConfig.allowed_formats??[]),output_language:state.config.output_language??null};
  const strategyDefinitions=Object.entries(state.strategy_definitions??{}).filter(([,item])=>!item.account_ref||item.account_ref===ownAccount);
  const strategyRefs=new Set(strategyDefinitions.map(([ref])=>ref));
  const experiments=values(state.experiments).filter(item=>{
    const action=state.actions?.[item.originating_action_id];return !action?.strategy_version_ref||strategyRefs.has(action.strategy_version_ref);
  });
  const strategyState=strategyDefinitions.map(([ref,item])=>({strategy_version_ref:ref,status:item.status??'defined',content_hash:item.strategy_hash??canonicalHash(item)}));
  const dueNeeds=experiments.filter(item=>['accepted','running','ready_for_review'].includes(item.status)).map(item=>({experiment_ref:item.experiment_id,status:item.status,observation_window:structuredClone(item.age_window_or_period??null),review_condition:item.planned_review_condition??null}));
  const signals=input.selected_signals??[];
  const base={
    contract_version:5,account_ref:ownAccount,intent:input.intent,use:input.use,goal:structuredClone(input.goal),cutoff:new Date(cutoffMs).toISOString(),
    subject_descriptor:structuredClone(input.subject_descriptor??null),subject_ref:input.subject_ref??input.subject_descriptor?.ref??null,
    topic_refs:request.topic_refs,format:request.format,surface:request.surface,task_constraints:structuredClone(input.task_constraints??{}),temporary_overrides:structuredClone(input.temporary_overrides??{}),
    content_evidence_refs:unique(input.content_evidence_refs??[]),content_evidence_fingerprints:unique(input.content_evidence_refs??[]).map(ref=>contentEvidenceFingerprint(state,ref)),metric_evidence_refs:unique(input.metric_evidence_refs??[]),
    explicit_preferences:explicit,inferred_preferences:inferred,selected_patterns:selected.map(item=>({pattern_version_ref:item.pattern_version_id,pattern_content_hash:item.pattern_content_hash,statement:item.statement,scope:item.scope,evidence_status:item.evidence_status,effect_kind:item.effect_kind,limitations:item.limitations,counter_evidence_refs:item.counter_evidence_refs})),
    counter_evidence_refs:unique(counter),excluded_patterns:excluded.sort((a,b)=>a.pattern_version_ref.localeCompare(b.pattern_version_ref)),strategy_state:strategyState.sort((a,b)=>a.strategy_version_ref.localeCompare(b.strategy_version_ref)),due_observation_needs:dueNeeds.sort((a,b)=>a.experiment_ref.localeCompare(b.experiment_ref)),
    signal_refs:unique(signals.map(item=>typeof item==='string'?item:item.signal_id??item.ref)),knowledge_dependency_versions:structuredClone(input.knowledge_dependency_versions??{}),selection_policy_version:input.selection_policy_version??'operational-context-v5'
  };
  const index={patterns:indexedPatterns.map(item=>({ref:item.pattern_version_id,hash:item.pattern_content_hash,status:item.lifecycle_status,supersedes_ref:item.supersedes_ref,activated_at:item.activated_at})).sort((a,b)=>a.ref.localeCompare(b.ref)),feedback:feedback.filter(item=>item.type==='output_feedback'&&scopeCompatibility(item.scope,request).length===0).map(item=>({ref:item.feedback_id,hash:item.event_hash,retracts_ref:item.retracts_ref,supersedes_ref:item.supersedes_ref})).sort((a,b)=>a.ref.localeCompare(b.ref)),strategies:base.strategy_state,policy:base.selection_policy_version};
  const withIndex={...base,selection_index_hash:canonicalHash(index)};
  return validate('OperationalContextV5',{...withIndex,selected_context_hash:canonicalHash(withIndex)});
}
