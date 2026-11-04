import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { catalogContentHash, knowledgeBundleFromState } from './knowledge.mjs';
import { loadActualReviewReceiptsV5 } from './host-review-v5.mjs';
import { putImmutable } from './state.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message); };
const bundleHash = bundle => canonicalHash({ catalog: bundle.catalog, artifacts: bundle.artifacts, facts: bundle.facts, rules: bundle.rules });

/** A read-only historical projection reuses the normal integrity and temporal guards. */
function rollbackInputs(state, targetRef, clock) {
  if (state?.schema_version !== 5) fail('MIGRATION_REQUIRED', '/state/schema_version', 'Rollback requires state 5');
  const current = knowledgeBundleFromState(state, { now: clock });
  if (current.catalog.catalog_id === targetRef) fail('INVALID_INPUT', '/target_catalog_ref', 'Rollback target is already current');
  if (!state.knowledge_catalogs[targetRef]) fail('MISSING_EVIDENCE', '/target_catalog_ref', 'Historical catalog does not exist');
  const events = Object.values(state.knowledge_events).filter(event => event.event_type === 'activated' && event.catalog_ref === targetRef);
  if (events.length !== 1) fail('MISSING_EVIDENCE', '/target_catalog_ref', 'Rollback requires one actual historical activation');
  const activation = events[0];
  validate(activation.contract_version === 5 ? 'KnowledgeEventV5' : 'KnowledgeEventV4', activation);
  const target = knowledgeBundleFromState({ ...state, knowledge_events: { [activation.event_id]: activation } }, { now: clock });
  if (target.temporal_readiness.status !== 'ready') fail('MISSING_EVIDENCE', '/target_catalog_ref', 'Historical target contains future evidence');
  if (current.catalog.upstream.repo !== target.catalog.upstream.repo) fail('INVALID_EVIDENCE_REF', '/target_catalog_ref', 'Rollback must retain the upstream repository');
  return { current, target };
}

function restoredCatalog(current, target) {
  const catalog = structuredClone(target.catalog);
  if ([current.catalog.execution_scope, target.catalog.execution_scope].includes('editorial_only')) catalog.execution_scope = 'editorial_only';
  catalog.catalog_content_hash = catalogContentHash(catalog);
  return catalog;
}

/** The exact reviewed payload is returned separately from its deterministic reference/hash. */
export function previewKnowledgeRollbackV5(state, targetRef, { clock = new Date() } = {}) {
  const { current, target } = rollbackInputs(state, targetRef, clock);
  const restored = restoredCatalog(current, target);
  const subject = {
    contract_version: 5, operation: 'rollback',
    prior_catalog_ref: current.catalog.catalog_id, prior_catalog_hash: current.catalog.catalog_content_hash,
    prior_bundle_hash: bundleHash(current), prior_activation_hash: canonicalHash(current.event),
    target_catalog_ref: target.catalog.catalog_id, target_catalog_hash: target.catalog.catalog_content_hash,
    target_bundle_hash: bundleHash(target), target_activation_ref: target.event.event_id,
    target_activation_hash: canonicalHash(target.event),
    restored_catalog_hash: restored.catalog_content_hash, execution_scope: restored.execution_scope ?? 'legacy'
  };
  const subject_hash = canonicalHash(subject);
  return Object.freeze({ subject_ref: `knowledge-rollback-${subject_hash.slice(0, 24)}`, subject_hash, subject });
}

/** Only append a fresh snapshot identity and activation; never rewrite historical evidence. */
export async function rollbackKnowledgeV5(state, { target_catalog_ref, review_receipt_ref }, { clock = new Date() } = {}) {
  const preview = previewKnowledgeRollbackV5(state, target_catalog_ref, { clock });
  const receipts = await loadActualReviewReceiptsV5(state, [review_receipt_ref], {
    clock: () => clock, expectedPurpose: 'review_knowledge', expectedSubjectRef: preview.subject_ref,
    expectedSubjectContentHash: preview.subject_hash
  });
  const review = receipts[review_receipt_ref];
  if (review.decision !== 'approved' || review.subject_hash !== preview.subject_hash || review.actual_result_hash !== preview.subject_hash)
    fail('MISSING_EVIDENCE', '/review_receipt_ref', 'Rollback requires actual independent approval of this exact transition');
  if (!Number.isFinite(Date.parse(review.reviewed_at)) || Date.parse(review.reviewed_at) > clock.getTime())
    fail('MISSING_EVIDENCE', '/review_receipt_ref', 'Rollback review cannot be future dated');
  const { current, target } = rollbackInputs(state, target_catalog_ref, clock);
  const catalog = { ...restoredCatalog(current, target), catalog_id: `knowledge-restore-${preview.subject_hash.slice(0, 24)}` };
  if (state.knowledge_catalogs[catalog.catalog_id]) fail('STATE_CONFLICT', '/catalog_id', 'Restored snapshot identity already exists');
  const event = validate('KnowledgeEventV5', {
    contract_version: 5, event_id: `knowledge-event-${canonicalHash({ rollback: preview.subject_hash, review: review.receipt_id }).slice(0, 24)}`,
    event_type: 'activated', catalog_ref: catalog.catalog_id, prior_catalog_ref: current.catalog.catalog_id,
    checked_at: clock.toISOString(), observed_head_commit: catalog.upstream.commit,
    affected_rule_version_refs: [...new Set([...current.catalog.rule_version_refs, ...target.catalog.rule_version_refs])].sort(),
    gaps: [...target.event.gaps], review_receipt_ref: review.receipt_id, replay_result_refs: [],
    rollback_target_catalog_hash: target.catalog.catalog_content_hash, rollback_restored_catalog_hash: catalog.catalog_content_hash,
    rollback_target_catalog_ref: target_catalog_ref, rollback_target_activation_ref: target.event.event_id,
    rollback_subject_ref: preview.subject_ref, rollback_subject_hash: preview.subject_hash
  });
  validate('RuleCatalogSnapshotV4', catalog);
  // Validate the append-only transition before touching the transaction's working state.
  knowledgeBundleFromState({ ...state, knowledge_catalogs: { ...state.knowledge_catalogs, [catalog.catalog_id]: catalog }, knowledge_events: { ...state.knowledge_events, [event.event_id]: event } }, { now: clock });
  putImmutable(state.knowledge_catalogs, catalog.catalog_id, catalog);
  putImmutable(state.knowledge_events, event.event_id, event);
  return { catalog, event, rollback: preview };
}
