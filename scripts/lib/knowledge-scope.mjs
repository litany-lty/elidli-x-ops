import { ContractError } from './contracts.mjs';
import { SIGNAL_DEFINITIONS_V5 } from './signals.mjs';

/** Follow registered dependencies without treating missing private descriptions as evidence. */
export function ruleDependencyClosure(rule, bundle) {
  const byId = new Map(bundle.dependencies.map(item => [item.dependency_id, item]));
  const ids = new Set(), unresolved = new Set(), visiting = new Set();
  const visit = id => {
    if (visiting.has(id)) { unresolved.add(`cycle:${id}`); return; }
    if (ids.has(id)) return;
    const dep = byId.get(id);
    if (!dep) { unresolved.add(id); return; }
    ids.add(id); visiting.add(id);
    if (dep.source_visibility !== 'public' || dep.wiring_status !== 'wired_reviewed') unresolved.add(id);
    for (const child of dep.missing_dependencies ?? []) visit(child);
    visiting.delete(id);
  };
  for (const id of rule.dependency_ids) visit(id);
  return { dependency_ids: [...ids].sort(), unresolved_dependencies: [...unresolved].sort() };
}

export function ruleExecutionScope(rule, bundle) {
  return rule.execution_scope === 'editorial_only' || bundle.catalog.execution_scope === 'editorial_only' ? 'editorial_only' : 'mechanism_and_editorial';
}

/** Editorial release is an explicit limited capability, never a private-mechanism waiver. */
export function validateEditorialScope(bundle, { requireExplicitRules = false } = {}) {
  if (bundle.catalog.execution_scope !== 'editorial_only') return;
  for (const rule of Object.values(bundle.rules)) {
    if (requireExplicitRules && (rule.execution_scope !== 'editorial_only' || rule.origin !== 'editorial_practice' || rule.missing_policy !== 'editorial_only')) throw new ContractError('MISSING_EVIDENCE', '/execution_scope', 'Editorial activation requires explicitly editorial rules and origin');
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      const signal = typeof node.exists === 'string' ? node.exists : node.signal;
      if (signal) {
        const definition = SIGNAL_DEFINITIONS_V5[signal], registered = bundle.signal_registry?.[signal];
        if (!definition || !registered || definition.type !== registered.type || definition.unit !== registered.unit) throw new ContractError('MISSING_EVIDENCE', '/execution_scope', `Editorial signal lacks an actual V5 extractor: ${signal}`);
      }
      for (const value of Object.values(node)) if (value && typeof value === 'object') visit(value);
    };
    visit(rule.editorial_predicate);
  }
}
