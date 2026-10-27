import { createRequire } from 'node:module';
import { Temporal } from '@js-temporal/polyfill';
import twitterText from 'twitter-text';
import {
  ContractError,
  canonicalHash,
  newId,
  textHash,
  validate,
} from './contracts.mjs';
import { buildConsumerContext, goalSnapshotFromState, validatePersonalContextSelection } from './consumer-context.mjs';
import { buildOperationalContext } from './consumer-context.mjs';
import { resolveSubject } from './subjects.mjs';

const require = createRequire(import.meta.url);
const { version: parserVersion } = require('twitter-text/package.json');
const { parseTweet } = twitterText;

const VALID_FORMATS = new Set(['short_post', 'thread', 'reply']);
const USABLE_CLAIM_STATUSES = new Set(['supported', 'attributed', 'inferred']);
const INVALID_CLAIM_STATUSES = new Set(['invalidated']);
const EVIDENCE_MATERIAL_KINDS = new Set(['article_excerpt', 'article_body', 'official_document', 'user_material']);
const INTERNAL_DRAFT_ID = /^draft-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code, path, message) {
  throw new ContractError(code, path, message, false);
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', path, '必须是对象');
  }
}

function assertDraftShape(input) {
  requireObject(input, '/payload/draft_input');
  if (input.draft_id !== null && typeof input.draft_id !== 'string') {
    fail('INVALID_INPUT', '/payload/draft_input/draft_id', '必须是字符串或 null');
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 1) {
    fail('INVALID_INPUT', '/payload/draft_input/revision', '必须是大于等于 1 的安全整数');
  }
  if (input.parent_revision !== null &&
      (!Number.isSafeInteger(input.parent_revision) || input.parent_revision < 1)) {
    fail('INVALID_INPUT', '/payload/draft_input/parent_revision', '必须是正整数或 null');
  }
  if (input.card_id !== null && typeof input.card_id !== 'string') {
    fail('INVALID_INPUT', '/payload/draft_input/card_id', '必须是字符串或 null');
  }
  if (input.personal_context_hash !== undefined && input.personal_context_hash !== null && typeof input.personal_context_hash !== 'string') {
    fail('INVALID_INPUT', '/payload/draft_input/personal_context_hash', '必须是字符串、null 或省略');
  }
  const hasOriginalText = typeof input.original_text === 'string' && input.original_text.length > 0;
  const hasOriginalRef = typeof input.original_ref === 'string' && input.original_ref.length > 0;
  if (!hasOriginalText && !hasOriginalRef) {
    fail('INVALID_INPUT', '/payload/draft_input', 'original_text 与 original_ref 至少提供一项');
  }
  if (!VALID_FORMATS.has(input.format)) {
    fail('INVALID_INPUT', '/payload/draft_input/format', '不支持的草稿格式');
  }
  if (!Array.isArray(input.texts) || input.texts.some((text) => typeof text !== 'string' || !text.trim())) {
    fail('INVALID_INPUT', '/payload/draft_input/texts', 'texts 必须是非空文本数组');
  }
  if ((input.format === 'thread' && input.texts.length < 2) ||
      (input.format !== 'thread' && input.texts.length !== 1)) {
    fail('INVALID_INPUT', '/payload/draft_input/texts', '文本数量与 format 不匹配');
  }
  if (!Array.isArray(input.fact_mapping)) {
    fail('INVALID_INPUT', '/payload/draft_input/fact_mapping', 'fact_mapping 必须是数组');
  }
  if (input.semantic_review !== null) requireObject(input.semantic_review, '/payload/draft_input/semantic_review');
}

function allowedFormats(context) {
  const formats = context?.effective_config?.config?.content?.allowed_formats;
  return Array.isArray(formats) ? formats : [];
}

function currentGoalSnapshot(context) {
  if (context.goal_snapshot) return context.goal_snapshot;
  return goalSnapshotFromState(context.state, context.effective_config);
}

function getDraftHistory(input, state) {
  if (input.draft_id === null) {
    if (input.revision !== 1 || input.parent_revision !== null) {
      fail('STALE_DRAFT', '/payload/draft_input/revision', '新草稿必须从 revision=1 且 parent_revision=null 开始');
    }
    return { draftId: newId('draft'), previous: null, mode: 'new' };
  }
  const history = state?.drafts?.[input.draft_id];
  if (!history) {
    if (!INTERNAL_DRAFT_ID.test(input.draft_id) || input.revision !== 1 || input.parent_revision !== null) {
      fail('STALE_DRAFT', '/payload/draft_input/draft_id', '未保存草稿必须使用代码生成的 ID，并保持首版 revision=1');
    }
    return { draftId: input.draft_id, previous: null, mode: 'new' };
  }
  const expectedParent = history.latest_revision;
  if (input.revision === expectedParent) {
    const current = history.revisions?.[expectedParent];
    if (!current || input.parent_revision !== current.parent_revision) {
      fail('STALE_DRAFT', '/payload/draft_input/revision', '重验必须引用已保存的当前版本');
    }
    return { draftId: input.draft_id, previous: current, mode: 'recheck' };
  }
  if (input.parent_revision !== expectedParent || input.revision !== expectedParent + 1) {
    fail('STALE_DRAFT', '/payload/draft_input/revision', '新修订号必须紧接当前最新版本');
  }
  return { draftId: input.draft_id, previous: history.revisions?.[expectedParent] ?? null, mode: 'revision' };
}

function sourceVersion(state, sourceVersionId) {
  for (const entry of Object.values(state?.sources ?? {})) {
    if (entry?.versions && Object.hasOwn(entry.versions, sourceVersionId)) {
      return entry.versions[sourceVersionId];
    }
  }
  return null;
}

function checkEvidence(input, state) {
  const issues = [];
  if(input.original_ref&&!state?.sources?.[input.original_ref]&&!sourceVersion(state,input.original_ref))issues.push({code:'MISSING_EVIDENCE',path:'/original_ref',message:'原始材料引用未登记',retryable:false});
  const usedClaims = new Set();
  const usedUserFacts = new Set();
  for (const [index, mapping] of input.fact_mapping.entries()) {
    requireObject(mapping, `/payload/draft_input/fact_mapping/${index}`);
    const { text_index: textIndex, start, end } = mapping;
    if (!Number.isSafeInteger(textIndex) || textIndex < 0 || textIndex >= input.texts.length) {
      fail('INVALID_INPUT', `/payload/draft_input/fact_mapping/${index}/text_index`, '文本索引越界');
    }
    const text = input.texts[textIndex];
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > text.length) {
      fail('INVALID_INPUT', `/payload/draft_input/fact_mapping/${index}`, '事实定位必须是有效的 UTF-16 [start,end) 区间');
    }
    for (const claimId of mapping.claim_ids ?? []) {
      usedClaims.add(claimId);
      const claim = state?.claims?.[claimId];
      if (!claim) {
        issues.push({ code: 'MISSING_EVIDENCE', path: `/fact_mapping/${index}/claim_ids`, message: `找不到主张 ${claimId}`, retryable: false });
        continue;
      }
      if (INVALID_CLAIM_STATUSES.has(claim.support_status)) {
        issues.push({ code: 'MISSING_EVIDENCE', path: `/claims/${claimId}`, message: '主张已失效', retryable: false });
      } else if (!USABLE_CLAIM_STATUSES.has(claim.support_status)) {
        issues.push({ code: 'MISSING_EVIDENCE', path: `/claims/${claimId}`, message: `主张状态 ${claim.support_status} 不足以支持确定式表述`, retryable: true });
      }
      if (claim.kind !== 'user_fact') {
        if (!Array.isArray(claim.source_version_ids) || claim.source_version_ids.length === 0) {
          issues.push({ code: 'MISSING_EVIDENCE', path: `/claims/${claimId}/source_version_ids`, message: '外部主张没有来源版本', retryable: true });
        } else {
          for (const sourceVersionId of claim.source_version_ids) {
            const version = sourceVersion(state, sourceVersionId);
            if (!version) {
              issues.push({ code: 'MISSING_EVIDENCE', path: `/claims/${claimId}/source_version_ids`, message: `找不到来源版本 ${sourceVersionId}`, retryable: true });
              continue;
            }
            const receipt = state?.raw_receipts?.[version.raw_receipt_ref];
            if (!receipt || receipt.status !== 'succeeded') {
              issues.push({ code: 'MISSING_EVIDENCE', path: `/sources/${sourceVersionId}/raw_receipt_ref`, message: '来源版本缺少成功且可恢复的原始回执', retryable: true });
            }
            if (version.read_status !== 'read' || !EVIDENCE_MATERIAL_KINDS.has(version.material_kind)) {
              issues.push({ code: 'MISSING_EVIDENCE', path: `/sources/${sourceVersionId}`, message: '来源版本未包含可支持主张的实读材料', retryable: true });
            }
          }
        }
      }
    }
    for (const userFactId of mapping.user_fact_ids ?? []) {
      usedUserFacts.add(userFactId);
      if (!state?.user_facts?.[userFactId]) {
        issues.push({ code: 'MISSING_EVIDENCE', path: `/fact_mapping/${index}/user_fact_ids`, message: `找不到用户事实 ${userFactId}`, retryable: false });
      }
      else if(!state?.sources?.[state.user_facts[userFactId].source_ref])issues.push({code:'MISSING_EVIDENCE',path:`/user_facts/${userFactId}/source_ref`,message:'用户事实的原始来源未登记',retryable:false});
    }
  }
  return { issues, usedClaims, usedUserFacts };
}

function sameMembers(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.size) return false;
  return new Set(actual).size === actual.length && actual.every((id) => expected.has(id));
}

function semanticStatus(review, hashes, usedClaims, usedUserFacts) {
  if (review === null) return { status: 'missing', issue: null };
  const hashesMatch = Array.isArray(review.text_hashes) &&
    review.text_hashes.length === hashes.length &&
    review.text_hashes.every((hash, index) => hash === hashes[index]);
  const refsMatch = sameMembers(review.claim_ids, usedClaims) &&
    sameMembers(review.kept_user_fact_ids, usedUserFacts);
  if (!hashesMatch || !refsMatch) {
    return {
      status: 'revise',
      issue: { code: 'STALE_DRAFT', path: '/semantic_review', message: '语义复核未绑定当前全文或事实引用', retryable: false },
    };
  }
  if (!review.new_claims_check.trim() || !review.reviewer.trim()) {
    return {
      status: 'revise',
      issue: { code: 'INVALID_INPUT', path: '/semantic_review', message: '语义复核必须记录新增主张检查和评阅者', retryable: false },
    };
  }
  if (review.decision === 'approve') return { status: 'approved', issue: null };
  if (review.decision === 'insufficient_evidence') return { status: 'insufficient_evidence', issue: null };
  return { status: 'revise', issue: null };
}

function checkLength(text, checkedAt) {
  const parsed = parseTweet(text);
  return {
    text_hash: textHash(text),
    weighted_length: parsed.weightedLength,
    valid: parsed.valid,
    parser_version: `twitter-text@${parserVersion}`,
    config_version: 'v3',
    checked_at: checkedAt,
  };
}

/** Validate a complete final draft and derive its immutable checks and validity. */
export function checkDraft(input, context, asOf) {
  validate('DraftInput', input);
  assertDraftShape(input);
  requireObject(context, '/context');
  let checkedAt;
  try {
    checkedAt = Temporal.Instant.from(asOf).toString();
  } catch {
    fail('INVALID_INPUT', '/as_of', 'as_of 必须是带时区的有效时刻');
  }
  if (!allowedFormats(context).includes(input.format)) {
    fail('INVALID_INPUT', '/payload/draft_input/format', '当前有效配置不允许该格式');
  }

  const { draftId, previous, mode } = getDraftHistory(input, context.state ?? {});
  if(input.edit_base_ref){const base=context.state?.drafts?.[input.edit_base_ref.draft_id]?.revisions[input.edit_base_ref.revision];if(!base||input.edit_base_ref.draft_id!==draftId)fail('STALE_DRAFT','/edit_base_ref','Edit base must identify real history of this draft');}
  if(mode==='recheck'&&['original_text','original_ref','format'].some(key=>input[key]!==previous[key]))fail('STALE_DRAFT','/draft_input','Recheck changes audit evidence, not the saved original material');
  if (previous?.card_id && input.card_id && input.card_id !== previous.card_id) {
    fail('STALE_DRAFT', '/payload/draft_input/card_id', '草稿修订必须保留原新闻卡关联；不能改绑到另一张卡');
  }
  const cardId = input.card_id ?? previous?.card_id ?? null;
  const personalizationContext = context.state?.schema_version === 2
    ? buildConsumerContext(context.state, { intent: 'draft', goal_snapshot: currentGoalSnapshot(context) })
    : null;
  const personalContextHash = input.personal_context_hash ?? previous?.personal_context_hash ?? null;
  if (personalContextHash && personalizationContext?.context_hash !== personalContextHash) {
    fail('STALE_DRAFT', '/payload/draft_input/personal_context_hash', '个性化依据已变化；请读取当前上下文后重新复核草稿');
  }
  const textHashes = input.texts.map(textHash);
  const sameAsPrevious = previous && Array.isArray(previous.text_hashes) &&
    previous.text_hashes.length === textHashes.length &&
    previous.text_hashes.every((hash, index) => hash === textHashes[index]);
  if (mode === 'revision' && sameAsPrevious) {
    fail('STALE_DRAFT', '/payload/draft_input/texts', '新 revision 必须对应发生变化的最终文本');
  }
  if (mode === 'recheck' && !sameAsPrevious) {
    fail('STALE_DRAFT', '/payload/draft_input/texts', '已保存 revision 的文本变化必须建立新 revision');
  }
  const lengthChecks = input.texts.map((text) => checkLength(text, checkedAt));
  const evidence = checkEvidence(input, context.state ?? {});
  const semantic = semanticStatus(input.semantic_review, textHashes, evidence.usedClaims, evidence.usedUserFacts);
  const errors = [...evidence.issues];
  if (semantic.issue) errors.push(semantic.issue);

  const hasInvalidatedClaim = evidence.issues.some((issue) => issue.message === '主张已失效');
  const evidenceStatus = hasInvalidatedClaim
    ? 'invalidated'
    : evidence.issues.length > 0 ? 'unverified' : 'supported';
  const lengthInvalid = lengthChecks.some((check) => !check.valid);
  let validity = 'unverified';
  if (lengthInvalid || semantic.status === 'revise' || evidenceStatus === 'invalidated') {
    validity = 'needs_revision';
  } else if (semantic.status === 'approved' && evidenceStatus === 'supported') {
    validity = 'ready';
  }

  const draft = {
    draft_id: draftId,
    revision: input.revision,
    parent_revision: input.parent_revision,
    card_id: cardId,
    personal_context_hash: personalContextHash,
    original_text: input.original_text,
    original_ref: input.original_ref,
    format: input.format,
    texts: [...input.texts],
    fact_mapping: structuredClone(input.fact_mapping),
    semantic_review: input.semantic_review === null ? null : structuredClone(input.semantic_review),
    length_checks: lengthChecks,
    text_hashes: textHashes,
    validity,
  };
  if(input.edit_base_ref!==undefined)draft.edit_base_ref=structuredClone(input.edit_base_ref);
  validate('DraftRecord', draft);
  const result = {
    draft,
    text_checks: lengthChecks,
    semantic_status: semantic.status,
    evidence_status: evidenceStatus,
    validity,
    errors,
    personalization_context: personalizationContext,
  };
  validate('DraftCheckResult', result);
  return result;
}

// Text revisions remain immutable. New evidence and approval are append-only sidecars.
function mappingEvidenceVersions(state, mapping) {
  const refs = new Set(mapping.flatMap(item => [...item.claim_ids, ...item.user_fact_ids]));
  for (const id of [...refs]) {
    const claim = state.claims[id];
    for (const source of claim?.source_version_ids ?? []) refs.add(source);
    const fact = state.user_facts[id];
    if (fact) refs.add(fact.source_ref);
  }
  return [...refs].sort().map(ref => {
    const value = state.claims[ref] ?? state.user_facts[ref] ?? sourceVersion(state, ref) ?? state.sources[ref];
    return { ref, hash: canonicalHash(value ?? null) };
  });
}

export function draftEvidenceMappingHash(state, mapping) {
  return canonicalHash({fact_mapping:mapping,evidence_versions:mappingEvidenceVersions(state,mapping)});
}

function effectiveReview(state, ref, selected = null) {
  const receipts = Object.values(state.draft_review_receipts ?? {}).filter(item => item.draft_ref.draft_id === ref.draft_id && item.draft_ref.revision === ref.revision);
  const superseded = new Set(receipts.map(item => item.supersedes_receipt_ref).filter(Boolean));
  const leaves = receipts.filter(item => !superseded.has(item.receipt_id));
  if (selected) return leaves.find(item => item.receipt_id === selected) ?? null;
  return leaves.length === 1 ? leaves[0] : null;
}

export function draftPersonalCallerContext(state,input){
  return {goal_hash:canonicalHash(goalSnapshotFromState(state)),brief_or_use_hash:canonicalHash({intent:'draft',format:input.format,original_text:input.original_text,original_ref:input.original_ref,edit_base_ref:input.edit_base_ref??null}),requested_use:'current',post_version_refs:[],selection_policy_version:'personal-context-v3'};
}

export function checkDraftV3(payload, context) {
  validate('DraftCheckPayloadV3', payload);
  const input = {...payload.draft_input, personal_context_hash:null};
  const checked = checkDraft(input, context, payload.as_of);
  if(checked.draft.card_id&&!Object.values(context.state.runs??{}).some(run=>run.cards?.some(card=>card.card_id===checked.draft.card_id)))fail('MISSING_EVIDENCE','/card_id','News card must be an actual saved version');
  const state = context.state;
  const selection = payload.personal_context_selection;
  if (payload.personalization_mode === 'none' && selection !== null) fail('INVALID_INPUT','/personal_context_selection','纯编辑不应声称使用账号依据');
  const personalErrors = [];
  if (payload.personalization_mode === 'evidence_bound') {
    if (!selection?.selected.length) personalErrors.push('personal_context_selection');
    else validatePersonalContextSelection(state, selection,draftPersonalCallerContext(state,input));
  }
  const previous = effectiveReview(state,{draft_id:checked.draft.draft_id,revision:checked.draft.revision});
  if (payload.supersedes_receipt_ref && !state.draft_review_receipts[payload.supersedes_receipt_ref]) fail('MISSING_EVIDENCE','/supersedes_receipt_ref','找不到待替代审核');
  const receipt = {
    contract_version:3,receipt_id:'',draft_ref:{draft_id:checked.draft.draft_id,revision:checked.draft.revision},
    text_hashes:checked.draft.text_hashes,fact_mapping:structuredClone(input.fact_mapping),
    evidence_mapping_hash:draftEvidenceMappingHash(state,input.fact_mapping),evidence_versions:mappingEvidenceVersions(state,input.fact_mapping),
    personalization_mode:payload.personalization_mode,personal_context_selection:selection,
    personal_context_selection_hash:selection?.selection_hash ?? null,validator_version:'draft-check@3',
    semantic_review:input.semantic_review,reviewer:input.semantic_review?.reviewer ?? 'awaiting-review',reviewed_at:payload.as_of,
    decision:checked.validity === 'ready' && !personalErrors.length ? 'approved' : checked.evidence_status === 'supported' ? 'needs_review':'incomplete',
    supersedes_receipt_ref:payload.supersedes_receipt_ref,
  };
  receipt.subject_hash=canonicalHash({...(payload.delivery_intent&&payload.delivery_intent!=='operational_optimize'?{delivery_intent:payload.delivery_intent}:{}),draft_ref:receipt.draft_ref,original_text:input.original_text,original_ref:input.original_ref,format:input.format,card_id:checked.draft.card_id,edit_base_ref:input.edit_base_ref??null,text_hashes:receipt.text_hashes,evidence_mapping_hash:receipt.evidence_mapping_hash,personalization_mode:receipt.personalization_mode,personal_context_selection_hash:receipt.personal_context_selection_hash});
  receipt.delivery_intent=payload.delivery_intent??'operational_optimize';
  receipt.actual_review_receipt_ref=payload.actual_review_receipt_ref??null;
  const actualReview=state.host_media_receipts?.[receipt.actual_review_receipt_ref];
  if(!actualReview||actualReview.operation!=='review_draft'||actualReview.status!=='succeeded'||actualReview.subject_hash!==receipt.subject_hash)receipt.decision=receipt.decision==='incomplete'?'incomplete':'needs_review';
  receipt.receipt_id=`draft-review:${canonicalHash({...receipt,receipt_id:undefined})}`;
  if(!state.draft_review_receipts[receipt.receipt_id]&&previous&&payload.supersedes_receipt_ref!==previous.receipt_id)fail('STALE_DRAFT','/supersedes_receipt_ref','重新审核须明确替代当前回执');
  validate('DraftReviewReceiptV3',receipt);
  return {...checked,review_receipt:receipt,readiness:receipt.decision==='approved'?'ready':receipt.decision,unmet_requirements:personalErrors};
}

function stableV5Hash(value,field){const copy=structuredClone(value);delete copy[field];return canonicalHash(copy);}

export function validateEditPrescriptionV5(prescription,{original_text,texts,requested_mode,scope_constraint}={}){
  validate('EditPrescriptionV5',prescription);
  if(prescription.prescription_hash!==stableV5Hash(prescription,'prescription_hash'))fail('RECEIPT_CONFLICT','/edit_request/prescription_hash','Edit prescription changed');
  if(prescription.scope_constraint!==scope_constraint)fail('INVALID_INPUT','/edit_request/scope_constraint','Prescription must retain the requested edit scope');
  const unchanged=texts.length===1&&texts[0]===original_text;
  if(prescription.mode==='keep'&&!unchanged)fail('INVALID_INPUT','/edit_request/prescription','Keep cannot change the draft');
  if(requested_mode==='suggest_only'&&!unchanged)fail('INVALID_INPUT','/draft_input/texts','Suggestion-only mode must not rewrite the draft');
  if(requested_mode==='local_edit'&&prescription.mode==='rewrite')fail('INVALID_INPUT','/edit_request/prescription','A local edit request cannot expand to a full rewrite');
  if(prescription.mode==='keep'&&!prescription.keep_reason)fail('INVALID_INPUT','/edit_request/prescription/keep_reason','Keeping a good draft requires a concrete reason');
  return structuredClone(prescription);
}

export function validateFormatRationaleV5(rationale,operationalContext=null){
  validate('FormatRationaleV5',rationale);
  if(rationale.rationale_hash!==stableV5Hash(rationale,'rationale_hash'))fail('RECEIPT_CONFLICT','/format_rationale/rationale_hash','Format rationale changed');
  if(rationale.unsupported_formats.length!==2||!rationale.unsupported_formats.includes('native_article')||!rationale.unsupported_formats.includes('platform_long_post'))fail('INVALID_INPUT','/format_rationale/unsupported_formats','Unvalidated Article and platform long-post delivery must remain unsupported');
  const configured=operationalContext?.explicit_preferences?.available_minutes_per_post;
  if(configured!==undefined&&configured!==null&&rationale.available_minutes!==configured)fail('STALE_BUNDLE','/format_rationale/available_minutes','Format rationale must use the current explicit time preference');
  return structuredClone(rationale);
}

export function draftReviewSubjectHashV5(value){
  return canonicalHash({subject_ref:value.subject_ref,draft_ref:value.draft_ref,text_hashes:value.text_hashes,evidence_mapping_hash:value.evidence_mapping_hash,operational_context_selector:value.operational_context_selector,operational_context_hash:value.operational_context_hash,delivery_intent:value.delivery_intent,requested_mode:value.requested_mode,edit_prescription:value.edit_prescription,format_rationale:value.format_rationale});
}

export function checkDraftV5(payload,context){
  validate('DraftCheckPayloadV5',payload);
  const operational=context.operational_context??null;
  if(payload.personalization_mode==='evidence_bound'&&!operational)fail('MISSING_EVIDENCE','/operational_context','Evidence-bound edit requires current operational context');
  const checked=checkDraft(payload.draft_input,context,payload.as_of),prescription=validateEditPrescriptionV5(payload.edit_request.prescription,{original_text:payload.draft_input.original_text,texts:payload.draft_input.texts,requested_mode:payload.edit_request.requested_mode,scope_constraint:payload.edit_request.scope_constraint}),formatRationale=validateFormatRationaleV5(payload.edit_request.format_rationale,operational),actual=context.actual_review_receipts?.[payload.actual_review_receipt_ref]??context.state.host_media_receipts?.[payload.actual_review_receipt_ref];
  const receiptBase={contract_version:5,subject_ref:payload.subject_ref,draft_ref:{draft_id:checked.draft.draft_id,revision:checked.draft.revision},text_hashes:checked.draft.text_hashes,evidence_mapping_hash:draftEvidenceMappingHash(context.state,payload.draft_input.fact_mapping),operational_context_selector:structuredClone(context.operational_context_selector??{}),operational_context_hash:operational?.selected_context_hash??null,delivery_intent:payload.delivery_intent,requested_mode:payload.edit_request.requested_mode,edit_prescription:prescription,format_rationale:formatRationale,decision:checked.validity==='ready'?'approved':checked.evidence_status==='supported'?'needs_review':'incomplete',actual_review_receipt_ref:payload.actual_review_receipt_ref,reviewed_at:actual?.reviewed_at??payload.as_of};
  const subjectHash=draftReviewSubjectHashV5(receiptBase),subjectContentHash=operational?.subject_descriptor?.content_hash;
  if(!actual||actual.purpose!=='review_edit_prescription'||actual.subject_ref!==payload.subject_ref||actual.subject_hash!==subjectHash||actual.subject_content_hash!==subjectContentHash||actual.decision!=='approved')receiptBase.decision=receiptBase.decision==='incomplete'?'incomplete':'needs_review';
  const receipt={...receiptBase,subject_hash:subjectHash,receipt_id:`draft-review-v5:${subjectHash}`};validate('DraftReviewReceiptV5',receipt);
  return{...checked,review_receipt:receipt,edit_prescription:prescription,format_rationale:formatRationale,readiness:receipt.decision==='approved'?'ready':receipt.decision};
}

export function evaluateDraftReadiness(ref, selectedReviewRef, state) {
  const draft=state.drafts?.[ref.draft_id]?.revisions?.[ref.revision];
  const receipt=effectiveReview(state,ref,selectedReviewRef);
  const unmet=[];
  if(!draft)unmet.push('draft');
  if(!receipt)unmet.push('draft_review');
  if(draft&&receipt){
    if(receipt.contract_version===5){
      const subject=resolveSubject(state,receipt.subject_ref),selector={...structuredClone(receipt.operational_context_selector),subject_ref:receipt.subject_ref,subject_descriptor:subject},operational=buildOperationalContext(state,selector),evidenceHash=draftEvidenceMappingHash(state,draft.fact_mapping);
      if(canonicalHash(draft.texts.map(textHash))!==canonicalHash(receipt.text_hashes))unmet.push('text_hashes');
      if(evidenceHash!==receipt.evidence_mapping_hash)unmet.push('evidence_mapping');
      if(checkEvidence({...draft,fact_mapping:draft.fact_mapping},state).issues.length)unmet.push('evidence');
      if(draft.texts.some(text=>!parseTweet(text).valid))unmet.push('length');
      if(operational.selected_context_hash!==receipt.operational_context_hash)unmet.push('operational_context');
      if(draftReviewSubjectHashV5(receipt)!==receipt.subject_hash)unmet.push('draft_review_subject');
      if(receipt.decision!=='approved')unmet.push('semantic_review');
      const actual=state.host_media_receipts?.[receipt.actual_review_receipt_ref];
      if(!actual||actual.contract_version!==5||actual.purpose!=='review_edit_prescription'||actual.subject_ref!==receipt.subject_ref||actual.subject_hash!==receipt.subject_hash||actual.subject_content_hash!==subject.content_hash||actual.decision!=='approved'||Object.values(actual.checks??{}).some(value=>value!==true)||(actual.issues??[]).length)unmet.push('actual_draft_review');
      return {review_receipt_ref:receipt.receipt_id,readiness:unmet.length?'needs_review':'ready',evidence_mapping_hash:receipt.evidence_mapping_hash,personal_context_selection_hash:receipt.operational_context_hash,text_hashes:draft.text_hashes,unmet_requirements:unmet};
    }
    if(canonicalHash(draft.texts.map(textHash))!==canonicalHash(receipt.text_hashes))unmet.push('text_hashes');
    if(draftEvidenceMappingHash(state,receipt.fact_mapping)!==receipt.evidence_mapping_hash)unmet.push('evidence_mapping');
    if(checkEvidence({...draft,fact_mapping:receipt.fact_mapping},state).issues.length)unmet.push('evidence');
    if(draft.texts.some(text=>!parseTweet(text).valid))unmet.push('length');
    const subject=canonicalHash({...(receipt.delivery_intent&&receipt.delivery_intent!=='operational_optimize'?{delivery_intent:receipt.delivery_intent}:{}),draft_ref:receipt.draft_ref,original_text:draft.original_text,original_ref:draft.original_ref,format:draft.format,card_id:draft.card_id,edit_base_ref:draft.edit_base_ref??null,text_hashes:receipt.text_hashes,evidence_mapping_hash:receipt.evidence_mapping_hash,personalization_mode:receipt.personalization_mode,personal_context_selection_hash:receipt.personal_context_selection_hash});
    if(subject!==receipt.subject_hash)unmet.push('draft_review_subject');
    if(receipt.decision!=='approved')unmet.push('semantic_review');
    const actual=state.host_media_receipts?.[receipt.actual_review_receipt_ref];if(!actual||actual.status!=='succeeded'||actual.operation!=='review_draft'||actual.subject_hash!==receipt.subject_hash)unmet.push('actual_draft_review');
    if(receipt.personalization_mode==='evidence_bound'){
      try{if(!receipt.personal_context_selection?.selected.length)throw Error();validatePersonalContextSelection(state,receipt.personal_context_selection,draftPersonalCallerContext(state,draft));}catch{unmet.push('personal_context_selection');}
    }
  }
  return {review_receipt_ref:receipt?.receipt_id??null,readiness:!draft?'incomplete':unmet.length?'needs_review':'ready',evidence_mapping_hash:receipt?.evidence_mapping_hash??null,personal_context_selection_hash:receipt?.personal_context_selection_hash??null,text_hashes:draft?.text_hashes??[],unmet_requirements:unmet};
}
