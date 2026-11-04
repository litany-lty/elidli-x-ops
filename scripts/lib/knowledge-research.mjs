import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash, ContractError } from './contracts.mjs';

const defaultPackageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/algorithm-knowledge');
const fail = (path, message) => { throw new ContractError('MISSING_EVIDENCE', path, message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

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
  const sources = new Map();
  for (const source of research.sources) {
    if (sources.has(source.source_id)) fail('/research/sources', 'Duplicate source ID');
    const path = resolve(root, source.material_path), rel = relative(root, path);
    if (isAbsolute(rel) || rel.startsWith('..')) fail('/research/sources', 'Source material escapes the package');
    if (sha256(readFileSync(path)) !== source.material_sha256) fail('/research/sources', `Source material changed: ${source.source_id}`);
    if (source.commit !== research.upstream.commit) fail('/research/sources', 'Source commit differs from research');
    sources.set(source.source_id, source);
  }
  const categories = new Set(['demotion', 'distribution_opportunity', 'account_and_context']);
  const ids = new Set();
  for (const rule of research.rules) {
    if (ids.has(rule.rule_id) || !categories.has(rule.category)) fail('/research/rules', 'Invalid rule ID or category');
    ids.add(rule.rule_id);
    if (!rule.source_refs.length || rule.source_refs.some(ref => !sources.has(ref))) fail('/research/rules', `Missing source for ${rule.rule_id}`);
    if (!rule.preconditions.length || !rule.not_proven.length) fail('/research/rules', `Missing boundaries for ${rule.rule_id}`);
  }
  if (new Set(research.rules.map(rule => rule.category)).size !== categories.size) fail('/research/rules', 'Research must cover all three requested categories');
  return Object.freeze(research);
}
