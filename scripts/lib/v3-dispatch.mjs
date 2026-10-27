import {currentGuidance} from './v4-dispatch.mjs';
import {
  createHash
}
from 'node:crypto';
import {
  readFile, writeFile, mkdir, rename, readdir
}
from 'node:fs/promises';
import {
  join, basename, extname
}
from 'node:path';
import {
  canonicalHash, textHash, validate, ContractError
}
from './contracts.mjs';
import {
  commitState, saveDraft, putImmutable, saveSourceVersion
}
from './state.mjs';
import {
  resolveConfig
}
from './config.mjs';
import {
  checkDraftV3, evaluateDraftReadiness
}
from './draft.mjs';
import {
  advanceContent, getPack, evaluatePackReadiness
}
from './content.mjs';
import {
  inspectMediaBytes, inspectPreviewBytes
}
from './media.mjs';
import {
  advanceCoaching
}
from './coaching.mjs';
import {
  coachingRunResult
}
from './v2-dispatch.mjs';
import {
  buildReviewComputation, validateExperimentPlanViewV3
}
from './review.mjs';
import {
  applyExperimentTransitionV3
}
from './experiments.mjs';
import {
  migrateStateV3
}
from './migrations.mjs';
const byteHash=value=>createHash('sha256').update(value).digest('hex');
const fail=(code,path,message)=>{
  throw new ContractError(code,path,message);
}
;
export async function verifyHostMediaReceipt(receipt) {
  if(receipt?.contract_version===5){
    if(receipt.purpose){const {verifyHostReviewReceiptV5}=await import('./host-review-v5.mjs');return verifyHostReviewReceiptV5(receipt);}
    validate('HostMediaReceiptV5',receipt);const bytes=await readFile(receipt.actual_result_ref);
    if(byteHash(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/actual_result_sha256','Actual media result changed');
    return receipt;
  }
  validate('HostMediaReceiptV3',receipt);
  const bytes=await readFile(receipt.actual_result_ref);
  if(byteHash(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/actual_result_sha256','Actual host result changed');
  if(receipt.operation.startsWith('review_')){
    let actual;
    try{
      actual=JSON.parse(bytes.toString('utf8'));
    }
    catch{
      fail('INVALID_INPUT','/actual_result_ref','Actual review must be recoverable structured JSON');
    }
    if(actual.subject_hash!==receipt.subject_hash||!['approve','approved','revise','revision_required'].includes(actual.decision))fail('RECEIPT_CONFLICT','/subject_hash','Actual review result does not bind the declared subject and decision');
  }
  return receipt;
}
async function persistBytes(dir,bytes,extension) {
  const sha=byteHash(bytes),folder=join(dir,'media');
  await mkdir(folder,{
    recursive:true,mode:0o700
  }
  );
  const existing=(await readdir(folder)).find(name=>name.startsWith(sha+'.'));
  if(existing){
    const saved=join(folder,existing);
    if(byteHash(await readFile(saved))!==sha)fail('PERSIST_FAILED','/artifact','Existing content-addressed bytes changed');
    return saved;
  }
  const path=join(folder,`${sha}.${extension}`),temp=join(folder,`.${crypto.randomUUID()}.tmp`);
  await writeFile(temp,bytes,{
    flag:'wx',mode:0o600
  }
  );
  await rename(temp,path);
  if(byteHash(await readFile(path))!==sha)fail('PERSIST_FAILED','/artifact','Managed bytes failed readback');
  return path;
}
export async function contentContext(state,dir,payload={
}
) {
  const hashes=new Map();
  for(const entry of Object.values(state.media_assets??{
  }
  ))for(const asset of Object.values(entry.versions)){
    try{
      hashes.set(asset.artifact_ref,byteHash(await readFile(asset.artifact_ref)));
      if(asset.data_spec_ref){
        const spec=await readFile(asset.data_spec_ref);
        if(!basename(asset.data_spec_ref).startsWith(byteHash(spec)+'.'))hashes.set(asset.artifact_ref,null);
      }
    }
    catch{
      hashes.set(asset.artifact_ref,null);
    }
  }
  for(const preview of Object.values(state.preview_artifacts??{
  }
  )){
    try{
      hashes.set(preview.artifact_ref,byteHash(await readFile(preview.artifact_ref)));
    }
    catch{
      hashes.set(preview.artifact_ref,null);
    }
  }
  const validDraftReviews=new Set();
  for(const audit of Object.values(state.draft_review_receipts??{
  }
  )){
    const actual=state.host_media_receipts[audit.actual_review_receipt_ref];
    if(actual)try{
      await verifyHostMediaReceipt(actual);
      validDraftReviews.add(actual.receipt_id);
    }
    catch{
    }
  }
  const context={
    evidence_ref_status:(ref,s)=>{
      const claim=s.claims[ref];
      if(claim)return ['supported','attributed','inferred'].includes(claim.support_status)?'current':'stale';
      for(const source of Object.values(s.sources)){
        const version=source.versions[ref];
        if(version)return source.latest_version_id===ref&&version.read_status==='read'?'current':'stale';
      }
      if(s.user_facts[ref]||s.sources[ref]||s.post_versions[ref])return 'current';
      return 'missing';
    }
    ,evaluate_draft:(ref,s)=>{
      const result=evaluateDraftReadiness(ref,null,s);
      const effective=s.draft_review_receipts[result.review_receipt_ref];
      if(!effective||!validDraftReviews.has(effective.actual_review_receipt_ref))return{
        ...result,readiness:'needs_review',unmet_requirements:[...result.unmet_requirements,'draft_review_unrecoverable']
      }
      ;
      return result;
    }
    ,verify_artifact:(ref,hash)=>hashes.get(ref)===hash
  }
  ;
  context.capabilities={
    image_generate:'unverified',image_edit:'unverified',data_render:'unverified',preview_render:'unverified',image_view:'unverified',artifact_persistence:'verified'
  }
  ;
  const capabilityByOperation={
    generate_image:'image_generate',edit_image:'image_edit',render_data:'data_render',build_preview:'preview_render',review_asset:'image_view'
  }
  ;
  for(const receipt of Object.values(state.host_media_receipts??{
  }
  ))if(receipt.status==='succeeded'&&capabilityByOperation[receipt.operation]){
    try{
      await verifyHostMediaReceipt(receipt);
      context.capabilities[capabilityByOperation[receipt.operation]]='verified';
    }
    catch{
    }
  }
  if(payload.operation==='ingest'){
    const receiptRef=payload.tool_receipt_ref??payload.actual_tool_receipt_ref;
    const receipt=state.host_media_receipts[receiptRef];
    if(!receipt)fail('MISSING_EVIDENCE','/tool_receipt_ref','Record actual host receipt first');
    await verifyHostMediaReceipt(receipt);
    context.actual_tool_receipt=receipt;
    const item=state.content_runs[payload.run_id]?.work_items.find(w=>w.work_item_id===payload.work_item_id);
    if(!item||receipt.operation!==item.operation)fail('RECEIPT_CONFLICT','/operation','Receipt belongs to another host operation');
    if(payload.result_kind==='media_asset'){
      const bytes=await readFile(payload.asset_path);
      if(byteHash(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/asset_path','Image bytes must be the actual host result');
      let dataSpecRef=payload.data_spec_ref;
      if(dataSpecRef){
        const specBytes=await readFile(dataSpecRef),spec=JSON.parse(specBytes.toString('utf8'));
        if(!(Array.isArray(spec.data)?spec.data.length:spec.data&&typeof spec.data==='object'&&Object.keys(spec.data).length)||typeof spec.method!=='string'||!spec.method.trim()||typeof spec.unit!=='string'||!spec.unit.trim()||!spec.axes||typeof spec.axes!=='object'||!Object.keys(spec.axes).length||!Array.isArray(spec.source_refs)||!spec.source_refs.length)fail('INVALID_INPUT','/data_spec_ref','Actual chart specification needs data, method, unit, axes and source_refs');
        const available=ref=>state.sources[ref]||Object.values(state.sources).some(s=>s.versions[ref])||Object.values(state.import_artifacts).some(a=>a.source_ref===ref);
        if(!spec.source_refs.every(ref=>typeof ref==='string'&&available(ref)))fail('INVALID_EVIDENCE_REF','/data_spec_ref/source_refs','Chart source material is missing');
        dataSpecRef=await persistBytes(dir,specBytes,'data.json');
      }
      const path=await persistBytes(dir,bytes,'image'),id=`asset-${item.slot_id}`,version=(state.media_assets[id]?.latest_version??0)+1;
      context.ingested_asset=inspectMediaBytes(bytes,{
        asset_id:id,asset_version:version,artifact_ref:path,origin_kind:payload.origin_kind,source_refs:payload.source_refs,tool_receipt_ref:receiptRef,visible_text_observation:payload.visible_text_observation,data_spec_ref:dataSpecRef,created_at:payload.as_of,persistence_receipt_ref:`sha256:${byteHash(bytes)}`
      }
      );
      hashes.set(path,byteHash(bytes));
      context.asset_persisted=true;
    }
    else if(payload.result_kind==='preview'){
      const bytes=await readFile(payload.preview_path);
      if(byteHash(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/preview_path','Preview bytes differ from actual result');
      const path=await persistBytes(dir,bytes,payload.preview_path.endsWith('.md')?'md':'html'),pack=getPack(state,item.pack_target_ref);
      context.ingested_preview=inspectPreviewBytes(bytes,{
        preview_id:`preview:${byteHash(bytes)}`,pack_ref:item.pack_target_ref,pack_content_hash:pack.pack_content_hash,artifact_ref:path,created_at:payload.as_of,persistence_receipt_ref:`sha256:${byteHash(bytes)}`,tool_receipt_ref:receiptRef
      }
      );
      hashes.set(path,byteHash(bytes));
      context.preview_persisted=true;
    }
  }
  if(payload.operation==='review'){
    const receipt=state.host_media_receipts[payload.receipt.actual_tool_receipt_ref];
    if(!receipt)fail('MISSING_EVIDENCE','/actual_tool_receipt_ref','Record actual visual review result first');
    await verifyHostMediaReceipt(receipt);
    if(receipt.operation!==`review_${payload.review_kind}`)fail('RECEIPT_CONFLICT','/operation','Review tool receipt operation differs');
    context.actual_review_receipt=receipt;
    const actual=JSON.parse(await readFile(receipt.actual_result_ref,'utf8'));
    context.actual_review_result={decision:['approve','approved'].includes(actual.decision)?'approved':'revision_required',checks:actual.checks,issues:actual.issues};
  }
  return context;
}
export async function dispatchV3(command,request,dir,state) {
  const p=request.payload;
  if(command==='state-migrate')return migrateStateV3(dir,p,request.expected_revision);
  if(!state||![3,4,5].includes(state.schema_version))fail('MIGRATION_REQUIRED','/schema_version','Preview and apply state 3 migration before new work');
  if(command==='coach-step'){
    let data;
    const next=await commitState(dir,request.expected_revision,working=>{
      const advanced=advanceCoaching(working,p,request.run_id);
      data=advanced.result;
      return advanced.state;
    }
    );
    return{
      state:next,data:{
        ...data,state_revision:next.revision,run_result:coachingRunResult(next,data.run.run_id)
      }
    }
    ;
  }
  if(command==='review'){
    let computation;
    const next=await commitState(dir,request.expected_revision,working=>{
      const plan=working.experiment_plan_views[p.plan_view_ref];
      if(!plan)fail('MISSING_EVIDENCE','/plan_view_ref','Plan view missing');
      computation=buildReviewComputation(working,plan,p);
      putImmutable(working.review_computations,computation.computation_id,computation);
      return working;
    }
    );
    return{
      state:next,data:{
        review_computation:computation
      }
    }
    ;
  }
  if(command==='draft-check'){
    if(p.actual_review_receipt_ref){
      const receipt=state.host_media_receipts[p.actual_review_receipt_ref];
      if(!receipt)fail('MISSING_EVIDENCE','/actual_review_receipt_ref','Draft review receipt missing');
      await verifyHostMediaReceipt(receipt);
      const actual=JSON.parse(await readFile(receipt.actual_result_ref,'utf8'));
      if(actual.decision!=='approve'||canonicalHash(actual.review)!==canonicalHash(p.draft_input.semantic_review))fail('RECEIPT_CONFLICT','/semantic_review','Actual draft review differs from the submitted semantic decision');
    }
    return{
      state,data:checkDraftV3(p,{
        state,effective_config:resolveConfig(state.config,null,p.as_of)
      }
      )
    }
    ;
  }
  if(command==='content-step'){
    if(request.run_id&&p.run_id&&request.run_id!==p.run_id)fail('STATE_CONFLICT','/run_id','Run IDs differ');
    const context=await contentContext(state,dir,p);
    let result;
    const next=await commitState(dir,request.expected_revision,working=>{
      const internal=p.result_kind==='media_asset'&&context.ingested_asset?{
        ...p,data_spec_ref:context.ingested_asset.data_spec_ref
      }
      :p;
      const advanced=advanceContent(working,internal,request.run_id,context);
      result=advanced.result;
      return advanced.state;
    }
    );
    return{
      state:next,data:{
        ...result,state_revision:next.revision
      }
    }
    ;
  }
  if(command==='record'){
    let storedHostReceipt=null;
    if(p.operation==='host_media_receipt'){
      await verifyHostMediaReceipt(p.data);
      const bytes=await readFile(p.data.actual_result_ref),extension=extname(p.data.actual_result_ref).slice(1);
      const path=await persistBytes(dir,bytes,['png','jpg','jpeg','json','txt','md','html'].includes(extension)?extension:'bin');
      storedHostReceipt={
        ...p.data,source_result_ref:p.data.source_result_ref??p.data.actual_result_ref,actual_result_ref:path
      }
      ;
    }
    let result;
    const next=await commitState(dir,request.expected_revision,async working=>{
      if(p.operation==='source_evidence'){
        const {
          source_record:source,source_version:version,raw_receipt:receipt,actual_result_path:path
        }
        =p.data;
        const actual=JSON.parse(await readFile(path,'utf8'));
        const contains=(value,text)=>typeof value==='string'?value.includes(text):value&&typeof value==='object'?Object.values(value).some(item=>contains(item,text)):false;
        if(receipt.status!=='succeeded'||receipt.raw_result_ref!==path||canonicalHash(actual)!==receipt.raw_hash||canonicalHash(actual)!==canonicalHash(receipt.raw_result)||version.raw_receipt_ref!==receipt.receipt_id||version.ticket_id!==receipt.ticket_id||version.source_id!==source.source_id||version.captured_text_hash!==textHash(version.captured_text)||!contains(actual,version.captured_text))fail('RECEIPT_CONFLICT','/source_evidence','Source version must retain exact material from the actual recovered host result');
        putImmutable(working.raw_receipts,receipt.receipt_id,receipt);
        saveSourceVersion(working,source,version,p.as_of);
        result={
          record_refs:[source.source_id,version.source_version_id,receipt.receipt_id]
        }
        ;
      }
      else if(p.operation==='experiment_plan_view'){
        const view=validateExperimentPlanViewV3(working,p.data);
        putImmutable(working.experiment_plan_views,view.plan_view_id,view);
        result={
          record_refs:[view.plan_view_id]
        }
        ;
      }
      else if(p.operation==='experiment_v3'){
        const updated=applyExperimentTransitionV3(working,p.event);
        Object.assign(working,updated);
        result={
          record_refs:[p.event.experiment_id]
        }
        ;
      }
      else if(p.operation==='draft_review'){
        const {
          draft,review_receipt:receipt
        }
        =p.data;
        if(receipt.actual_review_receipt_ref){
          const actual=working.host_media_receipts[receipt.actual_review_receipt_ref];
          if(!actual)fail('MISSING_EVIDENCE','/actual_review_receipt_ref','Actual draft review missing');
          await verifyHostMediaReceipt(actual);
          const reviewResult=JSON.parse(await readFile(actual.actual_result_ref,'utf8'));
          if(reviewResult.decision!=='approve'||canonicalHash(reviewResult.review)!==canonicalHash(receipt.semantic_review))fail('RECEIPT_CONFLICT','/semantic_review','Actual draft review does not support this approval');
        }
        const input={
        }
        ;
        for(const key of ['draft_id','revision','parent_revision','card_id','original_text','original_ref','format','texts'])input[key]=draft[key];
        if(draft.edit_base_ref!==undefined)input.edit_base_ref=draft.edit_base_ref;
        input.fact_mapping=receipt.fact_mapping;
        input.semantic_review=receipt.semantic_review;
        const checked=checkDraftV3({
          contract_version:3,delivery_intent:receipt.delivery_intent??'operational_optimize',draft_input:input,personalization_mode:receipt.personalization_mode,personal_context_selection:receipt.personal_context_selection,supersedes_receipt_ref:receipt.supersedes_receipt_ref,actual_review_receipt_ref:receipt.actual_review_receipt_ref??null,as_of:receipt.reviewed_at
        }
        ,{
          state:working,effective_config:resolveConfig(working.config,null,p.as_of)
        }
        );
        if(canonicalHash(checked.review_receipt)!==canonicalHash(receipt))fail('RECEIPT_CONFLICT','/review_receipt','Save requires exact recomputed review');
        saveDraft(working,checked.draft);
        putImmutable(working.draft_review_receipts,receipt.receipt_id,receipt);
        result={
          draft_ref:receipt.draft_ref,review_ref:receipt.receipt_id
        }
        ;
      }
      else if(p.operation==='host_media_receipt'){
        putImmutable(working.host_media_receipts,p.data.receipt_id,storedHostReceipt);
        result={
          record_refs:[p.data.receipt_id]
        }
        ;
      }
      else if(p.operation==='adoption'){
        const data=p.data;
        const draftReview=working.draft_review_receipts[data.draft_review_ref];
        if([4,5].includes(working.schema_version)){const run=data.pack_ref?Object.values(working.content_runs).find(r=>r.active_pack_ref===data.pack_ref):null;const intent=run?.delivery_intent??draftReview?.delivery_intent??'operational_optimize';const gate=await currentGuidance(working,data.pack_ref??`${data.draft_ref.draft_id}:${data.draft_ref.revision}`,{intent,use:intent==='plain_edit'?'plain_edit':'operational_guidance',content_readiness:{readiness:'ready'}});if(gate.task_readiness!=='ready')fail('REQUESTED_OUTPUT_INCOMPLETE','/guidance','Adoption requires current approval of the complete operational guidance');}
        if(draftReview?.actual_review_receipt_ref)await verifyHostMediaReceipt(working.host_media_receipts[draftReview.actual_review_receipt_ref]);
        if(evaluateDraftReadiness(data.draft_ref,data.draft_review_ref,working).readiness!=='ready')fail('STALE_DRAFT','/draft_ref','Adoption needs the current exact draft review');
        if(data.pack_ref){
          const pack=getPack(working,data.pack_ref);
          if(!pack||canonicalHash(pack.draft_ref)!==canonicalHash(data.draft_ref))fail('INVALID_EVIDENCE_REF','/pack_ref','Adopted pack text differs');
          const context=await contentContext(working,dir);
          if(evaluatePackReadiness(working,data.pack_ref,context).readiness!=='ready')fail('STALE_DRAFT','/pack_ref','Pack is not ready');
        }
        putImmutable(working.adoptions,data.adoption_id,data);
        result={
          record_refs:[data.adoption_id],adoption_status:'adopted'
        }
        ;
      }
      else if(p.operation==='publication'){
        const data=p.data,url=new URL(data.url);
        if(!['x.com','twitter.com'].includes(url.hostname)||url.pathname!==`/${working.account.handle}/status/${data.post_id}`)fail('IDENTITY_MISMATCH','/url','Publication must identify this account and post');
        if(data.confirmed_by==='fixture'&&data.data_mode!=='fixture')fail('INVALID_INPUT','/confirmed_by','Fixture cannot confirm a live publication');
        if(data.data_mode==='fixture'&&!working.account.handle.startsWith('fixture_'))fail('INVALID_INPUT','/data_mode','Fixture confirmation is only allowed on fixture accounts');
        const adoption=working.adoptions[data.adoption_id];
        if(data.adoption_id&&!adoption)fail('MISSING_EVIDENCE','/adoption_id','Adoption missing');
        if(adoption&&(canonicalHash(data.draft_ref)!==canonicalHash(adoption.draft_ref)||data.pack_ref!==adoption.pack_ref))fail('INVALID_EVIDENCE_REF','/draft_ref','Publication attribution differs from adoption');
        if(data.attribution==='exact'){
          if(!adoption)fail('MISSING_EVIDENCE','/adoption_id','Exact attribution needs the actual user adoption');
          if(data.data_mode==='live'){
            const verification=working.host_media_receipts[data.verification_receipt_ref];
            if(!verification||verification.operation!=='publication_read'||verification.status!=='succeeded')fail('MISSING_EVIDENCE','/verification_receipt_ref','Read back the actual live publication before exact attribution');
            await verifyHostMediaReceipt(verification);
            const actual=JSON.parse(await readFile(verification.actual_result_ref,'utf8'));
            if(actual.url!==data.url||canonicalHash(actual.texts)!==canonicalHash(data.actual_texts))fail('RECEIPT_CONFLICT','/verification_receipt_ref','Publication proof does not match the URL and actual text');
          }
          const draft=working.drafts[data.draft_ref?.draft_id]?.revisions[data.draft_ref?.revision];
          if(!draft||canonicalHash(data.actual_texts)!==canonicalHash(draft.texts)||data.differences.length)fail('INVALID_INPUT','/attribution','Exact attribution requires actual matching full text');
        }
        else if(data.attribution==='modified'&&(!data.actual_texts||!data.differences.length))fail('MISSING_EVIDENCE','/differences','Modified publication must retain its actual text and differences');
        else if(data.attribution==='unverified'&&data.actual_texts!==null)fail('INVALID_INPUT','/attribution','Use verified attribution for supplied actual text');
        putImmutable(working.publications,data.publication_id,data);
        result={
          record_refs:[data.publication_id],publication_status:`published/${data.attribution}`
        }
        ;
      }
      else fail('INVALID_INPUT','/operation','Unsupported state 3 record operation');
      return working;
    }
    );
    return{
      state:next,data:{
        ...result,state_revision:next.revision
      }
    }
    ;
  }
  fail('INVALID_INPUT','/command','Unsupported state 3 command');
}
