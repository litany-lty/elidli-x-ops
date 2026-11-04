import { copyFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeUrl } from './runtime.mjs';

const { loadKnowledgeCatalog } = await import(runtimeUrl('scripts/lib/knowledge.mjs'));
const packageDir = fileURLToPath(runtimeUrl('assets/algorithm-knowledge/'));
const baselinePath = 'source-snapshots/catalogs/operational-baseline-2f252142.json';

// Keep the complete pre-editorial release, including its immutable source bytes,
// signal registry and activation event. Selecting only its old rule IDs from the
// current editorial-only package would not exercise the legacy contract.
export function createLegacyKnowledgePackage(directory) {
  cpSync(packageDir, directory, { recursive: true });
  copyFileSync(join(directory, baselinePath), join(directory, 'catalog.json'));
  return directory;
}

export function loadLegacyKnowledgeCatalog(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'xops-legacy-knowledge-'));
  try {
    return loadKnowledgeCatalog(createLegacyKnowledgePackage(directory), options);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function seedLegacyKnowledgeState(state, bundle = loadLegacyKnowledgeCatalog()) {
  state.knowledge_artifacts = structuredClone({ ...bundle.history.artifacts, ...bundle.artifacts });
  state.rule_versions_v2 = structuredClone({ ...bundle.history.facts, ...bundle.facts });
  state.operational_rules = structuredClone({ ...bundle.history.rules, ...bundle.rules });
  state.knowledge_catalogs = structuredClone({ ...bundle.history.catalogs, [bundle.catalog.catalog_id]: bundle.catalog });
  state.knowledge_events = structuredClone({ ...bundle.history.events, [bundle.event.event_id]: bundle.event });
  return state;
}
