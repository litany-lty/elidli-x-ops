import { Temporal } from '@js-temporal/polyfill';
import { canonicalHash, ContractError, newId, textHash, validate } from './contracts.mjs';
import { isReliableState } from './state-version.mjs';
import { assetReviewSubjectHash, countAlt, dataSpecBindingHash } from './media.mjs';
import { resolveInspirationDeliveryRef } from './inspiration.mjs';
import { validateMediaSourceV5 } from './media-sources.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const clone=value=>structuredClone(value);
const values=value=>Object.values(value??{});
const briefRef=brief=>`${brief.brief_id}:${brief.brief_revision}`;
const packRef=pack=>`${pack.pack_id}:${pack.pack_revision}`;
const same=(a,b)=>canonicalHash(a)===canonicalHash(b);

function contentCollections(state){
  for(const key of ['content_briefs','recipe_versions','media_assets','asset_review_receipts','content_packs','preview_artifacts','pack_review_receipts','content_runs'])state[key]??={};
}

function immutable(collection,id,value,path){
  if(collection[id]&&!same(collection[id],value))fail('RECEIPT_CONFLICT',path,`${id} already identifies different content`);
  collection[id]??=clone(value);
}

function saveBrief(state,brief){
  const key=briefRef(brief);if(state.content_briefs[key]){immutable(state.content_briefs,key,brief,'/content_briefs');return;}
  const prior=values(state.content_briefs).filter(item=>item.brief_id===brief.brief_id).sort((a,b)=>a.brief_revision-b.brief_revision),latest=prior.at(-1)??null;
  if(latest&&(brief.brief_revision!==latest.brief_revision+1||brief.parent_revision!==latest.brief_revision))fail('STATE_CONFLICT','/brief/parent_revision','Brief revisions must append to the current revision');
  if(!latest&&(brief.brief_revision!==1||brief.parent_revision!==null))fail('STATE_CONFLICT','/brief/brief_revision','A new brief starts at revision 1');
  immutable(state.content_briefs,key,brief,'/content_briefs');
}

function normalizedBriefHash(brief){const copy=clone(brief);delete copy.brief_hash;return canonicalHash(copy);}

function assertBrief(brief){
  validate(brief.contract_version===5?'ContentBriefV5':'ContentBriefV3',brief);
  if(brief.brief_hash!==normalizedBriefHash(brief))fail('RECEIPT_CONFLICT','/brief/brief_hash','Brief hash does not match its immutable requirements');
  const slots=brief.visual_request.slots;
  if(brief.visual_request.count!==slots.length)fail('INVALID_INPUT','/brief/visual_request/count','Requested image count must equal declared slots');
  if(brief.visual_request.role==='none'&&slots.length)fail('INVALID_INPUT','/brief/visual_request','A no-image brief cannot contain image slots');
  const ids=new Set(),positions=new Set();
  for(const slot of slots){if(ids.has(slot.slot_id))fail('INVALID_INPUT','/brief/visual_request/slots','Slot IDs must be unique');ids.add(slot.slot_id);const key=`${slot.draft_text_index}:${slot.position_in_post}`;if(positions.has(key))fail('INVALID_INPUT','/brief/visual_request/slots','Image positions must be unique within each post');positions.add(key);}
  if(brief.personalization_mode==='evidence_bound'&&(!brief.context_selection_hash||!brief.used_context_refs.length))fail('MISSING_EVIDENCE','/brief/personalization_mode','Evidence-bound content requires the actual relevant context selection');
  if(brief.personalization_mode==='none'&&(brief.context_selection_hash||brief.used_context_refs.length))fail('INVALID_INPUT','/brief/used_context_refs','Pure editing must not claim unused account evidence');
}

function currentContentValidity(state,brief){
  if(brief?.contract_version!==5)return{issues:[],valid_refs_by_slot:new Map()};
  const issues=[],valid_refs_by_slot=new Map();
  for(const request of brief.media_operations){
    const refs=new Set(),addIssue=(kind,error)=>issues.push({slot_id:request.slot_id,reason:`${kind}_stale:${request.slot_id}`,error});
    if(request.source){try{validateMediaSourceV5(request.source,{deliverable:['reuse_asset','annotate_source'].includes(request.operation)});refs.add(request.source.source_id);}catch(error){if(!(error instanceof ContractError))throw error;addIssue('source',error);}}
    if(request.existing_asset_ref){const entry=state.media_assets?.[request.existing_asset_ref.asset_id],ref=`${request.existing_asset_ref.asset_id}:${request.existing_asset_ref.asset_version}`;if(getAsset(state,request.existing_asset_ref)&&entry?.latest_version===request.existing_asset_ref.asset_version)refs.add(ref);else addIssue('asset',new ContractError('STATE_CONFLICT','/existing_asset_ref','Related media asset changed; refresh the content operation before delivery'));}
    if(request.inspiration_ref){try{resolveInspirationDeliveryRef(state,request.inspiration_ref);refs.add(request.inspiration_ref);}catch(error){if(!(error instanceof ContractError))throw error;addIssue('inspiration',error);}}
    valid_refs_by_slot.set(request.slot_id,refs);
  }
  return{issues,valid_refs_by_slot};
}

function prepareContentV5(state,payload,runId,context){
  assertBrief(payload.brief);assertRecipe(payload.recipe);
  if(payload.brief.recipe_ref!==payload.recipe.recipe_ref||payload.brief.recipe_version!==payload.recipe.recipe_version)fail('INVALID_INPUT','/brief/recipe_ref','Brief must freeze the supplied recipe version');
  if(payload.brief.personalization_mode==='evidence_bound'&&payload.brief.operational_context_hash!==context.operational_context?.selected_context_hash)fail('STALE_BUNDLE','/brief/operational_context_hash','Content brief must bind the current relevant operational context');
  const preferences=context.operational_context?.explicit_preferences??{};
  if(preferences.short_text_on_images===true&&payload.brief.visual_request.count&&payload.brief.visual_request.style.density==='dense')fail('INVALID_INPUT','/brief/visual_request/style/density','Current explicit preference requires less text on images');
  if(preferences.image_usage==='avoid'&&payload.brief.visual_request.count&&!context.operational_context?.temporary_overrides?.allow_images)fail('INVALID_INPUT','/brief/visual_request','Current explicit image preference avoids images unless this task explicitly overrides it');
  const validity=currentContentValidity(state,payload.brief);if(validity.issues.length)throw validity.issues[0].error;
  const id=runId??newId('content_run');if(state.content_runs[id])fail('STATE_CONFLICT','/run_id','Content run already exists');saveBrief(state,payload.brief);immutable(state.recipe_versions,payload.recipe.recipe_ref,payload.recipe,'/recipe_versions');
  const slots=new Map(payload.brief.visual_request.slots.map(item=>[item.slot_id,item])),items=[];let reserved=0;
  if(payload.brief.required_deliverables.includes('text')&&!payload.base_pack_ref){const input={run_id:id,brief_revision_ref:briefRef(payload.brief),slot_id:null,operation:'compose_text',input_refs:[]};items.push({contract_version:5,work_item_id:`content-work-${canonicalHash(input).slice(0,24)}`,...input,input_hash:canonicalHash(input),capability_required:null,generation_cost:0,status:'pending',result_refs:[],actual_tool_receipt_ref:null});}
  for(const request of payload.brief.media_operations){
    if(!slots.has(request.slot_id))fail('INVALID_INPUT','/brief/media_operations','Media operation targets an unknown slot');
    if(request.source)validateMediaSourceV5(request.source,{deliverable:['reuse_asset','annotate_source'].includes(request.operation)});
    const asset=request.existing_asset_ref?getAsset(state,request.existing_asset_ref):null;if(request.operation==='reuse_asset'&&!asset)fail('INVALID_EVIDENCE_REF','/existing_asset_ref','Reuse requires an existing persisted media asset');
    const capability={inspect_asset:'image_view',annotate_source:'image_edit',render_data:'data_render',generate_illustration:'image_generate'}[request.operation]??null,generationCost=['annotate_source','render_data','generate_illustration'].includes(request.operation)?1:0;
    const available=request.operation==='reuse_asset'||(payload.capabilities[capability]==='verified'&&reserved+generationCost<=payload.budget),status=request.operation==='reuse_asset'?'succeeded':available?'pending':'blocked';
    const inputRefs=[request.source?.source_id,request.inspiration_ref,request.existing_asset_ref&&`${request.existing_asset_ref.asset_id}:${request.existing_asset_ref.asset_version}`].filter(Boolean),input={run_id:id,brief_revision_ref:briefRef(payload.brief),slot_id:request.slot_id,operation:request.operation,input_refs:inputRefs};
    items.push({contract_version:5,work_item_id:`content-work-${canonicalHash(input).slice(0,24)}`,...input,input_hash:canonicalHash(input),capability_required:capability,generation_cost:generationCost,status,result_refs:asset?[`${asset.asset_id}:${asset.asset_version}`]:[],actual_tool_receipt_ref:null});if(status==='pending')reserved+=generationCost;
  }
  const run={contract_version:5,run_id:id,status:'prepared',brief_revision_ref:briefRef(payload.brief),recipe_ref:payload.recipe.recipe_ref,base_pack_ref:payload.base_pack_ref,active_pack_ref:payload.base_pack_ref,work_items:items,budget:{reserved,used:0,limit:payload.budget},created_at:payload.as_of,updated_at:payload.as_of,execution_status:'partial',next_actions:[],operational_context_hash:payload.brief.operational_context_hash};
  state.content_runs[id]=validate('ContentRunV5',run);return{state,result:view(state,run)};
}

function ingestContentV5(state,payload,context){
  const run=getRun(state,payload.run_id),item=run.work_items.find(candidate=>candidate.work_item_id===payload.work_item_id);if(!item||item.status!=='pending')fail('STATE_CONFLICT','/work_item_id','Only a pending V5 media task may ingest');
  const receipt=context.actual_tool_receipt;if(!receipt||receipt.contract_version!==5||receipt.receipt_id!==payload.tool_receipt_ref||receipt.status!=='succeeded'||receipt.operation!==item.operation||receipt.input_hash!==item.input_hash)fail('RECEIPT_CONFLICT','/tool_receipt_ref','V5 media receipt must bind the exact work operation and input');
  if(!context.ingested_asset||context.asset_persisted!==true)fail('PERSIST_FAILED','/asset_path','Verified media bytes must be persisted and read back');
  const asset=context.ingested_asset;validate('MediaAssetV3',asset);if(asset.tool_receipt_ref!==receipt.receipt_id)fail('RECEIPT_CONFLICT','/asset_path','Asset must bind the exact host media receipt');
  state.media_assets[asset.asset_id]??={versions:{},latest_version:0};const entry=state.media_assets[asset.asset_id];if(asset.asset_version!==entry.latest_version+1)fail('STATE_CONFLICT','/asset_version','Asset versions must append');entry.versions[asset.asset_version]=clone(asset);entry.latest_version=asset.asset_version;
  item.status='succeeded';item.result_refs=[`${asset.asset_id}:${asset.asset_version}`];item.actual_tool_receipt_ref=receipt.receipt_id;run.budget.used+=item.generation_cost;run.updated_at=payload.as_of;return{state,result:view(state,run)};
}

function assertRecipe(snapshot){
  validate('ContentRecipeSnapshotV3',snapshot);validate('ContentRecipeV3',snapshot.recipe);
  if(snapshot.recipe_id!==snapshot.recipe.recipe_id||snapshot.recipe_version!==snapshot.recipe.recipe_version||snapshot.recipe_hash!==canonicalHash(snapshot.recipe))fail('RECEIPT_CONFLICT','/recipe','Recipe snapshot does not match its validated JSON data');
}

export function resolveContentBrief(request,confirmedPreferences={},runOverride={}){
  const resolved={...clone(confirmedPreferences),...clone(request),...clone(runOverride)};
  assertBrief(resolved);return resolved;
}

export function loadContentRecipe(recipe,{recipe_ref,source_kind='builtin',source_ref=recipe_ref}={}){
  validate('ContentRecipeV3',recipe);
  return validate('ContentRecipeSnapshotV3',{contract_version:3,recipe_ref:recipe_ref??`${recipe.recipe_id}@${recipe.recipe_version}`,recipe_id:recipe.recipe_id,recipe_version:recipe.recipe_version,recipe_hash:canonicalHash(recipe),source_kind,source_ref:source_ref??recipe_ref??recipe.recipe_id,recipe:clone(recipe)});
}

function workItem(runOrId,brief,slot,operation,status,budget,extra={}){
  const run=typeof runOrId==='string'?null:runOrId,runId=run?.run_id??runOrId;
  if(run?.contract_version===5){
    const v5Operation=operation==='edit_image'?'annotate_source':operation,input_refs=[...new Set(extra.input_refs??[])].sort(),input={run_id:runId,brief_revision_ref:briefRef(brief),slot_id:slot?.slot_id??null,operation:v5Operation,input_refs};
    const input_hash=canonicalHash(input),work_item_id=`content-work-${input_hash.slice(0,24)}`;
    return{contract_version:5,work_item_id,...input,input_hash,capability_required:extra.capability_required??null,generation_cost:operation==='edit_image'?1:budget,status,result_refs:[],actual_tool_receipt_ref:null};
  }
  const input={run_id:runId,brief_revision_ref:briefRef(brief),slot_id:slot?.slot_id??null,operation,required_data_refs:slot?.required_data_refs??[],...extra};
  const input_hash=canonicalHash(input),work_item_id=`content-work-${input_hash.slice(0,24)}`;
  return{work_item_id,run_id:runId,brief_revision_ref:briefRef(brief),slot_id:slot?.slot_id??null,pack_target_ref:extra.pack_target_ref??null,operation,input_refs:[...new Set(extra.input_refs??[])].sort(),input_hash,dependency_refs:[...new Set(extra.dependency_refs??[])].sort(),capability_required:extra.capability_required??null,budget_reservation:budget,status,result_refs:[],actual_tool_receipt_ref:null,retry_of:extra.retry_of??null};
}

function nextAction(kind,target,reason,{inputs=[],requires=true,operation=null}={}){return{kind,target_ref:target,required_inputs:inputs,can_resume:true,requires_user_input:requires,reason,operation};}

function refreshRun(run){
  const pending=run.work_items.filter(item=>['pending','running','blocked'].includes(item.status));
  const failed=run.work_items.filter(item=>item.status==='failed');
  if(run.status==='ready'||run.status==='delivered')run.execution_status='complete';
  else if(!run.work_items.some(item=>item.status==='succeeded')&&pending.length&&pending.every(item=>item.status==='blocked'))run.execution_status='blocked';
  else run.execution_status='partial';
  run.next_actions=[];
  for(const item of pending){const unavailable=item.status==='blocked';run.next_actions.push(nextAction(unavailable?'collect':'resume',item.slot_id??item.work_item_id,unavailable?`缺少 ${item.capability_required??'所需材料'}，任务尚未完成`:'继续未完成的实际制作任务',{inputs:unavailable?[item.capability_required??'required capability']:[],requires:unavailable,operation:'resume'}));}
  for(const item of failed)run.next_actions.push(nextAction('retry',item.slot_id??item.work_item_id,'实际工具调用失败；保留已完成部分，可重试该任务',{requires:false,operation:'resume'}));
  if(!run.next_actions.length&&run.active_pack_ref&&run.status!=='ready')run.next_actions.push(nextAction('recheck',run.active_pack_ref,'检查当前整包未满足项',{requires:false,operation:'finalize'}));
  return run;
}

function prepareContent(state,payload,runId){
  assertBrief(payload.brief);assertRecipe(payload.recipe);
  if(payload.brief.recipe_ref!==payload.recipe.recipe_ref||payload.brief.recipe_version!==payload.recipe.recipe_version)fail('INVALID_INPUT','/brief/recipe_ref','Brief must freeze the supplied recipe version');
  const id=runId??newId('content_run');if(state.content_runs[id])fail('STATE_CONFLICT','/run_id','Content run already exists');
  const bRef=briefRef(payload.brief);saveBrief(state,payload.brief);immutable(state.recipe_versions,payload.recipe.recipe_ref,payload.recipe,'/recipe_versions');
  if(payload.base_pack_ref&&!getPack(state,payload.base_pack_ref))fail('MISSING_EVIDENCE','/base_pack_ref','Base pack does not exist');
  const items=[];let reserved=0;
  if(payload.brief.required_deliverables.includes('text')&&!payload.base_pack_ref)items.push(workItem(id,payload.brief,null,'compose_text','pending',0));
  for(const slot of payload.brief.visual_request.slots){
    const operation=slot.role==='chart'?'render_data':'generate_image',capability=slot.role==='chart'?'data_render':'image_generate';
    const missingData=slot.required_data_refs.filter(ref=>![...payload.brief.material_refs,...payload.brief.claim_refs].includes(ref));
    const available=payload.capabilities[capability]==='verified'&&!missingData.length&&reserved<payload.budget;
    items.push(workItem(id,payload.brief,slot,operation,available?'pending':'blocked',available?1:0,{capability_required:capability,input_refs:slot.required_data_refs}));
    if(available)reserved+=1;
  }
  const run={contract_version:3,delivery_intent:payload.delivery_intent??'operational_optimize',delivery_use:payload.delivery_intent==='plain_edit'?'plain_edit':payload.delivery_intent==='pixel_edit'?'pixel_edit':'operational_guidance',run_id:id,status:'prepared',brief_revision_ref:bRef,recipe_ref:payload.recipe.recipe_ref,base_pack_ref:payload.base_pack_ref,active_pack_ref:payload.base_pack_ref,work_items:items,budget:{reserved,used:0,limit:payload.budget},revision_request:null,created_at:payload.as_of,updated_at:payload.as_of,execution_status:'partial',next_actions:[]};
  state.content_runs[id]=refreshRun(run);return{state,result:view(state,run)};
}

function getRun(state,id){const run=state.content_runs[id];if(!run)fail('MISSING_EVIDENCE','/run_id','Content run does not exist');return run;}
function getDraft(state,ref){return state.drafts?.[ref.draft_id]?.revisions?.[ref.revision]??null;}
export function getPack(state,ref){if(!ref)return null;const split=ref.lastIndexOf(':');if(split<1)return null;const id=ref.slice(0,split),revision=Number(ref.slice(split+1));return state.content_packs?.[id]?.revisions?.[revision]??null;}
function getAsset(state,ref){return state.media_assets?.[ref.asset_id]?.versions?.[ref.asset_version]??null;}

function requireActualReceipt(context,item,receiptRef){
  const receipt=context?.actual_tool_receipt;
  if(!receipt||receipt.receipt_id!==receiptRef||receipt.status!=='succeeded'||receipt.input_hash!==item.input_hash)fail('RECEIPT_CONFLICT','/actual_tool_receipt_ref','Actual tool receipt must identify this work item input and a successful call');
}

function ingestContent(state,payload,context){
  const run=getRun(state,payload.run_id),item=run.work_items.find(candidate=>candidate.work_item_id===payload.work_item_id);
  if(!item)fail('MISSING_EVIDENCE','/work_item_id','Work item does not belong to this run');
  if(!['pending','running'].includes(item.status))fail('STATE_CONFLICT','/work_item_id','Only pending or running work may ingest a result');
  if((item.dependency_refs??[]).some(ref=>!run.work_items.some(candidate=>candidate.work_item_id===ref&&candidate.status==='succeeded')))fail('REQUESTED_OUTPUT_INCOMPLETE','/dependency_refs','Work item dependencies are incomplete');
  let ref;
  if(payload.result_kind==='draft_ref'){
    requireActualReceipt(context,item,payload.actual_tool_receipt_ref);
    if(item.operation!=='compose_text'||!getDraft(state,payload.draft_ref))fail('INVALID_EVIDENCE_REF','/draft_ref','Draft result must be the actual saved output of a text task');
    ref=`${payload.draft_ref.draft_id}:${payload.draft_ref.revision}`;
  }else if(payload.result_kind==='media_asset'){
    requireActualReceipt(context,item,payload.tool_receipt_ref);
    if(!['generate_image','edit_image','render_data','inspect_asset'].includes(item.operation)||!context?.ingested_asset)fail('MISSING_EVIDENCE','/asset_path','CLI must read and verify actual media bytes before ingest');
    if(context.asset_persisted!==true)fail('PERSIST_FAILED','/asset_path','Asset must be durably persisted and read back before state references it');
    const asset=context.ingested_asset;validate('MediaAssetV3',asset);
    if(asset.tool_receipt_ref!==payload.tool_receipt_ref||asset.origin_kind!==payload.origin_kind||asset.data_spec_ref!==(payload.data_spec_ref??null))fail('RECEIPT_CONFLICT','/asset_path','Verified asset metadata differs from the requested actual result');
    if(item.operation==='render_data'&&(asset.origin_kind!=='data_rendered'||!asset.data_spec_ref))fail('INVALID_INPUT','/asset_path','Chart work must ingest an actual data-rendered asset with a data specification');
    state.media_assets[asset.asset_id]??={versions:{},latest_version:0};const entry=state.media_assets[asset.asset_id];
    if(asset.asset_version!==entry.latest_version+1)fail('STATE_CONFLICT','/asset_version','Asset versions must append');
    entry.versions[asset.asset_version]=clone(asset);entry.latest_version=asset.asset_version;ref=`${asset.asset_id}:${asset.asset_version}`;
  }else{
    requireActualReceipt(context,item,payload.actual_tool_receipt_ref);
    if(item.operation!=='build_preview'||!context?.ingested_preview)fail('MISSING_EVIDENCE','/preview_path','CLI must read and persist actual preview bytes before ingest');
    if(context.preview_persisted!==true)fail('PERSIST_FAILED','/preview_path','Preview must be durably persisted and read back before state references it');
    const preview=context.ingested_preview;validate('PreviewArtifactV3',preview);
    if(preview.tool_receipt_ref!==payload.actual_tool_receipt_ref)fail('RECEIPT_CONFLICT','/preview_path','Preview metadata differs from the actual render receipt');
    if((item.pack_target_ref??item.input_refs.find(ref=>ref===preview.pack_ref))!==preview.pack_ref)fail('INVALID_EVIDENCE_REF','/preview_path','Preview does not target the frozen pack');
    immutable(state.preview_artifacts,preview.preview_id,preview,'/preview_artifacts');ref=preview.preview_id;
  }
  item.status='succeeded';item.result_refs=[ref];item.actual_tool_receipt_ref=payload.actual_tool_receipt_ref??payload.tool_receipt_ref;
  run.budget.used+=item.generation_cost??item.budget_reservation;run.updated_at=payload.as_of;refreshRun(run);return{state,result:view(state,run)};
}

function resolveDraftEvaluation(state,payload,context){
  const draft=getDraft(state,payload.draft_ref);if(!draft)fail('MISSING_EVIDENCE','/draft_ref','Draft revision is missing');
  const hashes=draft.texts.map(textHash);if(!same(hashes,payload.draft_text_hashes))fail('STALE_DRAFT','/draft_text_hashes','Pack text hashes do not match the exact saved draft');
  const result=context?.evaluate_draft?.(payload.draft_ref,state)??{readiness:draft.validity==='ready'?'ready':'needs_review',evidence_mapping_hash:canonicalHash(draft.fact_mapping),personal_context_selection_hash:draft.personal_context_hash??null,text_hashes:hashes,unmet_requirements:draft.validity==='ready'?[]:['draft_review']};
  if(result.evidence_mapping_hash!==payload.draft_evidence_mapping_hash||result.personal_context_selection_hash!==(payload.personal_context_selection_hash??null)||!same(result.text_hashes,payload.draft_text_hashes))fail('STALE_DRAFT','/draft_evidence_mapping_hash','Draft readiness inputs changed');
  return{draft,result};
}

function assertSlots(state,brief,draft,slots){
  const requests=new Map(brief.visual_request.slots.map(slot=>[slot.slot_id,slot])),seen=new Set(),perPost=new Map();
  for(const slot of slots){
    if(seen.has(slot.slot_id)||!requests.has(slot.slot_id))fail('INVALID_INPUT','/media_slots','Slots must be unique and belong to the brief');seen.add(slot.slot_id);
    if(slot.draft_text_index>=draft.texts.length)fail('INVALID_INPUT','/media_slots/draft_text_index','Slot targets a missing post');
    if(slot.text_anchor_hash!==textHash(draft.texts[slot.draft_text_index]))fail('STALE_DRAFT','/media_slots/text_anchor_hash','Slot text anchor no longer matches its post');
    const position=`${slot.draft_text_index}:${slot.position_in_post}`;if(perPost.has(position))fail('INVALID_INPUT','/media_slots/position_in_post','Slot position is duplicated');perPost.set(position,true);
    const asset=slot.asset_ref?getAsset(state,slot.asset_ref):null;if(slot.asset_ref&&!asset)fail('INVALID_EVIDENCE_REF','/media_slots/asset_ref','Media asset is missing');
    if(requests.get(slot.slot_id).role==='chart'&&(!asset||asset.origin_kind!=='data_rendered'||!asset.data_spec_ref||slot.data_spec_hash!==dataSpecBindingHash(asset)))fail('INVALID_EVIDENCE_REF','/media_slots/data_spec_hash','Chart slot must bind the actual data-rendered asset, render receipt and data specification');
    const count=countAlt(slot.alt);if(count.code_points>1000)fail('INVALID_INPUT','/media_slots/alt','Image alt exceeds 1,000 Unicode code points');
  }
  for(const index of [...new Set(slots.map(slot=>slot.draft_text_index))])if(slots.filter(slot=>slot.draft_text_index===index).length>4)fail('INVALID_INPUT','/media_slots','Each post may contain at most four media slots');
  if(slots.length!==brief.visual_request.count)fail('REQUESTED_OUTPUT_INCOMPLETE','/media_slots','Pack must retain every requested slot, including incomplete slots');
}

function packHash(pack,state){
  return canonicalHash({brief_revision_ref:pack.brief_revision_ref,recipe_ref:pack.recipe_ref,draft_ref:pack.draft_ref,draft_text_hashes:pack.draft_text_hashes,draft_evidence_mapping_hash:pack.draft_evidence_mapping_hash,personal_context_selection_hash:pack.personal_context_selection_hash,media_slots:pack.media_slots.map(slot=>({...slot,asset_byte_sha256:slot.asset_ref?getAsset(state,slot.asset_ref)?.byte_sha256:null}))});
}

function composeContent(state,payload,context){
  const run=getRun(state,payload.run_id),brief=state.content_briefs[run.brief_revision_ref];const {draft}=resolveDraftEvaluation(state,payload,context);assertSlots(state,brief,draft,payload.media_slots);
  const current=run.active_pack_ref?getPack(state,run.active_pack_ref):null,pack_id=current?.pack_id??`pack-${canonicalHash({run_id:run.run_id,brief:run.brief_revision_ref}).slice(0,24)}`,entry=state.content_packs[pack_id],revision=(entry?.latest_revision??0)+1;
  const pack={contract_version:3,pack_id,pack_revision:revision,parent_revision:entry?.latest_revision??null,restored_from_ref:null,brief_revision_ref:run.brief_revision_ref,recipe_ref:run.recipe_ref,draft_ref:clone(payload.draft_ref),draft_text_hashes:clone(payload.draft_text_hashes),draft_evidence_mapping_hash:payload.draft_evidence_mapping_hash,personal_context_selection_hash:payload.personal_context_selection_hash??null,media_slots:clone(payload.media_slots),pack_content_hash:'',created_at:payload.as_of};pack.pack_content_hash=packHash(pack,state);
  state.content_packs[pack_id]??={revisions:{},latest_revision:0};state.content_packs[pack_id].revisions[revision]=pack;state.content_packs[pack_id].latest_revision=revision;run.active_pack_ref=packRef(pack);run.status='composed';run.updated_at=payload.as_of;
  if(brief.required_deliverables.includes('preview')){
    const existing=run.work_items.find(item=>item.operation==='build_preview'&&(item.pack_target_ref===run.active_pack_ref||item.contract_version===5&&item.input_refs.includes(run.active_pack_ref)));
    if(!existing){const available=context?.capabilities?.preview_render==='verified';run.work_items.push(workItem(run,brief,null,'build_preview',available?'pending':'blocked',0,{capability_required:'preview_render',pack_target_ref:run.active_pack_ref,input_refs:[run.active_pack_ref]}));}
  }
  refreshRun(run);return{state,result:{...view(state,run),pack:clone(pack)}};
}

function activeReceipt(receipts,subjectHash){
  const candidates=receipts.filter(receipt=>receipt.subject_hash===subjectHash||receipt.pack_content_hash===subjectHash);if(!candidates.length)return null;
  const superseded=new Set(candidates.map(receipt=>receipt.supersedes_receipt_ref).filter(Boolean));return candidates.filter(receipt=>!superseded.has(receipt.receipt_id)).sort((a,b)=>String(b.reviewed_at).localeCompare(String(a.reviewed_at))||b.receipt_id.localeCompare(a.receipt_id))[0]??null;
}

function requireActualReview(context,receiptRef,subjectHash){const receipt=context?.actual_review_receipt;if(!receipt||receipt.receipt_id!==receiptRef||receipt.status!=='succeeded'||receipt.subject_hash!==subjectHash)fail('RECEIPT_CONFLICT','/receipt/actual_tool_receipt_ref','Review must bind an actual successful view of this exact subject');}

function reviewContent(state,payload,context){
  const run=getRun(state,payload.run_id),pack=getPack(state,run.active_pack_ref);if(!pack)fail('MISSING_EVIDENCE','/run_id','Review requires a saved pack');
  if(payload.review_kind==='asset'){
    const receipt=payload.receipt;validate('AssetReviewReceiptV3',receipt);const asset=getAsset(state,receipt.asset_ref),slot=pack.media_slots.find(item=>item.asset_ref&&same(item.asset_ref,receipt.asset_ref));
    if(!asset||!slot||receipt.subject_hash!==assetReviewSubjectHash(asset,slot))fail('STALE_BUNDLE','/receipt/subject_hash','Asset review is not bound to current bytes, alt and fact mappings');
    requireActualReview(context,receipt.actual_tool_receipt_ref,receipt.subject_hash);
    for(const key of (payload.review_kind==='asset'||state.schema_version===4?['decision','checks','issues']:['decision','issues']))if(context.actual_review_result?.[key]===undefined||!same(context.actual_review_result[key],receipt[key]))fail('RECEIPT_CONFLICT',`/receipt/${key}`,'Saved visual review differs from the actual review result');
    if(receipt.decision==='approved'&&!Object.values(receipt.checks).every(Boolean))fail('INVALID_INPUT','/receipt/checks','Approved asset review requires every actual check');
    if(receipt.decision==='approved')for(const mapping of slot.visible_text_and_region_mapping){const actual=asset.visible_text_observation.find(item=>item.region_id===mapping.region_id&&item.text===mapping.visible_text_or_number&&item.observation_method!=='none');if(mapping.verification_status==='verified'&&!actual)fail('INVALID_EVIDENCE_REF','/receipt/subject_hash','Verified visible text is not present in the actual viewed asset observation');}
    if(receipt.supersedes_receipt_ref&&!state.asset_review_receipts[receipt.supersedes_receipt_ref])fail('INVALID_EVIDENCE_REF','/receipt/supersedes_receipt_ref','Superseded review does not exist');immutable(state.asset_review_receipts,receipt.receipt_id,receipt,'/asset_review_receipts');
  }else{
    const receipt=payload.receipt;validate('PackReviewReceiptV3',receipt);const preview=state.preview_artifacts[receipt.preview_ref];
    const subject=canonicalHash({pack_ref:receipt.pack_ref,pack_content_hash:receipt.pack_content_hash,preview_ref:receipt.preview_ref,preview_hash:receipt.preview_hash});
    if(receipt.subject_hash!==subject||receipt.pack_ref!==run.active_pack_ref||receipt.pack_content_hash!==pack.pack_content_hash||!preview||preview.pack_ref!==run.active_pack_ref||receipt.preview_hash!==preview.byte_sha256)fail('STALE_BUNDLE','/receipt','Pack review is not bound to this pack and actual preview');
    requireActualReview(context,receipt.actual_tool_receipt_ref,receipt.subject_hash);
    for(const key of (payload.review_kind==='asset'||state.schema_version===4?['decision','checks','issues']:['decision','issues']))if(context.actual_review_result?.[key]===undefined||!same(context.actual_review_result[key],receipt[key]))fail('RECEIPT_CONFLICT',`/receipt/${key}`,'Saved visual review differs from the actual review result');
    if(receipt.decision==='approved'&&receipt.issues.length)fail('INVALID_INPUT','/receipt/issues','Approved pack review cannot retain unresolved issues');
    if(receipt.supersedes_receipt_ref&&!state.pack_review_receipts[receipt.supersedes_receipt_ref])fail('INVALID_EVIDENCE_REF','/receipt/supersedes_receipt_ref','Superseded review does not exist');immutable(state.pack_review_receipts,receipt.receipt_id,receipt,'/pack_review_receipts');
  }
  run.status='awaiting_review';run.updated_at=payload.as_of;refreshRun(run);return{state,result:view(state,run)};
}

export function evaluatePackReadiness(state,packRefValue,context={},run=null){
  const pack=getPack(state,packRefValue);if(!pack)return{readiness:'incomplete',unmet_requirements:['pack_missing']};const brief=state.content_briefs[run?.contract_version===5?run.brief_revision_ref:pack.brief_revision_ref],unmet=currentContentValidity(state,brief).issues.map(item=>item.reason);
  const draftResult=context.evaluate_draft?.(pack.draft_ref,state)??{readiness:getDraft(state,pack.draft_ref)?.validity==='ready'?'ready':'needs_review',evidence_mapping_hash:canonicalHash(getDraft(state,pack.draft_ref)?.fact_mapping??[]),personal_context_selection_hash:getDraft(state,pack.draft_ref)?.personal_context_hash??null};
  if(draftResult.readiness!=='ready'||draftResult.evidence_mapping_hash!==pack.draft_evidence_mapping_hash)unmet.push('draft_review');
  if(pack.personal_context_selection_hash!==draftResult.personal_context_selection_hash)unmet.push('personal_context_selection_current_draft');
  if(brief.personalization_mode==='evidence_bound'&&(!pack.personal_context_selection_hash||pack.personal_context_selection_hash!==brief.context_selection_hash))unmet.push('personal_context_selection');
  if(brief.required_deliverables.includes('sources')&&!brief.material_refs.length&&!brief.claim_refs.length)unmet.push('source_mapping_missing');
  if(brief.blockers.length)unmet.push(...brief.blockers.map((_,index)=>`brief_blocker:${index}`));
  for(const slot of pack.media_slots){
    if(!slot.asset_ref){unmet.push(`asset_missing:${slot.slot_id}`);continue;}const asset=getAsset(state,slot.asset_ref);
    if(!asset||context.verify_artifact?.(asset.artifact_ref,asset.byte_sha256)===false){unmet.push(`asset_unrecoverable:${slot.slot_id}`);continue;}
    if(brief.required_deliverables.includes('alt')&&!slot.alt.trim())unmet.push(`alt_missing:${slot.slot_id}`);
    const subject=assetReviewSubjectHash(asset,slot),review=activeReceipt(values(state.asset_review_receipts),subject);if(!review||review.decision!=='approved')unmet.push(`asset_review:${slot.slot_id}`);
    if(slot.visible_text_and_region_mapping.some(region=>region.verification_status==='unverified'))unmet.push(`asset_fact_unverified:${slot.slot_id}`);
    if(context.evidence_ref_status)for(const evidenceRef of [...slot.used_evidence_versions,...slot.claim_and_user_fact_bindings])if(context.evidence_ref_status(evidenceRef,state)!=='current')unmet.push(`evidence_stale:${slot.slot_id}:${evidenceRef}`);
  }
  let preview=null;if(brief.required_deliverables.includes('preview')){preview=values(state.preview_artifacts).filter(item=>item.pack_ref===packRefValue&&item.pack_content_hash===pack.pack_content_hash).sort((a,b)=>Temporal.Instant.compare(b.created_at,a.created_at)||b.preview_id.localeCompare(a.preview_id))[0];if(!preview||context.verify_artifact?.(preview.artifact_ref,preview.byte_sha256)===false)unmet.push('preview_missing');}
  const packReview=preview?activeReceipt(values(state.pack_review_receipts).filter(item=>item.pack_ref===packRefValue&&item.preview_ref===preview.preview_id&&item.preview_hash===preview.byte_sha256&&item.pack_content_hash===pack.pack_content_hash),pack.pack_content_hash):null;if(!packReview||packReview.decision!=='approved')unmet.push('pack_review');
  const materialMissing=unmet.some(item=>/missing|unrecoverable|brief_blocker|personal_context|evidence_stale|source_stale|asset_stale|inspiration_stale/.test(item));return{readiness:unmet.length?(materialMissing?'incomplete':'needs_review'):'ready',unmet_requirements:[...new Set(unmet)]};
}

function finalizeContent(state,payload,context){
  const run=getRun(state,payload.run_id);if(!run.active_pack_ref)fail('REQUESTED_OUTPUT_INCOMPLETE','/run_id','No composed pack is available');const readiness=evaluatePackReadiness(state,run.active_pack_ref,context,run);
  run.status=readiness.readiness==='ready'?'ready':readiness.readiness==='needs_review'?'awaiting_review':'partial';run.updated_at=payload.as_of;refreshRun(run);
  if(readiness.unmet_requirements.length)run.next_actions=readiness.unmet_requirements.map(item=>nextAction(item.includes('review')?'recheck':item.includes('asset')?'retry':'provide_material',run.active_pack_ref,item,{requires:!item.includes('review'),operation:item.includes('review')?'review':'resume'}));
  return{state,result:{...view(state,run),pack_readiness:readiness,user_summary:readiness.readiness==='ready'?'图文稿件、实际资产、alt、预览和审核均已就绪。':`已保存当前图文稿件；仍有 ${readiness.unmet_requirements.length} 项未满足。`}};
}

function reviseContent(state,payload,context){
  const run=getRun(state,payload.run_id),pack=getPack(state,run.active_pack_ref);if(!pack)fail('MISSING_EVIDENCE','/run_id','Revision requires a current pack');
  if(payload.updated_brief){if(run.contract_version===5)fail('INVALID_INPUT','/updated_brief','A V5 run cannot adopt a legacy brief revision');assertBrief(payload.updated_brief);const ref=briefRef(payload.updated_brief);saveBrief(state,payload.updated_brief);run.brief_revision_ref=ref;}
  const brief=state.content_briefs[run.brief_revision_ref];run.revision_request={scope:payload.scope,target_slot_id:payload.target_slot_id,instruction_ref:payload.instruction_ref,base_pack_ref:run.active_pack_ref,created_at:payload.as_of};
  const slots=payload.scope==='asset_slot'?[brief.visual_request.slots.find(slot=>slot.slot_id===payload.target_slot_id)]:payload.scope==='style'?brief.visual_request.slots:[];
  if(payload.scope==='asset_slot'&&!slots[0])fail('INVALID_INPUT','/target_slot_id','Target slot does not exist');
  if(payload.scope==='text')run.work_items.push(workItem(run,brief,null,'compose_text','pending',0,{input_refs:[run.active_pack_ref,payload.instruction_ref]}));
  else for(const slot of slots){const can=context?.capabilities?.image_edit==='verified'&&run.budget.reserved<run.budget.limit;run.work_items.push(workItem(run,brief,slot,'edit_image',can?'pending':'blocked',can?1:0,{capability_required:'image_edit',input_refs:[run.active_pack_ref,payload.instruction_ref]}));if(can)run.budget.reserved+=1;}
  run.status='awaiting_materials';run.updated_at=payload.as_of;refreshRun(run);return{state,result:view(state,run)};
}

function restoreContent(state,payload,context){
  const run=getRun(state,payload.run_id),source=getPack(state,payload.source_pack_ref);if(!source)fail('MISSING_EVIDENCE','/source_pack_ref','Historical pack is missing');const current=run.active_pack_ref&&getPack(state,run.active_pack_ref),pack_id=current?.pack_id??source.pack_id,entry=state.content_packs[pack_id]??{revisions:{},latest_revision:0},revision=entry.latest_revision+1;
  const pack={...clone(source),pack_id,pack_revision:revision,parent_revision:entry.latest_revision||null,restored_from_ref:payload.source_pack_ref,created_at:payload.as_of};pack.pack_content_hash=packHash(pack,state);state.content_packs[pack_id]=entry;entry.revisions[revision]=pack;entry.latest_revision=revision;run.active_pack_ref=packRef(pack);if(run.contract_version===3){run.brief_revision_ref=pack.brief_revision_ref;run.recipe_ref=pack.recipe_ref;}run.status='composed';run.revision_request=null;run.updated_at=payload.as_of;
  const brief=state.content_briefs[run.brief_revision_ref];if(brief.required_deliverables.includes('preview')){const available=context?.capabilities?.preview_render==='verified';run.work_items.push(workItem(run,brief,null,'build_preview',available?'pending':'blocked',0,{capability_required:'preview_render',pack_target_ref:run.active_pack_ref,input_refs:[run.active_pack_ref]}));}refreshRun(run);return{state,result:{...view(state,run),pack:clone(pack)}};
}

function resumeContent(state,payload,context){
  const run=getRun(state,payload.run_id),brief=state.content_briefs[run.brief_revision_ref],validity=currentContentValidity(state,brief),availableRefs=new Set([...brief.material_refs,...brief.claim_refs,run.revision_request?.instruction_ref].filter(Boolean));
  for(const item of run.work_items.filter(candidate=>candidate.status==='failed'))item.status='pending';
  for(const item of run.work_items.filter(candidate=>candidate.status==='blocked')){const reservation=item.contract_version===5?item.generation_cost:item.operation==='build_preview'?0:1,slotIssues=validity.issues.some(issue=>issue.slot_id===item.slot_id),slotRefs=validity.valid_refs_by_slot.get(item.slot_id)??new Set();if(item.capability_required&&context?.capabilities?.[item.capability_required]==='verified'&&!slotIssues&&item.input_refs.every(ref=>availableRefs.has(ref)||slotRefs.has(ref)||ref===run.active_pack_ref)&&(reservation===0||run.budget.reserved+reservation<=run.budget.limit)){item.status='pending';if(item.contract_version!==5)item.budget_reservation=reservation;run.budget.reserved+=reservation;}}
  run.updated_at=payload.as_of;refreshRun(run);
  if(run.active_pack_ref)return finalizeContent(state,payload,context);
  return{state,result:view(state,run)};
}

function view(state,run){return{run:clone(run),brief:clone(state.content_briefs[run.brief_revision_ref]),recipe:clone(state.recipe_versions[run.recipe_ref]),active_pack:clone(getPack(state,run.active_pack_ref)),user_summary:run.status==='ready'?'当前图文稿件已就绪。':'当前结果已保存，可按 next_actions 继续。',next_actions:clone(run.next_actions)};}

export function advanceContent(state,payload,runId=null,context={}){
  if(!state||!isReliableState(state))fail('MIGRATION_REQUIRED','/state/schema_version','Content production requires state 3');contentCollections(state);validate(payload.contract_version===5?'ContentStepPayloadV5':'ContentStepPayloadV3',payload);
  if(payload.contract_version===5&&payload.operation==='prepare')return prepareContentV5(state,payload,runId,context);
  if(payload.contract_version===5&&payload.operation==='ingest')return ingestContentV5(state,payload,context);
  if(payload.contract_version===5&&payload.operation==='compose'){const projected={...payload,contract_version:3};return composeContent(state,projected,context);}
  if(payload.operation==='prepare')return prepareContent(state,payload,runId);
  if(runId&&payload.run_id!==runId)fail('STATE_CONFLICT','/run_id','Envelope and payload run IDs differ');
  if(payload.operation==='ingest')return ingestContent(state,payload,context);
  if(payload.operation==='compose')return composeContent(state,payload,context);
  if(payload.operation==='review')return reviewContent(state,payload,context);
  if(payload.operation==='finalize')return finalizeContent(state,payload,context);
  if(payload.operation==='revise')return reviseContent(state,payload,context);
  if(payload.operation==='restore')return restoreContent(state,payload,context);
  if(payload.operation==='resume')return resumeContent(state,payload,context);
  fail('INVALID_INPUT','/operation','Unsupported content operation');
}
