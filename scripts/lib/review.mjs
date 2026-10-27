import { canonicalHash, ContractError, summarizeRun, validate } from './contracts.mjs';
import { analyzeAccount, analyzeAccountV2 } from './account.mjs';
import { selectMetricObservations, computeComparison } from './observation-selection.mjs';
import { metricDefinition } from './metrics.mjs';

function fail(code, path, message) {
  throw new ContractError(code, path, message, false);
}

function values(object) {
  return Object.values(object ?? {});
}

function cardCandidates(state, cardId) {
  const candidates = [];
  for (const [collection, records] of [['cards', state.cards], ['news_cards', state.news_cards]]) {
    const card = records?.[cardId];
    if (card) candidates.push({ card, locator: `${collection}:${cardId}` });
  }
  for (const run of values(state.runs)) {
    for (const card of run.cards ?? []) {
      if (card.card_id === cardId) candidates.push({ card, locator: `run:${run.run_id ?? 'unknown'}` });
    }
  }
  return candidates;
}

/** Resolve only the requested news card. It never falls back to another card in a run. */
export function resolveCardExact(state, cardId) {
  if (!cardId) return { status: 'not_applicable', card_id: null, card: null, evidence_locators: [] };
  const candidates = cardCandidates(state, cardId);
  if (!candidates.length) return { status: 'missing', card_id: cardId, card: null, evidence_locators: [] };
  const groups = new Map();
  for (const candidate of candidates) {
    const hash = canonicalHash(candidate.card);
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(candidate);
  }
  if (groups.size > 1) {
    return { status: 'conflicting', card_id: cardId, card: null, evidence_locators: candidates.map(item => item.locator).sort() };
  }
  return {
    status: 'resolved',
    card_id: cardId,
    card: structuredClone(candidates[0].card),
    evidence_locators: candidates.map(item => item.locator).sort(),
  };
}

function inheritedCardId(history, revision) {
  const seen = new Set();
  let current = history?.revisions?.[revision] ?? null;
  while (current && !seen.has(current.revision)) {
    seen.add(current.revision);
    if (current.card_id) return current.card_id;
    current = current.parent_revision ? history.revisions?.[current.parent_revision] ?? null : null;
  }
  return null;
}

function publicationDraftLink(publication, state) {
  const adoption = publication.adoption_id ? state.adoptions?.[publication.adoption_id] : null;
  return {
    publication_id: publication.publication_id,
    post_id: publication.post_id,
    adoption_id: publication.adoption_id ?? null,
    draft_id: adoption?.draft_id ?? null,
    revision: adoption?.revision ?? null,
  };
}

function sourceAngleLink(link, state) {
  const history = link.draft_id ? state.drafts?.[link.draft_id] : null;
  const cardId = link.revision ? inheritedCardId(history, link.revision) : null;
  const resolution = resolveCardExact(state, cardId);
  const card = resolution.status === 'resolved' ? resolution.card : null;
  const event = card ? state.events?.[card.event_id] : null;
  const claims = (card?.claim_ids ?? []).map(id => state.claims?.[id]).filter(Boolean);
  const sourceVersionIds = [...new Set([...(event?.source_version_ids ?? []), ...claims.flatMap(claim => claim.source_version_ids ?? [])])];
  return {
    publication_id: link.publication_id,
    draft_id: link.draft_id,
    revision: link.revision,
    card_id: cardId,
    card_resolution: resolution.status,
    event_id: card?.event_id ?? null,
    claim_ids: card?.claim_ids ?? [],
    source_version_ids: sourceVersionIds,
    angle: card?.angle ?? null,
  };
}

/** Build the deterministic part of a review from persisted publication/post/snapshot records. */
export function buildReview(input, state) {
  validate('ReviewInput', input);
  const targetHandle = String(input.account.handle).replace(/^@/, '').toLowerCase();
  const stateHandle = String(state.account?.handle ?? targetHandle).replace(/^@/, '').toLowerCase();
  if (targetHandle !== stateHandle || (input.account.user_id && state.account?.user_id && input.account.user_id !== state.account.user_id)) {
    fail('IDENTITY_MISMATCH', '/account', '复盘账号与持久状态账号不一致');
  }
  const publicationIds = input.publication_ids ?? [];
  const explicitPostIds = input.post_ids ?? [];
  const publications = publicationIds.map(id => state.publications?.[id] ?? fail('MISSING_EVIDENCE', `/publication_ids/${id}`, '找不到发布记录'));
  const publishedPostIds = publications.map(item => item.post_id);
  const postIds = [...new Set([...explicitPostIds, ...publishedPostIds])];
  if (!postIds.length) fail('MISSING_EVIDENCE', '/post_ids', '复盘至少需要一个已确认发布或明确帖子');
  const posts = values(state.posts).filter(post => postIds.includes(post.post_id) || postIds.includes(post.post_key));
  const missing = postIds.filter(id => !posts.some(post => post.post_id === id || post.post_key === id));
  if (missing.length) fail('MISSING_EVIDENCE', '/post_ids', `找不到帖子记录：${missing.join(', ')}`);
  const requestedSnapshotIds = new Set(input.snapshot_ids);
  const allSnapshots = values(state.snapshots);
  const postSourceIds = new Set(posts.map(post => post.source_ref).filter(Boolean));
  const postEntityIds = new Set(posts.flatMap(post => [post.post_key, post.post_id]).filter(Boolean));
  const snapshots = allSnapshots.filter(snapshot => requestedSnapshotIds.size ? requestedSnapshotIds.has(snapshot.snapshot_id) :
    postEntityIds.has(snapshot.entity_id) || snapshot.entity_type === 'account');
  const sourceIds = [...new Set([...postSourceIds, ...snapshots.map(item => item.source_ref)].filter(Boolean))];
  const sources = sourceIds.map(source_id => state.sources?.[source_id]?.record ?? state.sources?.[source_id]).filter(Boolean);
  const requestedScope = structuredClone(input.requested_scope ?? {
    mode: 'sample',
    selection_policy: {
      cutoff: input.analysis_cutoff,
      windows_days: [7, 28],
      age_windows: input.age_windows ?? [{ target_hours: 24, tolerance_hours: 2 }],
      group_by: ['post_type', 'primary_topic'],
      requested_metrics: input.requested_metrics ?? ['impressions', 'likes', 'replies', 'reposts', 'quotes'],
      metric_scope: input.metric_scope ?? 'public_total',
      source_selection: sourceIds
    },
    requested_outputs: ['content', 'latest', 'age_matched', 'comparison']
  });
  requestedScope.selection_policy.source_selection = sourceIds;
  const accountInput = {
    schema_version: 1,
    account: input.account,
    analysis_cutoff: input.analysis_cutoff,
    requested_scope: requestedScope,
    coverage: input.coverage ?? {
      requested_start: null, requested_end: input.analysis_cutoff, observed_oldest: null, observed_newest: null,
      source_mode: 'persisted_review', status: 'sample', pages_read: 0, has_more: false, stop_reason: 'selected_publications',
      raw_item_count: posts.length, deduplicated_count: posts.length, metric_available_counts: {}
    },
    posts, snapshots, source_refs: sources, data_mode: input.data_mode ?? 'live'
  };
  const account_result = analyzeAccount(accountInput, requestedScope.selection_policy);
  const draft_links = publications.map(publication => publicationDraftLink(publication, state));
  const source_angle_links = draft_links.map(link => {
    const resolved = sourceAngleLink(link, state);
    const { card_resolution: ignored, ...legacy } = resolved;
    return legacy;
  });
  const limitations = [...account_result.limitations];
  if (!publications.length) limitations.push('本次按明确帖子复盘，没有已确认发布记录，无法判断采用的草稿版本');
  if (!snapshots.some(snapshot => snapshot.entity_type === 'post')) limitations.push('没有帖子指标观测，无法评估发布后表现');
  for (const link of source_angle_links) {
    const resolution = resolveCardExact(state, link.card_id);
    if (resolution.status === 'missing') limitations.push(`新闻卡 ${link.card_id} 缺失；未使用其他卡片替代来源归因`);
    if (resolution.status === 'conflicting') limitations.push(`新闻卡 ${link.card_id} 存在冲突版本；未选择任一版本归因`);
  }
  const result = {
    account: input.account,
    cutoff: input.analysis_cutoff,
    publication_links: draft_links,
    selected_observations: account_result.selection_log,
    descriptive_statistics: account_result,
    source_angle_links,
    limitations,
    finding_proposals: [],
    next_experiment: null,
    semantic_review_required: true
  };
  validate('ReviewResult', result);
  return result;
}

function canonicalPostKey(state, postId) {
  if (state.post_entities?.[postId]) return postId;
  const direct = `x:${postId}`;
  if (state.post_entities?.[direct]) return direct;
  const alias = state.post_aliases?.[postId] ?? state.post_aliases?.[direct];
  if (typeof alias === 'string') return alias;
  if (alias?.canonical_post_key) return alias.canonical_post_key;
  return values(state.post_entities).find(entity => entity.post_id === postId)?.post_key ?? null;
}

/** Build the deterministic V2 review without inventing a semantic conclusion. */
export function buildReviewV2(input, state) {
  validate('ReviewInputV2', input);
  const targetHandle = String(input.account?.handle ?? '').replace(/^@/, '').toLowerCase();
  const stateHandle = String(state.account?.handle ?? '').replace(/^@/, '').toLowerCase();
  if (!targetHandle || targetHandle !== stateHandle || (input.account.user_id && state.account?.user_id && input.account.user_id !== state.account.user_id)) {
    fail('ACCOUNT_MISMATCH', '/account', '复盘账号与持久状态账号不一致');
  }
  const publications = (input.publication_ids ?? []).map(id => state.publications?.[id] ?? fail('MISSING_EVIDENCE', `/publication_ids/${id}`, '找不到发布记录'));
  const requestedKeys = new Set(input.post_keys ?? []);
  for (const publication of publications) {
    const key = canonicalPostKey(state, publication.post_id);
    if (!key) fail('MISSING_EVIDENCE', `/publication_ids/${publication.publication_id}`, '发布记录无法关联稳定帖子实体');
    requestedKeys.add(key);
  }
  if (!requestedKeys.size) fail('MISSING_EVIDENCE', '/post_keys', 'V2 复盘至少需要一个已确认发布或明确帖子实体');
  const postEntities = [...requestedKeys].map(key => state.post_entities?.[key] ?? fail('MISSING_EVIDENCE', `/post_keys/${key}`, '找不到帖子实体'));
  const postVersions = values(state.post_versions).filter(version => requestedKeys.has(version.post_key));
  const analysisRequest = structuredClone(input.analysis_request ?? {});
  analysisRequest.target_post_keys = [...requestedKeys].sort();
  const accountAnalysis = analyzeAccountV2({
    contract_version: 2,
    account: structuredClone(input.account),
    analysis_cutoff: input.analysis_cutoff,
    post_entities: postEntities,
    post_versions: postVersions,
    snapshots: values(state.snapshots_v2),
    source_series: values(state.source_series),
  }, analysisRequest);
  const publicationLinks = publications.map(publication => publicationDraftLink(publication, state));
  const sourceAngleLinks = publicationLinks.map(link => sourceAngleLink(link, state));
  const experiment = input.experiment_id ? state.experiments?.[input.experiment_id] ?? fail('MISSING_EVIDENCE', '/experiment_id', '找不到试验计划') : null;
  const experimentPublicationIds = new Set(experiment?.linked_publication_ids ?? []);
  const plannedDefinitionId = experiment?.planned_primary_metric?.definition_id ?? null;
  const cohortMetricResults = accountAnalysis.post_cohort_results.filter(item => !plannedDefinitionId || item.metric_definition_id === plannedDefinitionId);
  const ageMetricResults = accountAnalysis.age_matched_results.flatMap(window => window.metrics
    .filter(metric => !plannedDefinitionId || metric.metric_definition_id === plannedDefinitionId)
    .map(metric => ({ window_id: window.window_id, metric })));
  const matureObservationRefs = [...new Set(cohortMetricResults.flatMap(item => item.selected_observation_refs ?? []))].sort();
  const pendingRequirements = ageMetricResults.flatMap(({ window_id, metric }) => metric.sample.pending_n ? [{
    window_id,
    metric_definition_id: metric.metric_definition_id,
    pending_n: metric.sample.pending_n,
  }] : []);
  const linkedPublicationIds = publicationLinks.filter(link => experimentPublicationIds.has(link.publication_id)).map(link => link.publication_id);
  const experimentExecution = experiment ? {
    experiment_id: experiment.experiment_id,
    status: experiment.status,
    linked_publication_ids: [...experimentPublicationIds].sort(),
    selected_publication_ids: linkedPublicationIds,
    executed: linkedPublicationIds.length > 0,
    planned_primary_metric: structuredClone(experiment.planned_primary_metric),
    observation_state: matureObservationRefs.length ? (pendingRequirements.length ? 'partial' : 'mature') : pendingRequirements.length ? 'pending' : 'missing',
    review_eligibility: experiment.status === 'ready_for_review' ? 'ready' : experiment.status === 'closed' ? 'closed' : linkedPublicationIds.length ? 'running_or_pending' : 'not_executed',
  } : null;
  const computedLimitations = [...accountAnalysis.limitations];
  for (const link of sourceAngleLinks) {
    if (link.card_resolution === 'missing') computedLimitations.push(`新闻卡 ${link.card_id} 缺失；未使用其他卡片替代来源归因`);
    if (link.card_resolution === 'conflicting') computedLimitations.push(`新闻卡 ${link.card_id} 存在冲突版本；未选择任一版本归因`);
  }
  if (experiment && !experimentExecution.executed) computedLimitations.push('所选发布记录尚未与该试验建立可靠关联');
  const base = {
    contract_version: 2,
    account: structuredClone(input.account),
    analysis_cutoff: input.analysis_cutoff,
    experiment_id: experiment?.experiment_id ?? null,
    experiment_status: experiment?.status ?? null,
    experiment_execution: experimentExecution,
    publication_links: publicationLinks,
    source_angle_links: sourceAngleLinks,
    account_analysis: accountAnalysis,
    mature_observation_refs: matureObservationRefs,
    pending_observation_refs: [],
    pending_requirements: pendingRequirements,
    computed_limitations: [...new Set(computedLimitations)],
    semantic_review_required: true,
  };
  return validate('DeterministicReviewV2', { review_id: `review-${canonicalHash(base).slice(0, 32)}`, ...base });
}

function availableMetricDefinitions(result) {
  const available = new Set();
  for (const period of result.account_analysis.account_period_results) {
    for (const metric of period.metrics) if (metric.status === 'available' && metric.selected_observation_refs.length) available.add(metric.metric_definition_id);
  }
  for (const metric of result.account_analysis.post_cohort_results) {
    if (metric.sample.valid_n > 0 && metric.selected_observation_refs.length) available.add(metric.metric_definition_id);
  }
  for (const window of result.account_analysis.age_matched_results) {
    for (const metric of window.metrics) if (metric.sample.valid_n > 0 && metric.selected_observation_refs.length) available.add(metric.metric_definition_id);
  }
  return available;
}

/** Derive V2 review completion from the observations and exact links actually recovered. */
export function reviewV2RunResult(input, result, state, runId = null) {
  validate('ReviewInputV2', input);
  validate('DeterministicReviewV2', result);
  const availableDefinitions = availableMetricDefinitions(result);
  const requestedDefinitions = input.analysis_request.requested_metric_definition_ids ?? [];
  const metricsComplete = requestedDefinitions.length
    ? requestedDefinitions.every(definition => availableDefinitions.has(definition))
    : availableDefinitions.size > 0;
  const requestedOutputs = input.analysis_request.requested_outputs ?? ['account_period', 'publication_cohort', 'age_matched'];
  const outputsComplete = requestedOutputs.every(output => result.account_analysis.deliverable_status[output] === 'complete');
  const cardsComplete = result.source_angle_links.every(link => !link.card_id || ['resolved', 'not_applicable'].includes(link.card_resolution));
  const stages = [
    {
      stage: 'entity_and_publication_linkage', required: true, status: 'passed',
      evidence_refs: [result.review_id], reason: null,
    },
    {
      stage: 'requested_metric_coverage', required: true, status: metricsComplete && outputsComplete ? 'passed' : 'failed',
      evidence_refs: [...result.mature_observation_refs],
      reason: metricsComplete && outputsComplete ? null : '请求的指标或统计输出缺少完整、可比的成熟观测',
    },
    {
      stage: 'source_attribution', required: true, status: cardsComplete ? 'passed' : 'failed',
      evidence_refs: result.source_angle_links.flatMap(link => [link.card_id, ...link.source_version_ids]).filter(Boolean),
      reason: cardsComplete ? null : '至少一条新闻卡关联缺失或冲突，未使用其他卡片替代',
    },
  ];
  if (input.experiment_id) {
    const execution = result.experiment_execution;
    const experimentComplete = execution?.executed && execution.review_eligibility === 'ready' && execution.observation_state === 'mature';
    stages.push({
      stage: 'experiment_review_readiness', required: true, status: experimentComplete ? 'passed' : 'failed',
      evidence_refs: [...(execution?.selected_publication_ids ?? []), ...result.mature_observation_refs],
      reason: experimentComplete ? null : '试验尚未可靠执行、达到复查状态或取得计划主指标的成熟观测',
    });
  }
  const complete = stages.every(stage => stage.status === 'passed');
  const scope = { contract_version: 2, requested_deliverables: ['review'] };
  return summarizeRun(stages, scope, {
    run_id: runId ?? `review-run-${canonicalHash({ input, review_id: result.review_id }).slice(0, 24)}`,
    intent: 'review',
    effective_config_hash: canonicalHash(state.config ?? state.account),
    as_of: input.analysis_cutoff,
    delivered_scope: scope,
    deliverable_refs: [result.review_id],
    limitations: result.computed_limitations,
    stop_reason: complete ? 'deterministic_review_ready' : 'review_inputs_incomplete',
    persistence_status: 'unverified',
    has_progress: true,
    has_findings: true,
  });
}

export function newObservationWindowPolicy(targetHours=24){
  if(!Number.isFinite(targetHours)||targetHours<=0)fail('INVALID_INPUT','/target_hours','Observation target hours must be positive');
  return{kind:'age_window',target_hours:targetHours,tolerance_hours:targetHours===168?12:2};
}

export function normalizeExperimentPlanV3(plan,state={}, {allowIncomplete=false}={}) {
  if(!plan?.experiment_id)fail('INVALID_INPUT','/experiment_id','Experiment ID is required');
  if(plan.contract_version===3)return structuredClone(plan);
  const old=plan.age_window_or_period;
  let window=null,limitations=[];
  if(old?.kind==='age_window'){
    const match=/^(\d+(?:\.\d+)?)h$/.exec(String(old.value));
    if(match){const policy=newObservationWindowPolicy(Number(match[1]));window={...policy,tolerance_hours:old.tolerance_hours??policy.tolerance_hours};}
  } else if(old?.kind==='period'&&old.start&&old.end_exclusive&&old.timezone&&old.aggregation_basis==='event_period') window={kind:'period',start:old.start,end_exclusive:old.end_exclusive,timezone:old.timezone,aggregation_basis:'event_period'};
  if(!window){window={kind:'age_window',target_hours:1,tolerance_hours:0};limitations.push('Original V2 window needs plan details before review');}
  const status=limitations.length?'needs_plan_details':plan.status;
  const sourceSemanticHash=experimentSemanticHash(plan);
  const view={contract_version:3,plan_view_id:`plan-view-${canonicalHash({id:plan.experiment_id,plan_hash:canonicalHash(plan),source_semantic_hash:sourceSemanticHash,version:'experiment-plan-view-v3-semantic'}).slice(0,24)}`,source_experiment_id:plan.experiment_id,source_plan_hash:canonicalHash(plan),source_semantic_hash:sourceSemanticHash,interpretation_version:'experiment-plan-view-v3',status,target_entity_keys:[],baseline_entity_keys:[],metric_requirements:[{definition_id:plan.planned_primary_metric.definition_id,role:'primary'},...(plan.guardrails??[]).map(item=>({definition_id:item.definition_id,role:'guardrail'}))],window,linked_publication_ids:[...(plan.linked_publication_ids??[])],limitations};
  if(limitations.length&&!allowIncomplete)throw new ContractError('INVALID_INPUT','/age_window_or_period','Experiment window needs plan details',false);
  if(state.publications)for(const id of view.linked_publication_ids){const pub=state.publications[id];if(pub)view.target_entity_keys.push(canonicalPostKey(state,`x:${pub.post_id}`)??`x:${pub.post_id}`);}
  return view;
}

/** Migration helper: preserve every active V2 plan, marking ambiguous windows for user repair. */
export function buildExperimentPlanView(state,experiment){return normalizeExperimentPlanV3(experiment,state,{allowIncomplete:true});}

export function experimentSemanticHash(experiment){
  const semantic=structuredClone(experiment);
  for(const field of ['status','status_history','review_ref','linked_publication_ids','maturity_evidence_refs','coverage_receipt_ref'])delete semantic[field];
  return canonicalHash(semantic);
}

function validatePlanSource(state,planView){
  if(!planView.source_semantic_hash)fail('MIGRATION_REQUIRED','/source_semantic_hash','Legacy plan view is read-only; create and save a semantic V3 plan view');
  const experiment=state.experiments?.[planView.source_experiment_id];
  if(!experiment)fail('MISSING_EVIDENCE','/source_experiment_id','Source experiment is missing');
  if(planView.source_semantic_hash!==experimentSemanticHash(experiment))fail('STALE_BUNDLE','/source_semantic_hash','Experiment semantics changed; create a new plan view and recompute');
  const actual=[...(experiment.linked_publication_ids??[])].sort(),frozen=[...planView.linked_publication_ids].sort();
  if(canonicalHash(actual)!==canonicalHash(frozen))fail('STALE_BUNDLE','/linked_publication_ids','Selected publications changed; create a new plan view and recompute');
  return experiment;
}

/** Validate a repaired or migrated public plan view before it is persisted. */
export function validateExperimentPlanViewV3(state,planView){
  validate('ExperimentPlanViewV3',planView);
  const experiment=validatePlanSource(state,planView);
  if(planView.status==='needs_plan_details')fail('REQUESTED_OUTPUT_INCOMPLETE','/status','Plan details must be repaired before saving a usable view');
  if(planView.status!==experiment.status)fail('STATE_CONFLICT','/status','Plan view status must match the source experiment');
  const sourcePublications=new Set(experiment.linked_publication_ids??[]);
  for(const id of planView.linked_publication_ids){if(!sourcePublications.has(id)||!state.publications?.[id])fail('INVALID_EVIDENCE_REF','/linked_publication_ids','Plan view publication is missing or not linked to the source experiment');}
  if(planView.window.kind==='period'&&Date.parse(planView.window.end_exclusive)<=Date.parse(planView.window.start))fail('INVALID_INPUT','/window/end_exclusive','Period end must be after its start');
  return structuredClone(planView);
}

function selectedMetric(selection,definitionId){
  const rows=selection.selected.filter(item=>item.metric_definition_id===definitionId),value=rows.length?rows.reduce((sum,item)=>sum+item.value,0):null;
  return {value,unit:rows[0]?.unit??null,refs:rows.map(item=>item.observation_ref)};
}

function selectionWindow(window){
  return window.kind==='period'?{kind:'period',...(window.start!==undefined?{start:window.start}:{}),...(window.end_exclusive!==undefined?{end_exclusive:window.end_exclusive}:{}),...(window.source_date_start!==undefined?{source_date_start:window.source_date_start}:{}),...(window.source_date_end_inclusive!==undefined?{source_date_end_inclusive:window.source_date_end_inclusive}:{})}:structuredClone(window);
}

function reviewScope(entityType,entityKeys){
  return {entity_type:entityType,entity_keys:[...entityKeys],...(entityType==='account'?{aggregation_basis:'event_period'}:{})};
}

export function buildReviewComputation(state,planView,{as_of,baseline_entity_keys=planView.baseline_entity_keys,coverage_receipt_refs=[]}={}) {
  if(planView?.contract_version!==3||planView.status==='needs_plan_details')fail('INVALID_INPUT','/plan_view','A complete V3 plan view is required');
  validatePlanSource(state,planView);
  const requirements=planView.metric_requirements.map(item=>({definition_id:item.definition_id}));
  const entityTypes=new Set(requirements.map(item=>metricDefinition(item.definition_id)?.allowed_entity_types?.[0]).filter(Boolean));
  if(entityTypes.size!==1)fail('INVALID_INPUT','/metric_requirements','A review computation cannot mix entity levels');
  const entityType=[...entityTypes][0];
  if(entityType==='account'&&planView.window.kind!=='period')fail('INVALID_INPUT','/window','Account metrics require an exact event period');
  const accountKeys=[state.account?.user_id,state.account?.handle?`handle:${state.account.handle}`:null,state.account?.handle].filter(Boolean),observedAccountKeys=new Set(Object.values(state.snapshots_v2??{}).filter(item=>item.entity_type==='account').map(item=>item.entity_id));
  const targetKeys=entityType==='account'?[accountKeys.find(key=>observedAccountKeys.has(key))??accountKeys[0]].filter(Boolean):planView.target_entity_keys;
  const scope=reviewScope(entityType,targetKeys),window=selectionWindow(planView.window);
  const target=selectMetricObservations(state,{scope,window,metric_requirements:requirements,as_of,role:'target',selection_policy_version:'review-computation-v3'});
  const baseline=baseline_entity_keys?.length?selectMetricObservations(state,{scope:{...scope,entity_keys:baseline_entity_keys},window,metric_requirements:requirements,as_of,role:'baseline',selection_policy_version:'review-computation-v3'}):null;
  const metric_results=planView.metric_requirements.map(requirement=>{const current=selectedMetric(target,requirement.definition_id),prior=baseline?selectedMetric(baseline,requirement.definition_id):{value:null,unit:null,refs:[]};return{definition_id:requirement.definition_id,role:requirement.role,target_value:current.value,baseline_value:prior.value,difference:current.value!==null&&prior.value!==null?current.value-prior.value:null,unit:current.unit??prior.unit,target_observation_refs:current.refs,baseline_observation_refs:prior.refs};});
  const comparison=baseline?computeComparison(target,baseline,{method:'descriptive'}):null;
  const publication_bindings=planView.linked_publication_ids.map(id=>{const publication=state.publications?.[id];return{publication_id:id,post_key:publication?canonicalPostKey(state,`x:${publication.post_id}`)??`x:${publication.post_id}`:'missing',content_match:publication?.attribution??publication?.content_match??'unverified'};});
  const limitations=[...planView.limitations,...target.limitations,...(baseline?.limitations??[]),...(coverage_receipt_refs.length?[]:['No actual coverage receipt was supplied']),...publication_bindings.filter(item=>item.content_match!=='exact').map(item=>`Publication ${item.publication_id} is ${item.content_match}; exact draft effect cannot be attributed`),...(comparison?.reasons??[])];
  const base={contract_version:3,computation_id:'',plan_view_ref:planView.plan_view_id,plan_hash:canonicalHash(planView),computed_at:as_of,target_selection:target,baseline_selection:baseline,method:{version:'review-computation-v3',kind:baseline?'descriptive_comparison':'target_only'},metric_results,comparability:comparison?.comparability??(target.completeness==='complete'?'partially_compatible':'insufficient'),publication_bindings,limitations};
  const computation_hash=canonicalHash(base);return validate('ReviewComputationV3',{...base,computation_id:`review-computation-${computation_hash.slice(0,24)}`,computation_hash});
}

function expectedPlanMetricRequirements(experiment){
  if(!experiment?.planned_primary_metric?.definition_id)fail('INVALID_INPUT','/source_experiment/planned_primary_metric','V4 review requires the source plan primary metric');
  return [{definition_id:experiment.planned_primary_metric.definition_id,role:'primary'},...(experiment.guardrails??[]).map(item=>({definition_id:item.definition_id,role:'guardrail'}))];
}

function validatePlanProjectionV4(state,planView){
  const experiment=validatePlanSource(state,planView),expectedMetrics=expectedPlanMetricRequirements(experiment);
  if(canonicalHash(planView.metric_requirements)!==canonicalHash(expectedMetrics))fail('STALE_BUNDLE','/metric_requirements','Review metrics must be the source plan primary metric and guardrails');
  const entityType=metricDefinition(expectedMetrics[0].definition_id)?.allowed_entity_types?.[0];
  if(!entityType)fail('METRIC_DEFINITION_UNRESOLVED','/metric_requirements','Review metric entity type is unavailable');
  if(entityType==='post'){
    const expected=[...(experiment.linked_publication_ids??[])].map(id=>{const publication=state.publications?.[id];return publication?canonicalPostKey(state,`x:${publication.post_id}`)??`x:${publication.post_id}`:null;}).filter(Boolean).sort();
    if(canonicalHash([...planView.target_entity_keys].sort())!==canonicalHash(expected))fail('STALE_BUNDLE','/target_entity_keys','Review targets must resolve from the source plan publications');
  } else if(planView.target_entity_keys.length) fail('INVALID_INPUT','/target_entity_keys','Account review targets are resolved from the plan account');
  return {experiment,entityType};
}

function coverageBindingV4(state,ref,targetScope,window){
  const receipt=state.collection_receipts_v4?.[ref]??state.collection_receipts?.[ref]??state.raw_receipts?.[ref]??state.sources?.[ref];
  if(!receipt)fail('MISSING_EVIDENCE','/coverage_receipt_refs',`Coverage receipt is missing: ${ref}`);
  if(receipt.status&&!['succeeded','partial'].includes(receipt.status))fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt did not produce observations: ${ref}`);
  const collectionScope=receipt.contract_version===4?state.collection_scopes?.[receipt.scope_ref]:null,collectionRun=receipt.contract_version===4?state.collection_runs?.[receipt.run_id]:null;
  if(receipt.contract_version===4&&(!collectionScope||collectionScope.run_id!==receipt.run_id))fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt scope is missing or belongs to another run: ${ref}`);
  const accountRefs=new Set([state.account?.user_id,state.account?.user_id?`x-user:${state.account.user_id}`:null,state.account?.handle,state.account?.handle?`handle:${state.account.handle}`:null].filter(Boolean));
  const accountRef=receipt.account_identity_ref??receipt.account_id??receipt.actual_identity?.account_identity_ref??receipt.identity_evidence?.analytics_account?.account_ref??receipt.identity_evidence?.target_profile?.account_ref??collectionRun?.target_account_ref;
  if(!accountRef||!accountRefs.has(accountRef))fail('ACCOUNT_MISMATCH','/coverage_receipt_refs',`Coverage receipt belongs to another or unknown account: ${ref}`);
  const requestScopeHash=canonicalHash(targetScope),collectionScopeHash=collectionScope?.scope_hash??receipt.scope_hash??(receipt.actual_scope?canonicalHash(receipt.actual_scope):null),windowHash=canonicalHash(window);
  if(!collectionScopeHash)fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt has no frozen scope: ${ref}`);
  if(!collectionScope&&receipt.actual_scope&&canonicalHash(receipt.actual_scope)!==requestScopeHash)fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt does not bind the requested scope: ${ref}`);
  if(collectionScope&&window.kind==='period'){
    const actual=collectionScope.actual_period,timezone=collectionScope.source_timezone;
    if(!actual||actual.start!==window.start||actual.end_exclusive!==window.end_exclusive||timezone?.status!=='known'||timezone.value!==window.timezone)fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage scope does not bind the requested period and timezone: ${ref}`);
  } else if(!collectionScope&&receipt.actual_window&&canonicalHash(receipt.actual_window)!==windowHash)fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt does not bind the requested window: ${ref}`);
  const completeness=collectionScope?.coverage?.completeness??receipt.coverage?.completeness??receipt.completeness;
  if(!['complete','partial','unknown'].includes(completeness))fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage completeness is unresolved: ${ref}`);
  const materialHash=receipt.material_byte_sha256??receipt.actual_result_sha256??receipt.material_hash??receipt.artifact_sha256;
  if(!/^[a-f0-9]{64}$/.test(materialHash??''))fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt has no exact material hash: ${ref}`);
  const sourceRef=receipt.source_ref;
  if(!sourceRef)fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Coverage receipt has no material source reference: ${ref}`);
  return {receipt_ref:ref,receipt_hash:canonicalHash(receipt),material_hash:materialHash,source_ref:sourceRef,account_identity_ref:accountRef,collection_scope_ref:collectionScope?.scope_id??null,collection_scope_hash:collectionScopeHash,request_scope_hash:requestScopeHash,window_hash:windowHash,completeness};
}

function selectedSourceRef(state,observationRef){
  for(const snapshot of Object.values(state.snapshots_v2??{}))for(const key of Object.keys(snapshot.metrics??{}))if(`${snapshot.snapshot_id}:${key}`===observationRef)return snapshot.source_ref;
  return null;
}

/** Build a persistable V4 computation with the exact request needed for replay. */
export function buildReviewComputationV4(state,planView,{as_of,coverage_receipt_refs=[]}={}){
  if(![4,5].includes(state?.schema_version))fail('MIGRATION_REQUIRED','/state/schema_version','V4 review computation requires state 4 or 5');
  validate('ExperimentPlanViewV3',planView);
  if(planView.status==='needs_plan_details')fail('REQUESTED_OUTPUT_INCOMPLETE','/plan_view/status','Plan details must be repaired before V4 computation');
  const {entityType}=validatePlanProjectionV4(state,planView),requirements=structuredClone(planView.metric_requirements);
  const accountKeys=[state.account?.user_id,state.account?.handle?`handle:${state.account.handle}`:null,state.account?.handle].filter(Boolean),observedAccountKeys=new Set(Object.values(state.snapshots_v2??{}).filter(item=>item.entity_type==='account').map(item=>item.entity_id));
  const targetKeys=entityType==='account'?[accountKeys.find(key=>observedAccountKeys.has(key))??accountKeys[0]].filter(Boolean):[...planView.target_entity_keys];
  const targetScope=reviewScope(entityType,targetKeys),baselineScope=planView.baseline_entity_keys.length?reviewScope(entityType,planView.baseline_entity_keys):null;
  const coverageBindings=[...new Set(coverage_receipt_refs)].sort().map(ref=>coverageBindingV4(state,ref,targetScope,planView.window));
  if(!coverageBindings.length)fail('MISSING_EVIDENCE','/coverage_receipt_refs','V4 review computation requires actual coverage evidence');
  const computationRequest=validate('ReviewComputationRequestV4',{contract_version:4,plan_view_ref:planView.plan_view_id,plan_hash:canonicalHash(planView),as_of,target_scope:targetScope,baseline_scope:baselineScope,window:structuredClone(planView.window),metric_requirements:requirements,coverage_bindings:coverageBindings});
  const selectorWindow=selectionWindow(planView.window),target=selectMetricObservations(state,{scope:targetScope,window:selectorWindow,metric_requirements:requirements,as_of,role:'target',selection_policy_version:'review-computation-v4'}),baseline=baselineScope?selectMetricObservations(state,{scope:baselineScope,window:selectorWindow,metric_requirements:requirements,as_of,role:'baseline',selection_policy_version:'review-computation-v4'}):null;
  for(const selected of target.selected){const sourceRef=selectedSourceRef(state,selected.observation_ref);if(!sourceRef||!coverageBindings.some(item=>item.source_ref===sourceRef))fail('INVALID_EVIDENCE_REF','/coverage_receipt_refs',`Selected observation is not covered by a frozen material receipt: ${selected.observation_ref}`);}
  const metricResults=requirements.map(requirement=>{const current=selectedMetric(target,requirement.definition_id),prior=baseline?selectedMetric(baseline,requirement.definition_id):{value:null,unit:null,refs:[]};return{definition_id:requirement.definition_id,role:requirement.role,target_value:current.value,baseline_value:prior.value,difference:current.value!==null&&prior.value!==null?current.value-prior.value:null,unit:current.unit??prior.unit,target_observation_refs:current.refs,baseline_observation_refs:prior.refs};});
  const comparison=baseline?computeComparison(target,baseline,{method:'descriptive'}):null,publicationBindings=planView.linked_publication_ids.map(id=>{const publication=state.publications?.[id];return{publication_id:id,post_key:publication?canonicalPostKey(state,`x:${publication.post_id}`)??`x:${publication.post_id}`:'missing',content_match:publication?.attribution??publication?.content_match??'unverified'};});
  const limitations=[...planView.limitations,...target.limitations,...(baseline?.limitations??[]),...coverageBindings.filter(item=>item.completeness!=='complete').map(item=>`Coverage ${item.receipt_ref} is ${item.completeness}`),...publicationBindings.filter(item=>item.content_match!=='exact').map(item=>`Publication ${item.publication_id} is ${item.content_match}; exact draft effect cannot be attributed`),...(comparison?.reasons??[])];
  const base={contract_version:4,computation_id:'',plan_view_ref:planView.plan_view_id,plan_hash:canonicalHash(planView),computed_at:as_of,computation_request:computationRequest,computation_request_hash:canonicalHash(computationRequest),target_selection:target,baseline_selection:baseline,method:{version:'review-computation-v4',kind:baseline?'descriptive_comparison':'target_only'},metric_results:metricResults,comparability:comparison?.comparability??(target.completeness==='complete'?'partially_compatible':'insufficient'),publication_bindings:publicationBindings,limitations};
  const computationHash=canonicalHash(base);return validate('ReviewComputationV4',{...base,computation_id:`review-computation-v4-${computationHash.slice(0,24)}`,computation_hash:computationHash});
}

export function validateReviewInterpretation(computation,interpretation,receipt) {
  if(![3,4].includes(computation?.contract_version))fail('INVALID_INPUT','/computation','A V3 or V4 review computation is required');
  const proposalHash=canonicalHash(interpretation);
  if(!receipt||receipt.contract_version!==3||receipt.computation_ref!==computation.computation_id||receipt.computation_hash!==computation.computation_hash||receipt.interpretation_proposal_hash!==proposalHash||receipt.decision!=='approved')fail('MISSING_EVIDENCE','/interpretation_receipt','Review interpretation must bind the exact deterministic computation and proposal');
  for(const claimed of interpretation.metric_results??[]){const actual=computation.metric_results.find(item=>item.definition_id===claimed.definition_id&&item.role===claimed.role);if(!actual||canonicalHash(actual)!==canonicalHash(claimed))fail('INVALID_INPUT','/metric_results','Review cannot refill deterministic metric results');}
  return{interpretation:structuredClone(interpretation),interpretation_proposal_hash:proposalHash,receipt:structuredClone(receipt)};
}
