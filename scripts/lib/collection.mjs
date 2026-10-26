import { readFile } from 'node:fs/promises';
import { canonicalHash, textHash, validate, ContractError } from './contracts.mjs';

export async function verifyCollectionReceipt(receipt,account) {
  validate('CollectionReceiptV2',receipt);
  const raw=await readFile(receipt.actual_result_ref,'utf8');
  if(textHash(raw)!==receipt.actual_result_sha256)throw new ContractError('RECEIPT_CONFLICT','/actual_result_sha256','Actual host result changed');
  if(receipt.status!=='succeeded')return receipt;
  const identity=account.user_id?`x-user:${account.user_id}`:`x-handle:${account.handle.toLowerCase()}`;
  if(receipt.account_identity_ref!==identity)throw new ContractError('ACCOUNT_MISMATCH','/account_identity_ref','Collection receipt identifies another account');
  const locator=receipt.identity_locator;
  if(raw.slice(locator.start,locator.end)!==locator.exact_text || !locator.exact_text.includes(account.user_id??account.handle))throw new ContractError('INVALID_EVIDENCE_REF','/identity_locator','Identity must be located in the actual host result');
  const material=receipt.material_locator;
  if(raw.slice(material.start,material.end)!==material.exact_text)throw new ContractError('INVALID_EVIDENCE_REF','/material_locator','Material must be located in the actual host result');
  return {...receipt,result_hash:canonicalHash(JSON.parse(raw))};
}
