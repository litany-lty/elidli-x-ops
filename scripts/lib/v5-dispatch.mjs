import { canonicalHash, ContractError } from './contracts.mjs';
import { commitState, putImmutable } from './state.mjs';
import { buildRuleContextV5, knowledgeBundleFromState, validateRuleApplicationV5 } from './knowledge.mjs';
import { prepareCoachingV5, validateCoachingProposalV5 } from './coaching.mjs';
import { materializeCoachingActions, finalizeMaterializedCoaching, actionPlanHash, actionOriginatingProposalRef, recordNonPostExecutionV5, actionExecutionView, validateStrategyDefinitionV5 } from './actions.mjs';
import { validateGuidanceOutputV5, validateGuidanceReceiptV5, evaluateGuidanceReadinessV5 } from './guidance.mjs';
import { applyActionDecision, applyExperimentTransition, createExperimentFromAction } from './experiments.mjs';
import { applyExperimentTransitionV4 } from './experiments.mjs';
import { buildReviewComputationV4 } from './review.mjs';
import { buildOperationalContext } from './consumer-context.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };

async function runtimeDependencies(overrides = {}) {
  let resolveSubjectV5 = overrides.resolveSubjectV5, verifyHostReviewV5 = overrides.verifyHostReviewV5;
  if (!resolveSubjectV5) {
    const subjects = await import('./subjects.mjs');
    resolveSubjectV5 = subjects.resolveSubjectV5 ?? subjects.resolveSubject;
  }
  if (!verifyHostReviewV5) {
    const host = await import('./host-review-v5.mjs');
    verifyHostReviewV5 = host.verifyHostReviewV5 ?? host.verifyHostReview;
  }
  if (!resolveSubjectV5 || !verifyHostReviewV5) fail('CAPABILITY_UNAVAILABLE', '/dispatcher', 'V5 subject resolution and actual host review verification are required');
  return { resolveSubjectV5, verifyHostReviewV5 };
}

function isActiveReceipt(receipt, receipts) {
  return !receipts.some(item => item.contract_version === 5
    && item.delivery_id === receipt.delivery_id
    && item.subject_ref === receipt.subject_ref
    && item.supersedes_receipt_ref === receipt.receipt_id);
}

export function ruleContextCompatibleV5(context,active){
  try{const replay=buildRuleContextV5({...context,context_id:context.context_id,explicit_rule_version_refs:context.explicit_rule_version_refs??[]},active);for(const key of ['selections','selected_rule_hashes','selected_fact_hashes','selected_dependency_hashes'])if(canonicalHash(replay[key]??{})!==canonicalHash(context[key]??{}))return false;return true;}catch{return false;}
}

export async function verifySemanticChecksV5(state,data,{verifyHostReviewV5}){
  for(const check of data.checks.filter(item=>item.check_type==='semantic')){const receipt=state.host_media_receipts?.[check.review_ref];if(!receipt||!['review_signals','review_edit_prescription','review_guidance'].includes(receipt.purpose))fail('MISSING_EVIDENCE','/checks/review_ref','Semantic applicability requires a saved actual semantic review');await verifyHostReviewV5(receipt,{expectedPurpose:receipt.purpose,expectedSubjectRef:data.subject_ref,expectedSubjectContentHash:data.actual_input_hash});if(receipt.decision!=='approved')fail('INVALID_EVIDENCE_REF','/checks/review_ref','A denied semantic review cannot support an applicable check');}
}

/** A user-directed edit is separate from algorithm applicability and needs its actual current request. */
export function verifyRulePreferenceEvidenceV5(state,application,context){
  const checks=new Map(application.checks.map(check=>[check.check_id,check])),events=Object.values(state.feedback_events??{}),accountRef=state.account.user_id??`handle:${state.account.handle}`,selected=new Set([...(context.signal_set.selected_evidence_refs??[]),...(context.operational_context?.content_evidence_refs??[])]),goal=context.goal?.primary_goal??context.goal;
  for(const action of application.actions.filter(action=>action.disposition==='modify'&&action.basis_kind==='user_preference')){
    const refs=action.supporting_check_refs.flatMap(ref=>checks.get(ref)?.inspected_refs??[]);
    const supported=refs.some(ref=>{
      const event=state.feedback_events?.[ref],scope=event?.scope;
      if(event?.type!=='explicit_preference'||event.account_ref!==accountRef||Date.parse(event.recorded_at)>Date.parse(context.cutoff)||events.some(item=>item.retracts_ref===ref||item.supersedes_ref===ref))return false;
      if(scope?.goal!==null&&scope?.goal!==undefined&&canonicalHash(scope.goal?.primary_goal??scope.goal)!==canonicalHash(goal))return false;
      if(scope?.use&&scope.use!==context.use||scope?.formats?.length&&!scope.formats.includes(context.operational_context?.format)||scope?.surfaces?.length&&!scope.surfaces.includes(context.surface)||scope?.topics?.length&&!scope.topics.some(topic=>context.operational_context?.topic_refs?.includes(topic)))return false;
      if(event.persistence==='temporary')return selected.has(ref);
      return Object.values(state.preference_meta??{}).some(meta=>meta.feedback_head_ref===ref)||event.operations.some(operation=>{
        if(operation.op!=='set')return false;
        const value=operation.path.slice(1).split('/').map(part=>part.replace(/~1/g,'/').replace(/~0/g,'~')).reduce((value,key)=>value?.[key],state.config);
        return value!==undefined&&canonicalHash(value)===canonicalHash(operation.value);
      });
    });
    if(!supported)fail('MISSING_EVIDENCE','/actions/supporting_check_refs','User-preference modification requires a saved current explicit request selected for this task');
  }
}

export async function currentGuidanceV5(state, subjectRef, { resolveSubjectV5, verifyHostReviewV5, intent = 'coach', use = null, goal = null } = {}) {
  if (use === 'plain_edit') return { readiness: 'ready', reasons: [], active_receipt_ref: null, subject: null };
  if (!resolveSubjectV5 || !verifyHostReviewV5) ({ resolveSubjectV5, verifyHostReviewV5 } = await runtimeDependencies({ resolveSubjectV5, verifyHostReviewV5 }));
  const subject = await resolveSubjectV5(state, subjectRef), contexts = Object.values(state.rule_contexts ?? {}).filter(context => context.contract_version === 5 && context.subject_ref === subjectRef && (!use || context.use === use) && (!goal || canonicalHash(context.goal) === canonicalHash(goal)) && context.intent === intent);
  const active = knowledgeBundleFromState(state), proposal = state.coaching_reports?.[subjectRef], run = proposal && state.coaching_runs?.[proposal.run_ref];
  const currentContexts = contexts.filter(context => {
    try {
      const prior = context.operational_context ?? (run?.operational_context && context.personal_context_selection_hash === run.selected_operational_context_hash ? run.operational_context : null);
      if(prior){const rebuilt = buildOperationalContext(state,{ intent: prior.intent, use: prior.use, goal: prior.goal, cutoff: prior.cutoff, subject_descriptor: prior.subject_descriptor, subject_ref: prior.subject_ref, topic_refs: prior.topic_refs, format: prior.format, surface: prior.surface, task_constraints: prior.task_constraints, temporary_overrides: prior.temporary_overrides, content_evidence_refs: prior.content_evidence_refs, metric_evidence_refs: prior.metric_evidence_refs, selected_signals: prior.signal_refs, model_selection: prior.model_selection, knowledge_dependency_versions: prior.knowledge_dependency_versions, selection_policy_version: prior.selection_policy_version });if(context.personal_context_selection_hash!==rebuilt.selected_context_hash)return false;}
      return ruleContextCompatibleV5(context,active);
    } catch { return false; }
  });
  const receipts = Object.values(state.guidance_receipts ?? {}), candidates = [];
  for (const receipt of receipts.filter(item => item.contract_version === 5 && item.subject_ref === subjectRef && item.subject_content_hash === subject.content_hash && isActiveReceipt(item, receipts))) {
    const application = state.rule_applications?.[receipt.application_ref], context = currentContexts.find(item => item.context_id === application?.context_ref), output = state.guidance_outputs?.[receipt.output_material_ref];
    if (!application || !context || !output || application.actual_input_hash !== subject.content_hash) continue;
    const actual = state.host_media_receipts?.[receipt.actual_review_receipt_ref];
    if (!actual) continue;
    try { verifyRulePreferenceEvidenceV5(state,application,context);await verifyHostReviewV5(actual, { expectedPurpose: 'review_guidance', expectedSubjectRef: subjectRef, expectedSubjectContentHash: subject.content_hash }); }
    catch { continue; }
    candidates.push({ receipt, application, context, output, actual });
  }
  const readiness = candidates.map(candidate => ({ candidate, result: evaluateGuidanceReadinessV5({ output: candidate.output, application: candidate.application, context: candidate.context, subject, receipts, actualReviewReceipts: { [candidate.actual.receipt_id]: candidate.actual }, state }) })).filter(item => item.result.active_receipt_ref === item.candidate.receipt.receipt_id);
  if (readiness.length !== 1) return { readiness: 'needs_review', reasons: ['missing_or_conflicting_active_guidance_receipt'], active_receipt_ref: null, subject };
  return { ...readiness[0].result, subject };
}

export async function approvedProposalActionViewV5(state, proposalRef, deps) {
  const proposal = state.coaching_reports?.[proposalRef], run = proposal && state.coaching_runs?.[proposal.run_ref];
  if (!proposal || ![4, 5].includes(proposal.contract_version) || !run) fail('MISSING_EVIDENCE', '/proposal_ref', 'Saved coaching proposal and run are required for a new V5 review');
  const originalContext = state.rule_contexts?.[run.rule_context_ref], originalGoal = originalContext?.goal ?? (typeof run.goal === 'string' ? { primary_goal: run.goal, goal_notes: null, source: 'temporary_assumption' } : run.goal);
  const gate = await currentGuidanceV5(state, proposalRef, { ...deps, intent: 'coach', use: run.use, goal: originalGoal });
  const hashes = proposal.actions.map(item => {
    const action = state.actions?.[item.action_id];
    if (!action) fail('MISSING_EVIDENCE', '/actions', 'Complete canonical actions must be materialized before approval');
    return action.plan_hash ?? actionPlanHash(action);
  });
  return { readiness: gate.readiness, subject_ref: proposalRef, action_plan_hashes: hashes, active_receipt_ref: gate.active_receipt_ref };
}

export async function approvedActionViewV5(state, actionId, deps) {
  const proposalRef = actionOriginatingProposalRef(state, actionId);
  if (!proposalRef) fail('MISSING_EVIDENCE', '/action_id', 'Action has no originating reviewed proposal');
  return approvedProposalActionViewV5(state, proposalRef, deps);
}

async function recordV5(request, dir, state, deps) {
  const payload = request.payload, data = payload.data;
  if (payload.operation === 'guidance_review_result') {
    await deps.verifyHostReviewV5(data, { expectedPurpose: data.purpose, expectedSubjectRef: data.subject_ref, expectedSubjectContentHash: data.subject_content_hash });
    const next = await commitState(dir, request.expected_revision, working => { putImmutable(working.host_media_receipts, data.receipt_id, data); return working; });
    return { state: next, data: { record_refs: [data.receipt_id], state_revision: next.revision } };
  }
  if (payload.operation === 'experiment_plan') {
    const proof = await approvedActionViewV5(state, data.originating_action_id, deps); let result;
    const next = await commitState(dir, request.expected_revision, working => { const advanced = createExperimentFromAction(working, { experiment: data, approved_guidance: proof }); result = advanced.result; return advanced.nextState; });
    return { state: next, data: result };
  }
  if (payload.operation === 'action_decision') {
    const proof = data.decision === 'accepted' ? await approvedActionViewV5(state, data.action_id, deps) : null;
    const next = await commitState(dir, request.expected_revision, working => applyActionDecision(working, data, { approved_guidance: proof }));
    return { state: next, data: { record_refs: [data.action_id], state_revision: next.revision } };
  }
  if(payload.operation==='non_post_execution'){
    const next=await commitState(dir,request.expected_revision,working=>recordNonPostExecutionV5(working,data));
    return{state:next,data:{record_refs:[data.execution_id],action_execution:actionExecutionView(next,data.action_id),state_revision:next.revision}};
  }
  if (payload.operation === 'experiment') {
    const actionId = state.experiments?.[data.experiment_id]?.originating_action_id, proof = data.type === 'accept' && actionId ? await approvedActionViewV5(state, actionId, deps) : null;
    const next = await commitState(dir, request.expected_revision, working => applyExperimentTransition(working, data, { ...(payload.actual_evidence ?? {}), approved_guidance: proof }));
    return { state: next, data: { record_refs: [data.experiment_id], state_revision: next.revision } };
  }
  const next = await commitState(dir, request.expected_revision, async working => {
    if (payload.operation === 'strategy_definition') {
      const strategy = validateStrategyDefinitionV5(data), ref = payload.strategy_version_ref;
      if (!ref) fail('INVALID_INPUT', '/strategy_version_ref', 'Strategy definition requires its immutable collection key');
      putImmutable(working.strategy_definitions, ref, strategy);
    } else if (payload.operation === 'rule_application') {
      const context = working.rule_contexts?.[data.context_ref]; if (!context) fail('MISSING_EVIDENCE', '/context_ref', 'V5 rule context is missing');
      const subject = await deps.resolveSubjectV5(working, data.subject_ref); if (subject.content_hash !== data.actual_input_hash) fail('STALE_BUNDLE', '/actual_input_hash', 'Rule application does not bind the current subject');
      await verifySemanticChecksV5(working,data,deps);
      verifyRulePreferenceEvidenceV5(working,data,context);
      validateRuleApplicationV5(data, context, knowledgeBundleFromState(working)); putImmutable(working.rule_applications, data.application_id, data);
    } else if (payload.operation === 'guidance_output') {
      validateGuidanceOutputV5(data, working); for (const ref of data.deliverable_refs) await deps.resolveSubjectV5(working, ref); putImmutable(working.guidance_outputs, data.output_id, data);
    } else if (payload.operation === 'guidance_receipt') {
      const output = working.guidance_outputs?.[data.output_material_ref], application = working.rule_applications?.[data.application_ref], context = application && working.rule_contexts?.[application.context_ref], actual = working.host_media_receipts?.[data.actual_review_receipt_ref];
      if (!output || !application || !context || !actual) fail('MISSING_EVIDENCE', '/data', 'V5 guidance dependencies must be saved first');
      const subject = await deps.resolveSubjectV5(working, data.subject_ref); await deps.verifyHostReviewV5(actual, { expectedPurpose: 'review_guidance', expectedSubjectRef: data.subject_ref, expectedSubjectContentHash: subject.content_hash });
      validateGuidanceReceiptV5(data, { output, application, context, subject, actualReviewReceipt: actual, receipts: Object.values(working.guidance_receipts ?? {}), state: working }); putImmutable(working.guidance_receipts, data.receipt_id, data);
    } else fail('INVALID_INPUT', '/operation', `Unsupported V5 record operation: ${payload.operation}`);
    return working;
  });
  return { state: next, data: { record_refs: [payload.strategy_version_ref ?? data.receipt_id ?? data.application_id ?? data.output_id], state_revision: next.revision } };
}

/** State-5 coach/guidance/action dispatcher; command registry and top-level routing stay external. */
export async function dispatchV5(command, request, dir, state, overrides = {}) {
  if (!state || state.schema_version !== 5) fail('MIGRATION_REQUIRED', '/schema_version', 'V5 dispatcher requires a state 5 container');
  const deps = await runtimeDependencies(overrides), payload = request.payload;
  if (command === 'review') {
    let result; const next = await commitState(dir, request.expected_revision, working => {
      if (payload.operation === 'compute') { const plan = working.experiment_plan_views?.[payload.plan_view_ref]; if (!plan) fail('MISSING_EVIDENCE', '/plan_view_ref', 'Plan view is missing'); result = buildReviewComputationV4(working, plan, payload); putImmutable(working.review_computations, result.computation_id, result); return working; }
      const advanced = applyExperimentTransitionV4(working, payload.event); result = { experiment: advanced.experiments[payload.event.experiment_id] }; return advanced;
    });
    return { state: next, data: payload.operation === 'compute' ? { review_computation: result } : result };
  }
  if (command === 'coach-step') {
    if (payload.operation === 'finalize') { const proof = await approvedProposalActionViewV5(state, payload.proposal_ref, deps); return { state, data: finalizeMaterializedCoaching(state, { proposal_ref: payload.proposal_ref, action_ids: payload.action_ids, approved_guidance: proof }) }; }
    if (payload.operation === 'materialize') { let result; const next = await commitState(dir, request.expected_revision, working => { const advanced = materializeCoachingActions(working, { proposal_ref: payload.proposal_ref, actions: payload.actions, created_at: payload.as_of }); result = advanced.result; return advanced.nextState; }); return { state: next, data: result }; }
    let result; const next = await commitState(dir, request.expected_revision, async working => {
      const bundle = knowledgeBundleFromState(working);
      if (payload.operation === 'prepare') {
        const actual = [];
        for (const ref of payload.request.actual_review_receipt_refs) { const receipt = working.host_media_receipts?.[ref]; if (!receipt) fail('MISSING_EVIDENCE', '/actual_review_receipt_refs', `Actual signal review is missing: ${ref}`); await deps.verifyHostReviewV5(receipt, { expectedPurpose: 'review_signals' }); actual.push(receipt); }
        result = prepareCoachingV5(working, payload.request, { catalog: bundle, actual_review_receipts: actual }); putImmutable(working.coaching_runs, result.run.run_id, result.run); putImmutable(working.evidence_bundles, result.evidence_bundle.bundle_id, result.evidence_bundle); putImmutable(working.rule_contexts, result.rule_context.context_id, result.rule_context); return working;
      }
      if (payload.operation === 'propose') { const proposal = payload.proposal, run = working.coaching_runs?.[proposal.run_ref]; if (!run) fail('MISSING_EVIDENCE', '/run_ref', 'Prepare this V5 coaching run first'); result = validateCoachingProposalV5(proposal, { run, state: working, evidence_bundle: working.evidence_bundles?.[run.evidence_bundle_ref], rule_context: working.rule_contexts?.[run.rule_context_ref] }); putImmutable(working.coaching_reports, result.proposal_id, result); return working; }
      fail('INVALID_INPUT', '/operation', `Unsupported V5 coach operation: ${payload.operation}`);
    });
    return { state: next, data: payload.operation === 'propose' ? { ...result, guidance_readiness: 'needs_review', task_readiness: 'not_ready' } : result };
  }
  if (command === 'record') return recordV5(request, dir, state, deps);
  fail('INVALID_INPUT', '/command', `Unsupported V5 dispatcher command: ${command}`);
}
