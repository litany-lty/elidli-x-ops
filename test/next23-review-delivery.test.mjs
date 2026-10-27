import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initializeState,commitState,loadState } from '../scripts/lib/state.mjs';
import { createDefaultConfig } from '../scripts/lib/config.mjs';
import { guardDeliveryV5 } from '../scripts/lib/delivery-v5.mjs';

test('review: changed personal evidence gets a new saved delivery context without replacing history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'xops-delivery-refresh-')),account={handle:'fixture_delivery_refresh',profile_url:'https://x.com/fixture_delivery_refresh',user_id:null,identity_basis:'user_provided'};
 let state=await commitState(dir,0,()=>initializeState(createDefaultConfig(account)));
 const request={run_id:'context-refresh',payload:{as_of:'2026-10-27T05:00:00Z',event:{computation_ref:'account'}}},data={review_computation:{computation_id:'account'}};
 const first=await guardDeliveryV5('review',request,dir,{state,data});
 state=await commitState(dir,first.state.revision,working=>{working.config.content.style_notes=['Use concise sentences'];return working;});
 const second=await guardDeliveryV5('review',request,dir,{state,data});
 assert.notEqual(second.data.rule_context.personal_context_selection_hash,first.data.rule_context.personal_context_selection_hash);
 assert.notEqual(second.data.rule_context.context_id,first.data.rule_context.context_id);
 const restored=await loadState(dir);assert(restored.rule_contexts[first.data.rule_context.context_id]);assert(restored.rule_contexts[second.data.rule_context.context_id]);
 assert.equal(second.data.guidance_readiness.readiness,'needs_review');
});
