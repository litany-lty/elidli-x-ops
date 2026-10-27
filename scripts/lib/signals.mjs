import { canonicalHash, ContractError } from './contracts.mjs';

const fail = (path, message, code = 'INVALID_INPUT') => { throw new ContractError(code, path, message); };
const instant = (value, path = '/cutoff') => {
  const time = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(time.getTime())) fail(path, 'Expected a valid instant');
  return time.toISOString();
};

export const SIGNAL_DEFINITIONS_V5 = Object.freeze({
  has_body: { type: 'boolean', unit: 'flag', kind: 'deterministic' },
  text_length_chars: { type: 'number', unit: 'characters', kind: 'deterministic' },
  newline_count: { type: 'number', unit: 'count', kind: 'deterministic' },
  has_link: { type: 'boolean', unit: 'flag', kind: 'deterministic' },
  media_count: { type: 'number', unit: 'count', kind: 'deterministic' },
  media_types: { type: 'string', unit: 'category_list', kind: 'deterministic' },
  post_type: { type: 'string', unit: 'category', kind: 'deterministic' },
  is_reply: { type: 'boolean', unit: 'flag', kind: 'deterministic' },
  published_at_verified: { type: 'boolean', unit: 'flag', kind: 'deterministic' },
  reader_benefit_clear: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  opening_promise_present: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  promise_fulfilled: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  goal_reach_new_readers: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  depends_on_prior_context: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  reusable_information: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  information_scattered: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  critical_assets_ready: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  actual_warning_present: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  wants_visuals: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  visual_fit: { type: 'string', unit: 'category', kind: 'semantic' },
  opening_delivers: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  depends_on_parent: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  substantive_repeat: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  factual_sensitivity: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  evidence_strength: { type: 'string', unit: 'category', kind: 'semantic' },
  reader_task: { type: 'string', unit: 'category', kind: 'semantic' },
  comparison_would_help: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  process_would_help: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  reusable_information_present: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  historical_addition_clear: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  time_context_clear: { type: 'boolean', unit: 'flag', kind: 'semantic' },
  visible_warning_present: { type: 'boolean', unit: 'flag', kind: 'semantic' }
});

function descriptor(subject) {
  if (!subject || typeof subject !== 'object' || !subject.ref || !subject.content_hash) fail('/subject', 'Resolved subject descriptor requires ref and content_hash', 'MISSING_EVIDENCE');
  if (!Array.isArray(subject.texts) || !['read', 'partial', 'unread'].includes(subject.read_status)) fail('/subject', 'Resolved subject descriptor requires texts and read_status');
  return subject;
}

function makeSample(name, value, { status, basis_kind, source_refs, locator, observed_at, review_refs = [] }) {
  return Object.freeze({ value, unit: SIGNAL_DEFINITIONS_V5[name].unit, status, basis_kind, source_refs: [...source_refs], locator, observed_at, review_refs: [...review_refs] });
}

function assessmentHash(item) {
  return canonicalHash({ assessment_id: item.assessment_id, signal: item.signal, value: item.value, unit: item.unit, subject_ref: item.subject_ref, subject_hash: item.subject_hash, source_refs: item.source_refs, locator: item.locator });
}

function semanticSamples(items, actualReviews, subject, cutoff) {
  const reviews = new Map((Array.isArray(actualReviews) ? actualReviews : Object.values(actualReviews ?? {})).map(item => [item.receipt_id, item])), byName = new Map();
  for (const [index, item] of (items ?? []).entries()) {
    const definition = SIGNAL_DEFINITIONS_V5[item?.signal];
    if (!definition || definition.kind !== 'semantic') fail(`/semantic_evidence/${index}/signal`, 'Unknown semantic signal');
    if (item.subject_ref !== subject.ref || item.subject_hash !== subject.content_hash || item.assessment_hash !== assessmentHash(item)) fail(`/semantic_evidence/${index}`, 'Semantic assessment must bind exact subject and immutable assessment', 'INVALID_EVIDENCE_REF');
    if (item.value === null || typeof item.value !== definition.type || item.unit !== definition.unit) fail(`/semantic_evidence/${index}/value`, 'Semantic value or unit does not match its definition');
    if (item.signal === 'substantive_repeat' && item.value === true && (!Array.isArray(item.source_refs) || !item.source_refs.some(ref => ref !== subject.ref))) fail(`/semantic_evidence/${index}/source_refs`, 'Substantive repeat requires at least one actual history reference', 'MISSING_EVIDENCE');
    const receipt = reviews.get(item.review_receipt_ref);
    if (!receipt || receipt.purpose !== 'review_signals' || receipt.subject_ref !== subject.ref || receipt.subject_hash !== subject.content_hash || receipt.actual_result_hash !== item.assessment_hash || receipt.decision !== 'approved') fail(`/semantic_evidence/${index}/review_receipt_ref`, 'Semantic assessment requires an actual exact host review', 'MISSING_EVIDENCE');
    if (byName.has(item.signal)) fail(`/semantic_evidence/${index}/signal`, 'Duplicate semantic signal');
    byName.set(item.signal, makeSample(item.signal, item.value, { status: 'reviewed', basis_kind: 'semantic_review', source_refs: item.source_refs, locator: item.locator, observed_at: instant(item.reviewed_at ?? receipt.reviewed_at ?? cutoff), review_refs: [receipt.receipt_id] }));
  }
  return byName;
}

export function buildSignalSetV5({ subject: rawSubject, cutoff = new Date(), semantic_evidence = [], actual_reviews = [], selected_evidence_refs = [], extractor_version = 'signal-extractor-v5.1' }) {
  const subject = descriptor(rawSubject), observed_at = instant(cutoff), sourceRefs = [...new Set([subject.ref, ...(subject.source_refs ?? [])])];
  const fullyRead = subject.read_status === 'read' && subject.full_text === true, text = fullyRead ? subject.texts.join('\n') : null;
  const media = Array.isArray(subject.media) ? subject.media : null;
  const deterministic = {
    has_body: text === null ? null : text.trim().length > 0,
    text_length_chars: text === null ? null : [...text].length,
    newline_count: text === null ? null : (text.match(/\n/g) ?? []).length,
    has_link: text === null ? null : /https?:\/\/\S+/iu.test(text),
    media_count: media ? media.length : null,
    media_types: media ? [...new Set(media.map(item => item.mime_type).filter(Boolean))].sort().join(',') : null,
    post_type: subject.post_type ?? null,
    is_reply: subject.post_type === 'unknown' ? null : subject.post_type === 'reply',
    published_at_verified: subject.observed_at ? true : null
  };
  const semantics = semanticSamples(semantic_evidence, actual_reviews, subject, observed_at), signals = {};
  for (const [name, definition] of Object.entries(SIGNAL_DEFINITIONS_V5)) {
    if (definition.kind === 'semantic') {
      signals[name] = semantics.get(name) ?? makeSample(name, null, { status: 'unknown', basis_kind: 'unknown', source_refs: sourceRefs, locator: null, observed_at, review_refs: [] });
    } else {
      const value = deterministic[name];
      signals[name] = makeSample(name, value, { status: value === null ? 'unknown' : 'observed', basis_kind: 'deterministic_extraction', source_refs: sourceRefs, locator: text === null ? null : 'subject.texts', observed_at, review_refs: [] });
    }
  }
  const base = { contract_version: 5, subject_ref: subject.ref, subject_hash: subject.content_hash, cutoff: observed_at, extractor_version, signals, selected_evidence_refs: [...new Set([...selected_evidence_refs, ...semantic_evidence.flatMap(item => item.source_refs ?? [])])].sort() };
  return Object.freeze({ ...base, signal_set_hash: canonicalHash(base) });
}
