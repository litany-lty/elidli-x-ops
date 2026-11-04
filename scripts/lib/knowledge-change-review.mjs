import { canonicalHash, ContractError } from './contracts.mjs';

const fail = message => { throw new ContractError('MISSING_EVIDENCE', '/change_review', message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const hash = value => /^[a-f0-9]{64}$/u.test(value ?? '');

/** A review closes a public diff, not missing production inputs or a whole repository. */
export function validateKnowledgeChangeReview(review, { base, target, check } = {}) {
  if (!review) return null;
  const { content_hash, ...content } = review;
  if (canonicalHash(content) !== content_hash || review.version !== 1 || review.scope !== 'public_changed_paths') fail('Changed-path review is not an immutable public-diff review');
  if (base && review.base_commit !== base || target && review.target_commit !== target) fail('Changed-path review identifies a different source range');
  if (!Array.isArray(review.entries) || !Array.isArray(review.limitations) || !review.limitations.length) fail('Changed-path review requires entries and explicit limits');
  const paths = new Set();
  for (const entry of review.entries) {
    if (!text(entry.path) || paths.has(entry.path) || !['A', 'D', 'M', 'T'].includes(entry.change)) fail('Duplicate or invalid reviewed path');
    paths.add(entry.path);
    if (entry.review_status !== 'reviewed_public_diff' || !['bounded_known_behavior', 'no_operational_effect', 'blocked'].includes(entry.operational_disposition)) fail(`Missing semantic disposition: ${entry.path}`);
    if (!text(entry.summary) || !text(entry.impact) || !Array.isArray(entry.rule_refs) || !Array.isArray(entry.unknowns) || !entry.evidence?.length) fail(`Missing semantic evidence: ${entry.path}`);
    if (!hash(entry.patch_sha256) || (entry.change === 'A' ? entry.before_sha256 !== null : !hash(entry.before_sha256)) || (entry.change === 'D' ? entry.after_sha256 !== null : !hash(entry.after_sha256))) fail(`Missing before/after source pins: ${entry.path}`);
    for (const ref of entry.evidence) if (!text(ref.path) || ![review.base_commit, review.target_commit].includes(ref.commit) || !Number.isInteger(ref.line_start) || ref.line_start < 1 || !Number.isInteger(ref.line_end) || ref.line_end < ref.line_start || !text(ref.reason)) fail(`Invalid evidence locator: ${entry.path}`);
  }
  if (check) {
    if (check.inventory_scope !== 'full_repository' || !Array.isArray(check.repository_diff) || check.prior_head !== review.base_commit || check.observed_head !== review.target_commit) fail('Changed-path review needs the exact full source inventory');
    if (check.repository_diff.length !== paths.size || check.repository_diff.some(item => !paths.has(item.path))) fail('Changed-path review does not cover the exact full diff');
    for (const entry of review.entries) {
      const change = check.repository_diff.find(item => item.path === entry.path), source = check.files.find(item => item.path === entry.path);
      if (change.change !== entry.change || !source || source.commit !== review.target_commit || source.sha256 !== entry.after_sha256 || source.status !== (entry.change === 'D' ? 'deleted' : 'present')) fail(`Changed-path review does not match checked source: ${entry.path}`);
    }
  }
  return review;
}

export function reviewedChangedPaths(bundle, check) {
  const review = validateKnowledgeChangeReview(bundle.catalog?.change_review, { target: bundle.catalog?.upstream?.commit, check });
  return new Set((review?.entries ?? []).filter(entry => entry.operational_disposition !== 'blocked').map(entry => entry.path));
}
