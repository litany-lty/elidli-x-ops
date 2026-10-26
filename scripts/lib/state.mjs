import { readFile, writeFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { canonicalHash, validate, ContractError } from './contracts.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const collections = ['runs','sources','raw_receipts','user_facts','events','claims','drafts','adoptions','publications','posts','snapshots','reviews','rule_versions'];

export function validateState(state) {
  validate('ConfigV1',state.config);
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
  for(const adoption of Object.values(state.adoptions)) {validate('AdoptionRecord',adoption);if(!state.drafts[adoption.draft_id]?.revisions[adoption.revision])fail('MISSING_EVIDENCE','/adoptions/revision','Adopted draft revision does not exist');}
  for(const publication of Object.values(state.publications)) {validate('PublicationRecord',publication);if(publication.adoption_id&&!state.adoptions[publication.adoption_id])fail('MISSING_EVIDENCE','/publications/adoption_id','Publication adoption does not exist');}
  for(const post of Object.values(state.posts)) {validate('PostRecord',post);if(post.author_handle.toLowerCase()!==state.account.handle.toLowerCase()||(state.account.user_id&&post.account_id&&post.account_id!==state.account.user_id))fail('IDENTITY_MISMATCH','/posts','Post does not belong to this account');if(!state.sources[post.source_ref])fail('MISSING_EVIDENCE','/posts/source_ref','Post source does not exist');}
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
  return state;
}

export function initializeState(config) {
  return { schema_version: 1, revision: 0, account: structuredClone(config.account), config: structuredClone(config),
    preference_meta: {}, ...Object.fromEntries(collections.map(key => [key, {}])) };
}

export async function loadState(dir) {
  try {
    const state = JSON.parse(await readFile(join(dir, 'account-state.json'), 'utf8'));
    if (state.schema_version !== 1) fail('SCHEMA_VERSION', '/schema_version', 'Unsupported state version');
    if (!Number.isSafeInteger(state.revision) || state.revision < 1) fail('INVALID_INPUT', '/revision', 'Invalid state revision');
    return validateState(state);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function commitState(dir, expectedRevision, mutation) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('STATE_CONFLICT', '/expected_revision', 'A current revision is required for every write');
  await mkdir(dir, {recursive: true, mode: 0o700});
  const lockPath = join(dir, '.write.lock');
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('STATE_CONFLICT', '/state', 'Another writer holds this account lock'); throw error; }
  const temporary = join(dir, `.account-state.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    const previous = await loadState(dir);
    if ((previous?.revision ?? 0) !== expectedRevision) fail('STATE_CONFLICT', '/expected_revision', 'State changed; read the current revision before writing');
    const working = previous ? structuredClone(previous) : null;
    const result = await mutation(working);
    const next = result?.state ?? result;
    if (!next || next.schema_version !== 1) fail('INVALID_INPUT', '/state', 'Mutation must return a versioned state');
    if (previous && canonicalHash(previous) === canonicalHash(next)) return previous;
    next.revision = expectedRevision + 1;
    validateState(next);
    await writeFile(temporary, JSON.stringify(next, null, 2) + '\n', {flag:'wx', mode:0o600});
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
