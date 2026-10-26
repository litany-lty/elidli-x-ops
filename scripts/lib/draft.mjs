import { createRequire } from 'node:module';
import { Temporal } from '@js-temporal/polyfill';
import twitterText from 'twitter-text';
import {
  ContractError,
  newId,
  textHash,
  validate,
} from './contracts.mjs';

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
    card_id: input.card_id,
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
  validate('DraftRecord', draft);
  const result = {
    draft,
    text_checks: lengthChecks,
    semantic_status: semantic.status,
    evidence_status: evidenceStatus,
    validity,
    errors,
  };
  validate('DraftCheckResult', result);
  return result;
}
