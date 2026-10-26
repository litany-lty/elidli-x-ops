import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import { runtimeUrl } from './helpers/runtime.mjs';
const load=path=>import(runtimeUrl(`scripts/lib/${path}.mjs`));
const {createDefaultConfig,resolveConfig}=await load('config');
const {canonicalHash,newId,summarizeRun}=await load('contracts');
const {initializeState,commitState,loadState,savePersistenceReceipt,persistenceStatus,reviseClaimStatus}=await load('state');
const {initializeNews,advanceNews}=await load('news');
const {ingestHostResult,normalizeUrl}=await load('host-results');
const binding=JSON.parse(await readFile(new URL(runtimeUrl('assets/host-binding.codex-desktop.json')),'utf8'));binding.data_mode='fixture';
const T='2026-10-26T04:00:00Z';
function setup(overrides={}) {
  const config=createDefaultConfig({handle:'fixture_news',profile_url:'https://x.com/fixture_news',user_id:null,identity_basis:'user_provided'});
  config.news.core_topics=['API 工具'];Object.assign(config.news,overrides);
  const effective=resolveConfig(config,null,T),state=initializeState(config);
  const run=initializeNews({task_text:'为API开发者找今天工具更新',requested_at:T,scope_patch:null,requested_outputs:['cards','drafts'],data_mode:'fixture'},effective,binding,T);
  state.runs[run.run_id]=run;
  const required=[{coverage_id:'core-api',description:'API工具官方更新',priority:1}];
  const tasks=Array.from({length:8},(_,i)=>({logical_task_id:`search-${i}`,operation:'search',purpose:'discover',request:{query:`API tools update ${i}`,recency_days:1},scope_refs:[],coverage_ids:['core-api']}));
  advanceNews(run,'plan',{plan:{plan_id:newId('plan'),run_id:run.run_id,required_coverage:required,tasks,backup_sources:[],assumptions:[]}}, {state,as_of:T});
  return {state,run,context:{state,effective_config:effective,data_mode:'fixture',as_of:T}};
}
function ingestEmpty(run,ticket,context,raw='No results returned by fixture search') {
  return advanceNews(run,'ingest',{ticket_id:ticket.ticket_id,raw_object:raw,actual_call:{tool_name:'web__run',request:ticket.request,executed_at:T,returned_at:T,host_call_ref:'fixture:empty'},extractions:[]},context);
}

test('STATE: revision lock, failed mutation preserves old bytes, immutable initialization and receipt freshness',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xops-state-'));
  try {
    const config=createDefaultConfig();let saved=await commitState(dir,0,()=>initializeState(config));assert.equal(saved.revision,1);
    const before=await readFile(join(dir,'account-state.json'),'utf8');
    await assert.rejects(commitState(dir,0,s=>s),{code:'STATE_CONFLICT'});
    await assert.rejects(commitState(dir,1,s=>{s.config.output_language='ja';throw new Error('controlled write failure');}),/controlled/);
    assert.equal(await readFile(join(dir,'account-state.json'),'utf8'),before);
    await writeFile(join(dir,'.write.lock'),'another writer');await assert.rejects(commitState(dir,1,s=>s),{code:'STATE_CONFLICT'});await rm(join(dir,'.write.lock'));
    const readbackPath=join(dir,'readback.json');
    await writeFile(readbackPath,JSON.stringify({artifact_id:join(dir,'account-state.json'),state_revision:1,state_hash:canonicalHash(saved)}));
    const receipt={provider:'local_filesystem',artifact_id:join(dir,'account-state.json'),version_id:null,state_revision:1,state_hash:canonicalHash(saved),saved_at:T,host_call_ref:'test actual file write/read',actual_result_ref:readbackPath};
    await assert.rejects(savePersistenceReceipt(dir,{...receipt,artifact_id:join(dir,'other-account.json')}),{code:'PERSIST_FAILED'});
    await assert.rejects(savePersistenceReceipt(dir,{...receipt,actual_result_ref:join(dir,'missing-readback.json')}),{code:'PERSIST_FAILED'});
    await savePersistenceReceipt(dir,receipt);assert.equal(await persistenceStatus(dir,saved),'saved');assert.equal((await loadState(dir)).revision,1);
    saved=await commitState(dir,1,s=>{s.config.output_language='ja';return s;});assert.equal(await persistenceStatus(dir,saved),'stale');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('BUDGET: five discovery searches, preserved verification reserve, failed attempts consume, idempotent ingest',()=>{
  const {run,context}=setup();
  for(let i=0;i<5;i++){const {tickets}=advanceNews(run,'reserve',{logical_task_ids:[`search-${i}`]},context);ingestEmpty(run,tickets[0],context);}
  assert.equal(run.budget.search_used,5);assert.throws(()=>advanceNews(run,'reserve',{logical_task_ids:['search-5']},context),{code:'BUDGET_EXHAUSTED'});
  const first=Object.values(run.tickets)[0];const revisionCount=Object.keys(context.state.raw_receipts).length;
  ingestEmpty(run,first,context);assert.equal(Object.keys(context.state.raw_receipts).length,revisionCount);assert.equal(run.budget.search_used,5);
  assert.throws(()=>ingestEmpty(run,first,context,'different result'),{code:'RECEIPT_CONFLICT'});
  const candidateId=newId('candidate');run.candidates[candidateId]={candidate_id:candidateId,url:'https://example.com/news',title:'candidate',source_ref:'r',receipt_id:'receipt',material_kind:'search_snippet',locator:{receipt_id:'receipt',block_index:0,start:0,end:1},status:'discovered'};
  const extra={logical_task_id:'verify',operation:'search',purpose:'verify',request:{query:'verify update',recency_days:1},scope_refs:[candidateId],coverage_ids:['core-api']};
  advanceNews(run,'plan',{plan:{...run.plan,tasks:[extra]}},context);const {tickets}=advanceNews(run,'reserve',{logical_task_ids:['verify']},context);
  advanceNews(run,'ingest',{ticket_id:tickets[0].ticket_id,raw_object:{isError:true,content:[{type:'text',text:'Error: 403 Forbidden'}]},actual_call:{tool_name:'web__run',request:tickets[0].request,executed_at:T,returned_at:T,host_call_ref:'fixture:error'},extractions:[]},context);
  assert.equal(run.budget.search_used,6);assert.equal(tickets[0].execution_state,'failed');
});

test('a rechecked unchanged claim cannot clear a different invalidated claim from a dependent draft',()=>{
  const state={claims:{one:{claim_id:'one',support_status:'supported'},two:{claim_id:'two',support_status:'needs_recheck'}},drafts:{draft:{revisions:{1:{fact_mapping:[{claim_ids:['one','two']}],length_checks:[{valid:true}],semantic_review:{decision:'approve'},validity:'ready'}}}}};
  reviseClaimStatus(state,'one','invalidated',T,'Explicit correction','new-source');
  assert.equal(state.drafts.draft.revisions[1].validity,'needs_revision');
  reviseClaimStatus(state,'two','supported',T,'Scope unchanged','new-source');
  assert.equal(state.drafts.draft.revisions[1].validity,'needs_revision');
});

test('BUDGET: batch reservation is atomic, maximum three pending, zero and expired budgets reject',()=>{
  const {run,context}=setup();assert.throws(()=>advanceNews(run,'reserve',{logical_task_ids:['search-0','search-1','search-2','search-3']},context),{code:'BUDGET_EXHAUSTED'});assert.equal(run.budget.search_used,0);
  const z=setup({max_queries:0,verification_queries_reserved:0});assert.throws(()=>advanceNews(z.run,'reserve',{logical_task_ids:['search-0']},z.context),{code:'BUDGET_EXHAUSTED'});
  assert.throws(()=>advanceNews(run,'reserve',{logical_task_ids:['search-0']},{...context,as_of:'2026-10-26T04:05:00Z'}),{code:'BUDGET_EXHAUSTED'});
});

test('read discovery preserves four verification slots and a full candidate list still permits verification',()=>{
  const {run,context}=setup({entities:[{entity_id:'entity-api',name:'API fixture',aliases:[],official_urls:['https://example.com/api'],priority:1}]});
  const reads=Array.from({length:9},(_,i)=>({logical_task_id:`read-${i}`,operation:'read',purpose:'discover',request:{ref_id:`https://example.com/api/${i}`},scope_refs:[],coverage_ids:['core-api']}));
  const verify={logical_task_id:'verify-entity',operation:'read',purpose:'verify',request:{ref_id:'https://example.com/api/verify'},scope_refs:['entity-api'],coverage_ids:['core-api']};
  advanceNews(run,'plan',{plan:{...run.plan,tasks:[...reads,verify]}},context);
  for(let i=0;i<8;i++) {const {tickets}=advanceNews(run,'reserve',{logical_task_ids:[`read-${i}`]},context);ingestEmpty(run,tickets[0],context);}
  assert.equal(run.budget.read_used,8);assert.throws(()=>advanceNews(run,'reserve',{logical_task_ids:['read-8']},context),{code:'BUDGET_EXHAUSTED'});
  for(let i=0;i<24;i++)run.candidates[`candidate-${i}`]={candidate_id:`candidate-${i}`};
  const verified=advanceNews(run,'reserve',{logical_task_ids:['verify-entity']},context);assert.equal(verified.tickets.length,1);assert.equal(run.budget.read_used,9);
});

test('HOST: exact raw slices, unsupported shapes, URLs and snippet boundary',()=>{
  const {run,context}=setup();const {tickets}=advanceNews(run,'reserve',{logical_task_ids:['search-0']},context),ticket=tickets[0];
  const call={tool_name:'web__run',request:ticket.request,executed_at:T,returned_at:T,host_call_ref:null};
  const raw='Official (https://example.com/update)\nA feature update';
  const extraction={kind:'candidate',block_index:0,start:0,end:raw.length,url:'https://example.com/update',title:'Official',source_ref:'fixture-ref',material_kind:'search_snippet'};
  const r=ingestHostResult(ticket,raw,[extraction],call);assert.equal(r.extractions[0].captured_text,raw);
  assert.throws(()=>ingestHostResult(ticket,raw,[{...extraction,captured_text:'invented'}],call),{code:'MISSING_EVIDENCE'});
  assert.throws(()=>ingestHostResult(ticket,raw,[{...extraction,kind:'source'}],call),{code:'MISSING_EVIDENCE'});
  assert.throws(()=>ingestHostResult(ticket,{unknown:'shape'},[],call),{code:'UNSUPPORTED_RESPONSE'});
  assert.equal(normalizeUrl('https://example.com/update?version=2&utm_source=a#top'),'https://example.com/update?version=2');
});

test('STATUS: bounded real empty fixture is no_findings, pending calls and actual failure remain distinct',()=>{
  const {run,context}=setup();let {tickets}=advanceNews(run,'reserve',{logical_task_ids:['search-0']},context);ingestEmpty(run,tickets[0],context);
  const result=advanceNews(run,'finalize',{cards:[],draft_inputs:[],coverage:[{coverage_id:'core-api',status:'completed',searched_ticket_ids:[tickets[0].ticket_id],read_ticket_ids:[],limitations:[]}],stop_reason:'bounded_search_complete'},{...context,persistence_status:'saved'});
  assert.equal(result.run_result.execution_status,'complete');assert.equal(result.run_result.result_kind,'no_findings');
  assert.throws(()=>advanceNews(run,'reserve',{logical_task_ids:['search-1']},context),{code:'STATE_CONFLICT'});
  const r=setup();advanceNews(r.run,'reserve',{logical_task_ids:['search-0']},r.context);
  const incomplete=advanceNews(r.run,'finalize',{cards:[],draft_inputs:[],coverage:[],stop_reason:'interrupted'},r.context);
  assert.notEqual(incomplete.run_result.execution_status,'complete');assert.equal(incomplete.run_result.result_kind,'undetermined');
});
