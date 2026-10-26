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
