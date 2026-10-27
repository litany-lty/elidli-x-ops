import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validate,canonicalHash,ContractError} from './contracts.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

/** Verify the saved independent result, rather than trusting a successful tool call. */
export async function verifyHostReviewReceiptV5(receipt,{clock=()=>new Date(),expectedPurpose,expectedSubjectRef,expectedSubjectContentHash}={}){
  validate('HostReviewReceiptV5',receipt);
  const now=clock();
  if(receipt.data_mode==='live'&&Date.parse(receipt.reviewed_at)>new Date(now).getTime())fail('INVALID_INPUT','/reviewed_at','Actual live review time cannot be in the future');
  for(const [field,expected] of Object.entries({purpose:expectedPurpose,subject_ref:expectedSubjectRef,subject_content_hash:expectedSubjectContentHash}))if(expected!==undefined&&receipt[field]!==expected)fail('RECEIPT_CONFLICT',`/${field}`,'Host result belongs to a different review subject');
  const bytes=await readFile(receipt.actual_result_ref);
  if(sha(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/actual_result_sha256','Actual independent review file changed');
  const actual=JSON.parse(bytes.toString('utf8'));
  for(const field of ['purpose','subject_ref','subject_hash','subject_content_hash','decision','checks','issues','reviewer','generator_ref']){
    if(canonicalHash(actual[field])!==canonicalHash(receipt[field]))fail('RECEIPT_CONFLICT',`/${field}`,'Saved review differs from the actual independent result');
  }
  if(actual.reviewed_at&&actual.reviewed_at!==receipt.reviewed_at)fail('RECEIPT_CONFLICT','/reviewed_at','Saved review time differs from actual result');
  if(receipt.decision==='approved'&&(Object.values(receipt.checks).some(v=>v!==true)||receipt.issues.length))fail('RECEIPT_CONFLICT','/decision','An approval cannot contain failed checks or unresolved issues');
  if(receipt.actual_result_hash!==null){
    const payload=actual.reviewed_payload??actual.assessment;
    if(!payload)fail('MISSING_EVIDENCE','/actual_result_hash','A semantic result hash requires the actual reviewed payload');
    let content=payload;
    if(receipt.purpose==='review_signals')content=Object.fromEntries(['assessment_id','signal','value','unit','subject_ref','subject_hash','source_refs','locator'].map(key=>[key,payload[key]]));
    if(canonicalHash(content)!==receipt.actual_result_hash)fail('RECEIPT_CONFLICT','/actual_result_hash','Semantic payload differs from its recorded hash');
  }
  return structuredClone(receipt);
}

export const verifyHostReviewV5=verifyHostReviewReceiptV5;

export async function loadActualReviewReceiptsV5(state,refs,{clock=()=>new Date(),...expected}={}){
  const verified={};
  for(const ref of refs){
    const receipt=state.host_media_receipts?.[ref];
    if(!receipt)fail('MISSING_EVIDENCE','/actual_review_receipt_refs',`Actual host review is missing: ${ref}`);
    verified[ref]=await verifyHostReviewReceiptV5(receipt,{clock,...expected});
  }
  return verified;
}
