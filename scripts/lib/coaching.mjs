import { canonicalHash, newId, ContractError } from './contracts.mjs';
import { analyzeAccountV2 } from './account.mjs';
import { prepareContentAnalysis, validateContentAnalysis, isContentAnalysisCurrent, prepareContentAnalysisV3, validateContentAnalysisV3, activeContentReceiptV3 } from './post-content.mjs';
import { priorActionOutcome, validateExperimentPlan } from './experiments.mjs';
import { selectMetricObservations } from './observation-selection.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const values = value => Object.values(value ?? {});
const clone = value => structuredClone(value);

function accountMatches(expected, actual) {
  const left = String(expected?.handle ?? '').replace(/^@/, '').toLowerCase();
  const right = String(actual?.handle ?? '').replace(/^@/, '').toLowerCase();
  return left === right && (!expected?.user_id || !actual?.user_id || expected.user_id === actual.user_id);
}

function objectHashEntry(type, locator, value, extra = {}) {
  return { type, locator: clone(locator), content_hash: canonicalHash(value), ...extra };
}

function metricEvidence(index, analysisResults) {
  for (const period of analysisResults.account_period_results ?? []) for (const metric of period.metrics ?? []) {
    const ref = `metric-result:account_period:${period.period_id}:${metric.metric_definition_id}`;
    addEvidence(index, ref, objectHashEntry('metric_result', { section: 'account_period_results', period_id: period.period_id, metric_definition_id: metric.metric_definition_id }, metric, { availability: metric.status === 'available' ? 'observed' : metric.status, definition_id: metric.metric_definition_id }));
  }
  for (const metric of analysisResults.post_cohort_results ?? []) {
    const ref = `metric-result:post_cohort:${metric.period_id}:${metric.post_type}:${metric.metric_definition_id}`;
    addEvidence(index, ref, objectHashEntry('metric_result', { section: 'post_cohort_results', period_id: metric.period_id, post_type: metric.post_type, metric_definition_id: metric.metric_definition_id }, metric, { availability: metric.sample?.valid_n > 0 ? 'observed' : 'unavailable', definition_id: metric.metric_definition_id }));
  }
  for (const window of analysisResults.age_matched_results ?? []) for (const metric of window.metrics ?? []) {
    const ref = `metric-result:age_matched:${window.period_id}:${window.post_type}:${window.window_id}:${metric.metric_definition_id}`;
    addEvidence(index, ref, objectHashEntry('metric_result', { section: 'age_matched_results', period_id: window.period_id, post_type: window.post_type, window_id: window.window_id, metric_definition_id: metric.metric_definition_id }, metric, { availability: metric.sample?.valid_n > 0 ? 'observed' : 'unavailable', definition_id: metric.metric_definition_id }));
  }
  for (const comparison of analysisResults.comparisons ?? []) {
    const ref = `metric-result:comparison:${comparison.current_scope}:${comparison.baseline_scope}:${comparison.metric_definition_id}`;
    addEvidence(index, ref, objectHashEntry('metric_result', { section: 'comparisons', current_scope: comparison.current_scope, baseline_scope: comparison.baseline_scope, metric_definition_id: comparison.metric_definition_id }, comparison, { availability: comparison.comparability_status === 'compatible' ? 'observed' : comparison.comparability_status, definition_id: comparison.metric_definition_id }));
  }
  for (const metric of analysisResults.derived_metrics ?? []) {
    const ref = `metric-result:derived:${metric.derived_metric_id}:${metric.scope_hash}`;
    addEvidence(index, ref, objectHashEntry('metric_result', { section: 'derived_metrics', derived_metric_id: metric.derived_metric_id, scope_hash: metric.scope_hash }, metric, { availability: metric.value === null ? 'unavailable' : 'observed', definition_id: metric.derived_metric_id }));
  }
}

function addEvidence(index, ref, entry) {
  if (index[ref] && canonicalHash(index[ref]) !== canonicalHash(entry)) fail('OBSERVATION_CONFLICT', '/evidence_index', `Evidence reference identifies different results: ${ref}`);
  index[ref] = entry;
}

function observationEvidence(index, state) {
  for (const snapshot of values(state.snapshots_v2)) {
    for (const [metricKey, metric] of Object.entries(snapshot.metrics ?? {})) {
      const ref = `${snapshot.snapshot_id}:${metricKey}`;
      index[ref] = objectHashEntry('observation', { snapshot_id: snapshot.snapshot_id, metric_key: metricKey }, metric, {
        availability: metric.availability,
        definition_id: metric.definition_id
      });
    }
  }
}

function contentEvidence(index, state, analysisRefs) {
  for (const ref of analysisRefs) {
    const analysis = state.content_analyses?.[ref];
    if (!analysis) continue;
    analysis.feature_evidence_spans.forEach((span, position) => {
      index[`post-span:${ref}:${position}`] = objectHashEntry('post_span', {
        analysis_id: ref, post_version_ref: analysis.post_version_ref, start: span.start, end: span.end
      }, span, { exact_text: span.text });
    });
  }
}

function buildEvidenceIndex(state, analysisResults, contentAnalysisRefs, materialRefs, ruleRefs, priorExperimentRefs) {
  const index = {};
  metricEvidence(index, analysisResults);
  observationEvidence(index, state);
  contentEvidence(index, state, contentAnalysisRefs);
  for (const ref of materialRefs) {
    const material = resolveMaterial(state, ref);
    if (material) index[ref] = objectHashEntry('source_material', { ref }, material);
  }
  for (const ref of ruleRefs) {
    const rule = state.rule_versions_v2?.[ref];
    if (rule) index[ref] = objectHashEntry('algorithm_rule', { rule_version_id: ref }, rule);
  }
  for (const ref of priorExperimentRefs) {
    const experiment = state.experiments?.[ref];
    if (experiment) index[ref] = objectHashEntry('prior_experiment', { experiment_id: ref }, experiment);
  }
  return index;
}

function resolveMaterial(state, ref) {
  const direct = state.sources?.[ref]?.record ?? state.sources?.[ref] ?? state.import_batches?.[ref];
  if (direct) return direct;
  const artifacts = values(state.import_artifacts).filter(item => item.source_ref === ref).map(item => ({ artifact_sha256: item.artifact_sha256, source_ref: item.source_ref, material_kind: item.material_kind, path: item.path })).sort((a, b) => a.artifact_sha256.localeCompare(b.artifact_sha256));
  return artifacts.length ? artifacts : null;
}

function currentContentRefs(state, requestedRefs, analysisVersion) {
  const requested = new Set(requestedRefs);
  const current = values(state.content_analyses).filter(item => {
    const version = state.post_versions?.[item.post_version_ref];
    if (!(requested.has(item.post_version_ref) && version && item.analysis_version === analysisVersion)) return false;
    try {
      if(item.contract_version===3)validateContentAnalysisV3(item,state,activeContentReceiptV3(state,item));
      else {if(!isContentAnalysisCurrent(item,version,analysisVersion,state.post_versions))return false;validateContentAnalysis(item,state,state.content_review_receipts?.[item.semantic_review_receipt_ref]);}
      return true;
    }
    catch { return false; }
  }).sort((left, right) => String(right.reviewed_at).localeCompare(String(left.reviewed_at)) || left.analysis_id.localeCompare(right.analysis_id));
  const selected = new Map();
  for (const item of current) if (!selected.has(item.post_version_ref)) selected.set(item.post_version_ref, item.analysis_id);
  return [...selected.values()];
}

function canonicalInput(state, request) {
  return {
    contract_version: 2,
    account: clone(state.account),
    analysis_cutoff: request.analysis_cutoff,
    post_entities: values(state.post_entities),
    post_versions: values(state.post_versions),
    snapshots: values(state.snapshots_v2),
    source_series: values(state.source_series),
    requested_scope: clone(request.requested_scope)
  };
}

function analysisDataset(state, analysisRequest, cutoff) {
  const outputs = new Set(analysisRequest.requested_outputs ?? ['account_period', 'publication_cohort', 'age_matched']);
  const requestedKeys = analysisRequest.target_post_keys?.length ? new Set(analysisRequest.target_post_keys) : null;
  const entities = values(state.post_entities).filter(item => !requestedKeys || requestedKeys.has(item.post_key));
  const entityKeys = new Set(entities.map(item => item.post_key));
  const periods = new Set((analysisRequest.periods ?? []).map(item => `${item.start}|${item.end_exclusive}`));
  const snapshots = values(state.snapshots_v2).filter(snapshot => {
    if (snapshot.entity_type === 'account') return outputs.has('account_period') && periods.has(`${snapshot.period?.start}|${snapshot.period?.end_exclusive}`);
    if (snapshot.entity_type !== 'post' || !(outputs.has('publication_cohort') || outputs.has('age_matched'))) return false;
    return entityKeys.has(state.post_aliases?.[snapshot.entity_id] ?? snapshot.entity_id) && (!snapshot.observed_at || Date.parse(snapshot.observed_at) <= Date.parse(cutoff));
  });
  const versionRefs = new Set(entities.map(item => item.current_version_ref).filter(Boolean));
  const seriesRefs = new Set(snapshots.map(item => item.source_series_id));
  return {
    analysis_request: clone(analysisRequest),
    account: clone(state.account),
    entities: entities.sort((a, b) => a.post_key.localeCompare(b.post_key)),
    versions: values(state.post_versions).filter(item => versionRefs.has(item.post_version_id)).sort((a, b) => a.post_version_id.localeCompare(b.post_version_id)),
    snapshots: snapshots.sort((a, b) => a.snapshot_id.localeCompare(b.snapshot_id)),
    source_series: values(state.source_series).filter(item => seriesRefs.has(item.source_series_id)).sort((a, b) => a.source_series_id.localeCompare(b.source_series_id))
  };
}

function coachingHistory(state) {
  return {
    actions: values(state.actions).sort((a, b) => a.action_id.localeCompare(b.action_id)),
    experiments: values(state.experiments).sort((a, b) => a.experiment_id.localeCompare(b.experiment_id)),
    reviews: values(state.experiment_reviews).sort((a, b) => a.review_id.localeCompare(b.review_id))
  };
}

function materialScope(state, refs) {
  return refs.map(ref => [ref, resolveMaterial(state, ref)]);
}

/** Build purpose-bound evidence; background/excluded refs never become target metric results. */
export function buildEvidenceRolesV3(state,{target,baseline=null,background_refs=[],as_of}={}) {
  const targetSelection=selectMetricObservations(state,{...target,as_of,role:'target'});
  const baselineSelection=baseline?selectMetricObservations(state,{...baseline,as_of,role:'baseline'}):null;
  const index={};
  for(const selection of [targetSelection,baselineSelection].filter(Boolean))for(const selected of selection.selected)addEvidence(index,selected.observation_ref,objectHashEntry('observation',{observation_ref:selected.observation_ref,role:selection.role,selection_hash:selection.selection_hash},selected,{availability:'observed',definition_id:selected.metric_definition_id,evidence_role:selection.role}));
  for(const ref of background_refs){const material=resolveMaterial(state,ref);if(!material)fail('INVALID_EVIDENCE_REF','/background_refs',`Background material is missing: ${ref}`);addEvidence(index,ref,objectHashEntry('source_material',{ref,role:'background'},material,{evidence_role:'background'}));}
  for(const excluded of targetSelection.excluded)addEvidence(index,`excluded:${excluded.observation_ref}:${excluded.reason}`,objectHashEntry('observation',{observation_ref:excluded.observation_ref,role:'excluded'},excluded,{availability:'excluded',definition_id:null,evidence_role:'excluded'}));
  return{contract_version:3,target_selection:targetSelection,baseline_selection:baselineSelection,evidence_index:index,evidence_roles_hash:canonicalHash({target:targetSelection.selection_hash,baseline:baselineSelection?.selection_hash??null,background_refs:[...background_refs].sort()})};
}

export function prepareCoaching(state, request, options = {}) {
  if (!request || request.contract_version !== 2) fail('INVALID_INPUT', '/contract_version', 'Coaching request requires contract_version 2');
  if (!accountMatches(state.account, request.account_identity)) fail('ACCOUNT_MISMATCH', '/account_identity', 'Coaching account does not match state');
  const analysisResults = analyzeAccountV2(canonicalInput(state, request), request.analysis_request);
  const requestedPostRefs = request.requested_post_version_refs ?? [];
  const contentAnalysisRefs = currentContentRefs(state, requestedPostRefs, request.content_analysis_version);
  const content = state.schema_version===3?prepareContentAnalysisV3(state,requestedPostRefs,{analysis_version:request.content_analysis_version,max_items:options.max_new_items??request.content_budget.max_items}):prepareContentAnalysis(values(state.post_versions).filter(item => requestedPostRefs.includes(item.post_version_id ?? item.version_id)), {
    requested_post_version_refs: requestedPostRefs,
    analysis_version: request.content_analysis_version,
    max_items: options.max_new_items ?? request.content_budget.max_items
  }, state.content_analyses);
  const materialRefs = [...new Set(request.available_material_refs ?? [])];
  for (const ref of materialRefs) if (!resolveMaterial(state, ref)) fail('INVALID_EVIDENCE_REF', '/available_material_refs', `Available material is not recoverable: ${ref}`);
  const ruleRefs = [...new Set(request.rule_version_refs ?? [])];
  const priorActionRefs = values(state.actions).map(item => item.action_id);
  const priorExperimentRefs = values(state.experiments).map(item => item.experiment_id);
  const computed = [...new Set([...(analysisResults.limitations ?? []), ...(analysisResults.derived_metrics ?? []).map(item => item.limitation)])];
  if (content.unread_post_version_refs.length || content.coverage.selected_n) computed.push(`内容覆盖受限：已完成 ${content.coverage.reusable_n}/${content.coverage.requested_n} 条；本轮待分析 ${content.coverage.selected_n} 条；未读 ${content.coverage.unread_n} 条；剩余新增分析预算 ${options.max_new_items ?? request.content_budget.max_items} 条`);
  const evidenceIndex = buildEvidenceIndex(state, analysisResults, contentAnalysisRefs, materialRefs, ruleRefs, priorExperimentRefs);
  const boundHashes = Object.fromEntries([
    ...requestedPostRefs.map(ref => [`post_version:${ref}`, state.post_versions?.[ref] ? canonicalHash(state.post_versions[ref]) : null]),
    ...contentAnalysisRefs.map(ref => [`content_analysis:${ref}`, canonicalHash(state.content_analyses[ref])]),
    ...ruleRefs.map(ref => [`rule_version:${ref}`, state.rule_versions_v2?.[ref] ? canonicalHash(state.rule_versions_v2[ref]) : null])
  ]);
  const base = {
    contract_version: 2,
    bundle_id: '',
    account_identity: clone(request.account_identity),
    requested_scope: clone(request.requested_scope),
    requested_deliverables: clone(request.requested_deliverables),
    goal_snapshot: clone(request.goal_snapshot),
    constraint_snapshot: clone(request.constraint_snapshot),
    source_state_revision: state.revision,
    analysis_cutoff: request.analysis_cutoff,
    selection_policy_version: request.selection_policy_version,
    analysis_request: clone(request.analysis_request),
    account_period_results: clone(analysisResults.account_period_results),
    publication_structure: clone(analysisResults.publication_structure ?? []),
    post_cohort_results: clone(analysisResults.post_cohort_results),
    age_matched_results: clone(analysisResults.age_matched_results),
    comparison_results: clone(analysisResults.comparisons ?? []),
    derived_metrics: clone(analysisResults.derived_metrics ?? []),
    deliverable_status: clone(analysisResults.deliverable_status),
    post_version_refs: [...requestedPostRefs],
    content_analysis_refs: contentAnalysisRefs,
    available_material_refs: materialRefs,
    rule_version_refs: ruleRefs,
    prior_action_refs: priorActionRefs,
    prior_experiment_refs: priorExperimentRefs,
    computed_limitations: computed,
    unresolved_questions: [...(request.unresolved_questions ?? [])],
    evidence_index: evidenceIndex,
    bound_hashes: boundHashes,
    analysis_dataset_hash: canonicalHash(analysisDataset(state, request.analysis_request, request.analysis_cutoff)),
    coaching_history_hash: canonicalHash(coachingHistory(state)),
    material_scope_hash: canonicalHash(materialScope(state, materialRefs))
  };
  base.bundle_id = `bundle-${canonicalHash(base).slice(0, 32)}`;
  base.bundle_hash = canonicalHash(base);
  return { bundle: base, content_work_items: content };
}

function assertBundleCurrent(bundle, state) {
  if (canonicalHash(analysisDataset(state, bundle.analysis_request, bundle.analysis_cutoff)) !== bundle.analysis_dataset_hash) fail('STALE_BUNDLE', '/analysis_dataset_hash', 'Eligible account observations or their definitions changed');
  if (canonicalHash(coachingHistory(state)) !== bundle.coaching_history_hash) fail('STALE_BUNDLE', '/coaching_history_hash', 'Prior actions or experiment results changed');
  if (canonicalHash(materialScope(state, bundle.available_material_refs)) !== bundle.material_scope_hash) fail('STALE_BUNDLE', '/material_scope_hash', 'Available source material changed');
  for (const [key, expected] of Object.entries(bundle.bound_hashes)) {
    const separator = key.indexOf(':');
    const kind = key.slice(0, separator);
    const ref = key.slice(separator + 1);
    const collection = kind === 'post_version' ? state.post_versions : kind === 'content_analysis' ? state.content_analyses : state.rule_versions_v2;
    const current = collection?.[ref];
    if (!current || canonicalHash(current) !== expected) fail('STALE_BUNDLE', '/bundle_hash', `Bound evidence changed: ${key}`);
  }
}

function requireEvidence(refs, bundle, path) {
  for (const ref of refs) if (!bundle.evidence_index[ref]) fail('INVALID_EVIDENCE_REF', path, `Evidence is not in this bundle: ${ref}`);
}

function actionIsConcrete(action) {
  const text = action.change?.trim() ?? '';
  if (text.length < 16) return false;
  return !/^(多互动|提高内容质量|保持活跃|多追热点|多发热点|发优质内容)[。！!]?$/u.test(text);
}

export function algorithmReviewFlags(value,{rejectHard=false}={}) {
  const source=typeof value==='string'?value:JSON.stringify(value);
  const sentences=source.split(/(?<=[。！？!?；;])|\n+/u).map(text=>text.trim()).filter(Boolean),flags=[];
  for(const text of sentences){
    const negated=/(不能|不可|不要|不应|无法|不保证|并非|不是|没有证据|待核查|引用|反驳|uncertain|cannot|not guarantee|should not)/i.test(text);
    let kind=null;
    if(/推荐分|爆款概率|likes?\s*[×x*]\s*\d|点赞.*(换算|加).*分/i.test(text))kind='ranking_formula';
    else if(/保底曝光|保证.*曝光|必然.*曝光|保证.*增长|guarantee/i.test(text))kind='effect_guarantee';
    else if(/限流.*(确定|证明)/i.test(text))kind='causal_restriction';
    if(!kind)continue;
    const flag={flag_id:`algorithm-flag-${canonicalHash({kind,text}).slice(0,20)}`,kind,text,classification_required:true,severity:negated?'review':'hard_error'};flags.push(flag);
    if(rejectHard&&!negated)fail('INVALID_INPUT','/proposal','The proposal contains an unsupported ranking or effect assertion');
  }
  return flags;
}

function ensureNoAlgorithmFantasy(value) {
  // Honest rebuttals and uncertainty must reach semantic review; only positive unsupported assertions hard fail.
  return algorithmReviewFlags(value,{rejectHard:true});
}

export function validateCoachingProposal(proposal, bundle, state) {
  if (!proposal || proposal.contract_version !== 2) fail('INVALID_INPUT', '/contract_version', 'Coaching proposal requires contract_version 2');
  if (proposal.bundle_id !== bundle.bundle_id || proposal.bundle_hash !== bundle.bundle_hash) fail('STALE_BUNDLE', '/bundle_hash', 'Proposal is not bound to the active evidence bundle');
  assertBundleCurrent(bundle, state);
  const diagnosis = proposal.diagnosis;
  if (!diagnosis?.primary_question_or_bottleneck?.trim() || !diagnosis.findings?.length) fail('REQUESTED_OUTPUT_INCOMPLETE', '/diagnosis', 'A concrete diagnosis and finding are required');
  if (diagnosis.bundle_id !== bundle.bundle_id || diagnosis.bundle_hash !== bundle.bundle_hash) fail('STALE_BUNDLE', '/diagnosis/bundle_hash', 'Diagnosis is not bound to the active evidence bundle');
  if (diagnosis.computed_limitations_hash !== canonicalHash(bundle.computed_limitations)) fail('STALE_BUNDLE', '/computed_limitations_hash', 'Computed limitations cannot be deleted or replaced');
  for (const [index, finding] of diagnosis.findings.entries()) {
    if (!finding.statement?.trim() || !finding.interpretation?.trim() || !finding.what_would_change_this_finding?.trim()) fail('REQUESTED_OUTPUT_INCOMPLETE', `/findings/${index}`, 'Finding text, interpretation, and recheck condition are required');
    requireEvidence(finding.evidence_refs, bundle, `/findings/${index}/evidence_refs`);
    if (!finding.evidence_refs.length && finding.confidence_level !== 'insufficient') fail('INVALID_EVIDENCE_REF', `/findings/${index}/evidence_refs`, 'A supported finding requires actual bundle evidence');
    if (finding.finding_type !== 'observation' && !finding.alternative_explanations?.length) fail('INVALID_INPUT', `/findings/${index}/alternative_explanations`, 'Associations and hypotheses require alternative explanations');
  }
  if (!proposal.actions?.length || proposal.actions.length > 3) fail('REQUESTED_OUTPUT_INCOMPLETE', '/actions', 'Coaching requires one to three prioritized actions');
  const priorities = new Set();
  for (const [index, action] of proposal.actions.entries()) {
    if (priorities.has(action.priority)) fail('INVALID_INPUT', `/actions/${index}/priority`, 'Action priorities must be unique');
    priorities.add(action.priority);
    if (action.status !== 'proposed') fail('INVALID_INPUT', `/actions/${index}/status`, 'A new coaching proposal can only propose actions');
    if (!actionIsConcrete(action) || !action.why_now?.trim() || !action.review_condition_or_due_at?.trim() || !action.stop_or_revise_condition?.trim()) fail('REQUESTED_OUTPUT_INCOMPLETE', `/actions/${index}`, 'Action must be concrete, timely, and reviewable');
    const refs = [...action.account_evidence_refs, ...action.content_evidence_refs, ...action.rule_version_refs, ...action.guardrail_metric_refs];
    requireEvidence(refs, bundle, `/actions/${index}/evidence_refs`);
    if (action.primary_metric_ref) {
      const metric = bundle.evidence_index[action.primary_metric_ref];
      if (!metric || !['metric_result', 'observation'].includes(metric.type)) fail('METRIC_DEFINITION_UNRESOLVED', `/actions/${index}/primary_metric_ref`, 'Primary metric is unavailable in this bundle');
      if (!['observed', 'complete', 'compatible'].includes(metric.availability) && action.target !== 'data_collection') fail('METRIC_DEFINITION_UNRESOLVED', `/actions/${index}/primary_metric_ref`, 'Unavailable metrics require a data-collection action or an explicit proxy');
    } else if (action.target !== 'data_collection') fail('METRIC_DEFINITION_UNRESOLVED', `/actions/${index}/primary_metric_ref`, 'Action requires an actually available metric');
    const prior = priorActionOutcome(state, action);
    if (prior.repeated && !refs.some(ref => !prior.evidence_refs.includes(ref))) fail('INVALID_INPUT', `/actions/${index}`, 'A rejected or unsuccessful action needs new evidence before being repeated');
  }
  if (proposal.experiment) {
    if (!proposal.actions.some(action => action.action_id === proposal.experiment.originating_action_id)) fail('MISSING_EVIDENCE', '/experiment/originating_action_id', 'Experiment must originate from this proposal');
    validateExperimentPlan(proposal.experiment, { ...state, actions: { ...state.actions, ...Object.fromEntries(proposal.actions.map(item => [item.action_id, item])) } });
    for (const [path, planned] of [['planned_primary_metric', proposal.experiment.planned_primary_metric], ...proposal.experiment.guardrails.map((item, index) => [`guardrails/${index}`, item])]) {
      const evidence = planned.evidence_ref && bundle.evidence_index[planned.evidence_ref];
      if (!evidence || !['metric_result', 'observation'].includes(evidence.type) || evidence.definition_id !== planned.definition_id || evidence.availability !== 'observed') fail('METRIC_DEFINITION_UNRESOLVED', `/experiment/${path}`, 'Experiment metric must bind an available observation of the same definition');
    }
  }
  ensureNoAlgorithmFantasy(proposal);
  const normalized = clone(proposal);
  normalized.actions.sort((left, right) => left.priority - right.priority);
  return { normalized_proposal: normalized, proposal_hash: canonicalHash(normalized) };
}

export function validateRuleVersionV2(rule, state) {
  if (!rule || rule.contract_version !== 2 || !rule.rule_version_id || !rule.source_content_hash || !rule.source_material_ref) fail('INVALID_INPUT', '/rule', 'Rule must bind a source material and content hash');
  const sourceVersion = values(state.sources).map(item => item.versions?.[rule.source_material_ref]).find(Boolean);
  const source = sourceVersion ?? state.sources?.[rule.source_material_ref]?.record ?? state.sources?.[rule.source_material_ref] ?? state.import_batches?.[rule.source_material_ref] ?? state.raw_receipts?.[rule.source_material_ref];
  if (!source) fail('MISSING_EVIDENCE', '/source_material_ref', 'Rule source material does not exist');
  const actualSourceHash = source.captured_text_hash ?? source.content_hash ?? source.source_content_hash ?? source.artifact_sha256 ?? source.raw_hash ?? null;
  if (!actualSourceHash) fail('MISSING_EVIDENCE', '/source_content_hash', 'Rule source has no recoverable content hash');
  if (actualSourceHash && actualSourceHash !== rule.source_content_hash) fail('RECEIPT_CONFLICT', '/source_content_hash', 'Rule is not bound to the actual source bytes');
  if (rule.supersedes) {
    const prior = state.rule_versions_v2?.[rule.supersedes];
    if (!prior) fail('MISSING_EVIDENCE', '/supersedes', 'Superseded rule does not exist');
    const ignore = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['rule_version_id', 'checked_at', 'supersedes'].includes(key)));
    if (canonicalHash(ignore(prior)) === canonicalHash(ignore(rule))) fail('INVALID_INPUT', '/checked_at', 'Changing checked_at alone is not a rule update');
  }
  return clone(rule);
}

export function assessRuleHistoricalApplicability(rule, postCreatedAt) {
  if (!rule.publicly_available_from) return { status: 'unknown', reason: 'The public availability date is not known' };
  if (Date.parse(postCreatedAt) < Date.parse(rule.publicly_available_from)) return { status: 'unknown', reason: 'The post predates the public rule version; historical production applicability is unknown' };
  if (rule.production_status !== 'confirmed') return { status: 'unknown', reason: 'Public source does not confirm production deployment' };
  return { status: 'potentially_applicable', reason: 'Public timing is compatible, subject to the stated preconditions' };
}

export function finalizeCoaching(validated, semanticReceipt, state) {
  const proposal = validated.normalized_proposal;
  const bundle = state.evidence_bundles?.[proposal.bundle_id];
  if (!bundle || proposal.bundle_hash !== bundle.bundle_hash) fail('STALE_BUNDLE', '/bundle_hash', 'The active evidence bundle is unavailable');
  assertBundleCurrent(bundle, state);
  if (!semanticReceipt?.review_id || !semanticReceipt.reviewer || !semanticReceipt.reviewed_at || semanticReceipt.bundle_hash !== bundle.bundle_hash || semanticReceipt.proposal_hash !== validated.proposal_hash || semanticReceipt.decision !== 'approved') fail('MISSING_EVIDENCE', '/semantic_review', 'An identified, timestamped review bound to this exact proposal is required');
  const requiredChecks = ['evidence_supported', 'alternatives_preserved', 'causality_bounded', 'voice_preserved', 'actions_executable', 'metrics_available'];
  if (requiredChecks.some(key => semanticReceipt.checks?.[key] !== true)) fail('REQUESTED_OUTPUT_INCOMPLETE', '/semantic_review/checks', 'Every semantic quality check must pass');
  const contentRequested = bundle.requested_deliverables.includes('historical_content');
  const contentComplete = !contentRequested || (bundle.post_version_refs.length > 0 && bundle.post_version_refs.length === bundle.content_analysis_refs.length);
  const accountStatus = bundle.deliverable_status?.account_period ?? 'unavailable';
  const limitations = [...bundle.computed_limitations, ...proposal.diagnosis.analyst_limitations];
  return {
    contract_version: 2,
    report_id: `coach-report-${validated.proposal_hash.slice(0, 24)}`,
    bundle_id: bundle.bundle_id,
    bundle_hash: bundle.bundle_hash,
    proposal_hash: validated.proposal_hash,
    semantic_review_ref: semanticReceipt.review_id,
    requested_deliverables: clone(bundle.requested_deliverables ?? ['account_period', 'historical_content', 'next_actions']),
    deliverable_status: {
      account_period: accountStatus === 'complete' ? 'complete' : accountStatus === 'unavailable' ? 'blocked' : 'partial',
      historical_content: contentComplete ? 'complete' : bundle.post_version_refs.length ? 'partial' : 'blocked',
      next_actions: proposal.actions.length ? 'complete' : 'blocked'
    },
    diagnosis: clone(proposal.diagnosis),
    actions: clone(proposal.actions),
    experiment: clone(proposal.experiment),
    computed_limitations: clone(bundle.computed_limitations),
    analyst_limitations: clone(proposal.diagnosis.analyst_limitations),
    limitations
  };
}

function storeImmutable(collection, id, value, path) {
  const existing = collection[id];
  if (existing && canonicalHash(existing) !== canonicalHash(value)) fail('STATE_CONFLICT', path, `${id} already identifies different content`);
  collection[id] = clone(value);
}

function rebuildBundle(state, run) {
  const remaining = Math.max(0, run.request.content_budget.max_items - run.accepted_content_count);
  const prepared = prepareCoaching(state, run.request, { max_new_items: remaining });
  storeImmutable(state.evidence_bundles, prepared.bundle.bundle_id, prepared.bundle, '/evidence_bundles');
  run.active_bundle_id = prepared.bundle.bundle_id;
  run.active_bundle_hash = prepared.bundle.bundle_hash;
  run.bundle_versions.push(prepared.bundle.bundle_id);
  run.content_work_items = prepared.content_work_items;
  run.proposal = null;
  run.semantic_review = null;
  return prepared;
}

function contentRunStatus(work) {
  return work.work_items.length || work.unread_post_version_refs.length ? 'awaiting_content' : 'evidence_ready';
}

export function advanceCoaching(state, payload, runId = null) {
  if (!state || ![2,3].includes(state.schema_version)) fail('MIGRATION_REQUIRED', '/state/schema_version', 'Coaching requires a v2 or v3 state');
  for (const key of ['content_analyses', 'content_review_receipts', 'coaching_runs', 'evidence_bundles', 'diagnoses', 'actions', 'experiments', 'experiment_reviews', 'rule_versions_v2']) state[key] ??= {};
  if (payload.operation === 'prepare') {
    const id = runId ?? newId('coach_run');
    if (state.coaching_runs[id]) fail('STATE_CONFLICT', '/run_id', 'Coaching run already exists');
    const run = { contract_version: state.schema_version===3?3:2, run_id: id, status: 'prepared', request: clone(payload.request), bundle_versions: [], active_bundle_id: null, active_bundle_hash: null, content_work_items: null, accepted_content_refs: [], accepted_content_count: 0, proposal: null, semantic_review: null, report_ref: null, created_at: payload.as_of, updated_at: payload.as_of };
    state.coaching_runs[id] = run;
    const prepared = rebuildBundle(state, run);
    run.status = contentRunStatus(prepared.content_work_items);
    return { state, result: { run: clone(run), bundle: clone(prepared.bundle), content_work_items: clone(prepared.content_work_items) } };
  }
  const run = state.coaching_runs[runId ?? payload.run_id];
  if (!run) fail('MISSING_EVIDENCE', '/run_id', 'Coaching run does not exist');
  if (run.status === 'delivered') fail('STATE_CONFLICT', '/run_id', 'Delivered runs are immutable');
  if (payload.operation === 'ingest' && payload.kind === 'content_analysis') {
    if (run.accepted_content_count >= run.request.content_budget.max_items) fail('BUDGET_EXHAUSTED', '/content_budget', 'This run has used its total new-content analysis budget');
    const analysis = state.schema_version===3?validateContentAnalysisV3(payload.data.analysis,state,payload.data.semantic_receipt):validateContentAnalysis(payload.data.analysis, state, payload.data.semantic_receipt);
    const item = run.content_work_items.work_items.find(candidate => candidate.post_version_ref === analysis.post_version_ref && candidate.content_hash === analysis.content_hash && (state.schema_version===3?candidate.context_selection_hash===analysis.context_selection_hash:candidate.context_hash===analysis.context_hash));
    if (!item) fail('STALE_BUNDLE', '/post_version_ref', 'Content analysis does not answer an active work item');
    storeImmutable(state.content_review_receipts, payload.data.semantic_receipt.review_id, payload.data.semantic_receipt, '/content_review_receipts');
    storeImmutable(state.content_analyses, analysis.analysis_id, analysis, '/content_analyses');
    run.accepted_content_refs.push(analysis.analysis_id);
    run.accepted_content_count = run.accepted_content_refs.length;
    const prepared = rebuildBundle(state, run);
    run.status = contentRunStatus(prepared.content_work_items);
    run.updated_at = payload.as_of;
    return { state, result: { run: clone(run), bundle: clone(prepared.bundle), content_work_items: clone(prepared.content_work_items) } };
  }
  if (payload.operation === 'ingest' && payload.kind === 'evidence_scope') {
    if (!['prepared', 'awaiting_content', 'evidence_ready'].includes(run.status)) fail('STATE_CONFLICT', '/status', 'Evidence scope cannot replace a validated proposal');
    const declared = new Set(payload.data.unread_post_version_refs);
    for (const ref of run.content_work_items.unread_post_version_refs.concat(run.content_work_items.work_items.map(item => item.post_version_ref))) if (!declared.has(ref)) fail('REQUESTED_OUTPUT_INCOMPLETE', '/unread_post_version_refs', 'Evidence scope cannot delete unread material');
    const previous = state.evidence_bundles[run.active_bundle_id];
    const bundle = clone(previous);
    for (const reason of payload.data.unavailable_reasons) if (!bundle.computed_limitations.includes(reason)) bundle.computed_limitations.push(reason);
    bundle.scope_freeze = { unread_post_version_refs: [...payload.data.unread_post_version_refs], unavailable_reasons: [...payload.data.unavailable_reasons] };
    bundle.bundle_id = '';
    delete bundle.bundle_hash;
    bundle.bundle_id = `bundle-${canonicalHash(bundle).slice(0, 32)}`;
    bundle.bundle_hash = canonicalHash(bundle);
    storeImmutable(state.evidence_bundles, bundle.bundle_id, bundle, '/evidence_bundles');
    run.active_bundle_id = bundle.bundle_id;
    run.active_bundle_hash = bundle.bundle_hash;
    run.bundle_versions.push(bundle.bundle_id);
    run.status = 'evidence_ready';
    run.updated_at = payload.as_of;
    return { state, result: { run: clone(run), bundle: clone(bundle) } };
  }
  if (payload.operation === 'ingest' && payload.kind === 'coaching_proposal') {
    if (run.status !== 'evidence_ready' && run.status !== 'proposal_validated') fail('STATE_CONFLICT', '/status', 'Proposal requires frozen evidence');
    const bundle = state.evidence_bundles[run.active_bundle_id];
    const checked = validateCoachingProposal(payload.data, bundle, state);
    run.proposal = checked;
    run.semantic_review = null;
    run.status = 'proposal_validated';
    run.updated_at = payload.as_of;
    return { state, result: { run: clone(run), proposal_hash: checked.proposal_hash } };
  }
  if (payload.operation === 'ingest' && payload.kind === 'semantic_review') {
    if (run.status !== 'proposal_validated') fail('STATE_CONFLICT', '/status', 'Semantic review requires the current validated proposal');
    if (payload.data.bundle_hash !== run.active_bundle_hash || payload.data.proposal_hash !== run.proposal.proposal_hash) fail('STALE_BUNDLE', '/semantic_review', 'Semantic review is not bound to the active proposal');
    run.semantic_review = clone(payload.data);
    run.status = payload.data.decision === 'approved' ? 'semantic_reviewed' : 'proposal_validated';
    run.updated_at = payload.as_of;
    return { state, result: { run: clone(run) } };
  }
  if (payload.operation === 'finalize') {
    if (run.status !== 'semantic_reviewed') fail('REQUESTED_OUTPUT_INCOMPLETE', '/status', 'Finalize requires an approved semantic review');
    if (payload.proposal_hash !== run.proposal.proposal_hash) fail('STALE_BUNDLE', '/proposal_hash', 'Finalize must name the exact reviewed proposal');
    const report = finalizeCoaching(run.proposal, run.semantic_review, state);
    storeImmutable(state.diagnoses, report.diagnosis.diagnosis_id, report.diagnosis, '/diagnoses');
    for (const action of report.actions) storeImmutable(state.actions, action.action_id, action, '/actions');
    if (report.experiment) storeImmutable(state.experiments, report.experiment.experiment_id, report.experiment, '/experiments');
    state.coaching_reports ??= {};
    storeImmutable(state.coaching_reports, report.report_id, report, '/coaching_reports');
    run.report_ref = report.report_id;
    run.status = 'delivered';
    run.updated_at = payload.as_of;
    return { state, result: { run: clone(run), coaching_report: clone(report) } };
  }
  fail('INVALID_INPUT', '/operation', 'Unsupported coaching operation');
}
