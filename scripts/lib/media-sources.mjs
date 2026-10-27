import { createHash } from 'node:crypto';
import { canonicalHash, ContractError, validate } from './contracts.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export function mediaSourceHash(source){const copy=structuredClone(source);delete copy.source_hash;return canonicalHash(copy);}

export function validateMediaSourceV5(source,{deliverable=false}={}){
  validate('MediaSourceDescriptorV5',source);
  if(source.source_hash!==mediaSourceHash(source))fail('RECEIPT_CONFLICT','/source_hash','Media source descriptor changed');
  if(deliverable){
    if(!source.acquired_at||!source.inspected_at)fail('MISSING_EVIDENCE','/source','Deliverable media requires actual acquisition and inspection');
    if(['thumbnail','temporary_url','unknown'].includes(source.quality))fail('REQUESTED_OUTPUT_INCOMPLETE','/source/quality','Thumbnail, temporary URL, or unknown quality is not a deliverable original');
    if(source.usage_status!=='confirmed')fail('MISSING_EVIDENCE','/source/usage_status','Usage conditions must be confirmed before reuse');
    if(['official_original','source_image'].includes(source.source_kind)&&!source.attribution)fail('MISSING_EVIDENCE','/source/attribution','Source media requires its necessary attribution');
  }
  return structuredClone(source);
}

export function verifyMediaSourceReceiptV5(receipt,{file_bytes,source,input_hash}={}){
  validate('HostMediaReceiptV5',receipt);validateMediaSourceV5(source,{deliverable:receipt.operation==='reuse_asset'});
  const bytes=file_bytes instanceof Uint8Array?file_bytes:new Uint8Array(file_bytes??[]);
  if(receipt.status==='succeeded'&&!bytes.length)fail('MISSING_EVIDENCE','/actual_result_ref','Successful media receipt requires actual bytes');
  if(bytes.length&&sha(bytes)!==receipt.actual_result_sha256)fail('RECEIPT_CONFLICT','/actual_result_sha256','Media bytes differ from the host receipt');
  if(receipt.source_hash!==source.source_hash||receipt.input_hash!==input_hash)fail('RECEIPT_CONFLICT','/receipt','Media receipt must bind the exact source and work input');
  if(['inspect_asset','reuse_asset','annotate_source'].includes(receipt.operation)&&receipt.status==='succeeded'&&!receipt.viewed)fail('MISSING_EVIDENCE','/viewed','Source media must be actually viewed');
  return structuredClone(receipt);
}
