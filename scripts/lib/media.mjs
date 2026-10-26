import { createHash } from 'node:crypto';
import { canonicalHash, ContractError } from './contracts.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function png(bytes){
  const magic=[137,80,78,71,13,10,26,10];
  if(bytes.length<24||!magic.every((value,index)=>bytes[index]===value))return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  return{mime_type:'image/png',width:view.getUint32(16),height:view.getUint32(20)};
}

function jpeg(bytes){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let offset=2;
  while(offset+8<bytes.length){
    if(bytes[offset]!==0xff){offset+=1;continue;}
    const marker=bytes[offset+1];
    if(marker===0xd9||marker===0xda)break;
    if(offset+4>bytes.length)break;
    const size=(bytes[offset+2]<<8)|bytes[offset+3];
    if(size<2||offset+2+size>bytes.length)break;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
      return{mime_type:'image/jpeg',height:(bytes[offset+5]<<8)|bytes[offset+6],width:(bytes[offset+7]<<8)|bytes[offset+8]};
    }
    offset+=2+size;
  }
  fail('INVALID_INPUT','/asset_path','JPEG dimensions could not be read from actual bytes');
}

function webp(bytes){
  const ascii=(start,length)=>String.fromCharCode(...bytes.slice(start,start+length));
  if(bytes.length<30||ascii(0,4)!=='RIFF'||ascii(8,4)!=='WEBP')return null;
  const kind=ascii(12,4);
  if(kind==='VP8X')return{mime_type:'image/webp',width:1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16),height:1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)};
  if(kind==='VP8L'){
    if(bytes[20]!==0x2f)fail('INVALID_INPUT','/asset_path','Invalid lossless WebP header');
    const bits=bytes[21]|(bytes[22]<<8)|(bytes[23]<<16)|(bytes[24]<<24);
    return{mime_type:'image/webp',width:1+(bits&0x3fff),height:1+((bits>>>14)&0x3fff)};
  }
  if(kind==='VP8 '&&bytes.length>=30)return{mime_type:'image/webp',width:(bytes[26]|(bytes[27]<<8))&0x3fff,height:(bytes[28]|(bytes[29]<<8))&0x3fff};
  fail('INVALID_INPUT','/asset_path','Unsupported WebP bitstream');
}

export function inspectMediaBytes(input,metadata){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input??[]);
  if(!bytes.length)fail('MISSING_EVIDENCE','/asset_path','Image asset is empty');
  const dimensions=png(bytes)??jpeg(bytes)??webp(bytes);
  if(!dimensions)fail('INVALID_INPUT','/asset_path','Only actual PNG, JPEG and WebP bytes are supported');
  if(!dimensions.width||!dimensions.height)fail('INVALID_INPUT','/asset_path','Image has invalid dimensions');
  for(const key of ['asset_id','asset_version','artifact_ref','origin_kind','tool_receipt_ref','created_at','persistence_receipt_ref'])if(metadata?.[key]===undefined||metadata[key]===null||metadata[key]==='')fail('INVALID_INPUT',`/asset_metadata/${key}`,`${key} is required`);
  return{contract_version:3,asset_id:metadata.asset_id,asset_version:metadata.asset_version,byte_sha256:hash(bytes),artifact_ref:metadata.artifact_ref,mime_type:dimensions.mime_type,byte_size:bytes.length,width:dimensions.width,height:dimensions.height,origin_kind:metadata.origin_kind,source_refs:[...new Set(metadata.source_refs??[])].sort(),tool_receipt_ref:metadata.tool_receipt_ref,visible_text_observation:structuredClone(metadata.visible_text_observation??[]),data_spec_ref:metadata.data_spec_ref??null,created_at:metadata.created_at,persistence_receipt_ref:metadata.persistence_receipt_ref};
}

export function inspectPreviewBytes(input,metadata){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input??[]);
  if(!bytes.length)fail('MISSING_EVIDENCE','/preview_path','Preview artifact is empty');
  for(const key of ['preview_id','pack_ref','pack_content_hash','artifact_ref','tool_receipt_ref','created_at','persistence_receipt_ref'])if(!metadata?.[key])fail('INVALID_INPUT',`/preview_metadata/${key}`,`${key} is required`);
  return{contract_version:3,preview_id:metadata.preview_id,pack_ref:metadata.pack_ref,pack_content_hash:metadata.pack_content_hash,artifact_ref:metadata.artifact_ref,byte_sha256:hash(bytes),tool_receipt_ref:metadata.tool_receipt_ref,created_at:metadata.created_at,persistence_receipt_ref:metadata.persistence_receipt_ref};
}

export function countAlt(text){return{code_points:[...text].length,utf16_length:text.length};}

export function dataSpecBindingHash(asset){
  return canonicalHash({data_spec_ref:asset.data_spec_ref,tool_receipt_ref:asset.tool_receipt_ref,source_refs:asset.source_refs});
}

export function assetReviewSubjectHash(asset,slot){
  return canonicalHash({byte_sha256:asset.byte_sha256,visible_text_and_region_mapping:slot.visible_text_and_region_mapping,claim_and_user_fact_bindings:slot.claim_and_user_fact_bindings,data_spec_hash:slot.data_spec_hash,alt:slot.alt,used_evidence_versions:slot.used_evidence_versions});
}
