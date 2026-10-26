import { canonicalHash, textHash, newId, ContractError } from './contracts.mjs';

const fail = (code, path, message) => { throw new ContractError(code,path,message,false); };

export function textBlocks(raw) {
  if (typeof raw === 'string') return [{block_index:0,text:raw,text_hash:textHash(raw)}];
  if (raw && Array.isArray(raw.content)) {
    const blocks = raw.content.flatMap((block, index) => block.type === 'text' && typeof block.text === 'string'
      ? [{block_index:index,text:block.text,text_hash:textHash(block.text)}] : []);
    if (blocks.length) return blocks;
  }
  fail('UNSUPPORTED_RESPONSE','/raw_result','Expected a captured web text string or CallToolResult text blocks');
}

export function normalizeUrl(value) {
  const url = new URL(value);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) fail('INVALID_INPUT','/url','Expected a public HTTP(S) URL without credentials');
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || ['fbclid','gclid','mc_cid','mc_eid'].includes(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.toString();
}

export function ingestHostResult(ticket, rawObject, extractionProposals, actualCall) {
  if (!actualCall || canonicalHash(actualCall.request) !== canonicalHash(ticket.request)) fail('MISSING_EVIDENCE','/actual_call/request','The executed request must exactly match its reserved ticket');
  const receipt = {receipt_id:newId('receipt'),ticket_id:ticket.ticket_id,tool_name:actualCall.tool_name,
    executed_at:actualCall.executed_at,returned_at:actualCall.returned_at,raw_result_ref:null,raw_result:structuredClone(rawObject),
    raw_hash:canonicalHash(rawObject),host_call_ref:actualCall.host_call_ref,status:'succeeded',error:null};
  receipt.raw_result_ref = receipt.receipt_id;
  let blocks;
  try { blocks = textBlocks(rawObject); }
  catch (error) { receipt.status='unknown'; receipt.error={code:error.code,path:error.path,message:error.message,retryable:false}; error.raw_receipt=receipt; throw error; }
  if (rawObject?.isError === true || blocks.every(block => /^\s*(?:Internal Error|Error:|Failed to fetch|Error fetching)/i.test(block.text))) {
    receipt.status='failed'; receipt.error={code:'CAPABILITY_UNAVAILABLE',path:'/raw_result',message:'Host returned an error; this is not an empty search result',retryable:false};
  }
  const extractions = [];
  if (receipt.status === 'succeeded') for (const proposal of extractionProposals) {
    const block = blocks.find(item => item.block_index === proposal.block_index);
    if (!block || !Number.isInteger(proposal.start) || !Number.isInteger(proposal.end) || proposal.start < 0 || proposal.end <= proposal.start || proposal.end > block.text.length) fail('INVALID_INPUT','/extractions','Extraction must identify a nonempty UTF-16 range in an actual text block');
    const captured = block.text.slice(proposal.start,proposal.end);
    if (proposal.captured_text !== undefined && proposal.captured_text !== captured) fail('MISSING_EVIDENCE','/extractions/captured_text','Extraction differs from the actual returned text');
    const url = normalizeUrl(proposal.url);
    let requestedUrl = null;
    try { if (ticket.operation === 'read') requestedUrl = normalizeUrl(ticket.request.ref_id); } catch { /* tool refs are not URLs */ }
    if (!block.text.includes(proposal.url) && requestedUrl !== url) fail('MISSING_EVIDENCE','/extractions/url','URL must appear in the raw text or exact registered read URL');
    if (proposal.kind === 'source' && ticket.operation !== 'read') fail('MISSING_EVIDENCE','/extractions/kind','Search output is a candidate; read the source before registering evidence');
    extractions.push({...structuredClone(proposal),url,captured_text:captured});
  }
  return {raw_receipt:receipt,text_blocks:blocks,extractions};
}
