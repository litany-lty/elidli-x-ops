import { createHash } from 'node:crypto';
import { canonicalHash, textHash, ContractError } from './contracts.mjs';
import { validateMetricObservation } from './metrics.mjs';
import { inspectAnalyticsCsv, normalizeAnalyticsCsv } from './importers/analytics-csv.mjs';
import { inspectHostObservations, normalizeHostObservations } from './importers/host-observations.mjs';
import { inspectArchivePosts, normalizeArchivePosts } from './importers/archive-posts.mjs';
import { resolvePostIdentity } from './post-identity.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const hashBytes=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value),'utf8').digest('hex');
const materialHash=material=>hashBytes(material.raw_text??material.content);
const cleanHandle=value=>value===null||value===undefined?null:String(value).replace(/^@/,'').toLowerCase();
const identityRef=identity=>identity.user_id?`x-user:${identity.user_id}`:`x-handle:${cleanHandle(identity.handle)}`;

export function decodeImportMaterial(kind,rawBytes){
 const raw_text=Buffer.isBuffer(rawBytes)?rawBytes.toString('utf8'):String(rawBytes);let content=raw_text;
 if(['canonical_json','host_observations','archive_posts'].includes(kind))try{content=JSON.parse(raw_text);}catch(error){fail('INVALID_INPUT','/material',`Invalid ${kind} JSON: ${error.message}`);}
 if(kind==='archive_posts'&&!Array.isArray(content)&&!Array.isArray(content?.posts))fail('INVALID_INPUT','/material','Archive JSON must be an array or {posts:[...]}');
 return{content,raw_text,artifact_sha256:hashBytes(raw_text)};
}

export function sourceDefinitionFingerprint({account_identity_ref,adapter_id,adapter_version,definition_context,entity_type,aggregation_basis,distribution,surface,metric_definitions=[]}){
 return canonicalHash({account_identity_ref:account_identity_ref??null,adapter_id,adapter_version,definition_context:definition_context??null,entity_type:entity_type??null,aggregation_basis:aggregation_basis??null,distribution:distribution??null,surface:surface??null,metric_definitions:[...metric_definitions].sort()});
}

export function inspectImport(material,declaredContext={},adapterRegistry={}){
 if(!material||!['canonical_json','analytics_csv','host_observations','archive_posts'].includes(material.kind))fail('ADAPTER_UNVERIFIED','/material/kind','Unsupported import material kind');
 const artifact_sha256=material.sha256??materialHash(material);if(material.sha256&&material.sha256!==materialHash(material))fail('RECEIPT_CONFLICT','/material/sha256','Material bytes do not match declared hash');
 let details;
 if(material.kind==='analytics_csv')details=inspectAnalyticsCsv(material.content,declaredContext);
 else if(material.kind==='host_observations')details=inspectHostObservations(material.content);
 else if(material.kind==='archive_posts')details=inspectArchivePosts(material.content);
 else {const input=material.content;if(!input||typeof input!=='object')fail('INVALID_INPUT','/material/content','Canonical JSON must be an object');details={adapter:{adapter_id:'canonical-json-v2',adapter_version:'1',verified_profile:true},status:'recognized',row_count:(input.observations??input.snapshots??[]).length+(input.posts??[]).length,columns:[],coverage:input.coverage??{},errors:input.errors??[]};}
 const account_identity_ref=declaredContext.account_identity_ref;if(!account_identity_ref)fail('MAPPING_REQUIRED','/declared_context/account_identity_ref','Target account identity is required');
 const mapping_hash=canonicalHash({mapping:declaredContext.mapping??null,constants:declaredContext.constants??null});
 const core={contract_version:2,artifact_sha256,source_ref:material.source_ref,material_kind:material.kind,adapter_id:details.adapter.adapter_id,adapter_version:details.adapter.adapter_version,adapter_verified:details.adapter.verified_profile,status:details.status,account_identity_ref,measurement_context:structuredClone(declaredContext.measurement_context??{}),mapping_hash,row_count:details.row_count??0,columns:details.columns??[],missing_required:details.missing_required??[],coverage:details.coverage??{},errors:details.errors??[]};
 if(!core.source_ref)fail('MISSING_EVIDENCE','/material/source_ref','Source material ID is required');
 const preview_id=`import-preview:${canonicalHash(core)}`;return{...core,preview_id,preview_hash:canonicalHash({...core,preview_id})};
}

function rawRecords(material,preview,context){
 if(material.kind==='analytics_csv')return normalizeAnalyticsCsv(inspectAnalyticsCsv(material.content,context),context);
 if(material.kind==='host_observations')return normalizeHostObservations(material.content);
 if(material.kind==='archive_posts')return normalizeArchivePosts(inspectArchivePosts(material.content));
 const c=material.content;return[...(c.posts??[]).map((p,i)=>({...p,entity_type:'post',entity_id:String(p.post_id??p.entity_id),post_text:p.text??p.post_text,locator:p.locator??`post:${i}`})),...(c.observations??c.snapshots??[]).map((o,i)=>({...o,locator:o.locator??`observation:${i}`}))];
}

function metricValue(record){let value=record.value;if(value!==null&&value!==undefined&&value!==''){value=Number(value);if(!Number.isFinite(value))fail('NUMERIC_RANGE',`/records/${record.locator}/value`,'Metric value must be finite');}else value=null;const availability=record.availability??(value===null?'missing':'observed');return{definition_id:record.definition_id??record.metric_key,value,value_kind:record.value_kind??'count',unit:record.unit??'count',precision:record.precision??'unknown',raw_display:record.raw_display??(record.value===undefined?null:String(record.value)),source_field_path:record.source_field_path??null,availability,evidence_locator:`${record.locator}:${record.metric_key??record.definition_id}`};}

export function normalizeImport(preview,material,identity,declaredContext={}){
 if(preview.preview_hash!==canonicalHash({...preview,preview_hash:undefined})) {const c=structuredClone(preview);delete c.preview_hash;if(preview.preview_hash!==canonicalHash(c))fail('RECEIPT_CONFLICT','/preview_hash','Import preview changed');}
 if(preview.artifact_sha256!==(material.sha256??materialHash(material)))fail('RECEIPT_CONFLICT','/material','Material differs from preview');
 if(identityRef(identity)!==preview.account_identity_ref)fail('ACCOUNT_MISMATCH','/identity','Import target does not match preview account');
 if(preview.status!=='recognized')fail(preview.status==='mapping_required'?'MAPPING_REQUIRED':'ADAPTER_UNVERIFIED','/preview/status','Import preview is not ready to normalize');
 const ctx=declaredContext,measurement_context=structuredClone(preview.measurement_context),identity_policy_version='import-batch-v2',batchCore={identity_policy_version,account_identity_ref:preview.account_identity_ref,artifact_sha256:preview.artifact_sha256,adapter_id:preview.adapter_id,adapter_version:preview.adapter_version,mapping_hash:preview.mapping_hash,measurement_context};
 const import_batch_id=`import-batch:${canonicalHash(batchCore)}`;const source_series_id=ctx.source_series_id??`series:${sourceDefinitionFingerprint({account_identity_ref:preview.account_identity_ref,adapter_id:preview.adapter_id,adapter_version:preview.adapter_version,definition_context:measurement_context.definition_context,entity_type:ctx.entity_type,aggregation_basis:ctx.aggregation_basis,distribution:ctx.distribution,surface:ctx.surface,metric_definitions:ctx.metric_definitions??[]})}`;
 const records=rawRecords(material,preview,ctx),post_entities=[],post_versions=[],snapshots=[],metadata_facts=[],errors=structuredClone(preview.errors??[]);
 for(const record of records){const locator=record.locator;if(record.entity_type==='post'&&(record.post_text!==undefined||record.text!==undefined)){const post_id=String(record.post_id??record.entity_id),post_key=record.post_key??`x:${post_id}`,author_id=record.author_id??record.account_id??identity.user_id??null,author_handle=cleanHandle(record.author_handle??identity.handle);if(identity.user_id&&author_id&&identity.user_id!==author_id)fail('ACCOUNT_MISMATCH',`/records/${locator}/author_id`,'Post belongs to another account');if(!identity.user_id&&author_handle&&author_handle!==cleanHandle(identity.handle))fail('ACCOUNT_MISMATCH',`/records/${locator}/author_handle`,'Post belongs to another account');const text=record.post_text??record.text??null,content_hash=text===null?canonicalHash({post_key,locator,missing:true}):textHash(text),post_version_id=`post-version:${canonicalHash({post_key,content_hash,source_ref:preview.source_ref,locator})}`;post_entities.push({post_key,post_id,author_id,author_handle,handle_aliases:author_handle?[author_handle]:[],edit_chain_ids:(record.edit_chain_ids??[]).map(String),current_version_ref:post_version_id,evidence_refs:[`${preview.source_ref}:${locator}`]});post_versions.push({post_version_id,post_key,content_hash,text,created_at:record.created_at??null,url:record.url??null,source_ref:preview.source_ref,source_locator:locator,context_coverage:record.context_coverage??{full_text:text!==null,parent:false,quote:false,thread:false,media:false,linked_source:false},parent_post_key:record.parent_post_key??null,quoted_post_key:record.quoted_post_key??null,thread_root_key:record.thread_root_key??null,media_refs:record.media_refs??[]});}
  if(record.metric_key||record.metrics){const entity_id=record.post_key??(record.entity_type==='post'?`x:${record.entity_id}`:String(record.entity_id));const metrics=record.metrics??{[record.metric_key]:metricValue(record)},scopeKey={entity_type:record.entity_type,entity_id,aggregation_basis:record.aggregation_basis??'unknown',period:{start:record.period_start??null,end_exclusive:record.period_end??null,timezone:record.timezone??null,raw_period_label:record.raw_period_label??null}};const snapshot={snapshot_id:`snapshot:${canonicalHash({import_batch_id,locator,entity_id,scopeKey})}`,contract_version:2,entity_type:record.entity_type,entity_id,account_id:record.account_id??identity.user_id??null,source_ref:preview.source_ref,source_series_id,source_locator:locator,observed_at:record.observed_at??null,period:record.period??((record.period_start||record.period_end||record.raw_period_label)?{start:record.period_start??null,end_exclusive:record.period_end??null,timezone:record.timezone??null,source_date_start:record.source_date_start??null,source_date_end_inclusive:record.source_date_end_inclusive??null,raw_period_label:record.raw_period_label??null,completeness:record.completeness??'unknown'}:null),aggregation_basis:record.aggregation_basis??'unknown',distribution:record.distribution??'unknown',surface:record.surface??'unknown',cohort_definition_ref:record.cohort_definition_ref??null,revision_status:record.revision_status??'unknown',supersedes_snapshot_id:record.supersedes_snapshot_id??null,metrics};snapshots.push(validateMetricObservation(snapshot,undefined,identity));}}
 for(const entity of post_entities)entity.version_conflict_refs=[];
 for(const version of post_versions){const previous=version.post_version_id,stable=`post-version:${canonicalHash({post_key:version.post_key,content_hash:version.content_hash})}`,record=records.find(item=>item.locator===version.source_locator);version.post_version_id=stable;version.post_type=record?.post_type??'unknown';version.source_created_date=record?.source_created_date??null;const entity=post_entities.find(item=>item.current_version_ref===previous);if(entity)entity.current_version_ref=stable;}
 for(const record of records){if(record.entity_type!=='post')continue;const postKey=record.post_key??`x:${String(record.post_id??record.entity_id)}`,version=post_versions.find(item=>item.post_key===postKey);if(!version)continue;for(const [field,value] of Object.entries({created_at:record.created_at??null,post_type:record.post_type??'unknown',parent_post_key:record.parent_post_key??null,parent_source_version_ref:record.parent_source_version_ref??null,quoted_post_key:record.quoted_post_key??null,quoted_source_version_ref:record.quoted_source_version_ref??null,thread_root_key:record.thread_root_key??null,media_refs:record.media_refs??[]})){const known=value!==null&&value!=='unknown'&&(!Array.isArray(value)||value.length);if(!known)continue;const supersedes_fact_refs=(record.metadata_supersedes?.[field]??[]).map(String);const core={post_key:postKey,post_version_ref:version.post_version_id,field,value,source_ref:preview.source_ref,source_locator:record.locator,source_hash:preview.artifact_sha256,observed_at:record.observed_at??null,precision:record.metadata_precision??'reported',supersedes_fact_refs,status:'confirmed'};metadata_facts.push({...core,contract_version:3,fact_id:`post-fact:${canonicalHash(core)}`});}}
 const definitionHash=sourceDefinitionFingerprint({account_identity_ref:preview.account_identity_ref,adapter_id:preview.adapter_id,adapter_version:preview.adapter_version,definition_context:measurement_context.definition_context,entity_type:ctx.entity_type,aggregation_basis:ctx.aggregation_basis,distribution:ctx.distribution,surface:ctx.surface,metric_definitions:ctx.metric_definitions??[]});
 const source_series=[{source_series_id,account_identity_ref:preview.account_identity_ref,definition_version:1,source_family:preview.adapter_id,measurement_context_hash:definitionHash,created_from_source_refs:[preview.source_ref]}];
 const import_batch={import_batch_id,contract_version:2,identity_policy_version,account_identity_ref:preview.account_identity_ref,source_ref:preview.source_ref,artifact_sha256:preview.artifact_sha256,adapter_id:preview.adapter_id,adapter_version:preview.adapter_version,mapping_hash:preview.mapping_hash,measurement_context,imported_at:ctx.imported_at??new Date().toISOString(),record_locators:[...new Set(records.map(r=>r.locator))],row_counts:{seen:records.length,accepted:records.length-errors.length,rejected:errors.length,duplicate:0,unresolved:0},coverage:preview.coverage,errors,reinterprets_batch_id:ctx.reinterprets_batch_id??null};
 return{contract_version:2,source_record:null,import_batch,source_series,post_entities,post_versions,snapshots,metadata_facts,coverage:preview.coverage,errors};
}

export function appendPostMetadataEvidence(state,facts){const next=structuredClone(state);next.post_metadata_facts??={};const fact_refs=[];for(const fact of [...facts].sort((a,b)=>a.fact_id.localeCompare(b.fact_id))){const old=next.post_metadata_facts[fact.fact_id];if(old&&canonicalHash(old)!==canonicalHash(fact))fail('RECEIPT_CONFLICT','/post_metadata_facts','Metadata fact identity conflict');next.post_metadata_facts[fact.fact_id]??=structuredClone(fact);fact_refs.push(fact.fact_id);}return{nextState:next,fact_refs};}

export function resolvePostMetadataView(state,versionRef,field){const version=state.post_versions?.[versionRef],active=Object.values(state.post_metadata_facts??{}).filter(f=>f.post_version_ref===versionRef&&f.field===field&&f.status==='confirmed'),superseded=new Set(active.flatMap(f=>f.supersedes_fact_refs??[])),current=active.filter(f=>!superseded.has(f.fact_id)),groups=new Map();for(const fact of current){const key=canonicalHash(fact.value),items=groups.get(key)??[];items.push(fact);groups.set(key,items);}const base=version?.[field],baseRef=`base:${versionRef}:${field}`,baseKnown=base!==null&&base!==undefined&&base!=='unknown'&&(!Array.isArray(base)||base.length);if(baseKnown&&!superseded.has(baseRef)&&!groups.has(canonicalHash(base)))groups.set(`base:${canonicalHash(base)}`,[]);if(groups.size===1){const group=[...groups.values()][0];return{status:'confirmed',value:structuredClone(group[0]?.value??base),fact_refs:group.map(f=>f.fact_id).sort()};}if(groups.size>1)return{status:'conflicting',value:null,fact_refs:current.map(f=>f.fact_id).sort()};return{status:'unknown',value:null,fact_refs:[]};}

function findStoredSourceVersion(state,sourceVersionRef){
 for(const [sourceId,source] of Object.entries(state.sources??{})){
  const version=source.versions?.[sourceVersionRef];
  if(version)return{source_id:sourceId,source,version};
 }
 return null;
}

function usableExternalContext(state,sourceVersionRef){
 const stored=findStoredSourceVersion(state,sourceVersionRef);
 if(!stored)return null;
 const {source_id,source}=stored,version=source.versions?.[source.latest_version_id??sourceVersionRef],receipt=state.raw_receipts?.[version?.raw_receipt_ref];
 if(!version)return null;
 if(receipt?.status!=='succeeded'||version.read_status!=='read'||version.material_kind==='search_snippet')return null;
 if(typeof version.captured_text!=='string'||textHash(version.captured_text)!==version.captured_text_hash)return null;
 return{
  source_id,
  source_version_ref:version.source_version_id,
  source_url:version.final_url??version.original_url??source.record?.locator??null,
  raw_receipt_ref:version.raw_receipt_ref,
  content_hash:version.captured_text_hash
 };
}

export function resolvePostContext(state,targetVersionRef,{context_pool=null,selection_policy='current-canonical-v1',as_of=null}={}){
 const target=state.post_versions?.[targetVersionRef];
 if(!target)fail('MISSING_EVIDENCE','/target_post_version_ref','Target post version is missing');
 const aliases=state.post_aliases??{},entities=state.post_entities??{};
 const targetKey=resolvePostIdentity(target.post_key,aliases,{entities}).canonical_key;
 const pool=new Set(context_pool??Object.keys(state.post_versions??{})),context_selection={},context_refs=[],limitations=[];

 for(const [role,field,sourceField] of [
  ['parent','parent_post_key','parent_source_version_ref'],
  ['quote','quoted_post_key','quoted_source_version_ref'],
  ['thread','thread_root_key',null]
 ]){
  const view=resolvePostMetadataView(state,targetVersionRef,field),raw=view.value;
  if(view.status==='conflicting'){
   context_selection[role]={status:'conflicting',post_key:null,post_version_ref:null,fact_refs:view.fact_refs};
   limitations.push(`${role} metadata conflicts`);
   continue;
  }
  if(!raw){
   context_selection[role]={status:'not_available',post_key:null,post_version_ref:null,fact_refs:view.fact_refs};
   continue;
  }

  let key=raw,internalRef=null;
  if(entities[raw]||Object.hasOwn(aliases,raw)){
   key=resolvePostIdentity(raw,aliases,{entities}).canonical_key;
   internalRef=entities[key]?.current_version_ref??null;
  }
  if(internalRef&&pool.has(internalRef)){
   context_selection[role]={status:'seen',post_key:key,post_version_ref:internalRef,content_hash:state.post_versions[internalRef].content_hash,fact_refs:view.fact_refs};
   context_refs.push(internalRef,...view.fact_refs);
   continue;
  }

  const sourceView=sourceField?resolvePostMetadataView(state,targetVersionRef,sourceField):{status:'unknown',value:null,fact_refs:[]};
  const external=sourceView.status==='confirmed'?usableExternalContext(state,sourceView.value):null;
  if(external){
   const fact_refs=[...new Set([...view.fact_refs,...sourceView.fact_refs])].sort();
   context_selection[role]={status:'seen',post_key:raw,post_version_ref:null,source_version_ref:external.source_version_ref,source_id:external.source_id,source_url:external.source_url,content_hash:external.content_hash,fact_refs};
   context_refs.push(external.source_version_ref,external.raw_receipt_ref,...fact_refs);
   continue;
  }

  context_selection[role]={status:'not_seen',post_key:key,post_version_ref:null,fact_refs:[...new Set([...view.fact_refs,...sourceView.fact_refs])].sort()};
  limitations.push(sourceView.status==='confirmed'?`${role} external source was not recoverable`:`${role} context was not selected`);
 }

 for(const field of ['media_refs','linked_source_refs']){
  const view=resolvePostMetadataView(state,targetVersionRef,field);
  context_selection[field]={status:view.status,value:view.value,fact_refs:view.fact_refs};
  context_refs.push(...view.fact_refs);
 }
 const base={contract_version:3,target_version_ref:targetVersionRef,target_post_key:targetKey,target_content_hash:target.content_hash,context_selection,context_refs:[...new Set(context_refs)].sort(),selection_policy,as_of,limitations};
 return{...base,context_selection_hash:canonicalHash(base)};
}

function mergeEntity(existing,incoming){if(!existing)return structuredClone(incoming);if(existing.author_id&&incoming.author_id&&existing.author_id!==incoming.author_id)fail('ACCOUNT_MISMATCH',`/post_entities/${incoming.post_key}/author_id`,'Same post ID has another author');const refs=[existing.current_version_ref,incoming.current_version_ref].filter(Boolean),explicitEdit=[...existing.edit_chain_ids,...incoming.edit_chain_ids].includes(incoming.post_id),current_version_ref=explicitEdit?incoming.current_version_ref:[...refs].sort()[0]??null,version_conflict_refs=explicitEdit?[...(existing.version_conflict_refs??[]),...(incoming.version_conflict_refs??[])]:[...(existing.version_conflict_refs??[]),...(incoming.version_conflict_refs??[]),...refs.filter(ref=>ref!==current_version_ref)];return{...existing,author_handle:incoming.author_handle??existing.author_handle,handle_aliases:[...new Set([...existing.handle_aliases,...incoming.handle_aliases])],edit_chain_ids:[...new Set([...existing.edit_chain_ids,...incoming.edit_chain_ids])],current_version_ref,evidence_refs:[...new Set([...existing.evidence_refs,...incoming.evidence_refs])],version_conflict_refs:[...new Set(version_conflict_refs)]};}
export function mergeImport(state,normalized){
 let next=structuredClone(state);for(const key of ['import_batches','source_series','post_entities','post_versions','post_aliases','snapshots_v2','post_metadata_facts'])next[key]??={};
 const id=normalized.import_batch.import_batch_id;
 if(next.import_batches[id])return{nextState:next,receipt:{import_batch_id:id,idempotent:true,entity_refs:normalized.post_entities.map(x=>x.post_key),version_refs:normalized.post_versions.map(x=>x.post_version_id),observation_refs:normalized.snapshots.map(x=>x.snapshot_id),source_series_refs:normalized.source_series.map(x=>x.source_series_id),row_counts:next.import_batches[id].row_counts}};
 for(const series of normalized.source_series){const old=next.source_series[series.source_series_id];if(old&&canonicalHash({...old,created_from_source_refs:[]})!==canonicalHash({...series,created_from_source_refs:[]}))fail('INVALID_INPUT','/source_series','Series definition conflict');next.source_series[series.source_series_id]=old?{...old,created_from_source_refs:[...new Set([...old.created_from_source_refs,...series.created_from_source_refs])]}:series;}
 for(const entity of normalized.post_entities){const canonicalId=entity.edit_chain_ids?.at(-1)??entity.post_id,canonicalKey=canonicalId?`x:${canonicalId}`:entity.post_key,projected={...entity,post_key:canonicalKey,post_id:canonicalId??entity.post_id};next.post_entities[canonicalKey]=mergeEntity(next.post_entities[canonicalKey],projected);for(const alias of entity.edit_chain_ids)next.post_aliases[`x:${alias}`]=canonicalKey;}
 for(const version of normalized.post_versions){const canonical=next.post_aliases[version.post_key]??version.post_key,projected={...version,post_key:canonical},old=next.post_versions[version.post_version_id];if(old&&old.content_hash!==projected.content_hash)fail('RECEIPT_CONFLICT','/post_versions','Post version content conflict');if(!old)next.post_versions[version.post_version_id]=projected;}
 const reinterpret=normalized.import_batch.reinterprets_batch_id;
 if(reinterpret&&!next.import_batches[reinterpret])fail('MISSING_EVIDENCE','/reinterprets_batch_id','Reinterpreted import batch does not exist');
 for(const original of normalized.snapshots){const snapshot=structuredClone(original);if(reinterpret){const definitions=new Set(Object.values(snapshot.metrics).map(metric=>metric.definition_id));const candidates=Object.values(next.snapshots_v2).filter(old=>old.source_ref===snapshot.source_ref&&old.source_locator===snapshot.source_locator&&old.entity_type===snapshot.entity_type&&old.entity_id===snapshot.entity_id&&Object.values(old.metrics).some(metric=>definitions.has(metric.definition_id)));if(candidates.length===1)snapshot.supersedes_snapshot_id=candidates[0].snapshot_id;else if(candidates.length>1)fail('OBSERVATION_CONFLICT','/reinterprets_batch_id','Reinterpretation target is ambiguous');}const old=next.snapshots_v2[snapshot.snapshot_id];if(old&&canonicalHash(old)!==canonicalHash(snapshot))fail('OBSERVATION_CONFLICT','/snapshots_v2','Snapshot identity conflict');next.snapshots_v2[snapshot.snapshot_id]=snapshot;}
 if(normalized.metadata_facts?.length)next=appendPostMetadataEvidence(next,normalized.metadata_facts).nextState;
 next.import_batches[id]=normalized.import_batch;
 return{nextState:next,receipt:{import_batch_id:id,idempotent:false,entity_refs:normalized.post_entities.map(x=>x.post_key),version_refs:normalized.post_versions.map(x=>x.post_version_id),observation_refs:normalized.snapshots.map(x=>x.snapshot_id),source_series_refs:normalized.source_series.map(x=>x.source_series_id),row_counts:normalized.import_batch.row_counts}};
}

export function legacyImportFromState(v1){
 const source_series=[],post_entities=[],post_versions=[],snapshots=[];
 if(!Object.keys(v1.posts??{}).length&&!Object.keys(v1.snapshots??{}).length)return null;
 for(const post of Object.values(v1.posts??{})){
  const content_hash=textHash(post.text),post_version_id=`post-version:${canonicalHash({post_key:post.post_key,content_hash,legacy:true})}`;
  post_entities.push({post_key:post.post_key,post_id:post.post_id,author_id:post.account_id,author_handle:cleanHandle(post.author_handle),handle_aliases:[cleanHandle(post.author_handle)],edit_chain_ids:post.edit_history_ids??[],current_version_ref:post_version_id,evidence_refs:[post.source_ref],version_conflict_refs:[]});
  post_versions.push({post_version_id,post_key:post.post_key,content_hash,text:post.text,post_type:post.post_type??'unknown',created_at:post.created_at,source_created_date:null,url:post.url,source_ref:post.source_ref,source_locator:`legacy:${post.post_key}`,context_coverage:{full_text:true,parent:false,quote:false,thread:false,media:false,linked_source:false},parent_post_key:null,quoted_post_key:null,thread_root_key:post.thread_root_id,media_refs:[]});
 }
 for(const old of Object.values(v1.snapshots??{})){
  const source_series_id=`legacy:${old.source_ref}`,metrics={};
  for(const [name,m] of Object.entries(old.metrics??{}))metrics[name]={definition_id:`legacy.v1.${old.metric_scope}.${name}`,value:m.value,value_kind:'count',unit:'count',precision:m.precision,raw_display:m.raw_value===null?null:String(m.raw_value),source_field_path:null,availability:m.availability==='not_provided'?'missing':m.availability,evidence_locator:`legacy:${old.snapshot_id}:${name}`};
  snapshots.push({snapshot_id:`v2:${old.snapshot_id}`,contract_version:2,entity_type:old.entity_type,entity_id:old.entity_id,account_id:old.account_id,source_ref:old.source_ref,source_series_id,source_locator:`legacy:${old.snapshot_id}`,observed_at:old.captured_at,period:null,aggregation_basis:old.aggregation_window==='cumulative'?'lifetime_as_of':'unknown',distribution:'unknown',surface:'unknown',cohort_definition_ref:null,revision_status:'unknown',supersedes_snapshot_id:null,metrics});
  if(!source_series.some(series=>series.source_series_id===source_series_id))source_series.push({source_series_id,account_identity_ref:v1.account.user_id?`x-user:${v1.account.user_id}`:`x-handle:${cleanHandle(v1.account.handle)}`,definition_version:1,source_family:'legacy-v1',measurement_context_hash:canonicalHash({source_ref:old.source_ref,metric_scope:old.metric_scope}),created_from_source_refs:[old.source_ref]});
 }
 const artifact_sha256=canonicalHash({account:v1.account,posts:v1.posts??{},snapshots:v1.snapshots??{},sources:v1.sources??{}}),source_ref=`legacy-state:${artifact_sha256}`,import_batch_id=`import-batch:${canonicalHash({account_identity_ref:v1.account.user_id?`x-user:${v1.account.user_id}`:`x-handle:${cleanHandle(v1.account.handle)}`,artifact_sha256,adapter_version:'1',mapping_hash:'legacy-v1',measurement_context:{basis:'declared',definition_context:'legacy-v1-state'}})}`;
 const import_batch={import_batch_id,contract_version:2,account_identity_ref:v1.account.user_id?`x-user:${v1.account.user_id}`:`x-handle:${cleanHandle(v1.account.handle)}`,source_ref,artifact_sha256,adapter_id:'legacy-v1-state',adapter_version:'1',mapping_hash:canonicalHash({legacy:true}),measurement_context:{basis:'declared',definition_context:'legacy-v1-state'},imported_at:new Date().toISOString(),record_locators:[...post_entities.map(item=>`legacy:${item.post_key}`),...snapshots.map(item=>item.source_locator)],row_counts:{seen:post_entities.length+snapshots.length,accepted:post_entities.length+snapshots.length,rejected:0,duplicate:0,unresolved:snapshots.length},coverage:{views:{content:post_entities.length?'obtained':'not_requested'},completeness:'unknown',has_more:false,stop_reason:'legacy_migration',successful_items:post_entities.length+snapshots.length,failed_items:0},errors:[],reinterprets_batch_id:null};
 return{contract_version:2,source_record:null,import_batch,source_series,post_entities,post_versions,snapshots,coverage:import_batch.coverage,errors:[]};
}
