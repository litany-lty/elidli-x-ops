import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { isContentAnalysisCurrent } from './post-content.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const values = value => Object.values(value ?? {});

function currentContentAnalyses(state) {
  const current=values(state.content_analyses).filter(analysis => {
    const version = state.post_versions?.[analysis.post_version_ref];
    return version && isContentAnalysisCurrent(analysis, version, analysis.analysis_version,state.post_versions);
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
export function buildConsumerContext(state, { intent, goal_snapshot: goalSnapshot }) {
  if (state?.schema_version !== 2) fail('MIGRATION_REQUIRED', '/state/schema_version', 'Personalized draft and news context requires a V2 state');
  if (!['draft', 'news'].includes(intent)) fail('INVALID_INPUT', '/intent', 'Consumer intent must be draft or news');
  validate('GoalSnapshotV2', goalSnapshot);

  const analyses = currentContentAnalyses(state).sort((left, right) => left.analysis_id.localeCompare(right.analysis_id));
  const voiceSamples = (state.config?.content?.voice_samples ?? [])
    .filter(sample => sample.confirmed_by_user && state.sources?.[sample.source_ref])
    .sort((left, right) => left.sample_id.localeCompare(right.sample_id));
  const actions = values(state.actions).sort((left, right) => left.action_id.localeCompare(right.action_id));
  const activeExperiments = values(state.experiments)
    .filter(experiment => ['proposed', 'accepted', 'running', 'ready_for_review'].includes(experiment.status))
    .sort((left, right) => left.experiment_id.localeCompare(right.experiment_id));
  const reviews = values(state.experiment_reviews)
    .filter(review => state.experiments?.[review.experiment_id]?.status === 'closed')
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
      value: { experiment_id: item.experiment_id, conclusion: item.conclusion, reason: item.reason, metric_results: structuredClone(item.metric_results), evidence_refs: [...item.evidence_refs] },
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
