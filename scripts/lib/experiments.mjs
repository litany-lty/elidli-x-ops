import { canonicalHash, ContractError } from './contracts.mjs';

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

function publicationCreatedAt(state, publication) {
  const key = canonicalPostKey(state, `x:${publication.post_id}`);
  const entity = state.post_entities?.[key];
  const version = entity?.current_version_ref && state.post_versions?.[entity.current_version_ref];
  if (version?.created_at) return version.created_at;
  return values(state.posts).find(item => item.post_id === publication.post_id)?.created_at ?? null;
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
    const createdAt = publicationCreatedAt(state, publication);
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
    const createdAt = publicationCreatedAt(state, item);
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
  if (/guarantee|保证|保底|必然|互刷|固定.*点赞/i.test(`${plan.hypothesis} ${plan.success_interpretation}`)) fail('INVALID_INPUT', '/hypothesis', 'Experiment cannot guarantee reach or require engagement manipulation');
  return structuredClone(plan);
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
    const adoptionRefs = event.adoption_ids ?? [];
    if (!adoptionRefs.length && !actualEvidence.user_acceptance_ref) fail('MISSING_EVIDENCE', '/adoption_ids', 'Acceptance requires explicit user or adoption evidence');
    requireRefs(adoptionRefs, next.adoptions, '/adoption_ids');
    if (actualEvidence.user_acceptance_ref && !hasEvidenceRef(next, actualEvidence.user_acceptance_ref)) fail('MISSING_EVIDENCE', '/user_acceptance_ref', 'User acceptance reference is not stored evidence');
    statusEvent.basis_refs = [...(event.basis_refs ?? []), ...adoptionRefs, ...(actualEvidence.user_acceptance_ref ? [actualEvidence.user_acceptance_ref] : [])];
    appendStatus(experiment, 'accepted', statusEvent);
    appended = true;
  } else if (event.type === 'publish') {
    if (experiment.status !== 'accepted' && experiment.status !== 'running') fail('STATE_CONFLICT', '/status', 'Publication can start only an accepted experiment');
    const ids = event.publication_ids ?? [];
    if (!ids.length) fail('MISSING_EVIDENCE', '/publication_ids', 'A real publication record is required');
    requireRefs(ids, next.publications, '/publication_ids');
    experiment.linked_publication_ids = [...new Set([...experiment.linked_publication_ids, ...ids])];
    statusEvent.basis_refs = [...(event.basis_refs ?? []), ...ids];
    appendStatus(experiment, 'running', statusEvent); appended = true;
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

export function applyActionDecision(state, decision) {
  const next = structuredClone(state);
  const action = next.actions?.[decision.action_id];
  if (!action) fail('MISSING_EVIDENCE', '/action_id', 'Action does not exist');
  if (!['accepted', 'declined'].includes(decision.decision) || !decision.basis?.trim() || !decision.decided_at || !decision.decision_id) fail('INVALID_INPUT', '/decision', 'Action decision requires explicit basis, identity and time');
  if (action.status !== 'proposed') fail('STATE_CONFLICT', '/status', 'Only a proposed action can be accepted or declined');
  action.status = decision.decision;
  action.decision_ref = decision.decision_id;
  next.action_decisions ??= {};
  const existing = next.action_decisions[decision.decision_id];
  if (existing && canonicalHash(existing) !== canonicalHash(decision)) fail('STATE_CONFLICT', '/decision_id', 'Decision ID identifies different content');
  next.action_decisions[decision.decision_id] = structuredClone(decision);
  return next;
}

export function priorActionOutcome(state, action) {
  const signature = canonicalHash({ objective: action.objective, target: action.target, change: action.change });
  for (const prior of values(state.actions)) {
    if (canonicalHash({ objective: prior.objective, target: prior.target, change: prior.change }) !== signature) continue;
    const experiments = values(state.experiments).filter(item => item.originating_action_id === prior.action_id);
    const reviews = experiments.map(item => item.review_ref && state.experiment_reviews?.[item.review_ref]).filter(Boolean);
    const priorEvidence = [prior.action_id, ...(prior.account_evidence_refs ?? []), ...(prior.content_evidence_refs ?? []), ...(prior.rule_version_refs ?? [])];
    if (prior.status === 'declined') return { repeated: true, outcome: 'declined', evidence_refs: priorEvidence };
    const adverse = reviews.find(item => ['revise', 'stop', 'inconclusive'].includes(item.conclusion));
    if (adverse) return { repeated: true, outcome: adverse.conclusion, evidence_refs: [...priorEvidence, adverse.review_id, ...(adverse.evidence_refs ?? [])] };
  }
  return { repeated: false, outcome: null, evidence_refs: [] };
}
