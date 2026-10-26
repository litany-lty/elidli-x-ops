import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,ContractError} from '../scripts/lib/contracts.mjs';
test('all registered NEXT contracts compile under strict AJV before runtime use',()=>{
 for(const file of ['data-reliability-v3','coaching-reliability-v3','content-v3','reliability-v3'])for(const name of Object.keys(JSON.parse(readFileSync(new URL(`../schemas/${file}.schema.json`,import.meta.url))).definitions)){
  try{validate(name,null);}catch(error){assert.ok(error instanceof ContractError,`${name}: ${error.message}`);assert.ok(!error.message.includes('Unknown contract'),name);}
 }
});
