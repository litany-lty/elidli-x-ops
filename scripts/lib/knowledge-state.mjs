import { validate } from './contracts.mjs';
import { loadKnowledgeCatalog } from './knowledge.mjs';
import { validateRuleVersionV2 } from './coaching.mjs';
import { putImmutable } from './state.mjs';

/** Seed only verified installed bytes; all objects commit with their owning transaction. */
export function seedKnowledgeState(state, bundle=loadKnowledgeCatalog(),{activate=true}={}) {
  for (const key of ['knowledge_artifacts','knowledge_catalogs','knowledge_events','operational_rules','rule_contexts','rule_applications','guidance_outputs','guidance_receipts','personal_patterns'])state[key]??={};
  for(const [id,item] of Object.entries(bundle.history?.artifacts??{}))putImmutable(state.knowledge_artifacts,id,validate('KnowledgeArtifactV4',item));
  for(const [id,item] of Object.entries(bundle.history?.facts??{})){validateRuleVersionV2(item,state);putImmutable(state.rule_versions_v2,id,validate('RuleVersionV2',item));}
  for(const [id,item] of Object.entries(bundle.history?.rules??{}))putImmutable(state.operational_rules,id,validate('OperationalRuleV4',item));
  for(const [id,item] of Object.entries(bundle.history?.catalogs??{}))putImmutable(state.knowledge_catalogs,id,validate('RuleCatalogSnapshotV4',item));
  for(const [id,item] of Object.entries(bundle.artifacts))putImmutable(state.knowledge_artifacts,id,validate('KnowledgeArtifactV4',item));
  for(const [id,item] of Object.entries(bundle.facts)){validateRuleVersionV2(item,state);putImmutable(state.rule_versions_v2,id,validate('RuleVersionV2',item));}
  for(const [id,item] of Object.entries(bundle.rules))putImmutable(state.operational_rules,id,validate('OperationalRuleV4',item));
  putImmutable(state.knowledge_catalogs,bundle.catalog.catalog_id,validate('RuleCatalogSnapshotV4',bundle.catalog));
  if(activate&&bundle.event.event_type==='activated')putImmutable(state.knowledge_events,bundle.event.event_id,validate('KnowledgeEventV4',bundle.event));
  return state;
}
