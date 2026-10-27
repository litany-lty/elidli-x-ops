import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalHash, ContractError } from './contracts.mjs';
export { buildSignalSetV5, SIGNAL_DEFINITIONS_V5 } from './signals.mjs';
export { inspectKnowledgeCheckoutV5, dependencyDiffV5, computeKnowledgeImpactV5, proposeKnowledgeUpdateV5, knowledgeReplayResultHashV5, activateKnowledgeUpdateV5 } from './knowledge-updates.mjs';

export const KNOWLEDGE_COLLECTIONS = Object.freeze([
  'knowledge_artifacts', 'knowledge_catalogs', 'knowledge_events',
  'operational_rules', 'rule_contexts', 'rule_applications'
]);
export const TRI = Object.freeze({ TRUE: 'applicable', FALSE: 'not_applicable', UNKNOWN: 'unknown' });

const OPS = new Set(['all', 'any', 'not', 'eq', 'in', 'lt', 'lte', 'gt', 'gte', 'exists']);
const defaultPackageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../assets/algorithm-knowledge');
const fail = (path, message, code = 'INVALID_INPUT') => { throw new ContractError(code, path, message); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function packagePath(root, path, label) {
  const absolute = resolve(root, path), rel = relative(root, absolute);
  if (isAbsolute(rel) || rel.startsWith('..')) fail(label, 'Knowledge path escapes the installed package');
  return absolute;
}

function readCatalogFile(root, entry) {
  const bytes = readFileSync(packagePath(root, entry.path, `/files/${entry.path}`));
  if (sha256(bytes) !== entry.sha256) fail(`/files/${entry.path}/sha256`, 'Installed knowledge bytes differ from the immutable catalog', 'MISSING_EVIDENCE');
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { fail(`/files/${entry.path}`, 'Installed knowledge JSON is unreadable', 'MISSING_EVIDENCE'); }
}

function knowledgeTimeReadiness({ catalog, event, artifacts, facts }, now = new Date()) {
  const cutoff = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(cutoff)) fail('/now', 'Knowledge clock must be a valid instant');
  const issues = [];
  const check = (path, value) => {
    const instant = Date.parse(value);
    if (!Number.isFinite(instant)) fail(path, 'Knowledge evidence time must be a valid instant', 'MISSING_EVIDENCE');
    if (instant > cutoff) issues.push(Object.freeze({ path, value, code: 'FUTURE_EVIDENCE' }));
  };
  check('/catalog/created_at', catalog.created_at);
  check('/event/checked_at', event.checked_at);
  for (const fact of Object.values(facts)) {
    check(`/facts/${fact.rule_version_id}/checked_at`, fact.checked_at);
    const artifact = artifacts[fact.source_material_ref];
    if (artifact) check(`/artifacts/${artifact.artifact_id}/checked_at`, artifact.checked_at);
  }
  return Object.freeze({ status: issues.length ? 'not_ready' : 'ready', checked_at: new Date(cutoff).toISOString(), issues: Object.freeze(issues) });
}

export function catalogContentHash(catalog, dependencies = catalog.dependencies) {
  const files = catalog.content_hash_policy === 'exclude-lifecycle-v1'
    ? catalog.files.filter(entry => !['knowledge_event', 'historical_catalog', 'review_receipt'].includes(entry.kind))
    : catalog.files;
  const content = {
    contract_version: catalog.contract_version,
    catalog_version: catalog.catalog_version,
    upstream: catalog.upstream,
    files: files.map(({ path, sha256: hash, kind }) => ({ path, sha256: hash, kind })).sort((a, b) => a.path.localeCompare(b.path)),
    artifact_refs: [...catalog.artifact_refs].sort(),
    fact_version_refs: [...catalog.fact_version_refs].sort(),
    rule_version_refs: [...catalog.rule_version_refs].sort(),
    dependencies: [...dependencies].sort((a, b) => a.dependency_id.localeCompare(b.dependency_id)),
    coverage: catalog.coverage
  };
  if (catalog.content_hash_policy) content.content_hash_policy = catalog.content_hash_policy;
  return canonicalHash(content);
}

export function validateKnowledgeBundleIntegrity({ catalog, dependencies = catalog.dependencies, artifacts, facts, rules }) {
  const dependencyIds = new Set(dependencies.map(dependency => dependency.dependency_id));
  if (dependencyIds.size !== dependencies.length) fail('/catalog/dependencies', 'Knowledge catalog contains duplicate dependency IDs', 'RECEIPT_CONFLICT');
  for (const ref of catalog.artifact_refs) if (!artifacts[ref]) fail('/catalog/artifact_refs', `Knowledge artifact is missing: ${ref}`, 'MISSING_EVIDENCE');
  for (const ref of catalog.fact_version_refs) {
    const fact = facts[ref], artifact = fact && artifacts[fact.source_material_ref];
    if (!fact || !artifact || fact.source_content_hash !== artifact.artifact_content_hash) fail('/catalog/fact_version_refs', `Knowledge fact material is missing or changed: ${ref}`, 'MISSING_EVIDENCE');
  }
  for (const ref of catalog.rule_version_refs) {
    const rule = rules[ref];
    if (!rule) fail('/catalog/rule_version_refs', `Knowledge operational rule is missing: ${ref}`, 'MISSING_EVIDENCE');
    for (const factRef of rule.fact_version_refs) if (!facts[factRef]) fail(`/rules/${ref}/fact_version_refs`, `Rule references an inactive fact: ${factRef}`, 'INVALID_EVIDENCE_REF');
    for (const dependencyId of rule.dependency_ids) if (!dependencyIds.has(dependencyId)) fail(`/rules/${ref}/dependency_ids`, `Rule references an unsupported dependency: ${dependencyId}`, 'INVALID_EVIDENCE_REF');
  }
  return true;
}

export function loadKnowledgeCatalog(packageDir = defaultPackageDir, { now = new Date(), allowFutureForErrata = false } = {}) {
  const root = resolve(packageDir);
  let catalog;
  try { catalog = JSON.parse(readFileSync(resolve(root, 'catalog.json'), 'utf8')); }
  catch { fail('/catalog', 'Knowledge catalog is missing or unreadable', 'MISSING_EVIDENCE'); }
  if (catalog.contract_version !== 4) fail('/catalog/contract_version', 'Knowledge catalog must use contract version 4', 'SCHEMA_VERSION');
  const parsed = new Map(catalog.files.map(entry => [entry.path, readCatalogFile(root, entry)]));
  const artifactManifest = parsed.get(catalog.artifact_manifest_path);
  const artifacts = Object.fromEntries((artifactManifest?.artifacts ?? []).map(artifact => {
    const bytes = readFileSync(packagePath(root, artifact.material_path, `/artifacts/${artifact.artifact_id}/material_path`));
    if (sha256(bytes) !== artifact.artifact_content_hash) fail(`/artifacts/${artifact.artifact_id}/artifact_content_hash`, 'Packaged source material hash mismatch', 'MISSING_EVIDENCE');
    return [artifact.artifact_id, Object.freeze({ ...artifact })];
  }));
  const activeFacts = new Set(catalog.fact_version_refs), activeRules = new Set(catalog.rule_version_refs);
  const factItems = catalog.files.filter(entry => entry.kind === 'fact').map(entry => parsed.get(entry.path));
  const facts = Object.fromEntries(factItems.filter(item => activeFacts.has(item.rule_version_id)).map(item => [item.rule_version_id, Object.freeze(item)]));
  const historicalFacts = Object.fromEntries(factItems.filter(item => !activeFacts.has(item.rule_version_id) && Object.values(facts).some(active => active.supersedes === item.rule_version_id)).map(item => [item.rule_version_id, Object.freeze(item)]));
  const ruleItems = catalog.files.filter(entry => entry.kind === 'operational_rule').map(entry => parsed.get(entry.path));
  const rules = Object.fromEntries(ruleItems.filter(item => activeRules.has(item.rule_version_id)).map(item => [item.rule_version_id, Object.freeze(item)]));
  const historicalRules = Object.fromEntries(ruleItems.filter(item => !activeRules.has(item.rule_version_id) && Object.values(rules).some(active => active.rule_id === item.rule_id)).map(item => [item.rule_version_id, Object.freeze(item)]));
  const dependencyDoc = parsed.get(catalog.dependency_manifest_path);
  if (!dependencyDoc || canonicalHash(dependencyDoc.dependencies) !== catalog.dependency_manifest_hash) fail('/dependency_manifest_hash', 'Dependency manifest differs from catalog', 'MISSING_EVIDENCE');
  if (!Array.isArray(catalog.dependencies) || canonicalHash(catalog.dependencies) !== canonicalHash(dependencyDoc.dependencies)) fail('/catalog/dependencies', 'Catalog does not embed the exact immutable dependency snapshot', 'MISSING_EVIDENCE');
  for (const dependency of dependencyDoc.dependencies) {
    if (dependency.evidence_material_path === null) {
      if (dependency.source_visibility !== 'external_unpublished' || dependency.evidence_content_hash !== null) fail(`/dependencies/${dependency.dependency_id}`, 'Only external unpublished dependencies may omit review evidence', 'MISSING_EVIDENCE');
      continue;
    }
    const bytes = readFileSync(packagePath(root, dependency.evidence_material_path, `/dependencies/${dependency.dependency_id}/evidence_material_path`));
    if (sha256(bytes) !== dependency.evidence_content_hash) fail(`/dependencies/${dependency.dependency_id}/evidence_content_hash`, 'Dependency review evidence bytes changed', 'MISSING_EVIDENCE');
  }
  if (catalogContentHash(catalog, dependencyDoc.dependencies) !== catalog.catalog_content_hash) fail('/catalog_content_hash', 'Knowledge catalog content hash mismatch', 'MISSING_EVIDENCE');
  validateKnowledgeBundleIntegrity({ catalog, dependencies: dependencyDoc.dependencies, artifacts, facts, rules });
  let event = parsed.get(catalog.activation_event_path);
  if (!event) {
    try { event = JSON.parse(readFileSync(packagePath(root, catalog.activation_event_path, '/activation_event_path'), 'utf8')); }
    catch { fail('/activation_event_path', 'Knowledge lifecycle event is missing or unreadable', 'MISSING_EVIDENCE'); }
  }
  if (event.catalog_ref !== catalog.catalog_id) fail('/activation_event_path/catalog_ref', 'Lifecycle event references another catalog', 'RECEIPT_CONFLICT');
  const temporal_readiness = knowledgeTimeReadiness({ catalog, event, artifacts, facts }, now);
  if (temporal_readiness.status !== 'ready' && !allowFutureForErrata) fail(temporal_readiness.issues[0].path, 'Active knowledge contains evidence dated after the actual clock', 'MISSING_EVIDENCE');
  const historicalArtifacts = Object.fromEntries(Object.values(historicalFacts).map(fact => [fact.source_material_ref, artifacts[fact.source_material_ref]]).filter(([, artifact]) => artifact));
  const historicalCatalogs = Object.fromEntries(catalog.files.filter(entry => entry.kind === 'historical_catalog').map(entry => parsed.get(entry.path)).map(item => [item.catalog_id, Object.freeze(item)]));
  const history = Object.freeze({ artifacts: Object.freeze(historicalArtifacts), facts: Object.freeze(historicalFacts), rules: Object.freeze(historicalRules), catalogs: Object.freeze(historicalCatalogs) });
  return Object.freeze({ catalog: Object.freeze(catalog), event: Object.freeze(event), artifacts: Object.freeze(artifacts), facts: Object.freeze(facts), rules: Object.freeze(rules), history, dependencies: Object.freeze(dependencyDoc.dependencies), signal_registry: Object.freeze(catalog.signal_registry), temporal_readiness });
}

export function knowledgeBundleFromState(state, { now = new Date() } = {}) {
  if (![4, 5].includes(state?.schema_version)) fail('/schema_version', 'Active knowledge requires state version 4 or 5', 'SCHEMA_VERSION');
  for (const key of ['knowledge_artifacts','knowledge_catalogs','knowledge_events','operational_rules','rule_versions_v2']) if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) fail(`/${key}`, `State knowledge collection is missing: ${key}`, 'MISSING_EVIDENCE');
  const events = Object.values(state.knowledge_events);
  const activations = events.filter(event => event.event_type === 'activated');
  const retired = new Set(events.filter(event => event.event_type === 'retired').map(event => event.catalog_ref));
  const superseded = new Set(activations.map(event => event.prior_catalog_ref).filter(Boolean));
  const activeEvents = activations.filter(event => !retired.has(event.catalog_ref) && !superseded.has(event.catalog_ref));
  if (activeEvents.length !== 1) fail('/knowledge_events', `Expected one active catalog event, found ${activeEvents.length}`, 'STATE_CONFLICT');
  const event = activeEvents[0], catalog = state.knowledge_catalogs[event.catalog_ref];
  if (!catalog) fail('/knowledge_events/catalog_ref', 'Active event references a missing catalog', 'MISSING_EVIDENCE');
  if (event.observed_head_commit !== catalog.upstream.commit) fail('/knowledge_events/observed_head_commit', 'Active event and catalog identify different upstream commits', 'RECEIPT_CONFLICT');
  if (!Array.isArray(catalog.dependencies)) fail('/knowledge_catalogs/dependencies', 'Active catalog lacks its immutable dependency snapshot', 'MISSING_EVIDENCE');
  if (canonicalHash(catalog.dependencies) !== catalog.dependency_manifest_hash) fail('/knowledge_catalogs/dependency_manifest_hash', 'Active dependency snapshot hash mismatch', 'RECEIPT_CONFLICT');
  if (catalogContentHash(catalog, catalog.dependencies) !== catalog.catalog_content_hash) fail('/knowledge_catalogs/catalog_content_hash', 'Active catalog content hash mismatch', 'RECEIPT_CONFLICT');
  const dependencies = Object.fromEntries(catalog.dependencies.map(dependency => [dependency.dependency_id, dependency]));
  for (const dependency of catalog.dependencies) {
    const hashOk = dependency.material_hash === null || /^[a-f0-9]{64}$/.test(dependency.material_hash);
    const evidenceOk = dependency.evidence_content_hash === null || /^[a-f0-9]{64}$/.test(dependency.evidence_content_hash);
    if (!hashOk || !evidenceOk || (dependency.source_visibility === 'external_unpublished') !== (dependency.material_hash === null && dependency.evidence_content_hash === null)) fail(`/knowledge_catalogs/dependencies/${dependency.dependency_id}`, 'Active dependency has unsupported material/evidence hashes', 'MISSING_EVIDENCE');
  }
  for (const gap of event.gaps) if (!dependencies[gap]) fail('/knowledge_events/gaps', `Active event names an unsupported gap: ${gap}`, 'MISSING_EVIDENCE');
  const artifacts = {}, facts = {}, rules = {};
  for (const ref of catalog.artifact_refs) {
    const artifact = state.knowledge_artifacts[ref];
    if (!artifact) fail('/knowledge_catalogs/artifact_refs', `Active artifact is missing: ${ref}`, 'MISSING_EVIDENCE');
    artifacts[ref] = artifact;
  }
  for (const ref of catalog.fact_version_refs) {
    const fact = state.rule_versions_v2[ref], artifact = fact && artifacts[fact.source_material_ref];
    if (!fact || !artifact || fact.source_content_hash !== artifact.artifact_content_hash) fail('/knowledge_catalogs/fact_version_refs', `Active fact material is missing or changed: ${ref}`, 'MISSING_EVIDENCE');
    facts[ref] = fact;
  }
  for (const ref of catalog.rule_version_refs) {
    const rule = state.operational_rules[ref];
    if (rule) rules[ref] = rule;
  }
  validateKnowledgeBundleIntegrity({ catalog, dependencies: catalog.dependencies, artifacts, facts, rules });
  const temporal_readiness = knowledgeTimeReadiness({ catalog, event, artifacts, facts }, now);
  return Object.freeze({catalog:Object.freeze(catalog),event:Object.freeze(event),artifacts:Object.freeze(artifacts),facts:Object.freeze(facts),rules:Object.freeze(rules),dependencies:Object.freeze(catalog.dependencies),signal_registry:Object.freeze(catalog.signal_registry),gaps:Object.freeze([...event.gaps]),temporal_readiness});
}

const triNot = value => value === TRI.UNKNOWN ? TRI.UNKNOWN : value === TRI.TRUE ? TRI.FALSE : TRI.TRUE;
const triAll = values => values.includes(TRI.FALSE) ? TRI.FALSE : values.includes(TRI.UNKNOWN) ? TRI.UNKNOWN : TRI.TRUE;
const triAny = values => values.includes(TRI.TRUE) ? TRI.TRUE : values.includes(TRI.UNKNOWN) ? TRI.UNKNOWN : TRI.FALSE;

function readSignal(name, signals, registry, expectedUnit, missing) {
  const definition = registry[name];
  if (!definition) fail('/predicate/signal', `Unregistered signal: ${name}`);
  if (!Object.hasOwn(signals, name) || signals[name] === null) { missing.add(name); return { known: false }; }
  const sample = signals[name];
  if (!sample || typeof sample !== 'object' || !Object.hasOwn(sample, 'value')) fail(`/signals/${name}`, 'Signal must contain value and unit');
  if (sample.unit !== definition.unit || (expectedUnit !== undefined && expectedUnit !== definition.unit)) fail(`/signals/${name}/unit`, `Signal ${name} requires unit ${definition.unit}`);
  if (definition.type === 'number' && (typeof sample.value !== 'number' || !Number.isFinite(sample.value))) fail(`/signals/${name}/value`, 'Expected finite number');
  if (definition.type === 'boolean' && typeof sample.value !== 'boolean') fail(`/signals/${name}/value`, 'Expected boolean');
  if (definition.type === 'string' && typeof sample.value !== 'string') fail(`/signals/${name}/value`, 'Expected string');
  return { known: true, value: sample.value };
}

export function evaluatePredicate(predicate, signals = {}, signalRegistry = {}) {
  const missing = new Set();
  function visit(node, path = '/predicate') {
    if (!node || typeof node !== 'object' || Array.isArray(node)) fail(path, 'Predicate must be an object');
    const keys = Object.keys(node);
    if (keys.length !== 1 || !OPS.has(keys[0])) fail(path, 'Predicate must contain one allowed operator');
    const op = keys[0], operand = node[op];
    if (op === 'all' || op === 'any') {
      if (!Array.isArray(operand) || !operand.length) fail(`${path}/${op}`, `${op} requires a non-empty array`);
      const values = operand.map((item, index) => visit(item, `${path}/${op}/${index}`));
      return op === 'all' ? triAll(values) : triAny(values);
    }
    if (op === 'not') return triNot(visit(operand, `${path}/not`));
    const spec = op === 'exists' && typeof operand === 'string' ? { signal: operand } : operand;
    if (!spec || typeof spec.signal !== 'string') fail(`${path}/${op}`, `${op} requires a signal`);
    const current = readSignal(spec.signal, signals, signalRegistry, spec.unit, missing);
    if (!current.known) return TRI.UNKNOWN;
    if (op === 'exists') return TRI.TRUE;
    if (!Object.hasOwn(spec, 'value')) fail(`${path}/${op}/value`, `${op} requires a value`);
    if (op === 'in') {
      if (!Array.isArray(spec.value)) fail(`${path}/${op}/value`, 'in requires an array');
      return spec.value.includes(current.value) ? TRI.TRUE : TRI.FALSE;
    }
    if (['lt', 'lte', 'gt', 'gte'].includes(op) && (typeof current.value !== 'number' || typeof spec.value !== 'number')) fail(`${path}/${op}`, `${op} requires numeric values`);
    const matched = op === 'eq' ? Object.is(current.value, spec.value) : op === 'lt' ? current.value < spec.value : op === 'lte' ? current.value <= spec.value : op === 'gt' ? current.value > spec.value : current.value >= spec.value;
    return matched ? TRI.TRUE : TRI.FALSE;
  }
  return Object.freeze({ status: visit(predicate), missing_signals: [...missing].sort() });
}

function selectorMatches(rule, input) {
  const dimensions = [['intents', input.intent], ['goals', input.goal?.primary_goal ?? input.goal], ['uses', input.use], ['surfaces', input.surface], ['post_types', input.post_type]];
  return dimensions.every(([key, value]) => rule.applicability[key].includes('*') || (value !== undefined && rule.applicability[key].includes(value)));
}

export function selectOperationalRules(input, bundle) {
  if (!bundle?.rules || !bundle?.dependencies || !bundle?.signal_registry) fail('/catalog', 'A loaded knowledge bundle is required');
  if (bundle.temporal_readiness?.status === 'not_ready') fail('/catalog/temporal_readiness', 'Active knowledge is not eligible because it contains future-dated evidence', 'MISSING_EVIDENCE');
  const explicit = new Set(input.explicit_rule_version_refs ?? []), selected = [], notSelected = [];
  for (const rule of Object.values(bundle.rules).sort((a, b) => a.rule_version_id.localeCompare(b.rule_version_id))) {
    if (explicit.size && !explicit.has(rule.rule_version_id)) { notSelected.push({ rule_version_ref: rule.rule_version_id, reason: 'excluded_by_explicit_constraint' }); continue; }
    if (!selectorMatches(rule, input)) { notSelected.push({ rule_version_ref: rule.rule_version_id, reason: 'scope_mismatch' }); continue; }
    const mechanism = evaluatePredicate(rule.mechanism_predicate, input.signals, bundle.signal_registry);
    const editorial = evaluatePredicate(rule.editorial_predicate, input.signals, bundle.signal_registry);
    if (mechanism.status === TRI.FALSE && editorial.status === TRI.FALSE) { notSelected.push({ rule_version_ref: rule.rule_version_id, reason: 'both_predicates_not_applicable' }); continue; }
    selected.push({ rule_version_ref: rule.rule_version_id, fact_version_refs: [...rule.fact_version_refs], dependency_ids: [...rule.dependency_ids], mechanism_applicability: mechanism, editorial_applicability: editorial });
  }
  return Object.freeze({
    selected,
    not_selected: notSelected,
    missing_signals: [...new Set(selected.flatMap(item => [...item.mechanism_applicability.missing_signals, ...item.editorial_applicability.missing_signals]))].sort()
  });
}

export function ruleContextHash(context) {
  return canonicalHash({
    run_id: context.run_id, intent: context.intent, goal: context.goal, use: context.use,
    subject_ref: context.subject_ref, cutoff: context.cutoff,
    personal_context_selection_hash: context.personal_context_selection_hash,
    evidence_bundle_hash: context.evidence_bundle_hash,
    selected_dependency_hashes:context.selected_dependency_hashes??{},selected_fact_hashes:context.selected_fact_hashes??{},selected_rule_hashes:context.selected_rule_hashes??{},
    selected_signal_values:Object.fromEntries((context.signal_dependencies??[]).map(key=>[key,context.signals?.[key]??null])),
    selections: context.selections.map(item => ({ rule_version_ref: item.rule_version_ref, fact_version_refs: item.fact_version_refs, dependency_ids: item.dependency_ids, mechanism_applicability: item.mechanism_applicability, editorial_applicability: item.editorial_applicability }))
  });
}

export function buildRuleContextV4(input, bundle) {
  const selection = selectOperationalRules(input, bundle);
  const signalDependencies=new Set();
  const scan=value=>{if(!value||typeof value!=='object')return;if(typeof value.signal==='string')signalDependencies.add(value.signal);for(const child of Object.values(value))if(typeof child==='object')scan(child);};
  for(const selected of selection.selected){const rule=bundle.rules[selected.rule_version_ref];scan(rule.mechanism_predicate);scan(rule.editorial_predicate);}
  const context = {
    contract_version: 4,
    signals:structuredClone(input.signals??{}),signal_dependencies:[...signalDependencies].sort(),
    selected_dependency_hashes:Object.fromEntries([...new Set(selection.selected.flatMap(r=>r.dependency_ids))].sort().map(id=>[id,canonicalHash(bundle.dependencies.find(d=>d.dependency_id===id))])),
    selected_fact_hashes:Object.fromEntries([...new Set(selection.selected.flatMap(r=>r.fact_version_refs))].sort().map(id=>[id,canonicalHash(bundle.facts[id])])),
    selected_rule_hashes:Object.fromEntries(selection.selected.map(r=>[r.rule_version_ref,canonicalHash(bundle.rules[r.rule_version_ref])])),
    context_id: input.context_id ?? `rule-context-${canonicalHash({ run_id: input.run_id, subject_ref: input.subject_ref, cutoff: input.cutoff }).slice(0, 24)}`,
    run_id: input.run_id,
    intent: input.intent,
    goal: structuredClone(input.goal),
    use: input.use,
    surface: input.surface ?? null,
    post_type: input.post_type ?? null,
    subject_ref: input.subject_ref,
    cutoff: input.cutoff,
    catalog_ref: bundle.catalog.catalog_id,
    catalog_content_hash: bundle.catalog.catalog_content_hash,
    personal_context_selection: structuredClone(input.personal_context_selection??null),
    personal_context_selection_ref: input.personal_context_selection_ref ?? null,
    personal_context_selection_hash: input.personal_context_selection_hash ?? null,
    personal_context_absence_reason: input.personal_context_selection_hash ? null : (input.personal_context_absence_reason ?? 'not_used'),
    evidence_bundle_ref: input.evidence_bundle_ref ?? null,
    evidence_bundle_hash: input.evidence_bundle_hash ?? null,
    explicit_rule_version_refs: [...(input.explicit_rule_version_refs ?? [])].sort(),
    selections: selection.selected,
    not_selected: selection.not_selected,
    missing_signals: selection.missing_signals
  };
  return Object.freeze({ ...context, selected_rule_context_hash: ruleContextHash(context) });
}

export function buildRuleContextV5(input, bundle) {
  const signalSet = input.signal_set;
  if (!signalSet || signalSet.contract_version !== 5 || signalSet.subject_ref !== input.subject_ref || signalSet.subject_hash !== input.subject_hash) fail('/signal_set', 'RuleContextV5 requires an exact subject-bound SignalSetV5', 'INVALID_EVIDENCE_REF');
  const signalBase = Object.fromEntries(Object.entries(signalSet).filter(([key]) => key !== 'signal_set_hash'));
  if (canonicalHash(signalBase) !== signalSet.signal_set_hash) fail('/signal_set/signal_set_hash', 'Signal set hash mismatch', 'RECEIPT_CONFLICT');
  const predicateSignals = Object.fromEntries(Object.entries(signalSet.signals).map(([name, item]) => [name, item.value === null ? null : { value: item.value, unit: item.unit }]));
  const selection = selectOperationalRules({ ...input, signals: predicateSignals }, bundle);
  const selectedRuleHashes=Object.fromEntries(selection.selected.map(item=>[item.rule_version_ref,canonicalHash(bundle.rules[item.rule_version_ref])]));
  const selectedFactHashes=Object.fromEntries([...new Set(selection.selected.flatMap(item=>item.fact_version_refs))].sort().map(ref=>[ref,canonicalHash(bundle.facts[ref])]));
  const selectedDependencyHashes=Object.fromEntries([...new Set(selection.selected.flatMap(item=>item.dependency_ids))].sort().map(ref=>[ref,canonicalHash(bundle.dependencies.find(item=>item.dependency_id===ref))]));
  const context = {
    contract_version: 5,
    context_id: input.context_id ?? `rule-context-${canonicalHash({ run_id: input.run_id, subject_ref: input.subject_ref, subject_hash: input.subject_hash, signal_set_hash: signalSet.signal_set_hash, catalog_content_hash: bundle.catalog.catalog_content_hash, cutoff: input.cutoff, personal_context_selection_hash: input.personal_context_selection_hash ?? null }).slice(0, 24)}`,
    run_id: input.run_id, intent: input.intent, goal: structuredClone(input.goal), use: input.use,
    surface: input.surface ?? null, post_type: input.post_type ?? null,
    subject_ref: input.subject_ref, subject_hash: input.subject_hash, cutoff: input.cutoff,
    signal_set: structuredClone(signalSet), catalog_ref: bundle.catalog.catalog_id,
    catalog_content_hash: bundle.catalog.catalog_content_hash,
    selections: selection.selected, not_selected: selection.not_selected, missing_signals: selection.missing_signals,
    explicit_rule_version_refs:[...(input.explicit_rule_version_refs??[])].sort(),selected_rule_hashes:selectedRuleHashes,selected_fact_hashes:selectedFactHashes,selected_dependency_hashes:selectedDependencyHashes,
    personal_context_selection_ref: input.personal_context_selection_ref ?? null,
    personal_context_selection_hash: input.personal_context_selection_hash ?? null,
    operational_context:structuredClone(input.operational_context??null)
  };
  return Object.freeze({ ...context, selected_rule_context_hash: canonicalHash(context) });
}

export function applicationProposalHash(application) {
  return canonicalHash({
    context_ref: application.context_ref,
    selected_rule_context_hash: application.selected_rule_context_hash,
    subject_ref: application.subject_ref,
    actual_input_hash: application.actual_input_hash,
    rule_version_refs: application.rule_version_refs,
    checks: application.checks,
    findings: application.findings,
    actions: application.actions,
    keep_unchanged_reason: application.keep_unchanged_reason,
    validation_plan: application.validation_plan,
    deliverable_refs: application.deliverable_refs
  });
}

export function validateRuleApplication(application, context, bundle) {
  if (application.contract_version !== 4) fail('/contract_version', 'RuleApplication must use contract version 4', 'SCHEMA_VERSION');
  if (application.context_ref !== context.context_id || application.selected_rule_context_hash !== context.selected_rule_context_hash) fail('/context_ref', 'Application is not bound to this exact rule context', 'INVALID_EVIDENCE_REF');
  const allowed = new Set(context.selections.map(item => item.rule_version_ref));
  if (allowed.size && application.rule_version_refs.length === 0) fail('/rule_version_refs', 'A selected rule context cannot be recorded as applied without an actual rule reference', 'REQUESTED_OUTPUT_INCOMPLETE');
  if (!allowed.size && (application.rule_version_refs.length || application.actions.length || !application.keep_unchanged_reason?.trim())) fail('/rule_version_refs', 'A context with no selected rules must record no rule/action and an explicit limitation', 'REQUESTED_OUTPUT_INCOMPLETE');
  for (const ref of application.rule_version_refs) if (!allowed.has(ref) || !bundle.rules[ref]) fail('/rule_version_refs', `Application uses unselected rule: ${ref}`, 'INVALID_EVIDENCE_REF');
  const applied = new Set(application.rule_version_refs);
  for (const action of application.actions) if (!allowed.has(action.rule_version_ref) || !applied.has(action.rule_version_ref)) fail('/actions', `Action uses a rule not actually selected and applied: ${action.rule_version_ref}`, 'INVALID_EVIDENCE_REF');
  if (!application.checks.length) fail('/checks', 'A rule application must record actual checks', 'REQUESTED_OUTPUT_INCOMPLETE');
  for (const check of application.checks) if (check.check_type === 'semantic' && check.reviewed_input_hash !== application.actual_input_hash) fail('/checks', 'Semantic check is not bound to actual input', 'INVALID_EVIDENCE_REF');
  if (!application.actions.length && !application.keep_unchanged_reason) fail('/keep_unchanged_reason', 'Record actions or why the deliverable remains unchanged', 'REQUESTED_OUTPUT_INCOMPLETE');
  if (applicationProposalHash(application) !== application.application_proposal_hash) fail('/application_proposal_hash', 'Application proposal hash mismatch', 'RECEIPT_CONFLICT');
  return structuredClone(application);
}

export function validateRuleApplicationV5(application, context, bundle) {
  if (application.contract_version !== 5 || context.contract_version !== 5) fail('/contract_version', 'RuleApplicationV5 requires V5 application and context', 'SCHEMA_VERSION');
  if (application.context_ref !== context.context_id || application.selected_rule_context_hash !== context.selected_rule_context_hash || application.subject_ref !== context.subject_ref || application.actual_input_hash !== context.subject_hash) fail('/context_ref', 'Application is not bound to exact V5 context and subject', 'INVALID_EVIDENCE_REF');
  const selections = new Map(context.selections.map(item => [item.rule_version_ref, item])), checks = new Map(application.checks.map(item => [item.check_id, item])), applied = new Set(application.rule_version_refs);
  const supportingTypes = { public_mechanism: new Set(['mechanism']), editorial_inference: new Set(['semantic', 'deterministic']), personal_observation: new Set(['personal_observation']), user_preference: new Set(['preference']) };
  for (const [index, action] of application.actions.entries()) {
    const selected = selections.get(action.rule_version_ref);
    if (!selected || !bundle.rules[action.rule_version_ref] || !applied.has(action.rule_version_ref)) fail(`/actions/${index}/rule_version_ref`, 'Action uses a rule that was not selected and applied', 'INVALID_EVIDENCE_REF');
    if (!['public_mechanism', 'editorial_inference', 'personal_observation', 'user_preference'].includes(action.basis_kind)) fail(`/actions/${index}/basis_kind`, 'Unsupported action basis');
    if (!action.supporting_check_refs.length || action.supporting_check_refs.some(ref => !checks.has(ref))) fail(`/actions/${index}/supporting_check_refs`, 'Every action must bind actual supporting checks', 'INVALID_EVIDENCE_REF');
    if (action.signal_refs.some(ref => !Object.hasOwn(context.signal_set.signals, ref))) fail(`/actions/${index}/signal_refs`, 'Action references an unavailable signal', 'INVALID_EVIDENCE_REF');
    if (action.disposition === 'modify') {
      if (action.basis_kind !== 'user_preference' && selected.mechanism_applicability.status === TRI.UNKNOWN && selected.editorial_applicability.status === TRI.UNKNOWN) fail(`/actions/${index}`, 'A double-unknown rule cannot support modification', 'MISSING_EVIDENCE');
      if (action.basis_kind === 'public_mechanism' && selected.mechanism_applicability.status !== TRI.TRUE) fail(`/actions/${index}/basis_kind`, 'Public mechanism basis requires observed mechanism applicability', 'MISSING_EVIDENCE');
      if (action.basis_kind === 'editorial_inference' && selected.editorial_applicability.status !== TRI.TRUE) fail(`/actions/${index}/basis_kind`, 'Editorial modification requires affirmative editorial applicability', 'MISSING_EVIDENCE');
      const supporting = action.supporting_check_refs.map(ref => checks.get(ref));
      if (supporting.some(check => check.status !== TRI.TRUE || !supportingTypes[action.basis_kind].has(check.check_type) || check.reviewed_input_hash !== context.subject_hash || !check.inspected_refs.some(ref => action.deliverable_refs.includes(ref)))) fail(`/actions/${index}/supporting_check_refs`, 'Modification support must be affirmative, basis-compatible, and inspect the modified deliverable', 'MISSING_EVIDENCE');
      const signals = action.signal_refs.map(ref => context.signal_set.signals[ref]);
      if (signals.some(signal => signal.status === 'unknown' || signal.value === null || !signal.source_refs.some(ref => action.deliverable_refs.includes(ref)))) fail(`/actions/${index}/signal_refs`, 'Modification support requires observed signals from the modified deliverable', 'MISSING_EVIDENCE');
    }
  }
  for (const check of application.checks) if (check.check_type === 'semantic' && (check.reviewed_input_hash !== context.subject_hash || !check.review_ref)) fail('/checks', 'Semantic check must bind a real review to exact subject', 'INVALID_EVIDENCE_REF');
  if (!application.actions.length && !application.keep_unchanged_reason) fail('/keep_unchanged_reason', 'Record actions or explicit keep/limitation reason', 'REQUESTED_OUTPUT_INCOMPLETE');
  if (applicationProposalHash(application) !== application.application_proposal_hash) fail('/application_proposal_hash', 'Application proposal hash mismatch', 'RECEIPT_CONFLICT');
  return structuredClone(application);
}

export function proposeKnowledgeUpdate(currentBundle, candidateBundle, { checked_at, head_commit }) {
  if (!checked_at || !head_commit) fail('/update', 'Actual check time and upstream HEAD are required');
  if (candidateBundle.temporal_readiness?.status !== 'ready') fail('/candidate_catalog/temporal_readiness', 'Candidate catalog contains future-dated active evidence', 'MISSING_EVIDENCE');
  if (currentBundle.catalog.upstream.repo !== candidateBundle.catalog.upstream.repo) fail('/candidate_catalog/upstream/repo', 'Update must keep the same upstream repository');
  const changedDependencies = candidateBundle.dependencies.filter(next => {
    const prior = currentBundle.dependencies.find(item => item.dependency_id === next.dependency_id);
    return !prior || canonicalHash(prior) !== canonicalHash(next);
  }).map(item => item.dependency_id);
  const affected = [...new Set(Object.values(candidateBundle.rules).filter(rule => !currentBundle.rules[rule.rule_version_id] || rule.dependency_ids.some(id => changedDependencies.includes(id))).map(rule => rule.rule_version_id))].sort();
  const gaps = candidateBundle.dependencies.filter(item => item.wiring_status === 'unreviewed' || item.source_visibility !== 'public').map(item => item.dependency_id);
  return Object.freeze({
    candidate_catalog: candidateBundle.catalog,
    affected_dependency_ids: changedDependencies.sort(),
    affected_rule_version_refs: affected,
    gaps,
    candidate_temporal_readiness: candidateBundle.temporal_readiness,
    activation_ready: false,
    event: {
      contract_version: 4,
      event_id: `knowledge-event-${canonicalHash({ checked_at, head_commit, candidate: candidateBundle.catalog.catalog_content_hash }).slice(0, 24)}`,
      event_type: 'candidate_update',
      catalog_ref: candidateBundle.catalog.catalog_id,
      prior_catalog_ref: currentBundle.catalog.catalog_id,
      checked_at,
      observed_head_commit: head_commit,
      affected_rule_version_refs: affected,
      gaps
    }
  });
}

export function activateKnowledgeCatalog(currentBundle, proposal, { review_receipt, case_results }) {
  if (proposal.candidate_catalog.catalog_id === currentBundle.catalog.catalog_id) fail('/candidate_catalog', 'Activation must append a new immutable catalog version');
  if (proposal.candidate_temporal_readiness?.status !== 'ready') fail('/candidate_catalog/temporal_readiness', 'Future-dated candidate knowledge cannot be activated', 'MISSING_EVIDENCE');
  if (!review_receipt || review_receipt.subject_hash !== proposal.candidate_catalog.catalog_content_hash || review_receipt.decision !== 'approved') fail('/review_receipt', 'Independent approval of the exact candidate catalog is required', 'MISSING_EVIDENCE');
  const required = new Set(proposal.affected_rule_version_refs), passed = new Set((case_results ?? []).filter(item => item.applicable && item.not_applicable && item.unknown).map(item => item.rule_version_ref));
  for (const ref of required) if (!passed.has(ref)) fail('/case_results', `Affected rule lacks all three replay cases: ${ref}`, 'REQUESTED_OUTPUT_INCOMPLETE');
  if (proposal.gaps.some(id => proposal.affected_dependency_ids.includes(id))) fail('/gaps', 'Affected unresolved dependencies cannot be activated', 'MISSING_EVIDENCE');
  return Object.freeze({
    catalog: proposal.candidate_catalog,
    event: {
      ...proposal.event,
      event_id: `knowledge-event-${canonicalHash({ candidate: proposal.candidate_catalog.catalog_content_hash, review: review_receipt.receipt_id }).slice(0, 24)}`,
      event_type: 'activated',
      review_receipt_ref: review_receipt.receipt_id
    }
  });
}
