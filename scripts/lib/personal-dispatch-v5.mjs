import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,rename,readdir } from 'node:fs/promises';
import { join,extname } from 'node:path';
import { canonicalHash, ContractError, textHash, validate } from './contracts.mjs';
import { loadState,commitState,putImmutable,saveDraft } from './state.mjs';
import { resolveConfig } from './config.mjs';
import { buildOperationalContext,goalSnapshotFromState } from './consumer-context.mjs';
import { personalStep } from './personal.mjs';
import { advanceInspiration } from './inspiration.mjs';
import { advanceContent } from './content.mjs';
import { checkDraftV5,draftEvidenceMappingHash,draftReviewSubjectHashV5,evaluateDraftReadiness,validateEditPrescriptionV5,validateFormatRationaleV5 } from './draft.mjs';
import { inspectMediaBytes } from './media.mjs';
import { validateMediaSourceV5,verifyMediaSourceReceiptV5 } from './media-sources.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const byteHash=value=>createHash('sha256').update(value).digest('hex');

async function persistBytes(dir,bytes,extension){
  const sha=byteHash(bytes),folder=join(dir,'media');await mkdir(folder,{recursive:true,mode:0o700});
  const existing=(await readdir(folder)).find(name=>name.startsWith(`${sha}.`));if(existing){const saved=join(folder,existing);if(byteHash(await readFile(saved))!==sha)fail('PERSIST_FAILED','/artifact','Existing content-addressed bytes changed');return saved;}
  const path=join(folder,`${sha}.${extension}`),temp=join(folder,`.${crypto.randomUUID()}.tmp`);await writeFile(temp,bytes,{flag:'wx',mode:0o600});await rename(temp,path);if(byteHash(await readFile(path))!==sha)fail('PERSIST_FAILED','/artifact','Managed bytes failed readback');return path;
}

async function hostReviewApi(){
  try{return await import('./host-review-v5.mjs');}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')fail('MISSING_EVIDENCE','/host_review','V5 host review verifier is not installed');throw error;}
}

export async function operationalContextFor(state,{subject_ref,intent,use,goal=goalSnapshotFromState(state),cutoff,topic_refs=[],format=null,surface=null,task_constraints={},temporary_overrides={},content_evidence_refs=[],metric_evidence_refs=[],selected_signals=[],knowledge_dependency_versions={},selection_policy_version='operational-context-v5'}={}){
  const {resolveSubject}=await import('./subjects.mjs'),subject=await resolveSubject(state,subject_ref);
  return buildOperationalContext(state,{subject_ref,subject_descriptor:subject,intent,use,goal,cutoff,topic_refs,format,surface,task_constraints,temporary_overrides,content_evidence_refs,metric_evidence_refs,selected_signals,knowledge_dependency_versions,selection_policy_version});
}

export function operationalContextForContentBrief(state,brief,cutoff){
  const content=structuredClone(brief);delete content.operational_context_hash;delete content.context_selection_hash;delete content.brief_hash;
  return buildOperationalContext(state,{subject_ref:`content-brief:${brief.brief_id}:${brief.brief_revision}`,subject_descriptor:{ref:`content-brief:${brief.brief_id}:${brief.brief_revision}`,content_hash:canonicalHash(content),texts:[],format:brief.publishing_format,post_type:brief.publishing_format,surface:null,media:brief.media_operations,full_text:null,read_status:'read',source_refs:brief.material_refs,observed_at:cutoff},intent:'content',use:'compose',goal:{primary_goal:brief.goal,goal_notes:null,source:'user_confirmed'},cutoff,topic_refs:[],format:brief.publishing_format,surface:null,task_constraints:{must_preserve:brief.must_preserve,must_avoid:brief.must_avoid},temporary_overrides:{},content_evidence_refs:brief.material_refs,metric_evidence_refs:[],selected_signals:[],knowledge_dependency_versions:{},selection_policy_version:'operational-context-v5'});
}

async function contentContextV5(state,dataDir,payload,operationalContext){
  const context={operational_context:operationalContext,capabilities:{image_generate:'unverified',image_edit:'unverified',data_render:'unverified',preview_render:'unverified',image_view:'unverified',artifact_persistence:'verified'}};
  const capability={generate_illustration:'image_generate',annotate_source:'image_edit',render_data:'data_render',inspect_asset:'image_view',reuse_asset:'image_view',build_preview:'preview_render'};
  for(const receipt of Object.values(state.host_media_receipts??{}))if(receipt.contract_version===5&&receipt.status==='succeeded'&&capability[receipt.operation])context.capabilities[capability[receipt.operation]]='verified';
  context.evaluate_draft=(ref,s)=>evaluateDraftReadiness(ref,null,s);
  context.verify_artifact=async(ref,sha)=>{try{return byteHash(await readFile(ref))===sha;}catch{return false;}};
  if(payload.operation!=='ingest')return context;
  const run=state.content_runs?.[payload.run_id],item=run?.work_items.find(value=>value.work_item_id===payload.work_item_id),brief=run&&state.content_briefs?.[run.brief_revision_ref];
  if(!item||!brief)fail('MISSING_EVIDENCE','/work_item_id','Saved V5 content work item is required');
  const receipt=state.host_media_receipts?.[payload.tool_receipt_ref];if(!receipt)fail('MISSING_EVIDENCE','/tool_receipt_ref','Record the actual host media receipt first');
  const request=brief.media_operations.find(value=>value.slot_id===item.slot_id);if(!request?.source)fail('MISSING_EVIDENCE','/source','Media ingest requires its frozen source descriptor');
  const bytes=await readFile(payload.asset_path);verifyMediaSourceReceiptV5(receipt,{file_bytes:bytes,source:validateMediaSourceV5(request.source),input_hash:item.input_hash});
  const extension={'.png':'png','.jpg':'jpg','.jpeg':'jpg','.webp':'webp'}[extname(payload.asset_path).toLowerCase()]??'image',path=await persistBytes(dataDir,bytes,extension),id=`asset-${item.slot_id}`,version=(state.media_assets?.[id]?.latest_version??0)+1;
  context.actual_tool_receipt=receipt;context.ingested_asset=inspectMediaBytes(bytes,{asset_id:id,asset_version:version,artifact_ref:path,origin_kind:payload.origin_kind,source_refs:payload.source_refs,tool_receipt_ref:receipt.receipt_id,visible_text_observation:payload.visible_text_observation,data_spec_ref:payload.data_spec_ref,created_at:payload.as_of,persistence_receipt_ref:`sha256:${byteHash(bytes)}`});context.asset_persisted=true;return context;
}

function payloadType(command,payload){
  if(command==='personal-step')return'PersonalStepEntryPayloadV5';
  if(command==='inspiration-step')return'InspirationStepEntryPayloadV5';
  if(command==='content-step')return'ContentStepPayloadV5';
  if(command==='draft-check')return'DraftCheckPayloadV5';
  if(command==='record')return'PersonalDomainRecordPayloadV5';
  fail('INVALID_INPUT','/command','Unsupported V5 personal-domain command');
}

export async function dispatchPersonalV5(command,p,{dataDir,state=null,expected_revision=null,run_id=null,clock=()=>new Date()}={}){
  validate(payloadType(command,p),p);const current=state??await loadState(dataDir);if(!current||current.schema_version!==5)fail('MIGRATION_REQUIRED','/schema_version','V5 personal-domain commands require state 5');
  const expected=expected_revision??p.expected_revision??current.revision;
  if(command==='record'){
    if(p.operation==='host_media_receipt'){
      const bytes=await readFile(p.data.actual_result_ref);verifyMediaSourceReceiptV5(p.data,{file_bytes:bytes,source:validateMediaSourceV5(p.source),input_hash:p.data.input_hash});
      const extension=extname(p.data.actual_result_ref).slice(1)||'bin',managed=await persistBytes(dataDir,bytes,extension),stored={...structuredClone(p.data),actual_result_ref:managed};
      let next=await commitState(dataDir,expected,working=>{putImmutable(working.host_media_receipts,stored.receipt_id,stored);return working;});return{state:next,data:{record_refs:[stored.receipt_id],state_revision:next.revision}};
    }
    if(p.operation==='host_review_receipt'){
      const api=await hostReviewApi(),verified=await api.verifyHostReviewReceiptV5(p.data,{clock}),bytes=await readFile(verified.actual_result_ref),managed=await persistBytes(dataDir,bytes,'review.json'),stored={...verified,actual_result_ref:managed};
      let next=await commitState(dataDir,expected,working=>{putImmutable(working.host_media_receipts,stored.receipt_id,stored);return working;});return{state:next,data:{record_refs:[stored.receipt_id],state_revision:next.revision}};
    }
    if(p.operation==='draft_review'){
      const selector={subject_ref:p.receipt.subject_ref,intent:'draft',use:'current',goal:goalSnapshotFromState(current),cutoff:p.as_of,topic_refs:[],format:p.draft.format,surface:null,task_constraints:{delivery_intent:p.receipt.delivery_intent,requested_mode:p.receipt.requested_mode,scope_constraint:p.receipt.edit_prescription.scope_constraint},temporary_overrides:{},content_evidence_refs:[],metric_evidence_refs:[],selected_signals:[],knowledge_dependency_versions:{},selection_policy_version:'operational-context-v5'},api=await hostReviewApi(),operational=await operationalContextFor(current,selector),actuals=await api.loadActualReviewReceiptsV5(current,[p.receipt.actual_review_receipt_ref],{clock,expectedPurpose:'review_edit_prescription',expectedSubjectRef:p.receipt.subject_ref,expectedSubjectContentHash:operational.subject_descriptor.content_hash}),actual=actuals[p.receipt.actual_review_receipt_ref];
      validateEditPrescriptionV5(p.receipt.edit_prescription,{original_text:p.draft.original_text,texts:p.draft.texts,requested_mode:p.receipt.requested_mode,scope_constraint:p.receipt.edit_prescription.scope_constraint});validateFormatRationaleV5(p.receipt.format_rationale,operational);
      const base={contract_version:5,subject_ref:p.receipt.subject_ref,draft_ref:{draft_id:p.draft.draft_id,revision:p.draft.revision},text_hashes:p.draft.texts.map(textHash),evidence_mapping_hash:draftEvidenceMappingHash(current,p.draft.fact_mapping),operational_context_selector:structuredClone(selector),operational_context_hash:operational.selected_context_hash,delivery_intent:p.receipt.delivery_intent,requested_mode:p.receipt.requested_mode,edit_prescription:structuredClone(p.receipt.edit_prescription),format_rationale:structuredClone(p.receipt.format_rationale),decision:actual.decision==='approved'?'approved':'needs_review',actual_review_receipt_ref:actual.receipt_id,reviewed_at:actual.reviewed_at},subjectHash=draftReviewSubjectHashV5(base),rebuilt={...base,subject_hash:subjectHash,receipt_id:`draft-review-v5:${subjectHash}`};
      if(actual.subject_hash!==subjectHash)fail('RECEIPT_CONFLICT','/receipt/subject_hash','Actual edit review binds different draft inputs');validate('DraftReviewReceiptV5',rebuilt);if(canonicalHash(rebuilt)!==canonicalHash(p.receipt))fail('RECEIPT_CONFLICT','/receipt','Submitted draft review differs from current facts, context, or actual review');
      let next=await commitState(dataDir,expected,async working=>{const currentOperational=await operationalContextFor(working,selector);if(currentOperational.selected_context_hash!==rebuilt.operational_context_hash||draftEvidenceMappingHash(working,p.draft.fact_mapping)!==rebuilt.evidence_mapping_hash)fail('STALE_DRAFT','/receipt','Draft facts or operational context changed before commit');saveDraft(working,p.draft);putImmutable(working.draft_review_receipts,rebuilt.receipt_id,rebuilt);return working;});return{state:next,data:{record_refs:[p.draft.draft_id,rebuilt.receipt_id],state_revision:next.revision}};
    }
  }
  if(command==='personal-step'&&p.operation==='inspect'){const advanced=personalStep(current,p);return{state:current,data:advanced.result};}
  if(command==='personal-step'){
    let actual_review_receipts={};if(p.operation==='activate-pattern'){const api=await hostReviewApi(),loaded=await api.loadActualReviewReceiptsV5(current,[p.activation.actual_review_receipt_ref],{clock});actual_review_receipts=Array.isArray(loaded)?Object.fromEntries(loaded.map(item=>[item.receipt_id,item])):loaded;}
    let result;const next=await commitState(dataDir,expected,working=>{const advanced=personalStep(working,p,{actual_review_receipts});result=advanced.result;return advanced.state;});return{state:next,data:{...result,state_revision:next.revision}};
  }
  if(command==='inspiration-step'){
    const now=p.as_of??new Date(clock()).toISOString(),entry=current.inspiration_sessions?.[p.session_id],snapshot=entry&&entry.revisions[String(entry.latest_revision)];let internal=structuredClone(p),operational=null;
    if(p.operation==='prepare'){
      const provisional=advanceInspiration(current,p,{as_of:now}),frozen=provisional.result.snapshot;operational=await operationalContextFor(current,frozen.operational_context_selector);internal={...internal,operational_context_selector:frozen.operational_context_selector,operational_context_hash:operational.selected_context_hash};
    }else if(snapshot){operational=await operationalContextFor(current,snapshot.operational_context_selector);}
    const preview=advanceInspiration(current,internal,{as_of:now,operational_context:operational});if(!preview.changed)return{state:current,data:preview.result};
    let result;const next=await commitState(dataDir,expected,working=>{const advanced=advanceInspiration(working,internal,{as_of:now,operational_context:operational});result=advanced.result;return advanced.state;});return{state:next,data:{...result,state_revision:next.revision}};
  }
  if(command==='draft-check'){
    let actual_review_receipts={};if(p.actual_review_receipt_ref){const api=await hostReviewApi();actual_review_receipts=await api.loadActualReviewReceiptsV5(current,[p.actual_review_receipt_ref],{clock});}
    const selector={subject_ref:p.subject_ref,intent:'draft',use:'current',goal:goalSnapshotFromState(current),cutoff:p.as_of,topic_refs:[],format:p.draft_input.format,surface:null,task_constraints:{delivery_intent:p.delivery_intent,requested_mode:p.edit_request.requested_mode,scope_constraint:p.edit_request.scope_constraint},temporary_overrides:{},content_evidence_refs:[],metric_evidence_refs:[],selected_signals:[],knowledge_dependency_versions:{},selection_policy_version:'operational-context-v5'},operational=await operationalContextFor(current,selector);
    const context={state:current,effective_config:resolveConfig(current.config,null,p.as_of),operational_context_selector:selector,operational_context:operational,actual_review_receipts};return{state:current,data:checkDraftV5(p,context)};
  }
  if(command==='content-step'){
    const storedRun=p.run_id&&current.content_runs?.[p.run_id],brief=p.operation==='prepare'?p.brief:storedRun&&current.content_briefs?.[storedRun.brief_revision_ref],cutoff=p.operation==='prepare'?p.as_of:storedRun?.created_at;
    if(!brief)fail('MISSING_EVIDENCE','/brief','Content command requires its exact saved or submitted brief');const operational=operationalContextForContentBrief(current,brief,cutoff),context=await contentContextV5(current,dataDir,p,operational);
    let result;const next=await commitState(dataDir,expected,working=>{const advanced=advanceContent(working,p,run_id,context);result=advanced.result;return advanced.state;});return{state:next,data:{...result,state_revision:next.revision}};
  }
}
