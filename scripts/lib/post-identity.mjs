import { ContractError } from './contracts.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};

/** Resolve an alias chain without guessing through loops or missing entities. */
export function resolvePostIdentity(postKey, aliasIndex = {}, { entities = null, allowSelf = true } = {}) {
  if (typeof postKey !== 'string' || !postKey) fail('INVALID_INPUT','/post_key','Post identity is required');
  const chain=[postKey],seen=new Set(chain);let current=postKey;
  while(Object.hasOwn(aliasIndex,current)) {
    const next=aliasIndex[current];
    if(typeof next!=='string'||!next)fail('INVALID_INPUT',`/post_aliases/${current}`,'Alias target must be a non-empty post key');
    if(next===current&&allowSelf)break;
    if(seen.has(next))fail('IDENTITY_MISMATCH',`/post_aliases/${current}`,'Post alias cycle detected');
    chain.push(next);seen.add(next);current=next;
  }
  if(entities && !Object.hasOwn(entities,current))fail('MISSING_EVIDENCE','/post_key',`Canonical post entity does not exist: ${current}`);
  return {input_key:postKey,canonical_key:current,alias_chain:chain};
}

export function canonicalPostKey(postKey,state) {
  return resolvePostIdentity(postKey,state?.post_aliases??{},{entities:state?.post_entities??null}).canonical_key;
}

export function resolveVersionPostKey(version,state) {
  if(!version?.post_key)fail('INVALID_INPUT','/post_version/post_key','Post version has no post key');
  return canonicalPostKey(version.post_key,state);
}

export function validateAliasIndex(aliasIndex,entities) {
  const normalized={};
  for(const key of Object.keys(aliasIndex??{}).sort())normalized[key]=resolvePostIdentity(key,aliasIndex,{entities}).canonical_key;
  return normalized;
}
