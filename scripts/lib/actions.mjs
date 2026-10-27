import { canonicalHash, ContractError, validate } from './contracts.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const clone = value => structuredClone(value);
const LIFECYCLE_FIELDS = new Set(['status', 'status_history', 'decision_ref', 'accepted_at', 'declined_at', 'supersedes_ref']);

export function actionPlanContent(action) {
  const content = clone(action);
  for (const field of LIFECYCLE_FIELDS) delete content[field];
  delete content.plan_hash;
  return content;
}

export function actionPlanHash(action) {
  return canonicalHash(actionPlanContent(action));
}

export function strategyDefinitionHash(definition) {
  const content = clone(definition);
  delete content.strategy_hash;
  return canonicalHash(content);
}

export function actionStrategyIdentity(definition) {
  return canonicalHash({
    change_dimension: definition.change_dimension,
    reader_behavior_hypothesis: definition.reader_behavior_hypothesis,
    goal: definition.goal,
    topic_scope: definition.topic_scope,
    format_scope: definition.format_scope,
    surface_scope: definition.surface_scope,
    primary_metric_definition_id: definition.primary_metric_definition_id,
    comparison_requirements: definition.comparison_requirements
  });
}

export function validateStrategyDefinitionV5(definition) {
  validate('StrategyDefinitionV5', definition);
  if (definition.strategy_hash !== strategyDefinitionHash(definition)) fail('STALE_BUNDLE', '/strategy_hash', 'Strategy definition hash does not match its immutable content');
  if (definition.strategy_id !== `strategy-${actionStrategyIdentity(definition).slice(0, 24)}`) fail('INVALID_INPUT', '/strategy_id', 'Strategy identity must be derived from structured change and scope');
  return clone(definition);
}

export function validateActionRecommendationV5(action, state = {}) {
  validate('ActionRecommendationV5', action);
  if (action.status !== 'proposed') fail('INVALID_INPUT', '/status', 'A new action plan must start proposed');
  if (action.plan_hash !== actionPlanHash(action)) fail('STALE_BUNDLE', '/plan_hash', 'Action plan hash does not match its immutable plan');
  const strategy = state.strategy_definitions?.[action.strategy_version_ref];
  if (!strategy) fail('MISSING_EVIDENCE', '/strategy_version_ref', 'Action strategy version must resolve to an immutable stored definition');
  validateStrategyDefinitionV5(strategy);
  if (strategy.goal !== action.goal || strategy.primary_metric_definition_id !== action.primary_metric_definition_id) fail('INVALID_EVIDENCE_REF', '/strategy_version_ref', 'Action goal and primary metric must match its strategy version');
  return clone(action);
}

function v4ProjectionMatches(thin, full) {
  const fullEvidence = [...new Set([
    ...(full.account_evidence_refs ?? []), ...(full.content_evidence_refs ?? []),
    ...(full.rule_version_refs ?? []), ...(full.guardrail_metric_refs ?? [])
  ])].sort();
  const thinEvidence = [...new Set(thin.evidence_refs ?? [])].sort();
  return thin.action_id === full.action_id && thin.objective === full.objective && thin.target === full.target
    && thin.change === full.change && thin.primary_metric_ref === full.primary_metric_ref
    && canonicalHash(thinEvidence) === canonicalHash(fullEvidence);
}

/** Materialize a reviewed-shape V4 proposal into canonical full V2 actions before review. */
export function materializeCoachingActions(state, { proposal_ref, actions, created_at } = {}) {
  const proposal = state.coaching_reports?.[proposal_ref];
  if (!proposal || ![4, 5].includes(proposal.contract_version)) fail('MISSING_EVIDENCE', '/proposal_ref', 'A saved V4 or V5 coaching proposal is required');
  if (!created_at) fail('INVALID_INPUT', '/created_at', 'Materialization requires the actual creation time');
  const full = actions ?? [];
  if (full.length !== proposal.actions.length) fail('REQUESTED_OUTPUT_INCOMPLETE', '/actions', 'Every thin proposal action needs one complete action plan');
  const byId = new Map(full.map(action => [action.action_id, action]));
  if (byId.size !== full.length) fail('INVALID_INPUT', '/actions', 'Action IDs must be unique');
  const next = clone(state), refs = [], plan_hashes = [];
  next.actions ??= {};
  for (const thin of proposal.actions) {
    const action = byId.get(thin.action_id);
    if (!action) fail('REQUESTED_OUTPUT_INCOMPLETE', '/actions', `Complete plan is missing for ${thin.action_id}`);
    if (proposal.contract_version === 5) {
      validateActionRecommendationV5(action, next);
      if (canonicalHash(action) !== canonicalHash(thin)) fail('RECEIPT_CONFLICT', '/actions', `Materialization must use the exact proposed V5 action: ${thin.action_id}`);
      const strategy = next.strategy_definitions?.[action.strategy_version_ref];
      if (!strategy) fail('MISSING_EVIDENCE', '/strategy_version_ref', `Strategy version is missing: ${action.strategy_version_ref}`);
      const aliases = Object.entries(next.strategy_definitions).filter(([, candidate]) => candidate.strategy_hash === strategy.strategy_hash).map(([ref]) => ref);
      if (aliases.length !== 1 || aliases[0] !== action.strategy_version_ref) fail('STATE_CONFLICT', '/strategy_version_ref', 'Strategy version must resolve to one exact immutable collection key');
    } else validate('ActionRecommendationV2', action);
    if (action.status !== 'proposed') fail('INVALID_INPUT', '/actions/status', 'Materialized actions must remain proposed');
    if (proposal.contract_version === 4 && !v4ProjectionMatches(thin, action)) fail('RECEIPT_CONFLICT', '/actions', `Thin proposal differs from complete plan ${thin.action_id}`);
    const existing = next.actions[action.action_id];
    if (existing && actionPlanHash(existing) !== actionPlanHash(action)) fail('STATE_CONFLICT', '/actions', `Action ID identifies a different immutable plan: ${action.action_id}`);
    next.actions[action.action_id] = existing ?? clone(action);
    refs.push(action.action_id); plan_hashes.push(actionPlanHash(action));
  }
  return { nextState: next, result: { contract_version: proposal.contract_version, proposal_ref, action_refs: refs, action_plan_hashes: plan_hashes, materialized_at: created_at } };
}

function currentApprovedReceipt(state, actionId, planHash) {
  const receipts = Object.values(state.guidance_receipts ?? {}).filter(receipt => receipt.subject_ref === actionId);
  const superseded = new Set(receipts.map(receipt => receipt.supersedes_receipt_ref).filter(Boolean));
  const active = receipts.filter(receipt => !superseded.has(receipt.receipt_id) && receipt.decision === 'approved' && receipt.subject_content_hash === planHash);
  if (active.length !== 1) return null;
  const receipt = active[0], actual = state.host_media_receipts?.[receipt.actual_review_receipt_ref];
  if (!actual || actual.decision !== 'approved' || canonicalHash(actual.checks) !== canonicalHash(receipt.checks) || canonicalHash(actual.issues) !== canonicalHash(receipt.issues)) return null;
  if (!Object.keys(receipt.checks ?? {}).length || Object.values(receipt.checks).some(value => value !== true) || receipt.issues?.length) return null;
  if (receipt.contract_version === 5) {
    const output = state.guidance_outputs?.[receipt.output_material_ref];
    if (!output?.action_plan_hashes?.includes(planHash) || !receipt.action_plan_hashes?.includes(planHash)) return null;
  }
  return receipt;
}

export function actionOriginatingProposalRef(state, actionId) {
  const direct = state.actions?.[actionId]?.originating_proposal_ref;
  if (direct) return direct;
  return Object.values(state.coaching_reports ?? {}).find(report => report.contract_version === 4 && report.actions?.some(action => action.action_id === actionId))?.proposal_id ?? null;
}

export function actionOriginalGoal(state, actionId) {
  const action = state.actions?.[actionId];
  if (action?.contract_version === 5) return action.goal;
  const report = Object.values(state.coaching_reports ?? {}).find(item => item.actions?.some(candidate => candidate.action_id === actionId));
  if (!report) return null;
  const run = state.coaching_runs?.[report.run_ref];
  const context = run && state.rule_contexts?.[run.rule_context_ref];
  return context?.goal?.primary_goal ?? context?.goal ?? state.evidence_bundles?.[report.bundle_id]?.goal_snapshot?.primary_goal ?? null;
}

export function actionRequiresCurrentApproval(state, actionId) {
  return Boolean(state?.schema_version === 5 || actionOriginatingProposalRef(state, actionId) || state.actions?.[actionId]?.contract_version === 5);
}

export function assertActionCurrentlyApproved(state, actionId, { approved_guidance = null } = {}) {
  const action = state.actions?.[actionId];
  if (!action) fail('MISSING_EVIDENCE', '/action_id', 'Action does not exist');
  const proposalRef = actionOriginatingProposalRef(state, actionId);
  if (state?.schema_version === 5 && !proposalRef) fail('MISSING_EVIDENCE', '/action_id', 'A legacy action without review origin must be re-reviewed through a current proposal or replaced before acceptance');
  const planHash = action.plan_hash ?? actionPlanHash(action);
  if (action.plan_hash && action.plan_hash !== actionPlanHash(action)) fail('STALE_BUNDLE', '/plan_hash', 'Stored action plan changed after review');
  if (approved_guidance) {
    if (approved_guidance.readiness !== 'ready' || approved_guidance.subject_ref !== (proposalRef ?? actionId) || !approved_guidance.action_plan_hashes?.includes(planHash)) fail('MISSING_EVIDENCE', '/action_id', 'Verified current guidance does not approve this exact action plan');
    return { action: clone(action), plan_hash: planHash, guidance_receipt_ref: approved_guidance.active_receipt_ref };
  }
  const receipt = currentApprovedReceipt(state, actionId, planHash);
  if (!receipt) fail('MISSING_EVIDENCE', '/action_id', 'The exact current action plan requires approved guidance review');
  return { action: clone(action), plan_hash: planHash, guidance_receipt_ref: receipt.receipt_id };
}

export function finalizeMaterializedCoaching(state, { proposal_ref, action_ids, approved_guidance = null } = {}) {
  const proposal = state.coaching_reports?.[proposal_ref];
  if (!proposal) fail('MISSING_EVIDENCE', '/proposal_ref', 'Coaching proposal is missing');
  const expected = proposal.actions.map(action => action.action_id);
  if (canonicalHash(action_ids) !== canonicalHash(expected)) fail('INVALID_EVIDENCE_REF', '/action_ids', 'Finalize must name every materialized proposal action in proposal order');
  const approvals = action_ids.map(actionId => assertActionCurrentlyApproved(state, actionId, { approved_guidance }));
  return { contract_version: proposal.contract_version, proposal_ref, action_refs: [...action_ids], action_plan_hashes: approvals.map(item => item.plan_hash), guidance_receipt_refs: approvals.map(item => item.guidance_receipt_ref), adoption_readiness: 'ready' };
}

export function actionSupportsPublication(action) {
  return new Set(['post_ids', 'content_series', 'publishing_habit']).has(action?.target);
}

function executionEvidenceExists(state,ref){return Boolean(state.raw_receipts?.[ref]||state.sources?.[ref]||state.user_facts?.[ref]||state.collection_receipts_v4?.[ref]||state.collection_receipts?.[ref]||state.host_media_receipts?.[ref]);}

export function recordNonPostExecutionV5(state,execution){
  validate('ActionExecutionV5',execution);const action=state.actions?.[execution.action_id];
  if(!action||action.status!=='accepted')fail('STATE_CONFLICT','/action_id','Non-post execution requires an accepted action');
  if(!['profile','data_collection'].includes(action.target))fail('INVALID_INPUT','/execution_kind','Only profile and data-collection actions use non-post execution records');
  const expectedKind=action.target==='profile'?'profile_change':'data_collection';if(execution.execution_kind!==expectedKind)fail('INVALID_INPUT','/execution_kind','Execution kind must match the accepted action target');
  const planHash=action.plan_hash??actionPlanHash(action);if(execution.action_plan_hash!==planHash)fail('STALE_BUNDLE','/action_plan_hash','Execution must bind the accepted immutable action plan');
  if(execution.execution_evidence_refs.some(ref=>!executionEvidenceExists(state,ref)))fail('MISSING_EVIDENCE','/execution_evidence_refs','Execution evidence must resolve to actual stored material');
  const next=clone(state);next.action_decisions??={};const old=next.action_decisions[execution.execution_id];if(old&&canonicalHash(old)!==canonicalHash(execution))fail('STATE_CONFLICT','/execution_id','Execution ID identifies different content');next.action_decisions[execution.execution_id]=old??clone(execution);return next;
}

export function actionExecutionView(state,actionId){
  const executions=Object.values(state.action_decisions??{}).filter(item=>item.contract_version===5&&item.action_id===actionId).sort((a,b)=>a.execution_id.localeCompare(b.execution_id));
  return{action_id:actionId,executed:executions.some(item=>item.feedback.status==='completed'),execution_refs:executions.map(item=>item.execution_id),executions:clone(executions),effect_sample_n:0};
}
