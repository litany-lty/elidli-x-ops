import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash, ContractError } from './contracts.mjs';
import { validateKnowledgeChangeReview } from './knowledge-change-review.mjs';

const defaultPackageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/algorithm-knowledge');
const fail = (path, message) => { throw new ContractError('MISSING_EVIDENCE', path, message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Read source-reviewed research without pretending it activated the operational catalog. */
export function loadAlgorithmResearch(packageDir = defaultPackageDir, { now = new Date() } = {}) {
  const root = resolve(packageDir);
  const research = JSON.parse(readFileSync(resolve(root, 'research/current.json'), 'utf8'));
  const { content_hash, ...content } = research;
  if (canonicalHash(content) !== content_hash) fail('/research/content_hash', 'Research manifest changed');
  if (research.version !== 1 || research.status !== 'source_reviewed_not_operationally_activated') fail('/research/status', 'Unsupported research status');
  const cutoff = new Date(now).getTime(), checked = Date.parse(research.checked_at);
  if (!Number.isFinite(cutoff) || !Number.isFinite(checked) || checked > cutoff) fail('/research/checked_at', 'Research is not available at this clock');
  if (!/^[a-f0-9]{40}$/.test(research.upstream?.commit ?? '')) fail('/research/upstream', 'Research needs a full source commit');
  if (research.coverage?.scope === 'reviewed_public_diff') {
    const ref = research.coverage.diff_review_ref;
    if (!ref?.path || !ref.content_hash) fail('/research/coverage', 'Completed diff review needs its immutable ledger');
    const path = resolve(root, ref.path), rel = relative(root, path);
    if (isAbsolute(rel) || rel.startsWith('..')) fail('/research/coverage', 'Review ledger escapes the package');
    const ledger = validateKnowledgeChangeReview(JSON.parse(readFileSync(path, 'utf8')), { base: research.operational_baseline?.commit, target: research.upstream.commit });
    if (ledger.content_hash !== ref.content_hash || research.coverage.unreviewed_changed_paths.length || ledger.entries.some(entry => entry.operational_disposition === 'blocked')) fail('/research/coverage', 'Completed diff review differs from its ledger');
  }
  const sources = new Map();
  for (const source of research.sources) {
    if (sources.has(source.source_id)) fail('/research/sources', 'Duplicate source ID');
    const path = resolve(root, source.material_path), rel = relative(root, path);
    if (isAbsolute(rel) || rel.startsWith('..')) fail('/research/sources', 'Source material escapes the package');
    if (sha256(readFileSync(path)) !== source.material_sha256) fail('/research/sources', `Source material changed: ${source.source_id}`);
    if (source.commit !== research.upstream.commit) fail('/research/sources', 'Source commit differs from research');
    sources.set(source.source_id, source);
  }
  // Call-site overrides and required inputs are evidence, not production observations.
  // Keep their references explicit so a service default cannot silently replace them.
  const bindings = new Map();
  if (research.research_revision) {
    if (!Array.isArray(research.runtime_bindings) || !research.runtime_bindings.length) fail('/research/runtime_bindings', 'Crosschecked research needs runtime bindings');
    if (!/^[a-f0-9]{64}$/.test(research.supersedes_content_hash ?? '')) fail('/research/supersedes_content_hash', 'Crosschecked research must preserve its previous version');
    const prior = JSON.parse(readFileSync(resolve(root, 'research/history', `${research.supersedes_content_hash}.json`), 'utf8'));
    const { content_hash: priorHash, ...priorContent } = prior;
    if (priorHash !== research.supersedes_content_hash || canonicalHash(priorContent) !== priorHash) fail('/research/supersedes_content_hash', 'Previous research manifest changed');
  }
  for (const binding of research.runtime_bindings ?? []) {
    if (!['binding_id', 'component', 'caller', 'effective_condition'].every(key => nonempty(binding[key])) || bindings.has(binding.binding_id)) fail('/research/runtime_bindings', 'Invalid or duplicate runtime binding');
    if (!object(binding.declared_defaults) || !object(binding.request_fields) || binding.production_status !== 'unknown') fail('/research/runtime_bindings', 'Runtime binding must distinguish defaults, request fields and unknown production status');
    if (!Array.isArray(binding.source_refs) || !binding.source_refs.length || binding.source_refs.some(ref => !sources.has(ref))) fail('/research/runtime_bindings', `Missing source for ${binding.binding_id}`);
    bindings.set(binding.binding_id, binding);
  }
  const categories = new Set(['demotion', 'distribution_opportunity', 'account_and_context']);
  const ids = new Set();
  for (const rule of research.rules) {
    if (ids.has(rule.rule_id) || !categories.has(rule.category)) fail('/research/rules', 'Invalid rule ID or category');
    ids.add(rule.rule_id);
    if (!rule.source_refs.length || rule.source_refs.some(ref => !sources.has(ref))) fail('/research/rules', `Missing source for ${rule.rule_id}`);
    if (!rule.preconditions.length || !rule.not_proven.length) fail('/research/rules', `Missing boundaries for ${rule.rule_id}`);
    if ((research.research_revision && !Array.isArray(rule.runtime_binding_refs)) || (rule.runtime_binding_refs ?? []).some(ref => !bindings.has(ref))) fail('/research/rules', `Missing runtime binding for ${rule.rule_id}`);
  }
  if (new Set(research.rules.map(rule => rule.category)).size !== categories.size) fail('/research/rules', 'Research must cover all three requested categories');
  return Object.freeze(research);
}
