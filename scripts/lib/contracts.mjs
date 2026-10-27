import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { Temporal } from '@js-temporal/polyfill';

const schemaUrl = new URL('../../schemas/contracts.schema.json', import.meta.url);
const schema = JSON.parse(readFileSync(fileURLToPath(schemaUrl), 'utf8'));
// V2 payloads keep the existing transport envelope and share one strict registry.
for (const name of ['data-v2.schema.json', 'coaching-v2.schema.json', 'review-v2.schema.json', 'consumer-v2.schema.json', 'runtime-v2.schema.json', 'data-reliability-v3.schema.json', 'coaching-reliability-v3.schema.json', 'content-v3.schema.json', 'reliability-v3.schema.json', 'data-reliability-v4.schema.json', 'coaching-v4.schema.json', 'knowledge-v4.schema.json', 'guidance-v4.schema.json', 'entry-v4.schema.json', 'runtime-v4.schema.json', 'collection-v4.schema.json', 'config-v5.schema.json', 'signals-v5.schema.json', 'actions-v5.schema.json', 'coaching-v5.schema.json', 'guidance-v5.schema.json', 'knowledge-v5.schema.json', 'personal-v5.schema.json', 'runtime-v5.schema.json', 'inspiration-v5.schema.json', 'host-v5.schema.json', 'content-v5.schema.json', 'draft-v5.schema.json', 'personal-entry-v5.schema.json', 'entry-v5.schema.json', 'knowledge-entry-v5.schema.json', 'config-entry-v5.schema.json']) {
  const extension = JSON.parse(readFileSync(new URL(`../../schemas/${name}`, import.meta.url), 'utf8'));
  for (const [key, definition] of Object.entries(extension.definitions)) {
    if (schema.definitions[key]) throw new Error(`Duplicate contract: ${key}`);
    schema.definitions[key] = definition;
  }
}
schema.definitions.EffectiveConfig.properties.config={oneOf:[{$ref:'#/definitions/ConfigV1'},{$ref:'#/definitions/ConfigV5'}]};
const ajv = new Ajv({ strict: true, allErrors: true, coerceTypes: false, removeAdditional: false, useDefaults: false });
ajv.addFormat('instant', {
  type: 'string',
  validate(value) {
    try { Temporal.Instant.from(value); return /(?:Z|[+-]\d{2}:\d{2})$/.test(value); } catch { return false; }
  }
});
ajv.addFormat('calendar-date', {
  type: 'string',
  validate(value) { try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; } }
});
ajv.addFormat('iana-timezone', {
  type: 'string',
  validate(value) { try { Temporal.Now.instant().toZonedDateTimeISO(value); return true; } catch { return false; } }
});
ajv.addFormat('url', {
  type: 'string',
  validate(value) { try { const parsed = new URL(value); return parsed.protocol === 'https:' || parsed.protocol === 'http:'; } catch { return false; } }
});

const validators = new Map();
const errorCodes = new Set([
  'INVALID_INPUT', 'SCHEMA_VERSION', 'CONFIG_CONFLICT', 'MAPPING_REQUIRED',
  'IDENTITY_MISMATCH', 'NUMERIC_RANGE', 'BUDGET_EXHAUSTED',
  'CAPABILITY_UNAVAILABLE', 'UNSUPPORTED_RESPONSE', 'RECEIPT_CONFLICT',
  'MISSING_EVIDENCE', 'STALE_DRAFT', 'STATE_CONFLICT', 'PERSIST_FAILED',
  'METRIC_DEFINITION_UNRESOLVED', 'ACCOUNT_MISMATCH', 'OBSERVATION_CONFLICT',
  'STALE_BUNDLE', 'INVALID_EVIDENCE_REF', 'REQUESTED_OUTPUT_INCOMPLETE',
  'ADAPTER_UNVERIFIED', 'MIGRATION_REQUIRED', 'AUTH_REQUIRED', 'ENTITLEMENT_REQUIRED', 'EXPORT_UNAVAILABLE', 'TRANSFER_REQUIRED', 'SCOPE_UNVERIFIED', 'COVERAGE_PARTIAL', 'WINDOW_PENDING', 'WINDOW_MISSING', 'FUTURE_EVIDENCE'
]);

export class ContractError extends Error {
  constructor(code, path, message, retryable = false) {
    super(message);
    this.name = 'ContractError';
    this.code = errorCodes.has(code) ? code : 'INVALID_INPUT';
    this.path = path || '/';
    this.retryable = Boolean(retryable);
  }

  toJSON() {
    return { code: this.code, path: this.path, message: this.message, retryable: this.retryable };
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function validatorFor(typeName) {
  if (!schema.definitions[typeName]) {
    throw new ContractError('INVALID_INPUT', '/typeName', `Unknown contract type: ${typeName}`);
  }
  if (!validators.has(typeName)) {
    validators.set(typeName, ajv.compile({ $ref: `${schema.$id}#/definitions/${typeName}` }));
  }
  return validators.get(typeName);
}

ajv.addSchema(schema);

export function validate(typeName, value) {
  if(value?.contract_version===5)typeName=({'coach-stepPayload':'CoachStepPayloadV5','recordPayload':(['host_media_receipt','host_review_receipt','draft_review'].includes(value.operation)?'PersonalDomainRecordPayloadV5':'RecordPayloadV5'),'state-migratePayload':'StateMigratePayloadV5','personal-stepPayload':'PersonalStepEntryPayloadV5','inspiration-stepPayload':'InspirationStepEntryPayloadV5','content-stepPayload':'ContentStepPayloadV5','draft-checkPayload':'DraftCheckPayloadV5','knowledge-stepPayload':'KnowledgeStepPayloadV5','configPayload':'ConfigPayloadV5'})[typeName]??typeName;
  if (value?.contract_version === 4) typeName = ({'doctorPayload':'DoctorPayloadV4','recordPayload':'RecordPayloadV4','state-migratePayload':'StateMigratePayloadV4','coach-stepPayload':'CoachStepPayloadV4','reviewPayload':'ReviewPayloadV4','knowledge-stepPayload':'KnowledgeStepPayloadV4','collection-stepPayload':'CollectionStepPayloadV4'})[typeName] ?? typeName;
  if (value?.contract_version === 3) {
    typeName = ({'draft-checkPayload':'DraftCheckPayloadV3','recordPayload':'RecordPayloadV3','state-migratePayload':'StateMigratePayloadV3','content-stepPayload':'ContentStepPayloadV3','coach-stepPayload':'CoachStepPayloadV3','reviewPayload':'ReviewComputePayloadV3'})[typeName] ?? typeName;
  }
  if (value?.contract_version === 2) {
    const commands = {'coach-stepPayload':'CoachStepPayloadV2','data-importPayload':'DataImportPayloadV2','state-migratePayload':'StateMigratePayloadV2','account-analyzePayload':'AccountAnalyzePayloadV2','reviewPayload':'ReviewPayloadV2','recordPayload':'RecordPayloadV2'};
    typeName = commands[typeName] ?? typeName;
  }
  if (['news-stepPayload','NewsStepPayload'].includes(typeName) && value && typeof value === 'object') {
    const newsTypes={init:'NewsInitPayload',plan:'NewsPlanPayload',reserve:'NewsReservePayload',ingest:'NewsIngestPayload',assess:'NewsAssessPayload',finalize:'NewsFinalizePayload'};
    if(newsTypes[value.operation])typeName=newsTypes[value.operation];
  }
  if (typeName === 'recordPayload' && value && typeof value === 'object') {
    const recordTypes={initialize:'RecordInitializePayload',user_material:'RecordUserMaterialPayload',analysis:'RecordAnalysisPayload',draft:'RecordDraftPayload',adoption:'RecordAdoptionPayload',publication:'RecordPublicationPayload',observations:'RecordObservationsPayload',review:'RecordReviewPayload',rule_version:'RecordRulePayload',persistence_receipt:'RecordPersistencePayload'};
    if(recordTypes[value.operation])typeName=recordTypes[value.operation];
  }
  if(typeName==='ContentStepPayloadV3') {
    const types={prepare:'ContentPreparePayloadV3',compose:'ContentComposePayloadV3',review:'ContentReviewPayloadV3',finalize:'ContentFinalizePayloadV3',revise:'ContentRevisePayloadV3',restore:'ContentRestorePayloadV3',resume:'ContentResumePayloadV3'};
    typeName=value?.operation==='ingest'?({draft_ref:'ContentDraftIngestPayloadV3',media_asset:'ContentAssetIngestPayloadV3',preview:'ContentPreviewIngestPayloadV3'})[value.result_kind]??typeName:types[value?.operation]??typeName;
  }
  const validator = validatorFor(typeName);
  if (!validator(value)) {
    const detail = validator.errors?.[0];
    const path = detail?.instancePath || '/';
    const code = detail?.keyword === 'const' && path === '/schema_version' ? 'SCHEMA_VERSION' : 'INVALID_INPUT';
    throw new ContractError(code, path, `${detail?.message ?? 'contract validation failed'} (${typeName})`);
  }
  runSemanticChecks(typeName, value);
  return clone(value);
}

function runSemanticChecks(typeName, value) {
  if (['ConfigV1','ConfigV5'].includes(typeName)) validateConfigSemantics(value);
  if (typeName === 'ConfigPatch') validatePatchSemantics(value);
  if (typeName === 'DraftInput') {
    if (value.original_text === null && value.original_ref === null) throw new ContractError('INVALID_INPUT', '/original_text', 'original_text or original_ref is required');
    if ((value.format === 'short_post' || value.format === 'reply') && value.texts.length !== 1) throw new ContractError('INVALID_INPUT', '/texts', `${value.format} requires exactly one text`);
    if (value.format === 'thread' && value.texts.length < 2) throw new ContractError('INVALID_INPUT', '/texts', 'thread requires at least two texts');
  }
  if (typeName === 'HeatEvidence' && value.kind === 'unknown' && value.value !== null) throw new ContractError('INVALID_INPUT', '/value', 'unknown heat evidence must not contain a numeric value');
}

function validateConfigSemantics(config) {
  const profile = new URL(config.account.profile_url);
  const urlHandle = profile.pathname.split('/').filter(Boolean)[0];
  if (profile.hostname.toLowerCase() !== 'x.com' || urlHandle?.toLowerCase() !== config.account.handle.toLowerCase()) {
    throw new ContractError('IDENTITY_MISMATCH', '/account/profile_url', 'profile URL does not match account handle');
  }
  if (config.content.primary_goal === 'custom' && !config.content.goal_notes?.trim()) {
    throw new ContractError('INVALID_INPUT', '/content/goal_notes', 'custom goal requires non-empty goal_notes');
  }
  if (config.news.verification_queries_reserved > config.news.max_queries) throw new ContractError('INVALID_INPUT', '/news/verification_queries_reserved', 'reserved queries exceed total queries');
  if (config.news.verification_reads_reserved > config.news.max_source_reads) throw new ContractError('INVALID_INPUT', '/news/verification_reads_reserved', 'reserved reads exceed total reads');
  if (config.news.window.mode === 'interval' && Temporal.Instant.compare(config.news.window.start, config.news.window.end) >= 0) throw new ContractError('INVALID_INPUT', '/news/window', 'interval start must precede end');
  const restricted = new Set(config.news.restricted_sources.map(canonicalSourceRule));
  for (const rule of config.news.excluded_sources) {
    if (restricted.has(canonicalSourceRule(rule))) throw new ContractError('CONFIG_CONFLICT', '/news/excluded_sources', 'the same source rule is both restricted and excluded');
  }
  ensureUniqueIds(config.news.entities, 'entity_id', '/news/entities');
  ensureUniqueIds(config.content.voice_samples, 'sample_id', '/content/voice_samples');
}

function validatePatchSemantics(patch) {
  const allowed = patchPaths();
  patch.operations.forEach((operation, index) => {
    if (!allowed.has(operation.path)) throw new ContractError('INVALID_INPUT', `/operations/${index}/path`, `unsupported patch path: ${operation.path}`);
    const needsValue = ['set', 'append', 'remove'].includes(operation.op);
    if (needsValue !== Object.hasOwn(operation, 'value')) throw new ContractError('INVALID_INPUT', `/operations/${index}/value`, needsValue ? 'operation requires value' : 'operation does not accept value');
    if (operation.op === 'inherit' && operation.path !== '/news/core_topics') throw new ContractError('INVALID_INPUT', `/operations/${index}`, 'inherit is only valid for /news/core_topics');
  });
}

function patchPaths() {
  return new Set([
    '/account/handle','/account/profile_url','/account/user_id','/account/identity_basis','/timezone','/output_language',
    '/content/recipe_defaults','/content/visual_preferences','/content/recipe_locations','/content/delivery_preferences','/content/audience','/content/audience_regions','/content/primary_goal','/content/goal_notes','/content/topics','/content/voice_samples','/content/style_notes','/content/allowed_formats',
    '/news/core_topics','/news/exploration_topics','/news/excluded_topics','/news/entities','/news/source_languages','/news/event_regions','/news/preferred_sources','/news/restricted_sources','/news/excluded_sources','/news/content_types','/news/window','/news/allow_out_of_window','/news/rumor_policy','/news/max_queries','/news/verification_queries_reserved','/news/max_source_reads','/news/verification_reads_reserved','/news/max_candidate_urls','/news/max_events_to_verify','/news/max_discovery_rounds','/news/soft_budget_seconds','/news/max_topic_cards','/news/max_draft_variants','/news/new_paid_api_budget_usd',
    '/history/dedupe_scope','/history/previously_recommended'
  ]);
}

function ensureUniqueIds(items, field, path) {
  const seen = new Set();
  items.forEach((item, index) => {
    if (seen.has(item[field])) throw new ContractError('INVALID_INPUT', `${path}/${index}/${field}`, `duplicate ${field}`);
    seen.add(item[field]);
  });
}

function canonicalSourceRule(rule) {
  if (rule.kind === 'domain') return `domain:${rule.value.toLowerCase().replace(/\.$/, '')}:${rule.include_subdomains}`;
  const url = new URL(rule.value);
  return `url_prefix:${url.origin.toLowerCase()}${normalizePath(url.pathname)}`;
}

function normalizePath(pathname) {
  const path = pathname.replace(/\/{2,}/g, '/');
  return path.endsWith('/') ? path : `${path}/`;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalHash(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export function textHash(value) {
  if (typeof value !== 'string') throw new ContractError('INVALID_INPUT', '/text', 'textHash requires a string');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function newId(kind) {
  if (!/^[a-z][a-z0-9_]*$/.test(kind)) throw new ContractError('INVALID_INPUT', '/kind', 'ID kind must be lowercase ASCII');
  return `${kind}-${randomUUID()}`;
}

export function assertReferences(ids, collection, path = '/references') {
  for (const [index, id] of ids.entries()) {
    const exists = collection instanceof Set ? collection.has(id) : Object.hasOwn(collection ?? {}, id);
    if (!exists) throw new ContractError('MISSING_EVIDENCE', `${path}/${index}`, `missing reference: ${id}`);
  }
}

export function summarizeRun(stageResults, requestedScope, context) {
  const stages = validateStageResults(stageResults);
  const required = stages.filter(stage => stage.required);
  const failed = required.filter(stage => stage.status !== 'passed');
  const deliverableRefs = [...(context.deliverable_refs ?? [])];
  let executionStatus = 'complete';
  const hasProgress = Boolean(context.has_progress ?? required.some(stage => stage.status === 'passed'));
  if (failed.length || context.core_blocked) executionStatus = context.core_blocked || (!hasProgress && !deliverableRefs.length) ? 'blocked' : 'partial';
  let resultKind;
  if (deliverableRefs.length || context.has_findings) resultKind = 'findings';
  else if (executionStatus === 'complete' && (context.definitive_no_findings || context.bounded_search_complete)) resultKind = 'no_findings';
  else resultKind = 'undetermined';
  const persistence = stages.find(stage => stage.stage === 'persistence');
  const persistenceStatus = context.persistence_status ?? (!persistence ? 'unverified' : persistence.status === 'passed' ? 'saved' : persistence.status === 'failed' ? 'stale' : 'unverified');
  return validate('RunResult', {
    run_id: context.run_id,
    intent: context.intent,
    requested_scope: clone(requestedScope),
    delivered_scope: clone(context.delivered_scope ?? {}),
    effective_config_hash: context.effective_config_hash,
    as_of: context.as_of,
    stage_results: stages,
    execution_status: executionStatus,
    result_kind: resultKind,
    deliverable_refs: deliverableRefs,
    limitations: [...(context.limitations ?? []), ...failed.map(stage => `${stage.stage}: ${stage.reason ?? stage.status}`)],
    stop_reason: context.stop_reason ?? null,
    persistence_status: persistenceStatus
  });
}

function validateStageResults(stageResults) {
  const seen = new Set();
  return stageResults.map((stage, index) => {
    const checked = validate('StageResult', stage);
    if (seen.has(checked.stage)) throw new ContractError('INVALID_INPUT', `/stage_results/${index}/stage`, 'duplicate stage');
    seen.add(checked.stage);
    return checked;
  });
}

export function schemaDefinitionNames() {
  return Object.keys(schema.definitions).sort();
}
