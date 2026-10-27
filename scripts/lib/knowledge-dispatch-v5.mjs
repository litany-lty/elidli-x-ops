import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { commitState, putImmutable } from './state.mjs';
import { seedKnowledgeState } from './knowledge-state.mjs';
import { knowledgeBundleFromState, loadKnowledgeCatalog, validateKnowledgeBundleIntegrity } from './knowledge.mjs';
import { activateKnowledgeUpdateV5, inspectKnowledgeCheckoutV5, knowledgeReplayResultHashV5, proposeKnowledgeUpdateV5, verifyKnowledgeSourceMaterialsV5 } from './knowledge-updates.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };

function savedCandidateBundle(state, catalogRef, temporalReadiness) {
  const catalog = state.knowledge_catalogs[catalogRef];
  if (!catalog) fail('MISSING_EVIDENCE', '/candidate_catalog_ref', 'Saved candidate catalog does not exist');
  const artifacts = Object.fromEntries(catalog.artifact_refs.map(ref => [ref, state.knowledge_artifacts[ref]]));
  const facts = Object.fromEntries(catalog.fact_version_refs.map(ref => [ref, state.rule_versions_v2[ref]]));
  const rules = Object.fromEntries(catalog.rule_version_refs.map(ref => [ref, state.operational_rules[ref]]));
  if (Object.values(artifacts).some(value => !value) || Object.values(facts).some(value => !value) || Object.values(rules).some(value => !value)) fail('MISSING_EVIDENCE', '/candidate_catalog_ref', 'Saved candidate is incomplete');
  validateKnowledgeBundleIntegrity({ catalog, dependencies: catalog.dependencies, artifacts, facts, rules });
  return Object.freeze({ catalog, artifacts, facts, rules, dependencies: catalog.dependencies, signal_registry: catalog.signal_registry, temporal_readiness: temporalReadiness });
}

function savedTemporalReadiness(bundle, clock = new Date()) {
  const cutoff = clock.getTime(), issues = [];
  const inspect = (path, value) => { const time = Date.parse(value); if (!Number.isFinite(time) || time > cutoff) issues.push({ path, value, code: !Number.isFinite(time) ? 'INVALID_TIME' : 'FUTURE_EVIDENCE' }); };
  inspect('/catalog/created_at', bundle.catalog.created_at);
  for (const fact of Object.values(bundle.facts)) { inspect(`/facts/${fact.rule_version_id}/checked_at`, fact.checked_at); const artifact = bundle.artifacts[fact.source_material_ref]; if (artifact) inspect(`/artifacts/${artifact.artifact_id}/checked_at`, artifact.checked_at); }
  return Object.freeze({ status: issues.length ? 'not_ready' : 'ready', checked_at: clock.toISOString(), issues: Object.freeze(issues) });
}

function actualReceipt(collection, ref) {
  if (collection instanceof Map) return collection.get(ref);
  if (Array.isArray(collection)) return collection.find(item => item.receipt_id === ref);
  return collection?.[ref];
}

function lastSuccessfulCheck(state) {
  return Object.values(state.knowledge_events).filter(item => item.contract_version === 5 && item.check_id && item.status !== 'check_failed').sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0]?.checked_at ?? null;
}

export async function dispatchKnowledgeV5(request, dir, state) {
  const payload = validate('KnowledgeStepPayloadV5', request.payload);
  if (!state || state.schema_version !== 5) fail('MIGRATION_REQUIRED', '/state/schema_version', 'Knowledge V5 requires state 5');
  let result;
  const next = await commitState(dir, request.expected_revision, async working => {
    const current = knowledgeBundleFromState(working);
    if (payload.operation === 'check') {
      result = validate('KnowledgeCheckV5', inspectKnowledgeCheckoutV5({ checkout_dir: payload.checkout_dir, repo: current.catalog.upstream.repo, prior_head: current.catalog.upstream.commit, paths: payload.paths, clock: new Date() }));
      putImmutable(working.knowledge_events, result.check_id, result);
      return working;
    }
    if (payload.operation === 'propose-update') {
      const check = working.knowledge_events[payload.check_ref];
      if (!check || check.contract_version !== 5 || !check.check_id) fail('MISSING_EVIDENCE', '/check_ref', 'Saved knowledge check does not exist');
      const loaded = loadKnowledgeCatalog(payload.package_dir, { now: new Date() });
      if (loaded.catalog.upstream.commit !== check.observed_head) fail('INVALID_EVIDENCE_REF', '/check_ref', 'Candidate package does not match the actual checked HEAD');
      verifyKnowledgeSourceMaterialsV5(current, loaded, check, payload.package_dir);
      seedKnowledgeState(working, loaded, { activate: false });
      const saved = savedCandidateBundle(working, loaded.catalog.catalog_id, loaded.temporal_readiness);
      if (canonicalHash(saved.catalog) !== canonicalHash(loaded.catalog)) fail('RECEIPT_CONFLICT', '/candidate_catalog_ref', 'Saved candidate differs from verified package');
      result = validate('KnowledgeUpdateProposalV5', proposeKnowledgeUpdateV5(current, saved, check));
      putImmutable(working.knowledge_events, result.proposal_id, result);
      return working;
    }
    const proposal = working.knowledge_events[payload.proposal_ref];
    if (!proposal || proposal.contract_version !== 5 || !proposal.proposal_id) fail('MISSING_EVIDENCE', '/proposal_ref', 'Saved update proposal does not exist');
    if (proposal.candidate_catalog_ref !== payload.candidate_catalog_ref) fail('INVALID_EVIDENCE_REF', '/candidate_catalog_ref', 'Activation identifies another candidate');
    const savedBase = savedCandidateBundle(working, payload.candidate_catalog_ref, null), saved = Object.freeze({ ...savedBase, temporal_readiness: savedTemporalReadiness(savedBase) });
    const replayResults = payload.replay_results.map(item => validate('KnowledgeReplayResultV5', item));
    for (const replay of replayResults) {
      if (replay.proposal_ref !== proposal.proposal_id || replay.subject_hash !== proposal.proposal_hash || replay.replay_result_hash !== knowledgeReplayResultHashV5(replay)) fail('RECEIPT_CONFLICT', '/replay_results', 'Replay result is not bound to the exact saved proposal');
    }
    const reviewRefs = [payload.review_receipt_ref, ...replayResults.map(item => item.review_ref)];
    const { verifyHostReviewReceiptV5, loadActualReviewReceiptsV5 } = await import('./host-review-v5.mjs');
    const receipts = await loadActualReviewReceiptsV5(working, reviewRefs), clock = new Date();
    const proposalReview = actualReceipt(receipts, payload.review_receipt_ref);
    await verifyHostReviewReceiptV5(proposalReview, { clock: () => clock, expectedPurpose: 'review_knowledge', expectedSubjectRef: proposal.proposal_id, expectedSubjectContentHash: proposal.proposal_hash });
    if (proposalReview?.purpose !== 'review_knowledge' || proposalReview.subject_ref !== proposal.proposal_id || proposalReview.subject_hash !== proposal.proposal_hash || proposalReview.actual_result_hash !== proposal.proposal_hash || proposalReview.decision !== 'approved') fail('MISSING_EVIDENCE', '/review_receipt_ref', 'Exact approved knowledge proposal review is required');
    for (const replay of replayResults) {
      const receipt = actualReceipt(receipts, replay.review_ref);
      await verifyHostReviewReceiptV5(receipt, { clock: () => clock, expectedPurpose: 'review_knowledge', expectedSubjectRef: replay.replay_id, expectedSubjectContentHash: replay.replay_result_hash });
      if (receipt?.purpose !== 'review_knowledge' || receipt.subject_ref !== replay.replay_id || receipt.subject_hash !== replay.replay_result_hash || receipt.actual_result_hash !== replay.replay_result_hash || receipt.decision !== 'approved') fail('MISSING_EVIDENCE', '/replay_results/review_ref', 'Each replay requires its exact actual review');
      putImmutable(working.knowledge_events, replay.replay_id, replay);
    }
    result = activateKnowledgeUpdateV5(current, saved, proposal, { review_receipt: proposalReview, replay_results: replayResults, check: working.knowledge_events[proposal.check_ref], activated_at: clock });
    putImmutable(working.knowledge_events, result.event.event_id, validate('KnowledgeEventV5', result.event));
    return working;
  });
  return { state: next, data: payload.operation === 'check' ? { check: result, last_successful_checked_at: lastSuccessfulCheck(next) } : payload.operation === 'propose-update' ? { proposal: result } : result };
}
