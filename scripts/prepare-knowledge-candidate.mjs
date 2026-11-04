import { cpSync, existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKnowledgeCatalog } from './lib/knowledge.mjs';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../assets/algorithm-knowledge');
const candidatePath = 'source-snapshots/catalogs/candidate-b220448.json';

/** Materialize a reviewable package without changing any account or active catalog. */
export function prepareKnowledgeCandidate(outputDir) {
  const output = resolve(outputDir);
  if (existsSync(output)) throw new Error('Candidate output must be a new directory; existing data will not be overwritten');
  const catalog = JSON.parse(readFileSync(resolve(packageDir, candidatePath), 'utf8'));
  if (catalog.catalog_id !== 'x-algorithm-b220448-operational-candidate-v6') throw new Error('Unexpected candidate catalog');
  mkdirSync(output, { recursive: true });
  cpSync(packageDir, output, { recursive: true });
  copyFileSync(resolve(packageDir, candidatePath), resolve(output, 'catalog.json'));
  const bundle = loadKnowledgeCatalog(output);
  if (bundle.event.event_type === 'activated') throw new Error('This helper only prepares an unactivated candidate');
  return { package_dir: output, catalog_ref: bundle.catalog.catalog_id, catalog_hash: bundle.catalog.catalog_content_hash, status: 'candidate_not_activated' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--output' || !args[1]) throw new Error('Usage: node scripts/prepare-knowledge-candidate.mjs --output <new-directory>');
  console.log(JSON.stringify(prepareKnowledgeCandidate(args[1]), null, 2));
}
