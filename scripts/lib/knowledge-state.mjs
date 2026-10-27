import { canonicalHash, ContractError, validate } from './contracts.mjs';
import { loadKnowledgeCatalog } from './knowledge.mjs';

function putImmutable(collection, id, value) {
  const existing = collection[id];
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(value)) throw new Error(`Immutable knowledge object conflict: ${id}`);
  collection[id] = structuredClone(value);
}

function validateStoredFact(rule, state) {
  const source = state.knowledge_artifacts?.[rule.source_material_ref];
  if (!source) throw new ContractError('MISSING_EVIDENCE', '/source_material_ref', 'Rule source material does not exist');
  if (source.artifact_content_hash !== rule.source_content_hash) throw new ContractError('RECEIPT_CONFLICT', '/source_content_hash', 'Rule is not bound to actual source bytes');
  if (rule.supersedes) {
    const prior = state.rule_versions_v2?.[rule.supersedes];
    if (!prior) throw new ContractError('MISSING_EVIDENCE', '/supersedes', 'Superseded rule does not exist');
    const content = value => Object.fromEntries(Object.entries(value).filter(([key]) => !['rule_version_id', 'checked_at', 'supersedes'].includes(key)));
    if (canonicalHash(content(prior)) === canonicalHash(content(rule))) throw new ContractError('INVALID_INPUT', '/checked_at', 'Changing checked_at alone is not a rule update');
  }
}

/** Seed only verified installed bytes; all objects commit with their owning transaction. */
export function seedKnowledgeState(state, bundle=loadKnowledgeCatalog(),{activate=true}={}) {
  for (const key of ['knowledge_artifacts','knowledge_catalogs','knowledge_events','operational_rules','rule_contexts','rule_applications','guidance_outputs','guidance_receipts','personal_patterns'])state[key]??={};
  for(const [id,item] of Object.entries(bundle.history?.artifacts??{}))putImmutable(state.knowledge_artifacts,id,validate('KnowledgeArtifactV4',item));
  for(const [id,item] of Object.entries(bundle.history?.facts??{})){validateStoredFact(item,state);putImmutable(state.rule_versions_v2,id,validate('RuleVersionV2',item));}
  for(const [id,item] of Object.entries(bundle.history?.rules??{}))putImmutable(state.operational_rules,id,validate('OperationalRuleV4',item));
  for(const [id,item] of Object.entries(bundle.history?.catalogs??{}))putImmutable(state.knowledge_catalogs,id,validate('RuleCatalogSnapshotV4',item));
  for(const [id,item] of Object.entries(bundle.artifacts))putImmutable(state.knowledge_artifacts,id,validate('KnowledgeArtifactV4',item));
  for(const [id,item] of Object.entries(bundle.facts)){validateStoredFact(item,state);putImmutable(state.rule_versions_v2,id,validate('RuleVersionV2',item));}
  for(const [id,item] of Object.entries(bundle.rules))putImmutable(state.operational_rules,id,validate('OperationalRuleV4',item));
  putImmutable(state.knowledge_catalogs,bundle.catalog.catalog_id,validate('RuleCatalogSnapshotV4',bundle.catalog));
  if(activate&&bundle.event.event_type==='activated')putImmutable(state.knowledge_events,bundle.event.event_id,validate(bundle.event.contract_version===5?'KnowledgeEventV5':'KnowledgeEventV4',bundle.event));
  return state;
}
