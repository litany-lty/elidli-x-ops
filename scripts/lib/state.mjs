import { readFile, writeFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { canonicalHash, textHash, validate, ContractError } from './contracts.mjs';
import { analysisProposalHash } from './post-content.mjs';
import { resolvePostIdentity, resolveVersionPostKey } from './post-identity.mjs';
import { validateMetricObservation } from './metrics.mjs';
import { CURRENT_STATE_VERSION, hasKnowledgeState, isReliableState } from './state-version.mjs';
import { seedKnowledgeState } from './knowledge-state.mjs';
import { migrateConfigV5 } from './config.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const collections = ['runs','sources','raw_receipts','user_facts','events','claims','drafts','adoptions','publications','posts','snapshots','reviews','rule_versions'];
export const v2Collections = ['import_batches','source_series','post_entities','post_versions','post_aliases','snapshots_v2','content_analyses','content_review_receipts','coaching_runs','coaching_reports','evidence_bundles','diagnoses','actions','action_decisions','experiments','experiment_reviews','rule_versions_v2','import_artifacts','migration_receipts','collection_receipts'];

export const v3Collections = ['post_metadata_facts','draft_review_receipts','content_briefs','recipe_versions','media_assets','asset_review_receipts','content_packs','preview_artifacts','pack_review_receipts','content_runs','review_computations','experiment_plan_views','host_media_receipts'];
export const v4Collections = ['knowledge_artifacts','knowledge_catalogs','knowledge_events','operational_rules','rule_contexts','rule_applications','guidance_outputs','guidance_receipts','personal_patterns','collection_runs','collection_scopes','collection_receipts_v4'];
export const v5Collections = ['strategy_definitions','feedback_events','inspiration_sessions'];

export function validateState(state) {
  if (![1,2,3,4,5].includes(state.schema_version)) fail('SCHEMA_VERSION','/schema_version','Unsupported state version');
  validate(state.schema_version===5?'ConfigV5':'ConfigV1',state.config);
  if(canonicalHash(state.account)!==canonicalHash(state.config.account))fail('IDENTITY_MISMATCH','/account','State identity must match its configuration');
  for(const key of collections)if(!state[key]||typeof state[key]!=='object'||Array.isArray(state[key]))fail('INVALID_INPUT',`/${key}`,'Expected an ID-indexed state collection');
  for(const [id,source] of Object.entries(state.sources)) {
    validate('SourceRecord',source.record);
    if(source.record.source_id!==id)fail('INVALID_INPUT','/sources','Source map key does not match source ID');
    for(const version of Object.values(source.versions)) {validate('SourceVersion',version);if(version.source_id!==id||!state.raw_receipts[version.raw_receipt_ref])fail('MISSING_EVIDENCE','/sources/versions','Source version has no matching source or raw receipt');}
    if(source.latest_version_id!==null&&!source.versions[source.latest_version_id])fail('MISSING_EVIDENCE','/latest_version_id','Latest source version does not exist');
  }
  for(const receipt of Object.values(state.raw_receipts)) {validate('RawReceipt',receipt);if(receipt.raw_hash!==canonicalHash(receipt.raw_result))fail('RECEIPT_CONFLICT','/raw_hash','Stored raw material differs from its receipt hash');}
  for(const fact of Object.values(state.user_facts)) {validate('UserFactRecord',fact);if(!state.sources[fact.source_ref])fail('MISSING_EVIDENCE','/user_facts/source_ref','User fact original material does not exist');}
  for(const event of Object.values(state.events)) {validate('NewsEvent',event);for(const id of event.source_version_ids)if(!findSourceVersion(state,id))fail('MISSING_EVIDENCE','/events/source_version_ids','Event source does not exist');}
  for(const claim of Object.values(state.claims)) {validate('Claim',claim);if(claim.event_id&&!state.events[claim.event_id])fail('MISSING_EVIDENCE','/claims/event_id','Claim event does not exist');for(const id of claim.source_version_ids)if(!findSourceVersion(state,id))fail('MISSING_EVIDENCE','/claims/source_version_ids','Claim source does not exist');for(const id of claim.user_fact_ids)if(!state.user_facts[id])fail('MISSING_EVIDENCE','/claims/user_fact_ids','Claim user fact does not exist');}
  for(const [id,entry] of Object.entries(state.drafts)) {
    if(!entry.revisions[entry.latest_revision])fail('MISSING_EVIDENCE','/drafts/latest_revision','Latest draft revision does not exist');
    for(const [revision,draft] of Object.entries(entry.revisions)) {validate('DraftRecord',draft);if(draft.draft_id!==id||draft.revision!==Number(revision))fail('INVALID_INPUT','/drafts/revisions','Draft identity and revision must match its map keys');}
  }
  for(const adoption of Object.values(state.adoptions)) {validate(adoption.draft_ref?'AdoptionRecordV3':'AdoptionRecord',adoption);if(!state.drafts[adoption.draft_ref?.draft_id??adoption.draft_id]?.revisions[adoption.draft_ref?.revision??adoption.revision])fail('MISSING_EVIDENCE','/adoptions/revision','Adopted draft revision does not exist');}
  for(const publication of Object.values(state.publications)) {validate(Object.hasOwn(publication,'attribution')?'PublicationRecordV3':'PublicationRecord',publication);if(publication.adoption_id&&!state.adoptions[publication.adoption_id])fail('MISSING_EVIDENCE','/publications/adoption_id','Publication adoption does not exist');}
  for(const post of Object.values(state.posts)) {validate('PostRecord',post);const stable=state.account.user_id&&post.account_id;if((stable?post.account_id!==state.account.user_id:post.author_handle.toLowerCase()!==state.account.handle.toLowerCase()))fail('IDENTITY_MISMATCH','/posts','Post does not belong to this account');if(!state.sources[post.source_ref])fail('MISSING_EVIDENCE','/posts/source_ref','Post source does not exist');}
  for(const snapshot of Object.values(state.snapshots)) {
    validate('Snapshot',snapshot);
    if(snapshot.account_id&&state.account.user_id&&snapshot.account_id!==state.account.user_id)fail('IDENTITY_MISMATCH','/snapshots/account_id','Snapshot belongs to another account');
    if(snapshot.entity_type==='account'&&![state.account.user_id,state.account.handle,`handle:${state.account.handle}`].filter(Boolean).includes(snapshot.entity_id))fail('IDENTITY_MISMATCH','/snapshots/entity_id','Account observation must identify the target account');
    if(snapshot.entity_type==='post'&&!state.posts[snapshot.entity_id])fail('MISSING_EVIDENCE','/snapshots/entity_id','Snapshot post does not exist');
    if(!state.sources[snapshot.source_ref])fail('MISSING_EVIDENCE','/snapshots/source_ref','Snapshot source does not exist');
  }
  for(const rule of Object.values(state.rule_versions))validate('RuleVersion',rule);
  for(const review of Object.values(state.reviews)){validate('ReviewInput',review.review_input);validate('ReviewResult',review.report);}
  for(const run of Object.values(state.runs))if(run.binding)validate('NewsRun',run);else {validate('RunContext',run.run_context);validate('RunResult',run.run_result);}
  if (state.schema_version >= 2) validateV2State(state);
  if(isReliableState(state))validateV3State(state);
  if(hasKnowledgeState(state))validateV4State(state);
  if(state.schema_version===5)validateV5State(state);
  return state;
}

export function initializeState(config, version = CURRENT_STATE_VERSION) {
  const selectedConfig=version===5?migrateConfigV5(config):config;
  const state={ schema_version: version, revision: 0, account: structuredClone(selectedConfig.account), config: structuredClone(selectedConfig),
    preference_meta: {}, ...Object.fromEntries([...collections,...(version>=2?v2Collections:[]),...(isReliableState(version)?v3Collections:[]),...(hasKnowledgeState(version)?v4Collections:[]),...(version===5?v5Collections:[])].map(key => [key, {}])) };
  return hasKnowledgeState(version)?seedKnowledgeState(state):state;
}

function validateV2State(state) {
  for (const key of v2Collections) if(!state[key] || typeof state[key]!=='object' || Array.isArray(state[key])) fail('INVALID_INPUT',`/${key}`,'Expected a V2 ID-indexed collection');
  const types = {import_batches:'ImportBatchV2',source_series:'SourceSeriesV2',post_entities:'PostEntityV2',post_versions:'PostVersionV2',snapshots_v2:'SnapshotV2',content_analyses:'PostContentAnalysisV2',content_review_receipts:'ContentSemanticReceiptV2',coaching_runs:'CoachingRunV2',coaching_reports:'CoachingReportV2',evidence_bundles:'EvidenceBundleV2',diagnoses:'AccountDiagnosisV2',actions:'ActionRecommendationV2',action_decisions:'ActionDecisionV2',experiments:'ExperimentPlanV2',experiment_reviews:'ReviewResultV2',rule_versions_v2:'RuleVersionV2',collection_receipts:'CollectionReceiptV2'};
  const mixed={3:{coaching_runs:'CoachingRunV3',content_review_receipts:'ContentSemanticReceiptV3',content_analyses:'PostContentAnalysisV3',experiment_reviews:'ReviewResultV3'},4:{coaching_runs:'CoachingRunV4',coaching_reports:'CoachingProposalV4',evidence_bundles:'EvidenceBundleV4',experiment_reviews:'ExperimentReviewV4'},5:{coaching_runs:'CoachingRunV5',coaching_reports:'CoachingProposalV5',actions:'ActionRecommendationV5',action_decisions:'ActionExecutionV5'}};
  for (const [collection,type] of Object.entries(types)) for (const value of Object.values(state[collection])) validate(mixed[value.contract_version]?.[collection]??type,value);
  const hasMaterial = ref => Boolean(state.sources[ref] || Object.values(state.import_artifacts).some(a=>(a.source_refs??[a.source_ref]).includes(ref)));
  for(const analysis of Object.values(state.content_analyses)) {
    const receipt=analysis.contract_version===3?Object.values(state.content_review_receipts).find(r=>r.contract_version===3&&r.post_version_ref===analysis.post_version_ref&&r.analysis_proposal_hash===analysisProposalHash(analysis)&&r.decision==='approved'):state.content_review_receipts[analysis.semantic_review_receipt_ref];
    const fields=analysis.contract_version===3?['post_version_ref','content_hash','context_selection_hash','analysis_version']:['post_version_ref','content_hash','context_hash','analysis_version'];
    if(!receipt||fields.some(key=>receipt[key]!==analysis[key])||receipt.decision!=='approved')fail('INVALID_EVIDENCE_REF','/content_analyses','Content analysis needs its exact historical review receipt');
  }
  for (const version of Object.values(state.post_versions)) {
    if(!(isReliableState(state)?state.post_entities[resolveVersionPostKey(version,state)]:state.post_entities[version.post_key]) || !hasMaterial(version.source_ref)) fail('INVALID_EVIDENCE_REF','/post_versions','A post version must retain its entity and original material');
  }
  for (const entity of Object.values(state.post_entities)) {
    if(entity.current_version_ref && !state.post_versions[entity.current_version_ref])fail('INVALID_EVIDENCE_REF','/current_version_ref','Current post version is missing');
    const stable=state.account.user_id&&entity.author_id;
    if(stable?entity.author_id!==state.account.user_id:entity.author_handle?.toLowerCase()!==state.account.handle.toLowerCase())fail('ACCOUNT_MISMATCH','/post_entities','Post entity belongs to another account');
  }
  for (const [alias,key] of Object.entries(state.post_aliases)) if(typeof key!=='string'||!(isReliableState(state)?resolvePostIdentity(alias,state.post_aliases,{entities:state.post_entities}).canonical_key:state.post_entities[key]))fail('INVALID_EVIDENCE_REF',`/post_aliases/${alias}`,'Canonical entity is missing');
  for (const snapshot of Object.values(state.snapshots_v2)) {
    if(!Object.values(snapshot.metrics).every(metric=>metric.definition_id.startsWith('legacy.v1.')))validateMetricObservation(snapshot,undefined,state.account);
    if (state.account.user_id && snapshot.account_id && snapshot.account_id!==state.account.user_id)fail('ACCOUNT_MISMATCH','/snapshots_v2/account_id','Observation belongs to another account');
    if (!hasMaterial(snapshot.source_ref)||!state.source_series[snapshot.source_series_id])fail('INVALID_EVIDENCE_REF','/snapshots_v2','Observation material or series is missing');
    if (snapshot.entity_type==='post'&&!state.post_entities[isReliableState(state)?resolvePostIdentity(snapshot.entity_id,state.post_aliases,{entities:state.post_entities}).canonical_key:state.post_aliases[snapshot.entity_id]??snapshot.entity_id])fail('INVALID_EVIDENCE_REF','/snapshots_v2/entity_id','Observation post is missing');
  }
}

function validateV3State(state) {
  const types={post_metadata_facts:'PostMetadataFactV3',draft_review_receipts:'DraftReviewReceiptV3',content_briefs:'ContentBriefV3',recipe_versions:'ContentRecipeSnapshotV3',media_assets:'MediaAssetEntryV3',asset_review_receipts:'AssetReviewReceiptV3',content_packs:'ContentPackEntryV3',preview_artifacts:'PreviewArtifactV3',pack_review_receipts:'PackReviewReceiptV3',content_runs:'ContentRunV3',review_computations:'ReviewComputationV3',experiment_plan_views:'ExperimentPlanViewV3',host_media_receipts:'HostMediaReceiptV3'};
  for(const [collection,type] of Object.entries(types)){
    if(!state[collection]||typeof state[collection]!=='object'||Array.isArray(state[collection]))fail('INVALID_INPUT',`/${collection}`,'Expected state 3 collection');
    for(const value of Object.values(state[collection])){const current=value.contract_version===5?({content_briefs:'ContentBriefV5',content_runs:'ContentRunV5',draft_review_receipts:'DraftReviewReceiptV5',host_media_receipts:value.operation?'HostMediaReceiptV5':'HostReviewReceiptV5'}[collection]??type):value.contract_version===4?({review_computations:'ReviewComputationV4',host_media_receipts:'HostGuidanceReviewReceiptV4'}[collection]??type):collection==='experiment_plan_views'&&!value.source_semantic_hash?'ExperimentPlanViewLegacyV3':type;validate(current,value);}
  }
  for(const adoption of Object.values(state.adoptions))if(adoption.draft_ref){
    const review=state.draft_review_receipts[adoption.draft_review_ref];
    if(!review||canonicalHash(review.draft_ref)!==canonicalHash(adoption.draft_ref))fail('INVALID_EVIDENCE_REF','/adoptions/draft_review_ref','Adoption review identifies another draft');
    if(adoption.pack_ref){const split=adoption.pack_ref.lastIndexOf(':');const pack=state.content_packs[adoption.pack_ref.slice(0,split)]?.revisions[adoption.pack_ref.slice(split+1)];if(!pack||canonicalHash(pack.draft_ref)!==canonicalHash(adoption.draft_ref))fail('INVALID_EVIDENCE_REF','/adoptions/pack_ref','Adopted pack identifies another draft');}
  }
  for(const publication of Object.values(state.publications))if(publication.attribution){
    const adoption=state.adoptions[publication.adoption_id];
    if(adoption&&(canonicalHash(adoption.draft_ref)!==canonicalHash(publication.draft_ref)||adoption.pack_ref!==publication.pack_ref))fail('INVALID_EVIDENCE_REF','/publications','Publication differs from its saved adoption binding');
    if(publication.attribution==='exact'){const draft=state.drafts[publication.draft_ref?.draft_id]?.revisions[publication.draft_ref?.revision];if(!adoption||!draft||canonicalHash(draft.texts)!==canonicalHash(publication.actual_texts))fail('INVALID_EVIDENCE_REF','/publications/attribution','Exact publication must retain the adopted exact text');}
  }
  for(const review of Object.values(state.experiment_reviews))if(review.contract_version===3){const receipt=review.interpretation_receipt,computed=state.review_computations[review.computation_ref];if(!receipt||!computed||computed.computation_hash!==review.computation_hash||receipt.computation_hash!==review.computation_hash)fail('INVALID_EVIDENCE_REF','/experiment_reviews','Verified review requires its exact saved computation and semantic receipt');}
  for(const [id,fact] of Object.entries(state.post_metadata_facts)){
    const version=state.post_versions[fact.post_version_ref];
    if(id!==fact.fact_id||!version||resolvePostIdentity(fact.post_key,state.post_aliases,{entities:state.post_entities}).canonical_key!==resolveVersionPostKey(version,state))fail('INVALID_EVIDENCE_REF','/post_metadata_facts','Metadata must retain its exact version and canonical entity');
    if(['parent_source_version_ref','quoted_source_version_ref'].includes(fact.field)){
      const found=Object.values(state.sources).flatMap(source=>Object.values(source.versions)).filter(v=>v.source_version_id===fact.value);
      const source=found[0],receipt=source&&state.raw_receipts[source.raw_receipt_ref];
      if(typeof fact.value!=='string'||found.length!==1||!receipt||receipt.status!=='succeeded'||source.read_status!=='read'||source.material_kind==='search_snippet'||textHash(source.captured_text)!==source.captured_text_hash)fail('INVALID_EVIDENCE_REF','/post_metadata_facts/value','External context needs one exact actually read source version and receipt');
    }
    const artifacts=Object.values(state.import_artifacts).filter(a=>(a.source_refs??[a.source_ref]).includes(fact.source_ref));
    if(!state.sources[fact.source_ref]&&!artifacts.length)fail('MISSING_EVIDENCE','/post_metadata_facts/source_ref','Metadata original material is missing');
    if(artifacts.length&&!artifacts.some(a=>a.artifact_sha256===fact.source_hash))fail('RECEIPT_CONFLICT','/post_metadata_facts/source_hash','Metadata source bytes differ');
    const seen=new Set([id]);const visit=ref=>{if(ref===`base:${fact.post_version_ref}:${fact.field}`)return;if(seen.has(ref))fail('INVALID_EVIDENCE_REF','/supersedes_fact_refs','Metadata supersession cycle');const old=state.post_metadata_facts[ref];if(!old||old.post_version_ref!==fact.post_version_ref||old.field!==fact.field)fail('INVALID_EVIDENCE_REF','/supersedes_fact_refs','Metadata supersession crosses version or field');seen.add(ref);for(const parent of old.supersedes_fact_refs)visit(parent);seen.delete(ref);};
    for(const ref of fact.supersedes_fact_refs)visit(ref);
  }
  for(const receipt of Object.values(state.draft_review_receipts)){
    const draft=state.drafts[receipt.draft_ref.draft_id]?.revisions[receipt.draft_ref.revision];
    if(!draft||canonicalHash(draft.text_hashes)!==canonicalHash(receipt.text_hashes))fail('INVALID_EVIDENCE_REF','/draft_review_receipts','Review must bind the exact saved text');
    if(receipt.supersedes_receipt_ref){const old=state.draft_review_receipts[receipt.supersedes_receipt_ref];if(!old||canonicalHash(old.draft_ref)!==canonicalHash(receipt.draft_ref))fail('INVALID_EVIDENCE_REF','/supersedes_receipt_ref','Review supersession must retain its draft');}
  }
}

function validateV4State(state) {
  const types={knowledge_artifacts:'KnowledgeArtifactV4',knowledge_catalogs:'RuleCatalogSnapshotV4',knowledge_events:'KnowledgeEventV4',operational_rules:'OperationalRuleV4',rule_contexts:'RuleContextV4',rule_applications:'RuleApplicationV4',guidance_outputs:'GuidanceOutputV4',guidance_receipts:'GuidanceReceiptV4',personal_patterns:'PersonalPatternV4',collection_runs:'CollectionRunV4',collection_scopes:'CollectionScopeV4',collection_receipts_v4:'CollectionReceiptV4'};
  for(const key of v4Collections)if(!state[key]||typeof state[key]!=='object'||Array.isArray(state[key]))fail('INVALID_INPUT',`/${key}`,'Expected state 4 collection');
  const v5Types={rule_contexts:'RuleContextV5',rule_applications:'RuleApplicationV5',guidance_outputs:'GuidanceOutputV5',guidance_receipts:'GuidanceReceiptV5',personal_patterns:'PersonalPatternV5'};
  for(const [collection,type] of Object.entries(types))for(const value of Object.values(state[collection])){
    const current=collection==='knowledge_events'&&value.contract_version===5?(value.check_id?'KnowledgeCheckV5':value.proposal_id?'KnowledgeUpdateProposalV5':value.replay_id?'KnowledgeReplayResultV5':'KnowledgeEventV5'):value.contract_version===5?(v5Types[collection]??type):type;
    validate(current,value);
  }
}

function validateV5State(state) {
  const types={strategy_definitions:'StrategyDefinitionV5',feedback_events:'FeedbackEventV5',inspiration_sessions:'InspirationSessionEntryV5'};
  for(const key of v5Collections)if(!state[key]||typeof state[key]!=='object'||Array.isArray(state[key]))fail('INVALID_INPUT',`/${key}`,'Expected state 5 collection');
  for(const [collection,type] of Object.entries(types))for(const value of Object.values(state[collection]))validate(type,value);
}

export async function loadState(dir) {
  try {
    const state = JSON.parse(await readFile(join(dir, 'account-state.json'), 'utf8'));
    if (![1,2,3,4,5].includes(state.schema_version)) fail('SCHEMA_VERSION', '/schema_version', 'Unsupported state version');
    if (!Number.isSafeInteger(state.revision) || state.revision < 1) fail('INVALID_INPUT', '/revision', 'Invalid state revision');
    return validateState(state);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function commitState(dir, expectedRevision, mutation, { migration = false, stagedWriteHook = null } = {}) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('STATE_CONFLICT', '/expected_revision', 'A current revision is required for every write');
  await mkdir(dir, {recursive: true, mode: 0o700});
  const lockPath = join(dir, '.write.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('STATE_CONFLICT', '/state', 'Another writer holds this account lock'); throw error; }
  const temporary = join(dir, `.account-state.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    const previous = await loadState(dir);
    if (previous && previous.schema_version !== CURRENT_STATE_VERSION && !migration) fail('MIGRATION_REQUIRED','/schema_version',`Preview and apply the state ${CURRENT_STATE_VERSION} migration before writing this account`);
    if ((previous?.revision ?? 0) !== expectedRevision) fail('STATE_CONFLICT', '/expected_revision', 'State changed; read the current revision before writing');
    const working = previous ? structuredClone(previous) : null;
    const result = await mutation(working);
    const next = result?.state ?? result;
    if (!next || next.schema_version!==CURRENT_STATE_VERSION) fail('SCHEMA_VERSION', '/state/schema_version', `Every normal commit must target state ${CURRENT_STATE_VERSION}`);
    if (previous && canonicalHash(previous) === canonicalHash(next)) return previous;
    next.revision = expectedRevision + 1;
    validateState(next);
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', {flag:'wx', mode:0o600});
    if(stagedWriteHook)await stagedWriteHook(); // Exercise interruption after staging without changing the public CLI.
    await rename(temporary, join(dir, 'account-state.json'));
    return next;
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await lock.close();
    await unlink(lockPath);
  }
}

export function registerSources(state, records) {
  for (const record of records) {
    const existing = state.sources[record.source_id];
    if (existing && canonicalHash(existing.record) !== canonicalHash(record)) fail('RECEIPT_CONFLICT', '/source_refs', 'Existing source material is immutable; use a new source ID');
    if (!existing) state.sources[record.source_id] = {record: structuredClone(record), versions:{}, latest_version_id:null};
  }
}

export function putImmutable(collection, id, record) {
  if (collection[id] && canonicalHash(collection[id]) !== canonicalHash(record)) fail('RECEIPT_CONFLICT', `/${id}`, 'Record ID already identifies different material');
  collection[id] ??= structuredClone(record);
}

export function saveDraft(state, draft) {
  if(draft.original_ref&&!state.sources[draft.original_ref]&&!findSourceVersion(state,draft.original_ref))fail('MISSING_EVIDENCE','/original_ref','Original draft material must be recoverable');
  for(const mapping of draft.fact_mapping) {
    for(const id of mapping.claim_ids)if(!state.claims[id])fail('MISSING_EVIDENCE','/fact_mapping/claim_ids','Draft claim is not registered');
    for(const id of mapping.user_fact_ids)if(!state.user_facts[id])fail('MISSING_EVIDENCE','/fact_mapping/user_fact_ids','Draft user fact is not registered');
  }
  const entry = state.drafts[draft.draft_id];
  if (entry?.revisions[draft.revision]) {
    const previous = entry.revisions[draft.revision];
    if (canonicalHash(previous.texts) !== canonicalHash(draft.texts)) fail('STALE_DRAFT', '/revision', 'Changed text requires a new draft revision');
    if (canonicalHash(previous) === canonicalHash(draft)) return;
    if(isReliableState(state))return; // Audit changes are stored in draft_review_receipts.
    fail('STALE_DRAFT', '/revision', 'A stored draft revision is immutable');
  }
  if (entry && (draft.parent_revision !== entry.latest_revision || draft.revision !== entry.latest_revision + 1)) fail('STALE_DRAFT', '/parent_revision', 'Draft revisions must append to the current revision');
  if (!entry && (draft.revision !== 1 || draft.parent_revision !== null)) fail('STALE_DRAFT', '/revision', 'A new draft starts at revision 1');
  state.drafts[draft.draft_id] ??= {revisions:{}, latest_revision:0};
  state.drafts[draft.draft_id].revisions[draft.revision] = structuredClone(draft);
  state.drafts[draft.draft_id].latest_revision = draft.revision;
}

export function reviseClaimStatus(state, claimId, status, at, reason, sourceVersionRef) {
  const claim = state.claims[claimId];
  if (!claim) fail('MISSING_EVIDENCE', '/claim_id', 'Claim does not exist');
  if (claim.support_status === status) return;
  claim.status_history ??= [];
  claim.status_history.push({at, from:claim.support_status, to:status, reason, source_version_ref:sourceVersionRef});
  claim.support_status = status;
  if(isReliableState(state))return; // Preserve creation history; readiness resolves current evidence.
  for (const entry of Object.values(state.drafts)) for (const draft of Object.values(entry.revisions)) {
    if (!draft.fact_mapping.some(map => map.claim_ids.includes(claimId))) continue;
    const referenced=Object.values(draft.fact_mapping).flatMap(map=>map.claim_ids).map(id=>state.claims[id]?.support_status);
    const to = referenced.includes('invalidated')||draft.length_checks.some(check=>!check.valid)||draft.semantic_review?.decision==='revise' ? 'needs_revision' : 'unverified';
    if (draft.validity === to) continue;
    draft.status_history ??= [];
    draft.status_history.push({at, from:draft.validity, to, reason, source_version_ref:sourceVersionRef});
    draft.validity = to;
  }
}

export function saveSourceVersion(state, record, version, at) {
  const existing = state.sources[record.source_id];
  if (!existing) registerSources(state, [record]);
  const source = state.sources[record.source_id];
  if (source.versions[version.source_version_id]) return;
  const old = source.versions[source.latest_version_id];
  source.versions[version.source_version_id] = structuredClone(version);
  source.latest_version_id = version.source_version_id;
  if (old && old.captured_text_hash !== version.captured_text_hash) {
    for (const claim of Object.values(state.claims)) if (claim.source_version_ids.includes(old.source_version_id)) {
      reviseClaimStatus(state, claim.claim_id, 'needs_recheck', at, 'Source text changed; semantic recheck required', version.source_version_id);
    }
  }
}

export function findSourceVersion(state, versionId) {
  for (const source of Object.values(state.sources)) if (source.versions[versionId]) return source.versions[versionId];
  return null;
}

export function adoptionStatus(state, draftId, revision) {
  const adopted = Object.values(state.adoptions).filter(a => a.draft_id === draftId && a.revision === revision);
  if (Object.values(state.publications).some(p => adopted.some(a => a.adoption_id === p.adoption_id))) return 'published';
  return adopted.length ? 'adopted' : 'suggested';
}

export async function savePersistenceReceipt(dir, receipt) {
  const state = await loadState(dir);
  if (!state || receipt.state_revision !== state.revision || receipt.state_hash !== canonicalHash(state)) fail('PERSIST_FAILED', '/persistence_receipt', 'Receipt does not identify the current state revision and hash');
  if (!receipt.artifact_id || !receipt.actual_result_ref || !receipt.host_call_ref) fail('PERSIST_FAILED', '/persistence_receipt', 'An actual save result and call reference are required');
  await verifyLocalReceipt(dir,state,receipt);
  const target = join(dir, 'persistence-receipt.json');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', {mode:0o600});
  await rename(temporary, target);
  return receipt;
}

async function verifyLocalReceipt(dir,state,receipt) {
  if(receipt.provider!=='local_filesystem')fail('PERSIST_FAILED','/provider','This binding has verified only the local filesystem persistence provider');
  if(!isAbsolute(receipt.artifact_id)||resolve(receipt.artifact_id)!==resolve(dir,'account-state.json'))fail('PERSIST_FAILED','/artifact_id','Receipt must identify this account state file');
  if(!isAbsolute(receipt.actual_result_ref))fail('PERSIST_FAILED','/actual_result_ref','Local save evidence must be a durable absolute result path');
  let result;
  try {
    result=JSON.parse(await readFile(receipt.actual_result_ref,'utf8'));
    if(typeof result.output==='string')result=JSON.parse(result.output);
  } catch {fail('PERSIST_FAILED','/actual_result_ref','Actual save/readback result cannot be recovered');}
  if(result.artifact_id!==receipt.artifact_id||result.state_revision!==state.revision||(result.state_hash??result.canonical_hash)!==canonicalHash(state))fail('PERSIST_FAILED','/actual_result_ref','Save/readback evidence does not identify this state content');
}

export async function persistenceStatus(dir, state) {
  try {
    const receipt = JSON.parse(await readFile(join(dir, 'persistence-receipt.json'), 'utf8'));
    if(receipt.state_revision !== state.revision || receipt.state_hash !== canonicalHash(state))return 'stale';
    await verifyLocalReceipt(dir,state,receipt);
    return 'saved';
  } catch (error) { if (error.code === 'ENOENT'||error.code==='PERSIST_FAILED') return 'unverified'; throw error; }
}
