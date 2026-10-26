import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { buildReviewComputation, buildReviewComputationV4, experimentSemanticHash, newObservationWindowPolicy } from '../scripts/lib/review.mjs';
import { applyExperimentTransitionV4, buildPersonalPatternFromReviewV4, observationWindowStatusV4, priorActionOutcome } from '../scripts/lib/experiments.mjs';

const account={handle:'fixture_coach22',profile_url:'https://x.com/fixture_coach22',user_id:null,identity_basis:'user_provided'};

function fixture(){
  const experiment={contract_version:2,experiment_id:'exp',originating_action_id:'action',goal:'relevant_reach',hypothesis:'不保证增长',single_primary_change:'只改开头',baseline_scope:{kind:'none',refs:[]},target_scope:{kind:'publication',refs:['pub9']},inclusion_exclusion_rules:[],planned_primary_metric:{definition_id:'post.impressions'},guardrails:[],age_window_or_period:{kind:'age_window',value:'24h',tolerance_hours:1},planned_review_condition:'24h',assignment_or_selection_method:'single post',known_confounders:[],success_interpretation:'描述性复盘',stop_condition:'无改善时停',status:'running',status_history:[{status:'running',at:'2026-10-25T00:01:00Z',basis_refs:['pub9'],reason:null}],linked_publication_ids:['pub9']};
  const state={schema_version:4,revision:1,account,post_aliases:{},post_metadata_facts:{},post_entities:{'x:9':{post_key:'x:9',current_version_ref:'pv9'}},post_versions:{pv9:{post_version_id:'pv9',post_key:'x:9',text:'目标帖',content_hash:canonicalHash('目标帖'),created_at:'2026-10-25T00:00:00Z'}},snapshots_v2:{target:{snapshot_id:'target',contract_version:2,entity_type:'post',entity_id:'x:9',account_id:null,source_ref:'s',source_series_id:'series',source_locator:'t',observed_at:'2026-10-26T00:00:00Z',period:null,aggregation_basis:'lifetime_as_of',distribution:'total',surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:{definition_id:'post.impressions',value:120,value_kind:'count',unit:'count',precision:'exact',raw_display:'120',source_field_path:null,availability:'observed',evidence_locator:'t'}}}},publications:{pub9:{publication_id:'pub9',post_id:'9',content_match:'exact'}},experiments:{exp:experiment},experiment_plan_views:{},review_computations:{},experiment_reviews:{},collection_receipts:{}};
  const plan={contract_version:3,plan_view_id:'view',source_experiment_id:'exp',source_plan_hash:canonicalHash(experiment),source_semantic_hash:experimentSemanticHash(experiment),interpretation_version:'v3',status:'running',target_entity_keys:['x:9'],baseline_entity_keys:[],metric_requirements:[{definition_id:'post.impressions',role:'primary'}],window:{kind:'age_window',target_hours:24,tolerance_hours:1},linked_publication_ids:['pub9'],limitations:[]};
  state.experiment_plan_views.view=plan;
  const scope={entity_type:'post',entity_keys:['x:9']};
  state.collection_receipts.coverage={receipt_id:'coverage',status:'succeeded',account_identity_ref:'handle:fixture_coach22',actual_result_sha256:'c'.repeat(64),source_ref:'s',actual_scope:scope,actual_window:plan.window,coverage:{completeness:'complete'}};
  return {state,plan};
}

test('B08 strict V3 computation no longer leaks metric or period-only fields into selections',()=>{
  const {state,plan}=fixture(),computed=buildReviewComputation(state,plan,{as_of:'2026-10-26T01:00:00Z'});
  assert.doesNotThrow(()=>validate('ReviewComputationV3',computed));
  assert.equal('metric_definition_ids' in computed.target_selection.scope,false);
});

test('B11/B12 V4 freezes the plan projection and replays exact coverage through maturity and close',()=>{
  const {state,plan}=fixture(),computed=buildReviewComputationV4(state,plan,{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']});
  state.review_computations[computed.computation_id]=computed;
  assert.doesNotThrow(()=>validate('ReviewComputationV4',computed));
  assert.equal(computed.computation_request_hash,canonicalHash(computed.computation_request));
  const ready=applyExperimentTransitionV4(state,{type:'check_maturity',event_id:'mature',experiment_id:'exp',plan_view_ref:'view',computation_ref:computed.computation_id,at:'2026-10-26T01:01:00Z'});
  const interpretation={conclusion:'continue',reason:'成熟观测支持继续窄范围验证',metric_results:computed.metric_results},receipt={contract_version:3,receipt_id:'interpretation',computation_ref:computed.computation_id,computation_hash:computed.computation_hash,interpretation_proposal_hash:canonicalHash(interpretation),reviewer:'independent',reviewed_at:'2026-10-26T01:02:00Z',decision:'approved',classifications:['assertion']};
  const closed=applyExperimentTransitionV4(ready,{type:'close',event_id:'close',review_id:'review',experiment_id:'exp',plan_view_ref:'view',computation_ref:computed.computation_id,at:'2026-10-26T01:03:00Z',interpretation,interpretation_receipt:receipt});
  assert.equal(closed.experiments.exp.status,'closed');
  assert.equal(closed.experiment_reviews.review.contract_version,4);
  const pattern=buildPersonalPatternFromReviewV4(closed,{review_ref:'review',pattern_id:'pattern',topic_scope:['AI'],format_scope:['short_post'],pattern_statement:'当前账号的这一类开头值得继续验证',alternative_explanations:['发布时间也可能影响结果'],updated_at:'2026-10-26T01:04:00Z'});
  assert.equal(pattern.support_status,'supported');
  assert.equal(pattern.publication_refs[0],'pub9');
});

test('B11 rejects hidden target or primary-metric substitution',()=>{
  const {state,plan}=fixture();
  assert.throws(()=>buildReviewComputationV4(state,{...plan,target_entity_keys:['x:other']},{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']}),/targets must resolve/);
  assert.throws(()=>buildReviewComputationV4(state,{...plan,metric_requirements:[{definition_id:'post.likes',role:'primary'}]},{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']}),/primary metric and guardrails/);
});

test('B13 reads verified V3/V4 conclusions from interpretation',()=>{
  const action={action_id:'new',objective:'o',target:'t',change:'c'},state={actions:{old:{...action,action_id:'old',status:'accepted'}},experiments:{e:{experiment_id:'e',originating_action_id:'old',review_ref:'r'}},experiment_reviews:{r:{contract_version:3,review_id:'r',interpretation:{conclusion:'stop',evidence_refs:['obs']}}}};
  assert.deepEqual(priorActionOutcome(state,action),{repeated:true,outcome:'stop',evidence_refs:['old','r','obs']});
});

test('V4 maturity uses the frozen upper bound: 26h and 180h, never an available 24h or 72h value',()=>{
  const {state,plan}=fixture(),p24={...plan,window:newObservationWindowPolicy(24)},p168={...plan,window:newObservationWindowPolicy(168)};
  assert.deepEqual(p24.window,{kind:'age_window',target_hours:24,tolerance_hours:2});assert.deepEqual(p168.window,{kind:'age_window',target_hours:168,tolerance_hours:12});
  assert.equal(observationWindowStatusV4(state,p24,'2026-10-26T01:59:59Z').reason_code,'WINDOW_PENDING');
  assert.equal(observationWindowStatusV4(state,p24,'2026-10-26T02:00:00Z').status,'mature');
  assert.equal(observationWindowStatusV4(state,p168,'2026-10-28T00:00:00Z').reason_code,'WINDOW_PENDING','72h is not a mature 7-day window');
  assert.equal(observationWindowStatusV4(state,p168,'2026-11-01T12:00:00Z').status,'mature');
  const missing=structuredClone(state);delete missing.post_versions.pv9.created_at;assert.equal(observationWindowStatusV4(missing,p24,'2026-10-26T02:00:00Z').reason_code,'WINDOW_MISSING');
  const period={...plan,linked_publication_ids:[],window:{kind:'period',start:'2026-10-20T00:00:00Z',end_exclusive:'2026-10-27T00:00:00Z',timezone:'UTC',aggregation_basis:'event_period'}};
  assert.equal(observationWindowStatusV4(state,period,'2026-10-26T23:59:59Z').reason_code,'WINDOW_PENDING');assert.equal(observationWindowStatusV4(state,period,'2026-10-27T00:00:00Z').status,'mature');
});

test('V4 transition returns WINDOW_PENDING when an available observation precedes the real publication upper bound',()=>{
  const {state,plan}=fixture();state.publications.pub9.published_at='2026-10-25T00:30:00Z';const computation=buildReviewComputationV4(state,plan,{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']});state.review_computations[computation.computation_id]=computation;
  assert.equal(computation.metric_results[0].target_value,120);
  assert.throws(()=>applyExperimentTransitionV4(state,{type:'check_maturity',event_id:'too-early',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,at:'2026-10-26T01:00:00Z'}),error=>error.code==='WINDOW_PENDING'&&/01:30:00/.test(error.message));
});
