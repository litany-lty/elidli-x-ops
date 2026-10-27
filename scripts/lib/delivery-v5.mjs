import { buildOperationalContext, goalSnapshotFromState } from './consumer-context.mjs';
import { currentGuidanceV5 } from './v5-dispatch.mjs';
import { buildSignalSetV5 } from './signals.mjs';
import { buildRuleContextV5, knowledgeBundleFromState } from './knowledge.mjs';
import { commitState, putImmutable } from './state.mjs';

async function dependencies(overrides = {}) {
  if (overrides.resolveSubjectV5 && overrides.verifyHostReviewV5) return overrides;
  const subjects = await import('./subjects.mjs'), host = await import('./host-review-v5.mjs');
  return { resolveSubjectV5: overrides.resolveSubjectV5 ?? subjects.resolveSubjectV5 ?? subjects.resolveSubject, verifyHostReviewV5: overrides.verifyHostReviewV5 ?? host.verifyHostReviewV5 ?? host.verifyHostReview };
}

/** Uniform state-5 delivery gate; compatibility payloads do not bypass current V5 guidance. */
export async function guardDeliveryV5(command, request, dir, result, overrides = {}) {
  let { state, data } = result; if (state?.schema_version !== 5 || !data) return result;
  const payload = request.payload, deps = await dependencies(overrides); let subjectRef, intent, use, contentReadiness;
  if (command === 'content-step' && ['finalize', 'resume', 'restore'].includes(payload.operation)) { const run = state.content_runs?.[payload.run_id]; subjectRef = run?.active_pack_ref; intent = run?.delivery_intent ?? 'operational_optimize'; use = run?.delivery_use ?? 'operational_guidance'; contentReadiness = data.pack_readiness ?? { readiness: data.run?.status === 'ready' ? 'ready' : 'incomplete' }; }
  else if (command === 'coach-step') { if (payload.operation === 'prepare') return { state, data: { ...data, task_readiness: 'not_ready', guidance_required: true } }; subjectRef = data.proposal_id ?? data.proposal_ref; const proposal = state.coaching_reports?.[subjectRef], run = state.coaching_runs?.[proposal?.run_ref]; intent = 'coach'; use = run?.use ?? 'coaching'; contentReadiness = { readiness: ['propose', 'finalize'].includes(payload.operation) ? 'ready' : 'incomplete' }; }
  else if (command === 'review') { subjectRef = payload.event?.type === 'close' ? payload.event.review_id : data.review_computation?.computation_id ?? payload.event?.computation_ref; intent = 'review'; use = 'performance_review'; contentReadiness = { readiness: 'ready' }; }
  else if (command === 'news-step' && payload.operation === 'finalize') { subjectRef = request.run_id ?? payload.run_id; intent = 'news'; use = 'topic_selection'; contentReadiness = { readiness: data.run_result?.execution_status === 'complete' ? 'ready' : 'incomplete' }; }
  else if (command === 'record' && payload.operation === 'draft_review') { const draft = payload.contract_version === 5 ? payload.draft : payload.data.draft, receipt = payload.contract_version === 5 ? payload.receipt : payload.data.review_receipt; subjectRef = `${draft.draft_id}:${draft.revision}`; intent = receipt.delivery_intent ?? 'operational_optimize'; use = intent === 'plain_edit' ? 'plain_edit' : 'operational_guidance'; contentReadiness = { readiness: receipt.decision === 'approved' ? 'ready' : 'needs_review' }; }
  else if (command === 'draft-check') return { state, data: { ...data, task_readiness: payload.delivery_intent === 'plain_edit' && data.readiness === 'ready' ? 'ready' : 'not_ready', guidance_required: payload.delivery_intent !== 'plain_edit' } };
  else return result;
  if (!subjectRef) return { state, data: { ...data, task_readiness: 'not_ready', guidance_required: true, limitations: [...(data.limitations ?? []), 'Exact V5 deliverable subject is missing'] } };
  if (use === 'plain_edit') return { state, data: { ...data, content_readiness: contentReadiness, guidance_required: false, guidance_readiness: { readiness: 'not_required', reasons: [], active_receipt_ref: null }, task_readiness: contentReadiness.readiness === 'ready' ? 'ready' : 'not_ready' } };
  const proposal = state.coaching_reports?.[subjectRef], run = state.coaching_runs?.[proposal?.run_ref], originalContext = run && state.rule_contexts?.[run.rule_context_ref], goal = intent === 'coach' ? (originalContext?.goal ?? (typeof run?.goal === 'string' ? { primary_goal: run.goal, goal_notes: null, source: 'temporary_assumption' } : run?.goal)) : goalSnapshotFromState(state);
  const active = knowledgeBundleFromState(state), resolvedSubject = await deps.resolveSubjectV5(state, subjectRef), contexts = Object.values(state.rule_contexts ?? {}).filter(context => context.contract_version === 5 && context.subject_ref === subjectRef && context.subject_hash === resolvedSubject.content_hash && context.intent === intent && context.use === use && context.catalog_ref === active.catalog.catalog_id && context.catalog_content_hash === active.catalog.catalog_content_hash);
  const existing = contexts.find(context => {
    const prior = context.operational_context;
    if (!prior) return false;
    try { return buildOperationalContext(state, { ...prior, selected_signals: prior.signal_refs }).selected_context_hash === context.personal_context_selection_hash; } catch { return false; }
  }); let currentContext = existing;
  if (!existing) {
    const subject = resolvedSubject, cutoff = payload.as_of ?? run?.cutoff ?? state.review_computations?.[payload.event?.computation_ref ?? subjectRef]?.computed_at ?? new Date().toISOString();
    const prior = contexts.at(-1), signalSet = prior?.signal_set ?? buildSignalSetV5({ subject, cutoff }), priorOperational = prior?.operational_context;
    const operational = buildOperationalContext(state, priorOperational ? { ...priorOperational, subject_descriptor: subject, selected_signals: priorOperational.signal_refs } : { intent: intent === 'operational_optimize' ? 'content' : intent, use, goal, cutoff, subject_descriptor: subject, subject_ref: subjectRef, topic_refs: [], format: subject.format ?? null, surface: subject.surface ?? null, task_constraints: {}, temporary_overrides: {}, content_evidence_refs: [], metric_evidence_refs: [], selected_signals: Object.keys(signalSet.signals).map(name => `${signalSet.signal_set_hash}:${name}`), knowledge_dependency_versions: { catalog_ref: active.catalog.catalog_id, catalog_content_hash: active.catalog.catalog_content_hash }, selection_policy_version: 'delivery-operational-context-v5' });
    const context = buildRuleContextV5({ run_id: request.run_id ?? payload.run_id ?? subjectRef, intent, goal, use, surface: subject.surface ?? null, post_type: subject.post_type ?? null, subject_ref: subjectRef, subject_hash: subject.content_hash, cutoff, signal_set: signalSet, personal_context_selection_ref: `operational-context-${operational.selected_context_hash.slice(0, 24)}`, personal_context_selection_hash: operational.selected_context_hash, operational_context:operational }, active);
    state = await commitState(dir, state.revision, working => { putImmutable(working.rule_contexts, context.context_id, context); return working; });
    currentContext = context;
  }
  const gate = await currentGuidanceV5(state, subjectRef, { ...deps, intent, use, goal });
  const taskReadiness = contentReadiness.readiness === 'ready' && gate.readiness === 'ready' ? 'ready' : 'not_ready';
  data = { ...data, content_readiness: contentReadiness, guidance_required: use !== 'plain_edit', guidance_readiness: gate, task_readiness: use === 'plain_edit' ? (contentReadiness.readiness === 'ready' ? 'ready' : 'not_ready') : taskReadiness, rule_context: currentContext };
  if (data.task_readiness !== 'ready' && data.guidance_required) data.user_summary = '当前内容与依据已保存，完整运营指导仍需当前 V5 独立审核。';
  return { state, data };
}
