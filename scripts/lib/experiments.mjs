import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { buildExperimentPlanView, buildReviewComputation, buildReviewComputationV4, validateReviewInterpretation } from './review.mjs';
import { personalPatternHash } from './guidance.mjs';
import { actionPlanHash, actionRequiresCurrentApproval, actionSupportsPublication, assertActionCurrentlyApproved } from './actions.mjs';
import { resolvePostMetadataView } from './imports.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const values = value => Object.values(value ?? {});

function appendStatus(experiment, status, event) {
  experiment.status = status;
  experiment.status_history.push({ status, at: event.at, basis_refs: [...(event.basis_refs ?? [])], reason: event.reason ?? null });
}

function requireRefs(refs, collection, path) {
  for (const ref of refs) if (!collection?.[ref]) fail('MISSING_EVIDENCE', path, `Missing actual evidence: ${ref}`);
}

function hasEvidenceRef(state, ref) {
  return Boolean(state.raw_receipts?.[ref] || state.sources?.[ref] || state.user_facts?.[ref] || state.adoptions?.[ref]);
}

function observationForRef(state, ref) {
  const snapshot = Object.values(state.snapshots_v2 ?? {}).sort((left, right) => right.snapshot_id.length - left.snapshot_id.length).find(item => {
    const prefix = `${item.snapshot_id}:`;
    return ref.startsWith(prefix) && Object.hasOwn(item.metrics ?? {}, ref.slice(prefix.length));
  });
  if (!snapshot) return null;
  const prefix = `${snapshot.snapshot_id}:`;
  const metricKey = ref.slice(prefix.length);
  return { snapshot, metric_key: metricKey, metric: snapshot.metrics[metricKey] };
}

function canonicalPostKey(state, key) {
  return state.post_aliases?.[key] ?? key;
}

/** Stable identity for one actual platform post across duplicate publication records. */
export function publicationIdentityV5(state, publicationOrId) {
  const publication = typeof publicationOrId === 'string' ? state.publications?.[publicationOrId] : publicationOrId;
  if (!publication) return null;
  const urlId = typeof publication.url === 'string' ? publication.url.match(/\/status\/([^/?#]+)/)?.[1] : null;
  const platformId = publication.platform_post_id ?? publication.post_id ?? urlId;
  if (platformId) return canonicalPostKey(state, `x:${platformId}`);
  return publication.publication_id ? `publication:${publication.publication_id}` : null;
}

export function publicationCreatedAtV4(state, publication) {
  if(publication.published_at)return publication.published_at;
  const key = canonicalPostKey(state, `x:${publication.post_id}`);
  const entity = state.post_entities?.[key];
  const version = entity?.current_version_ref && state.post_versions?.[entity.current_version_ref];
  const view=version&&resolvePostMetadataView(state,version.post_version_id,'created_at');
  if(view?.status==='confirmed')return view.value;
  return values(state.posts).find(item => item.post_id === publication.post_id)?.created_at ?? null;
}

export function observationWindowStatusV4(state,planView,cutoff){
  const cutoffMs=Date.parse(cutoff);if(!Number.isFinite(cutoffMs))fail('INVALID_INPUT','/cutoff','A frozen instant cutoff is required');
  const window=planView?.window;
  if(window?.kind==='period'){
    const requiredMs=Date.parse(window.end_exclusive);if(!Number.isFinite(requiredMs))return{status:'missing',reason_code:'WINDOW_MISSING',required_at:null,cutoff};
    return cutoffMs<requiredMs?{status:'pending',reason_code:'WINDOW_PENDING',required_at:window.end_exclusive,cutoff}:{status:'mature',reason_code:null,required_at:window.end_exclusive,cutoff};
  }
  if(window?.kind!=='age_window'||!Number.isFinite(window.target_hours)||!Number.isFinite(window.tolerance_hours))return{status:'missing',reason_code:'WINDOW_MISSING',required_at:null,cutoff};
  const publications=(planView.linked_publication_ids??[]).map(id=>state.publications?.[id]);
  if(!publications.length||publications.some(item=>!item))return{status:'missing',reason_code:'WINDOW_MISSING',required_at:null,cutoff};
  const created=publications.map(item=>publicationCreatedAtV4(state,item)),createdMs=created.map(value=>Date.parse(value));
  if(createdMs.some(value=>!Number.isFinite(value)))return{status:'missing',reason_code:'WINDOW_MISSING',required_at:null,cutoff};
  const requiredMs=Math.max(...createdMs.map(value=>value+(window.target_hours+window.tolerance_hours)*3_600_000)),requiredAt=new Date(requiredMs).toISOString();
  return cutoffMs<requiredMs?{status:'pending',reason_code:'WINDOW_PENDING',required_at:requiredAt,cutoff}:{status:'mature',reason_code:null,required_at:requiredAt,cutoff};
}

function validateMatureObservations(state, experiment, refs) {
  const observations = refs.map(ref => observationForRef(state, ref));
  if (observations.some(item => !item)) fail('MISSING_EVIDENCE', '/required_observation_refs', 'Observation reference does not identify a stored snapshot and metric');
  for (const item of observations) {
    if (item.metric.definition_id !== experiment.planned_primary_metric.definition_id || item.metric.availability !== 'observed' || item.metric.value === null) fail('INVALID_EVIDENCE_REF', '/required_observation_refs', 'Observation does not contain the planned available metric');
  }
  const hours = plannedHours(experiment);
  if (hours === null) return observations;
  const tolerance = experiment.age_window_or_period.tolerance_hours ?? 2;
  const publications = experiment.linked_publication_ids.map(id => state.publications?.[id]).filter(Boolean);
  for (const publication of publications) {
    const createdAt = publicationCreatedAtV4(state, publication);
    if (!createdAt) fail('REQUESTED_OUTPUT_INCOMPLETE', '/publication/created_at', 'A recorded publication time is not a post creation time; age maturity remains unknown');
    const expectedKey = canonicalPostKey(state, `x:${publication.post_id}`);
    const matching = observations.filter(item => item.snapshot.entity_type === 'post' && canonicalPostKey(state, item.snapshot.entity_id) === expectedKey);
    if (!matching.length) fail('INVALID_EVIDENCE_REF', '/required_observation_refs', 'Every linked publication needs its own planned metric observation');
    if (matching.some(item => !item.snapshot.observed_at || Math.abs((Date.parse(item.snapshot.observed_at) - Date.parse(createdAt)) / 3_600_000 - hours) > tolerance)) fail('REQUESTED_OUTPUT_INCOMPLETE', '/required_observation_refs', 'Observation is outside the declared post-age window');
  }
  return observations;
}

function hasCoverageReceipt(state, ref) {
  return Boolean(ref && (state.collection_receipts?.[ref] || state.raw_receipts?.[ref] || state.sources?.[ref]));
}

function plannedHours(experiment) {
  if (experiment.age_window_or_period?.kind !== 'age_window') return null;
  const match = String(experiment.age_window_or_period.value).match(/^([0-9]+(?:\.[0-9]+)?)h$/);
  return match ? Number(match[1]) : null;
}

function conditionReached(state, experiment, event, actualEvidence) {
  const publications = experiment.linked_publication_ids.map(id => state.publications?.[id]).filter(Boolean);
  if (!publications.length) return false;
  const hours = plannedHours(experiment);
  if (hours !== null) return publications.every(item => {
    const createdAt = publicationCreatedAtV4(state, item);
    return createdAt && Date.parse(event.at) >= Date.parse(createdAt) + hours * 3_600_000;
  });
  const ref = actualEvidence.condition_evidence_ref;
  return Boolean(ref && (state.collection_receipts?.[ref] || state.raw_receipts?.[ref] || state.sources?.[ref]));
}

export function validateExperimentPlan(plan, state = {}) {
  if (!plan || plan.contract_version !== 2 || !plan.experiment_id || !plan.originating_action_id) fail('INVALID_INPUT', '/experiment', 'A versioned experiment and originating action are required');
  if (!plan.single_primary_change?.trim()) fail('INVALID_INPUT', '/single_primary_change', 'Experiment must isolate one primary change');
  if (!plan.planned_primary_metric?.definition_id) fail('METRIC_DEFINITION_UNRESOLVED', '/planned_primary_metric', 'Experiment requires an available metric definition');
  if (!plan.planned_review_condition?.trim() || !plan.stop_condition?.trim()) fail('INVALID_INPUT', '/planned_review_condition', 'Review and stop conditions are required');
  if (plan.status !== 'proposed' || plan.status_history.length !== 1 || plan.status_history[0].status !== 'proposed') fail('INVALID_INPUT', '/status', 'A new experiment starts as proposed');
  if (state.actions && !state.actions[plan.originating_action_id]) fail('MISSING_EVIDENCE', '/originating_action_id', 'Experiment action does not exist');
  const claimText=`${plan.hypothesis} ${plan.success_interpretation}`;
  const manipulation=/互刷|固定.*点赞/i.test(claimText),guarantee=/guarantee|保证|保底|必然/i.test(claimText),honestBoundary=/(不保证|不能保证|不保底|并非必然|无法保证|not guarantee|cannot guarantee)/i.test(claimText);
  if (manipulation||(guarantee&&!honestBoundary)) fail('INVALID_INPUT', '/hypothesis', 'Experiment cannot guarantee reach or require engagement manipulation');
  return structuredClone(plan);
}

export function actionPlanOf(action) {
  return { contract_version: action.contract_version ?? 2, action_id: action.action_id, plan_hash: action.plan_hash ?? actionPlanHash(action), plan: structuredClone(action) };
}

export function strategyVersionOf(state, action) {
  const ref = action?.strategy_version_ref ?? null;
  return ref ? state.strategy_definitions?.[ref] ?? null : null;
}

/** Create the proposed experiment from an accepted, currently approved canonical action. */
export function createExperimentFromAction(state, { experiment, approved_guidance = null } = {}) {
  const action = state.actions?.[experiment?.originating_action_id];
  if (!action) fail('MISSING_EVIDENCE', '/originating_action_id', 'Experiment action does not exist');
  if (action.status !== 'accepted') fail('STATE_CONFLICT', '/originating_action_id', 'An experiment can be created only after explicit action acceptance');
  if (actionRequiresCurrentApproval(state, action.action_id)) assertActionCurrentlyApproved(state, action.action_id, { approved_guidance });
  const plan = validateExperimentPlan(experiment, state), next = structuredClone(state);
  next.experiments ??= {};
  const existing = next.experiments[plan.experiment_id];
  if (existing && canonicalHash(existing) !== canonicalHash(plan)) fail('STATE_CONFLICT', '/experiment_id', 'Experiment ID identifies different content');
  next.experiments[plan.experiment_id] = existing ?? plan;
  return { nextState: next, result: { experiment: structuredClone(next.experiments[plan.experiment_id]), originating_action_plan_hash: action.plan_hash ?? actionPlanHash(action) } };
}

export function applyExperimentTransition(state, event, actualEvidence = {}) {
  const next = structuredClone(state);
  const experiment = next.experiments?.[event.experiment_id];
  if (!experiment) fail('MISSING_EVIDENCE', '/experiment_id', 'Experiment does not exist');
  if (!event.at || !event.event_id) fail('INVALID_INPUT', '/event', 'Experiment transition requires a durable event ID and time');
  if (experiment.status_history.some(item => item.event_id === event.event_id)) return next;
  const statusEvent = { ...event, event_id: event.event_id };
  let appended = false;

  if (event.type === 'accept') {
    if (experiment.status !== 'proposed') fail('STATE_CONFLICT', '/status', 'Only a proposed experiment can be accepted');
    const action = next.actions?.[experiment.originating_action_id];
    if (actionRequiresCurrentApproval(next, experiment.originating_action_id)) {
      assertActionCurrentlyApproved(next, experiment.originating_action_id, { approved_guidance: actualEvidence.approved_guidance });
      if (action?.status !== 'accepted') fail('STATE_CONFLICT', '/originating_action_id', 'Experiment acceptance requires an accepted originating action');
    }
    const adoptionRefs = event.adoption_ids ?? [];
    if (!adoptionRefs.length && !actualEvidence.user_acceptance_ref) fail('MISSING_EVIDENCE', '/adoption_ids', 'Acceptance requires explicit user or adoption evidence');
    requireRefs(adoptionRefs, next.adoptions, '/adoption_ids');
    if (actualEvidence.user_acceptance_ref && !hasEvidenceRef(next, actualEvidence.user_acceptance_ref)) fail('MISSING_EVIDENCE', '/user_acceptance_ref', 'User acceptance reference is not stored evidence');
    statusEvent.basis_refs = [...(event.basis_refs ?? []), ...adoptionRefs, ...(actualEvidence.user_acceptance_ref ? [actualEvidence.user_acceptance_ref] : [])];
    appendStatus(experiment, 'accepted', statusEvent);
    appended = true;
  } else if (event.type === 'publish') {
    if (experiment.status !== 'accepted' && experiment.status !== 'running') fail('STATE_CONFLICT', '/status', 'Publication can start only an accepted experiment');
    const action = next.actions?.[experiment.originating_action_id];
    if (action?.target && !actionSupportsPublication(action)) fail('INVALID_INPUT', '/publication_ids', 'This action is not a post-publication action; record its execution without fabricating a publication');
    const ids = event.publication_ids ?? [];
    if (!ids.length) fail('MISSING_EVIDENCE', '/publication_ids', 'A real publication record is required');
    requireRefs(ids, next.publications, '/publication_ids');
    experiment.linked_publication_ids = [...new Set([...experiment.linked_publication_ids, ...ids])];
    statusEvent.basis_refs = [...(event.basis_refs ?? []), ...ids];
    appendStatus(experiment, 'running', statusEvent);
    next.experiment_plan_views ??= {};
    const planView = buildExperimentPlanView(next, experiment);
    const priorView = next.experiment_plan_views[planView.plan_view_id];
    if (priorView && canonicalHash(priorView) !== canonicalHash(planView)) fail('STATE_CONFLICT', '/experiment_plan_views', 'Experiment plan view ID identifies different content');
    next.experiment_plan_views[planView.plan_view_id] = priorView ?? planView;
    appended = true;
  } else if (event.type === 'check_maturity') {
    if (experiment.status !== 'running') fail('STATE_CONFLICT', '/status', 'Only a running experiment can become reviewable');
    if (!conditionReached(next, experiment, event, actualEvidence) || !hasCoverageReceipt(next, actualEvidence.coverage_receipt_ref)) fail('REQUESTED_OUTPUT_INCOMPLETE', '/actual_evidence', 'The declared review condition and coverage require actual evidence');
    const refs = actualEvidence.required_observation_refs ?? [];
    if (!refs.length || actualEvidence.pending_observation_refs?.length) fail('REQUESTED_OUTPUT_INCOMPLETE', '/required_observation_refs', 'Required observations are not mature');
    validateMatureObservations(next, experiment, refs);
    experiment.maturity_evidence_refs = [...refs];
    experiment.coverage_receipt_ref = actualEvidence.coverage_receipt_ref;
    appendStatus(experiment, 'ready_for_review', { ...statusEvent, basis_refs: refs });
    appended = true;
  } else if (event.type === 'close') {
    if (!['running', 'ready_for_review'].includes(experiment.status)) fail('STATE_CONFLICT', '/status', 'Only a running or reviewable experiment can close');
    const review = actualEvidence.review;
    if (!review || review.experiment_id !== experiment.experiment_id || !review.review_id) fail('MISSING_EVIDENCE', '/review', 'Closing requires a valid review result');
    const coverageRef = actualEvidence.coverage_receipt_ref ?? experiment.coverage_receipt_ref;
    if (!hasCoverageReceipt(next, coverageRef)) fail('MISSING_EVIDENCE', '/coverage_receipt_ref', 'Closing requires the stored observation coverage receipt');
    if (experiment.status === 'running' && (review.conclusion !== 'inconclusive' || !conditionReached(next, experiment, event, actualEvidence))) {
      fail('REQUESTED_OUTPUT_INCOMPLETE', '/review/conclusion', 'A running experiment may close directly only as inconclusive after its declared condition');
    }
    if ((review.publication_ids ?? []).some(id => !experiment.linked_publication_ids.includes(id) || !next.publications?.[id])) fail('INVALID_EVIDENCE_REF', '/review/publication_ids', 'Review publication is not part of this experiment');
    if (review.conclusion !== 'inconclusive' && !(review.mature_observation_refs?.length)) fail('REQUESTED_OUTPUT_INCOMPLETE', '/review/mature_observation_refs', 'A directional conclusion requires mature observations');
    if (review.mature_observation_refs?.length) validateMatureObservations(next, experiment, review.mature_observation_refs);
    next.experiment_reviews ??= {};
    const existing = next.experiment_reviews[review.review_id];
    if (existing && canonicalHash(existing) !== canonicalHash(review)) fail('STATE_CONFLICT', '/review_id', 'Review ID identifies different content');
    next.experiment_reviews[review.review_id] = structuredClone(review);
    experiment.review_ref = review.review_id;
    appendStatus(experiment, 'closed', { ...statusEvent, basis_refs: [review.review_id] });
    appended = true;
  } else {
    fail('INVALID_INPUT', '/type', `Unsupported experiment transition: ${event.type}`);
  }
  if (appended) experiment.status_history.at(-1).event_id = event.event_id;
  return next;
}

export function applyActionDecision(state, decision, { approved_guidance = null } = {}) {
  const next = structuredClone(state);
  const action = next.actions?.[decision.action_id];
  if (!action) fail('MISSING_EVIDENCE', '/action_id', 'Action does not exist');
  if (!['accepted', 'declined'].includes(decision.decision) || !decision.basis?.trim() || !decision.decided_at || !decision.decision_id) fail('INVALID_INPUT', '/decision', 'Action decision requires explicit basis, identity and time');
  if (action.status !== 'proposed') fail('STATE_CONFLICT', '/status', 'Only a proposed action can be accepted or declined');
  if (decision.decision === 'accepted' && actionRequiresCurrentApproval(next, decision.action_id)) assertActionCurrentlyApproved(next, decision.action_id, { approved_guidance });
  action.status = decision.decision;
  action.decision_ref = decision.decision_id;
  next.action_decisions ??= {};
  const existing = next.action_decisions[decision.decision_id];
  if (existing && canonicalHash(existing) !== canonicalHash(decision)) fail('STATE_CONFLICT', '/decision_id', 'Decision ID identifies different content');
  next.action_decisions[decision.decision_id] = structuredClone(decision);
  return next;
}

/** Count cadence groups, not posts, as independent strategy samples. */
export function experimentEvidenceSummary(state, experimentId) {
  const experiment = state.experiments?.[experimentId];
  if (!experiment) fail('MISSING_EVIDENCE', '/experiment_id', 'Experiment does not exist');
  const action = state.actions?.[experiment.originating_action_id];
  const strategyRef = action?.strategy_version_ref ?? `legacy-action:${experiment.originating_action_id}`;
  const publicationsByIdentity = new Map();
  for (const publicationId of experiment.linked_publication_ids ?? []) {
    const publication = state.publications?.[publicationId];
    if (!publication) continue;
    const identity = publicationIdentityV5(state, publication) ?? `publication:${publicationId}`;
    const entry = publicationsByIdentity.get(identity) ?? { publication_identity: identity, publication_ids: [], cadence_refs: new Set() };
    entry.publication_ids.push(publicationId);
    const cadenceRef = publication.cadence_group_ref ?? publication.series_execution_ref;
    if (cadenceRef) entry.cadence_refs.add(cadenceRef);
    publicationsByIdentity.set(identity, entry);
  }
  const groups = new Map();
  for (const publication of publicationsByIdentity.values()) {
    const cadenceRef = experiment.cadence_group_ref ?? [...publication.cadence_refs].sort()[0] ?? `post:${publication.publication_identity}`;
    const key = `${strategyRef}:${cadenceRef}`;
    const entry = groups.get(key) ?? { sample_key: key, strategy_version_ref: strategyRef, cadence_group_ref: cadenceRef, publication_ids: [], publication_identities: [] };
    entry.publication_ids.push(...publication.publication_ids);
    entry.publication_identities.push(publication.publication_identity);
    groups.set(key, entry);
  }
  return { experiment_id: experimentId, strategy_version_ref: strategyRef, independent_publication_n: publicationsByIdentity.size, independent_sample_n: groups.size, sample_groups: [...groups.values()].map(group => ({ ...group, publication_ids: group.publication_ids.sort(), publication_identities: group.publication_identities.sort() })).sort((a, b) => a.sample_key.localeCompare(b.sample_key)) };
}

export function priorActionOutcome(state, action) {
  const signature = canonicalHash({ objective: action.objective, target: action.target, change: action.change });
  for (const prior of values(state.actions)) {
    if (canonicalHash({ objective: prior.objective, target: prior.target, change: prior.change }) !== signature) continue;
    const experiments = values(state.experiments).filter(item => item.originating_action_id === prior.action_id);
    const reviews = experiments.map(item => item.review_ref && state.experiment_reviews?.[item.review_ref]).filter(Boolean);
    const priorEvidence = [prior.action_id, ...(prior.account_evidence_refs ?? []), ...(prior.content_evidence_refs ?? []), ...(prior.rule_version_refs ?? [])];
    if (prior.status === 'declined') return { repeated: true, outcome: 'declined', evidence_refs: priorEvidence };
    const adverse = reviews.map(item=>({item,conclusion:item.interpretation?.conclusion??item.conclusion,evidence_refs:item.interpretation?.evidence_refs??item.evidence_refs??[]})).find(({conclusion}) => ['revise', 'stop', 'inconclusive'].includes(conclusion));
    if (adverse) return { repeated: true, outcome: adverse.conclusion, evidence_refs: [...priorEvidence, adverse.item.review_id, ...adverse.evidence_refs] };
  }
  return { repeated: false, outcome: null, evidence_refs: [] };
}

/** Replay a frozen V4 computation for maturity and close; callers cannot replace its inputs. */
export function applyExperimentTransitionV4(state,event){
  if(!['check_maturity','close'].includes(event?.type))fail('INVALID_INPUT','/type','V4 transition supports maturity and close');
  const next=structuredClone(state),experiment=next.experiments?.[event.experiment_id],plan=next.experiment_plan_views?.[event.plan_view_ref],stored=next.review_computations?.[event.computation_ref];
  if(!experiment||!plan||stored?.contract_version!==4)fail('MISSING_EVIDENCE','/event','Experiment, plan view and V4 review computation are required');
  if(plan.source_experiment_id!==experiment.experiment_id||stored.plan_view_ref!==plan.plan_view_id)fail('INVALID_EVIDENCE_REF','/event','Plan and computation belong to another experiment');
  const frozen=stored.computation_request;
  if(stored.computation_request_hash!==canonicalHash(frozen))fail('STALE_BUNDLE','/computation_request_hash','Frozen review request changed');
  const recomputed=buildReviewComputationV4(next,plan,{as_of:frozen.as_of,coverage_receipt_refs:frozen.coverage_bindings.map(item=>item.receipt_ref)});
  if(recomputed.computation_hash!==stored.computation_hash)fail('STALE_BUNDLE','/computation_ref','Relevant observations, coverage or publication bindings changed; recompute and review again');
  const windowStatus=observationWindowStatusV4(next,plan,frozen.as_of),primary=stored.metric_results.find(item=>item.role==='primary'),mature=windowStatus.status==='mature'&&primary?.target_value!==null&&stored.target_selection.completeness==='complete'&&frozen.coverage_bindings.every(item=>item.completeness==='complete');
  if(event.type==='check_maturity'){
    if(experiment.status!=='running')fail('STATE_CONFLICT','/status','Only a running experiment may become ready');
    if(windowStatus.status!=='mature')fail(windowStatus.reason_code,'/computation_ref',windowStatus.status==='pending'?`Observation window is pending until ${windowStatus.required_at}`:'Observation window maturity cannot be established without a reliable publication time or period end');
    if(!mature)fail('REQUESTED_OUTPUT_INCOMPLETE','/computation_ref','Planned primary metric and actual coverage are not mature');
    appendStatus(experiment,'ready_for_review',{...event,basis_refs:[stored.computation_id,...frozen.coverage_bindings.map(item=>item.receipt_ref)]});return next;
  }
  if(!['running','ready_for_review'].includes(experiment.status))fail('STATE_CONFLICT','/status','Only an executed experiment may close');
  if(windowStatus.status!=='mature'&&event.interpretation?.conclusion!=='inconclusive')fail(windowStatus.reason_code,'/interpretation/conclusion',windowStatus.status==='pending'?`Observation window is pending until ${windowStatus.required_at}`:'Observation window maturity cannot be established');
  if(!mature&&event.interpretation?.conclusion!=='inconclusive')fail('REQUESTED_OUTPUT_INCOMPLETE','/interpretation/conclusion','Missing mature observations can close only as inconclusive');
  const validated=validateReviewInterpretation(stored,event.interpretation,event.interpretation_receipt);
  next.experiment_reviews??={};const review={contract_version:4,review_id:event.review_id,experiment_id:experiment.experiment_id,plan_view_ref:plan.plan_view_id,computation_ref:stored.computation_id,computation_hash:stored.computation_hash,interpretation:validated.interpretation,interpretation_proposal_hash:validated.interpretation_proposal_hash,interpretation_receipt_ref:validated.receipt.receipt_id,interpretation_receipt:structuredClone(validated.receipt),result_trust:'verified',applicable_scope_hash:stored.target_selection.selection_hash,closed_at:event.at};
  validate('ExperimentReviewV4',review);const old=next.experiment_reviews[review.review_id];if(old&&canonicalHash(old)!==canonicalHash(review))fail('STATE_CONFLICT','/review_id','Review ID identifies different content');
  next.experiment_reviews[review.review_id]=review;experiment.review_ref=review.review_id;appendStatus(experiment,'closed',{...event,basis_refs:[stored.computation_id,validated.receipt.receipt_id]});return next;
}

/** Promote only a real publication with mature, verified observations into account-local learning. */
export function buildPersonalPatternFromReviewV4(state,{review_ref,pattern_id,topic_scope=[],format_scope=[],pattern_statement,alternative_explanations,updated_at}={}){
  const review=state.experiment_reviews?.[review_ref],experiment=review&&state.experiments?.[review.experiment_id],computation=review&&state.review_computations?.[review.computation_ref];
  if(review?.contract_version!==4||review.result_trust!=='verified'||experiment?.status!=='closed'||computation?.contract_version!==4)fail('MISSING_EVIDENCE','/review_ref','Personal learning requires a closed verified V4 review');
  const publicationRefs=[...(experiment.linked_publication_ids??[])];
  if(!publicationRefs.length||publicationRefs.some(ref=>!state.publications?.[ref]))fail('MISSING_EVIDENCE','/publication_refs','Personal learning requires actual stored publications');
  const coverage=computation.computation_request.coverage_bindings;
  const learningWindow=observationWindowStatusV4(state,state.experiment_plan_views?.[review.plan_view_ref],computation.computation_request.as_of);if(learningWindow.status!=='mature')fail(learningWindow.reason_code,'/review_ref','Personal learning requires the frozen observation window to be mature');
  if(computation.target_selection.completeness!=='complete'||coverage.some(item=>item.completeness!=='complete'))fail('REQUESTED_OUTPUT_INCOMPLETE','/review_ref','Personal learning requires mature target observations and complete coverage');
  const observationRefs=[...new Set(computation.metric_results.flatMap(item=>item.target_observation_refs))].sort();
  if(!observationRefs.length)fail('MISSING_EVIDENCE','/observation_refs','Personal learning requires selected observations');
  if(!pattern_statement?.trim()||!alternative_explanations?.length)fail('INVALID_INPUT','/pattern_statement','Personal learning requires a scoped statement and alternative explanations');
  const conclusion=review.interpretation?.conclusion??'inconclusive',support_status=({continue:'supported',revise:'mixed',stop:'refuted',inconclusive:'insufficient'})[conclusion]??'insufficient';
  const base={contract_version:4,pattern_id,account_ref:state.account?.user_id??`handle:${state.account?.handle}`,goal:experiment.goal,topic_scope:[...topic_scope],format_scope:[...format_scope],publication_refs:publicationRefs,observation_refs:observationRefs,review_refs:[review_ref],pattern_statement,alternative_explanations:[...alternative_explanations],support_status,counter_evidence_refs:support_status==='refuted'?[review_ref]:[],updated_at};
  return validate('PersonalPatternV4',{...base,pattern_hash:personalPatternHash(base)});
}

/** Close/review a V3-compatible plan only from a stored deterministic computation. */
export function applyExperimentTransitionV3(state,event) {
  if(!['check_maturity','close'].includes(event?.type))fail('INVALID_INPUT','/type','V3 transition supports maturity and close');
  const next=structuredClone(state),experiment=next.experiments?.[event.experiment_id],plan=next.experiment_plan_views?.[event.plan_view_ref],stored=next.review_computations?.[event.computation_ref];
  if(!experiment||!plan||!stored)fail('MISSING_EVIDENCE','/event','Experiment, V3 plan view and review computation are required');
  if(plan.source_experiment_id!==experiment.experiment_id||stored.plan_view_ref!==plan.plan_view_id)fail('INVALID_EVIDENCE_REF','/event','Plan and computation belong to another experiment');
  // Re-evaluate the frozen cutoff. Later inapplicable observations must not stale an approved computation.
  const recomputed=buildReviewComputation(next,plan,{as_of:stored.computed_at,coverage_receipt_refs:stored.coverage_receipt_refs??event.coverage_receipt_refs??[]});
  if(recomputed.computation_hash!==stored.computation_hash)fail('STALE_BUNDLE','/computation_ref','Relevant observations or publication bindings changed; recompute and review again');
  const primary=stored.metric_results.find(item=>item.role==='primary'),mature=primary?.target_value!==null&&stored.target_selection.completeness==='complete';
  if(event.type==='check_maturity'){
    if(experiment.status!=='running')fail('STATE_CONFLICT','/status','Only a running experiment may become ready');
    if(!mature)fail('REQUESTED_OUTPUT_INCOMPLETE','/computation_ref','Planned primary metric coverage is not mature');
    appendStatus(experiment,'ready_for_review',{...event,basis_refs:[stored.computation_id]});return next;
  }
  if(!['running','ready_for_review'].includes(experiment.status))fail('STATE_CONFLICT','/status','Only an executed experiment may close');
  if(!mature&&event.interpretation?.conclusion!=='inconclusive')fail('REQUESTED_OUTPUT_INCOMPLETE','/interpretation/conclusion','Missing mature observations can close only as inconclusive');
  const validated=validateReviewInterpretation(stored,event.interpretation,event.interpretation_receipt);
  next.experiment_reviews??={};const review={contract_version:3,review_id:event.review_id,experiment_id:experiment.experiment_id,plan_view_ref:plan.plan_view_id,computation_ref:stored.computation_id,computation_hash:stored.computation_hash,interpretation:validated.interpretation,interpretation_proposal_hash:validated.interpretation_proposal_hash,interpretation_receipt_ref:validated.receipt.receipt_id,interpretation_receipt:structuredClone(validated.receipt),result_trust:'verified',applicable_scope_hash:stored.target_selection.selection_hash,closed_at:event.at};
  const old=next.experiment_reviews[review.review_id];if(old&&canonicalHash(old)!==canonicalHash(review))fail('STATE_CONFLICT','/review_id','Review ID identifies different content');
  next.experiment_reviews[review.review_id]=review;experiment.review_ref=review.review_id;appendStatus(experiment,'closed',{...event,basis_refs:[stored.computation_id,validated.receipt.receipt_id]});return next;
}
