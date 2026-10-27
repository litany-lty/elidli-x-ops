import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfigV5, resolveConfig } from '../scripts/lib/config.mjs';
import { advanceInspiration, inspirationBudgetView, resolveInspirationRef } from '../scripts/lib/inspiration.mjs';
import { advanceNews, historicalNewsRuns } from '../scripts/lib/news.mjs';
import { buildOperationalContext } from '../scripts/lib/consumer-context.mjs';

const T='2026-10-27T01:00:00Z',account={handle:'fixture_inspiration',profile_url:'https://x.com/fixture_inspiration',user_id:null,identity_basis:'user_provided'};
function state(){const config=createDefaultConfigV5(account);return{schema_version:5,revision:1,account,config,inspiration_sessions:{},content_analyses:{},personal_patterns:{},post_entities:{},post_versions:{},runs:{},sources:{},raw_receipts:{},events:{},claims:{},media_assets:{},strategy_definitions:{},experiments:{},actions:{},feedback_events:{}};}
function prepare(current,overrides={}){return advanceInspiration(current,{contract_version:5,operation:'prepare',session_id:overrides.session_id??'session1',request_ref:'request1',goal:{primary_goal:'relevant_reach',goal_notes:null,source:'user_confirmed'},use:'current',request_scope:overrides.request_scope??{explicit_topics:['databases'],reader_questions:[],today_only:false},cutoff:T,budget_policy:{search_allocated:2,read_allocated:1},operational_context_hash:'a'.repeat(64)},{as_of:T});}

test('A13 current explicit topic outranks config and history, while history supplies a seed when config is empty',()=>{
  const current=state();current.config.content.topics=null;current.content_analyses.old={analysis_id:'analysis1',primary_topic:'AI',reader_problem:'如何验证模型？'};
  const historical=prepare(current,{session_id:'history',request_scope:{explicit_topics:[],reader_questions:[],today_only:false}});
  assert.deepEqual(historical.result.snapshot.seeds.map(item=>item.source_tier),['current_history','current_history']);
  const explicit=prepare(current,{session_id:'explicit',request_scope:{explicit_topics:['开源数据库'],reader_questions:[],today_only:true}});
  assert.deepEqual(explicit.result.snapshot.seeds.map(item=>item.value),['开源数据库']);
});

test('A14 the same configured topic keeps relevant historical questions account-specific',()=>{
  const left=state(),right=state();left.config.content.topics=['AI'];right.config.content.topics=['AI'];left.content_analyses.a={analysis_id:'a',post_version_ref:'pv-a',primary_topic:'AI',reader_problem:'如何验证模型？',reviewed_at:'2026-10-26T00:00:00Z'};right.content_analyses.b={analysis_id:'b',post_version_ref:'pv-b',primary_topic:'AI',reader_problem:'怎样控制成本？',reviewed_at:'2026-10-26T00:00:00Z'};
  const a=prepare(left,{session_id:'left',request_scope:{explicit_topics:[],reader_questions:[],today_only:false}}).result.snapshot.seeds,b=prepare(right,{session_id:'right',request_scope:{explicit_topics:[],reader_questions:[],today_only:false}}).result.snapshot.seeds;assert.notDeepEqual(a.map(item=>item.value),b.map(item=>item.value));assert.ok(a.some(item=>item.value==='如何验证模型？'));assert.ok(b.some(item=>item.value==='怎样控制成本？'));
});

test('A17 selected historical post correction changes context while unrelated history stays stable',()=>{
  let current=state();current.config.content.topics=['AI'];current.post_entities['x:1']={current_version_ref:'pv1'};current.post_versions.pv1={post_version_id:'pv1',post_key:'x:1',text:'旧正文'};current.content_analyses.analysis1={analysis_id:'analysis1',post_version_ref:'pv1',primary_topic:'AI',reader_problem:'如何验证？',reviewed_at:'2026-10-26T00:00:00Z'};
  current=prepare(current,{request_scope:{explicit_topics:[],reader_questions:[],today_only:false}}).state;const snapshot=current.inspiration_sessions.session1.revisions['1'],descriptor={ref:'account',content_hash:'a'.repeat(64)},first=buildOperationalContext(current,{...snapshot.operational_context_selector,subject_descriptor:descriptor});
  current.content_analyses.unrelated={analysis_id:'unrelated',post_version_ref:'pv-x',primary_topic:'other',reader_problem:'无关问题',reviewed_at:'2026-10-26T01:00:00Z'};const stable=buildOperationalContext(current,{...snapshot.operational_context_selector,subject_descriptor:descriptor});assert.equal(stable.selected_context_hash,first.selected_context_hash);
  current.post_versions.pv2={post_version_id:'pv2',post_key:'x:1',text:'更正正文'};current.post_entities['x:1'].current_version_ref='pv2';const corrected=buildOperationalContext(current,{...snapshot.operational_context_selector,subject_descriptor:descriptor});assert.notEqual(corrected.selected_context_hash,first.selected_context_hash);const resumed=advanceInspiration(current,{contract_version:5,operation:'resume',session_id:'session1'},{as_of:T,operational_context:corrected});assert.equal(resumed.result.reselection_required,true);assert.deepEqual(resumed.result.budget,inspirationBudgetView(current.inspiration_sessions.session1));
});

test('A26 direct news reserve uses the parent ledger and resume does not issue or charge another ticket',()=>{
  let current=prepare(state()).state;const seed=current.inspiration_sessions.session1.revisions['1'].seeds[0].seed_id;
  let planned=advanceInspiration(current,{contract_version:5,operation:'plan',session_id:'session1',child_news_runs:[{run_id:'child1',allocated_search:1,allocated_read:0}],query_tasks:[{query_id:'query1',seed_refs:[seed],purpose:'new_fact',query:'databases update',child_news_run_ref:'child1',logical_task_ref:'task1'}]},{as_of:T});current=planned.state;
  const config=current.config,effective=resolveConfig(config,null,T),run={run_id:'child1',phase:'plan',deadline_at:'2026-10-27T02:00:00Z',request:{data_mode:'fixture'},effective_config:effective,binding_id:'binding',budget:{search_used:0,read_used:0,discover_search_used:0,discover_read_used:0,discovery_rounds:0},plan:{required_coverage:[{coverage_id:'coverage1'}],tasks:[{logical_task_id:'task1',operation:'search',purpose:'discover',coverage_ids:['coverage1'],scope_refs:[seed],request:{query:'databases update'}}]},tickets:{},candidates:{}};current.runs.child1=run;
  const reserved=advanceNews(run,'reserve',{logical_task_ids:['task1']},{state:current,as_of:T});assert.equal(reserved.tickets.length,1);assert.equal(inspirationBudgetView(current.inspiration_sessions.session1).search.reserved,1);
  const resumed=advanceInspiration(current,{contract_version:5,operation:'resume',session_id:'session1'},{as_of:T});assert.equal(resumed.changed,false);assert.equal(resumed.result.budget.search.reserved,1);assert.equal(Object.keys(resumed.result.runtime.ticket_ledger).length,1);
  const corrected=advanceInspiration(current,{contract_version:5,operation:'resume',session_id:'session1'},{as_of:T,operational_context:{selected_context_hash:'b'.repeat(64)}});assert.equal(corrected.changed,true);assert.equal(corrected.result.reselection_required,true);assert.equal(corrected.result.budget.search.reserved,1);assert.equal(Object.keys(corrected.result.runtime.ticket_ledger).length,1);
  assert.throws(()=>advanceNews(run,'reserve',{logical_task_ids:['task1']},{state:current,as_of:T}),/(parent allocation|pending or completed)/);
});

test('historical dedupe follows run versus account configuration',()=>{
  const current=state(),run={run_id:'new',effective_config:{config:current.config}};current.runs.old={run_id:'old',card_ids:['card'],event_ids:['event1']};
  current.config.history.dedupe_scope='run';assert.deepEqual(historicalNewsRuns(current,run),[]);
  current.config.history.dedupe_scope='account';assert.deepEqual(historicalNewsRuns(current,run).map(item=>item.run_id),['old']);
});

test('A15-A17 non-news followup requires real NoveltyDelta and resolves an exact immutable revision',()=>{
  let current=prepare(state()).state;const seed=current.inspiration_sessions.session1.revisions['1'].seeds[0].seed_id;current.sources.source1={record:{source_id:'source1'}};
  const base={candidate_id:'candidate1',kind:'history_followup',seed_refs:[seed],history_refs:['post1'],source_refs:['source1'],event_refs:[],claim_refs:[],new_information:'新版本修复了旧问题',reader_value:'知道是否值得复测',author_contribution_basis:'可复现旧测试',suggested_format:'short_post',material_requirements:['旧测试结果'],cost:{level:'low',basis:'已有材料'},novelty_delta:{prior_refs:['post1'],new_material_refs:['source1'],changed_dimension:'followup_result',explanation:'旧问题已有新修复'},media_candidate_refs:[]};
  assert.throws(()=>advanceInspiration(current,{contract_version:5,operation:'assess',session_id:'session1',candidates:[{...base,novelty_delta:null}],media_candidates:[]},{as_of:T}),/NoveltyDelta/);
  let assessed=advanceInspiration(current,{contract_version:5,operation:'assess',session_id:'session1',candidates:[base],media_candidates:[]},{as_of:T});current=assessed.state;
  const finalized=advanceInspiration(current,{contract_version:5,operation:'finalize',session_id:'session1',selected_candidate_ids:['candidate1'],selection_reasons:{candidate1:'与历史复测直接相关'},rejection_reasons:{}},{as_of:T});
  const ref=finalized.result.selected_refs[0],resolved=resolveInspirationRef(finalized.state,ref);assert.equal(resolved.candidate.candidate_id,'candidate1');assert.equal(resolved.candidate.kind,'history_followup');assert.equal(finalized.result.result_kind,'findings');
  assert.throws(()=>resolveInspirationRef(finalized.state,ref.replace(':3:',':1:')),/Candidate does not exist/);
});

test('A15 an old event cannot be labeled fresh for a today-only session',()=>{
  let current=prepare(state(),{request_scope:{explicit_topics:['AI'],reader_questions:[],today_only:true}}).state,seed=current.inspiration_sessions.session1.revisions['1'].seeds[0].seed_id;current.sources.source1={record:{source_id:'source1'}};current.events.old={event_id:'old',event_time:{instant:'2026-10-20T00:00:00Z'}};current.claims.claim1={claim_id:'claim1'};
  const fresh={candidate_id:'old-as-fresh',kind:'fresh_event',seed_refs:[seed],history_refs:[],source_refs:['source1'],event_refs:['old'],claim_refs:['claim1'],new_information:'旧材料',reader_value:'了解事件',author_contribution_basis:'解释',suggested_format:'short_post',material_requirements:[],cost:{level:'low',basis:'已有材料'},novelty_delta:null,media_candidate_refs:[]};assert.throws(()=>advanceInspiration(current,{contract_version:5,operation:'assess',session_id:'session1',candidates:[fresh],media_candidates:[]},{as_of:T}),/current frozen news window/);
  const noFindings=advanceInspiration(current,{contract_version:5,operation:'finalize',session_id:'session1',selected_candidate_ids:[],selection_reasons:{},rejection_reasons:{}},{as_of:T});assert.equal(noFindings.result.result_kind,'no_findings');
});
