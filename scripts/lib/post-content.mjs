import { canonicalHash, ContractError } from './contracts.mjs';

const fail = (code, path, message) => { throw new ContractError(code, path, message, false); };
const values = value => Array.isArray(value) ? value : Object.values(value ?? {});
const idOf = version => version.post_version_id ?? version.version_id ?? version.post_version_ref;

function textOf(version) {
  if (typeof version.text === 'string') return version.text;
  if (typeof version.content === 'string') return version.content;
  if (Array.isArray(version.texts)) return version.texts.join('\n');
  return '';
}

export function contentFingerprint(version, postVersions = []) {
  const text = textOf(version);
  const contentHash = version.content_hash ?? canonicalHash(text);
  const contexts = [version.parent_post_key ?? version.parent_ref, version.quoted_post_key ?? version.quote_ref, version.thread_root_key ?? version.thread_ref].filter(Boolean);
  const contextMaterials = values(postVersions).filter(item => contexts.includes(item.post_key)).map(item => ({ post_key: item.post_key, post_version_id: idOf(item), content_hash: item.content_hash ?? canonicalHash(textOf(item)) })).sort((a, b) => `${a.post_key}:${a.post_version_id}`.localeCompare(`${b.post_key}:${b.post_version_id}`));
  const contextHash = version.context_hash ?? canonicalHash({
    parent: version.parent_post_key ?? version.parent_ref ?? null,
    quote: version.quoted_post_key ?? version.quote_ref ?? null,
    thread: version.thread_root_key ?? version.thread_ref ?? version.thread_root_id ?? null,
    media: version.media_refs ?? [],
    linked_source: version.linked_source_refs ?? [],
    coverage: version.context_coverage ?? version.completeness ?? null,
    source: { source_ref: version.source_ref ?? null, source_locator: version.source_locator ?? null },
    context_materials: contextMaterials,
    declared_material_hashes: version.context_material_hashes ?? {}
  });
  return { content_hash: contentHash, context_hash: contextHash };
}

export function prepareContentAnalysis(postVersions, context = {}, priorAnalyses = {}) {
  const versions = values(postVersions);
  const prior = values(priorAnalyses);
  const requested = new Set(context.requested_post_version_refs ?? versions.map(idOf));
  const maxItems = context.max_items ?? versions.length;
  if (!Number.isSafeInteger(maxItems) || maxItems < 0) fail('INVALID_INPUT', '/max_items', 'max_items must be a non-negative integer');
  const analysisVersion = context.analysis_version;
  if (!analysisVersion) fail('INVALID_INPUT', '/analysis_version', 'analysis_version is required');

  const work = [];
  const reused = [];
  const missing = [];
  for (const ref of requested) {
    const version = versions.find(item => idOf(item) === ref);
    if (!version) { missing.push(ref); continue; }
    const fingerprint = contentFingerprint(version, versions);
    const current = prior.find(item => item.post_version_ref === ref && item.content_hash === fingerprint.content_hash &&
      item.context_hash === fingerprint.context_hash && item.analysis_version === analysisVersion);
    if (current) { reused.push(current.analysis_id); continue; }
    work.push({
      work_item_id: `content-work-${canonicalHash({ ref, ...fingerprint, analysisVersion }).slice(0, 24)}`,
      post_key: version.post_key,
      post_version_ref: ref,
      content_hash: fingerprint.content_hash,
      context_hash: fingerprint.context_hash,
      actual_material_refs: [...new Set([version.source_ref, ...(version.evidence_refs ?? version.source_refs ?? [])].filter(Boolean))],
      context_coverage: structuredClone(version.context_coverage ?? null)
    });
  }
  const selected = work.slice(0, maxItems);
  const unread = [...missing, ...work.slice(maxItems).map(item => item.post_version_ref)];
  return {
    work_items: selected,
    reused_analysis_refs: reused,
    unread_post_version_refs: unread,
    coverage: { requested_n: requested.size, reusable_n: reused.length, selected_n: selected.length, unread_n: unread.length }
  };
}

function materialIndex(actualMaterials) {
  if (actualMaterials?.post_versions) return new Map(values(actualMaterials.post_versions).map(item => [idOf(item), item]));
  return new Map(values(actualMaterials).map(item => [idOf(item), item]));
}

function checkSpan(span, text, path) {
  if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end <= span.start || span.end > text.length) {
    fail('INVALID_EVIDENCE_REF', path, 'Text span is outside the actual post text');
  }
  if (text.slice(span.start, span.end) !== span.text) fail('INVALID_EVIDENCE_REF', path, 'Quoted text does not match the actual post text');
}

export function validateContentAnalysis(proposal, actualMaterials, semanticReceipt = null) {
  if (!proposal || proposal.contract_version !== 2) fail('INVALID_INPUT', '/contract_version', 'Post content analysis requires contract_version 2');
  const version = materialIndex(actualMaterials).get(proposal.post_version_ref);
  if (!version) fail('MISSING_EVIDENCE', '/post_version_ref', 'The analyzed post version is not available');
  const fingerprint = contentFingerprint(version, actualMaterials?.post_versions ?? actualMaterials);
  if (proposal.post_key !== version.post_key || proposal.content_hash !== fingerprint.content_hash || proposal.context_hash !== fingerprint.context_hash) {
    fail('STALE_BUNDLE', '/content_hash', 'The analysis is not bound to the current text and context');
  }
  const text = textOf(version);
  if (version.context_coverage?.full_text === false && proposal.context_coverage.full_text === true) {
    fail('INVALID_EVIDENCE_REF', '/context_coverage/full_text', 'Analysis cannot claim truncated text is complete');
  }
  for (const field of ['parent', 'quote', 'thread', 'media', 'linked_source']) {
    if (version.context_coverage?.[field] === false && proposal.context_coverage[field] === 'seen') {
      fail('INVALID_EVIDENCE_REF', `/context_coverage/${field}`, `Analysis cannot claim unseen ${field} context was read`);
    }
  }
  checkSpan(proposal.hook.exact_span, text, '/hook/exact_span');
  proposal.feature_evidence_spans.forEach((span, index) => checkSpan(span, text, `/feature_evidence_spans/${index}`));
  for (const item of proposal.delivery_evidence) checkSpan(item.span, text, '/delivery_evidence/span');
  const receipt = semanticReceipt ?? actualMaterials.content_review_receipts?.[proposal.semantic_review_receipt_ref];
  if (!receipt || receipt.review_id !== proposal.semantic_review_receipt_ref || receipt.post_version_ref !== proposal.post_version_ref || receipt.content_hash !== proposal.content_hash || receipt.context_hash !== proposal.context_hash || receipt.analysis_version !== proposal.analysis_version || !receipt.reviewer || !receipt.reviewed_at || receipt.decision !== 'approved') {
    fail('MISSING_EVIDENCE', '/semantic_review_receipt_ref', 'An approved content review bound to the exact text, context and analysis version is required');
  }
  if (!proposal.context_coverage.full_text && !proposal.uncertainties.some(item => /截断|truncat|全文|full text/i.test(item))) {
    fail('INVALID_INPUT', '/uncertainties', 'Truncated text must remain an explicit uncertainty');
  }
  for (const field of ['parent', 'quote', 'thread', 'media', 'linked_source']) {
    if (proposal.context_coverage[field] === 'not_seen' && !proposal.uncertainties.length) {
      fail('INVALID_INPUT', '/uncertainties', `Unseen ${field} context must remain explicit`);
    }
  }
  return structuredClone(proposal);
}

export function isContentAnalysisCurrent(analysis, version, analysisVersion = analysis.analysis_version, postVersions = [version]) {
  const fingerprint = contentFingerprint(version, postVersions);
  return analysis.analysis_version === analysisVersion && analysis.post_version_ref === idOf(version) &&
    analysis.content_hash === fingerprint.content_hash && analysis.context_hash === fingerprint.context_hash;
}
