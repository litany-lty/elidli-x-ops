import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, ContractError, validate } from '../scripts/lib/contracts.mjs';
import { activeContentReceiptV3, analysisProposalHash, contentFingerprint, prepareContentAnalysisV3, validateContentAnalysisV3 } from '../scripts/lib/post-content.mjs';
import { algorithmReviewFlags, buildEvidenceRolesV3 } from '../scripts/lib/coaching.mjs';
import { normalizeExperimentPlanV3, buildReviewComputation, experimentSemanticHash, validateExperimentPlanViewV3, validateReviewInterpretation } from '../scripts/lib/review.mjs';
import { applyExperimentTransitionV3, validateExperimentPlan } from '../scripts/lib/experiments.mjs';
import { buildConsumerContext, resolvePersonalContextSelection, validatePersonalContextSelection } from '../scripts/lib/consumer-context.mjs';
import { resolvePostContext } from '../scripts/lib/imports.mjs';

const account={handle:'fixture_next',profile_url:'https://x.com/fixture_next',user_id:null,identity_basis:'user_provided'};
const resolveContextForTest=(state,ref)=>resolvePostContext(state,ref,{});
function contextState(){
 const parentText='父帖当前版本',replyText='回复正文';
 return {schema_version:3,revision:1,account,post_aliases:{},post_metadata_facts:{},post_entities:{'x:1':{post_key:'x:1',current_version_ref:'pv-parent-2'},'x:2':{post_key:'x:2',current_version_ref:'pv-reply'}},post_versions:{
  'pv-parent-1':{post_version_id:'pv-parent-1',post_key:'x:1',text:'父帖旧版本',content_hash:canonicalHash('父帖旧版本'),source_ref:'src-old',source_locator:'p1'},
  'pv-parent-2':{post_version_id:'pv-parent-2',post_key:'x:1',text:parentText,content_hash:canonicalHash(parentText),source_ref:'src-current',source_locator:'p2'},
  'pv-reply':{post_version_id:'pv-reply',post_key:'x:2',text:replyText,content_hash:canonicalHash(replyText),source_ref:'src-reply',source_locator:'r',parent_post_key:'x:1',context_coverage:{full_text:true,parent:true,quote:false,thread:false,media:false,linked_source:false}}
 },content_analyses:{},content_review_receipts:{},sources:{},config:{content:{voice_samples:[]}},actions:{},experiments:{},experiment_reviews:{},coaching_reports:{},evidence_bundles:{}};
}
function analysis(work,overrides={}){return {contract_version:3,analysis_id:'ca-v3',post_key:'x:2',post_version_ref:'pv-reply',content_hash:work.content_hash,context_selection_hash:work.context_selection_hash,analysis_version:'reader-v3',model_or_host_ref:'host',reviewed_at:'2026-10-26T12:00:00Z',context_coverage:{full_text:true,parent:'seen',quote:'not_applicable',thread:'not_applicable',media:'not_seen',linked_source:'not_applicable'},primary_topic:'reply',secondary_topics:[],intended_reader:'父帖读者',reader_problem:'理解回应',post_purpose:'reply',hook:{type:'reply',exact_span:{start:0,end:4,text:'回复正文'},promise:'回应父帖'},delivery_evidence:[],original_contribution:'回应',proof_type:'reasoning',cta_type:'none',media_dependency:'none',context_dependency:'parent',strengths:['直接'],issues:[],feature_evidence_spans:[{start:0,end:4,text:'回复正文'}],uncertainties:['media not seen'],...overrides};}

test('E14/E15 target reply uses the same frozen current parent context through prepare and ingest',()=>{
 const state=contextState(),prepared=prepareContentAnalysisV3(state,['pv-reply'],{analysis_version:'reader-v3',max_items:1}),work=prepared.work_items[0];
 assert.equal(work.context_selection.context_selection.parent.post_version_ref,'pv-parent-2');
 const proposal=analysis(work),hash=analysisProposalHash(proposal),receipt={contract_version:3,review_id:'cr3',post_version_ref:'pv-reply',content_hash:work.content_hash,context_selection_hash:work.context_selection_hash,analysis_version:'reader-v3',analysis_proposal_hash:hash,reviewer:'reviewer',method:'independent',reviewed_at:'2026-10-26T12:01:00Z',decision:'approved',supersedes_receipt_ref:null};
 assert.equal(validateContentAnalysisV3(proposal,state,receipt).analysis_id,'ca-v3');
 const reordered={...state,post_versions:Object.fromEntries(Object.entries(state.post_versions).reverse())};
 assert.equal(prepareContentAnalysisV3(reordered,['pv-reply'],{analysis_version:'reader-v3',max_items:1}).work_items[0].context_selection_hash,work.context_selection_hash);
 const changed=structuredClone(state);changed.post_entities['x:1'].current_version_ref='pv-parent-1';
 assert.throws(()=>validateContentAnalysisV3(proposal,changed,receipt),error=>error instanceof ContractError&&error.code==='STALE_BUNDLE');
});

test('E16 content approval binds the semantic proposal, not only text and analysis id',()=>{
 const state=contextState(),work=prepareContentAnalysisV3(state,['pv-reply'],{analysis_version:'reader-v3',max_items:1}).work_items[0],first=analysis(work),receipt={contract_version:3,review_id:'r',post_version_ref:'pv-reply',content_hash:work.content_hash,context_selection_hash:work.context_selection_hash,analysis_version:'reader-v3',analysis_proposal_hash:analysisProposalHash(first),reviewer:'r',method:'independent',reviewed_at:'2026-10-26T12:01:00Z',decision:'approved',supersedes_receipt_ref:null};
 assert.doesNotThrow(()=>validateContentAnalysisV3(first,state,receipt));
 assert.throws(()=>validateContentAnalysisV3({...first,issues:['新的语义主张']},state,receipt),/proposal hash/);
 assert.doesNotThrow(()=>validateContentAnalysisV3({...first,analysis_id:'retry-id'},state,receipt));
});

test('E16 a later exact denial supersedes an older approval',()=>{
 const state=contextState(),work=prepareContentAnalysisV3(state,['pv-reply'],{analysis_version:'reader-v3',max_items:1}).work_items[0],proposal=analysis(work),hash=analysisProposalHash(proposal);
 state.content_review_receipts.approved={contract_version:3,review_id:'approved',post_version_ref:'pv-reply',content_hash:work.content_hash,context_selection_hash:work.context_selection_hash,analysis_version:'reader-v3',analysis_proposal_hash:hash,reviewer:'r',method:'independent',reviewed_at:'2026-10-26T12:01:00Z',decision:'approved',supersedes_receipt_ref:null};
 state.content_review_receipts.denied={...state.content_review_receipts.approved,review_id:'denied',reviewed_at:'2026-10-26T12:02:00Z',decision:'revision_required',supersedes_receipt_ref:'approved'};
 assert.equal(activeContentReceiptV3(state,proposal).review_id,'denied');
 assert.throws(()=>validateContentAnalysisV3(proposal,state,activeContentReceiptV3(state,proposal)),/Approved V3 receipt/);
 state.content_analyses[proposal.analysis_id]=proposal;
 assert.equal(prepareContentAnalysisV3(state,['pv-reply'],{analysis_version:'reader-v3',max_items:1}).reused_analysis_refs.length,0);
});

test('E25 honest rebuttals become review flags while unsupported score assertions still fail',()=>{
 const honest=algorithmReviewFlags({text:'不能把点赞次数换算为推荐分；本次试验不保证曝光上涨。'});
 assert.equal(honest.every(flag=>flag.severity==='review'),true);
 assert.equal(honest.some(flag=>flag.classification_required),true);
 assert.throws(()=>algorithmReviewFlags({text:'每个点赞固定加20推荐分，所以保证曝光上涨。'},{rejectHard:true}),/unsupported ranking or effect assertion/);
 const plan={contract_version:2,experiment_id:'e',originating_action_id:'a',goal:'g',hypothesis:'本次试验不保证曝光上涨',single_primary_change:'只改开头',planned_primary_metric:{definition_id:'post.impressions'},guardrails:[],planned_review_condition:'24h',stop_condition:'无改善时停',success_interpretation:'不保证增长',status:'proposed',status_history:[{status:'proposed'}],linked_publication_ids:[]};
 assert.doesNotThrow(()=>validateExperimentPlan(plan,{actions:{a:{}}}));
});

test('E19 consumer defaults to the entity current version and includes history only when explicit',()=>{
 const state=contextState(),oldContext=resolveContextForTest(state,'pv-parent-1'),currentContext=resolveContextForTest(state,'pv-parent-2'),coverage={full_text:true,parent:'not_applicable',quote:'not_applicable',thread:'not_applicable',media:'not_seen',linked_source:'not_applicable'};state.content_analyses={old:{contract_version:3,analysis_id:'old',post_version_ref:'pv-parent-1',analysis_version:'v3',reviewed_at:'2026-10-25T00:00:00Z',content_hash:oldContext.target_content_hash,context_selection_hash:oldContext.context_selection_hash,primary_topic:'old',intended_reader:'r',reader_problem:'p',post_purpose:'x',context_coverage:coverage,strengths:[],issues:['old issue'],uncertainties:[]},current:{contract_version:3,analysis_id:'current',post_version_ref:'pv-parent-2',analysis_version:'v3',reviewed_at:'2026-10-26T00:00:00Z',content_hash:currentContext.target_content_hash,context_selection_hash:currentContext.context_selection_hash,primary_topic:'current',intended_reader:'r',reader_problem:'p',post_purpose:'x',context_coverage:coverage,strengths:[],issues:[],uncertainties:[]}};
 const goal={primary_goal:'relevant_reach',goal_notes:null,source:'temporary_assumption'};
 assert.deepEqual(buildConsumerContext(state,{intent:'draft',goal_snapshot:goal}).content_analysis_refs,['current']);
 assert.deepEqual(buildConsumerContext(state,{intent:'draft',goal_snapshot:goal,requested_use:'historical_compare',post_version_refs:['pv-parent-1','pv-parent-2']}).content_analysis_refs,['current','old']);
});

test('E26 old closed review and active plans are not trusted as proven effects',()=>{
 const state=contextState(),goal={primary_goal:'relevant_reach',goal_notes:null,source:'temporary_assumption'};state.experiments.old={experiment_id:'old',status:'closed'};state.experiment_reviews.old={review_id:'old-review',experiment_id:'old',conclusion:'continue',reason:'legacy',metric_results:[],evidence_refs:[]};
 const context=buildConsumerContext(state,{intent:'draft',goal_snapshot:goal});assert.deepEqual(context.experiment_review_refs,[]);assert(context.limitations.some(item=>item.includes('没有已关闭')));
});

test('E29 personal context binds only a relevant subset and unrelated additions do not stale it',()=>{
 const state=contextState(),context=resolveContextForTest(state,'pv-parent-2');state.content_analyses.current={contract_version:3,analysis_id:'current',post_version_ref:'pv-parent-2',analysis_version:'v3',reviewed_at:'2026-10-26T00:00:00Z',content_hash:context.target_content_hash,context_selection_hash:context.context_selection_hash,primary_topic:'topic',intended_reader:'reader',reader_problem:'problem',post_purpose:'explain',context_coverage:{full_text:true,parent:'not_applicable',quote:'not_applicable',thread:'not_applicable',media:'not_seen',linked_source:'not_applicable'},strengths:[],issues:[],uncertainties:[]};
 const selection=resolvePersonalContextSelection(state,{goal_hash:'goal',brief_or_use_hash:'use',selected:[{ref:'current',purpose:'content_pattern',limitations:[]}]});assert.doesNotThrow(()=>validatePersonalContextSelection(state,selection));state.sources.unrelated={source_id:'unrelated'};assert.equal(validatePersonalContextSelection(state,selection).selection_hash,selection.selection_hash);state.content_analyses.current.issues=['changed'];assert.throws(()=>validatePersonalContextSelection(state,selection),/changed or became stale/);
 assert.throws(()=>resolvePersonalContextSelection(state,{goal_hash:'goal',brief_or_use_hash:'use',selected:[{ref:'current',purpose:'performance_result',limitations:[]}]}),/cannot support personal purpose/);
});

test('E23 V2 plan windows normalize only unambiguous 24h and reject weak strings',()=>{
 const v2={contract_version:2,experiment_id:'exp',status:'running',age_window_or_period:{kind:'age_window',value:'24h',tolerance_hours:2},planned_primary_metric:{definition_id:'post.impressions'},guardrails:[],linked_publication_ids:[]};
 assert.deepEqual(normalizeExperimentPlanV3(v2).window,{kind:'age_window',target_hours:24,tolerance_hours:2});
 assert.throws(()=>normalizeExperimentPlanV3({...v2,age_window_or_period:{kind:'age_window',value:'24 hours'}}),/plan details/);
 const state={post_aliases:{},post_entities:{'x:9':{}},publications:{pub9:{publication_id:'pub9',post_id:'9'}},experiments:{exp:{...v2,linked_publication_ids:['pub9']}}},view=normalizeExperimentPlanV3(state.experiments.exp,state);
 assert.doesNotThrow(()=>validateExperimentPlanViewV3(state,view));
 const legacy=structuredClone(view);delete legacy.source_semantic_hash;legacy.plan_view_id=`plan-view-${canonicalHash({id:state.experiments.exp.experiment_id,plan_hash:canonicalHash(state.experiments.exp),version:'experiment-plan-view-v3'}).slice(0,24)}`;
 assert.doesNotThrow(()=>validate('ExperimentPlanViewLegacyV3',legacy));assert.notEqual(view.plan_view_id,legacy.plan_view_id);
 assert.throws(()=>buildReviewComputation(state,legacy,{as_of:'2026-10-26T00:00:00Z'}),error=>error instanceof ContractError&&error.code==='MIGRATION_REQUIRED');
 const ambiguousState=structuredClone(state);ambiguousState.experiments.exp.age_window_or_period={kind:'age_window',value:'24 hours'};
 assert.throws(()=>validateExperimentPlanViewV3(ambiguousState,normalizeExperimentPlanV3(ambiguousState.experiments.exp,ambiguousState,{allowIncomplete:true})),/Plan details/);
});

function reviewPlan(state,{baseline_entity_keys=[]}={}){return{contract_version:3,plan_view_id:'view',source_experiment_id:'exp',source_plan_hash:canonicalHash(state.experiments.exp),source_semantic_hash:experimentSemanticHash(state.experiments.exp),interpretation_version:'v3',status:'running',target_entity_keys:['x:9'],baseline_entity_keys,metric_requirements:[{definition_id:'post.impressions',role:'primary'}],window:{kind:'age_window',target_hours:24,tolerance_hours:1},linked_publication_ids:['pub9'],limitations:[]};}

function reviewState(){
 const text='目标帖';return{schema_version:3,account,post_aliases:{},post_metadata_facts:{},post_entities:{'x:9':{post_key:'x:9',current_version_ref:'pv9'},'x:8':{post_key:'x:8',current_version_ref:'pv8'}},post_versions:{pv9:{post_version_id:'pv9',post_key:'x:9',text,content_hash:canonicalHash(text),created_at:'2026-10-25T00:00:00Z'},pv8:{post_version_id:'pv8',post_key:'x:8',text:'基线',content_hash:canonicalHash('基线'),created_at:'2026-10-24T00:00:00Z'}},snapshots_v2:{target:{snapshot_id:'target',contract_version:2,entity_type:'post',entity_id:'x:9',account_id:null,source_ref:'s',source_series_id:'series',source_locator:'t',observed_at:'2026-10-26T00:00:00Z',period:null,aggregation_basis:'lifetime_as_of',distribution:'total',surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:{definition_id:'post.impressions',value:120,value_kind:'count',unit:'count',precision:'exact',raw_display:'120',source_field_path:null,availability:'observed',evidence_locator:'t'}}},baseline:{snapshot_id:'baseline',contract_version:2,entity_type:'post',entity_id:'x:8',account_id:null,source_ref:'s',source_series_id:'series',source_locator:'b',observed_at:'2026-10-25T00:00:00Z',period:null,aggregation_basis:'lifetime_as_of',distribution:'total',surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:{definition_id:'post.impressions',value:100,value_kind:'count',unit:'count',precision:'exact',raw_display:'100',source_field_path:null,availability:'observed',evidence_locator:'b'}}}},publications:{pub9:{publication_id:'pub9',post_id:'9',content_match:'exact'}},experiments:{exp:{experiment_id:'exp',status:'running',linked_publication_ids:['pub9'],status_history:[]}},experiment_plan_views:{},review_computations:{},experiment_reviews:{}};}

test('E17/E18 purpose-bound evidence excludes future and background from target selection',()=>{
 const state=reviewState();state.import_artifacts={bg:{artifact_sha256:'bg',source_ref:'background',material_kind:'canonical_json',path:'/private/bg'}};state.snapshots_v2.future={...structuredClone(state.snapshots_v2.target),snapshot_id:'future',observed_at:'2026-10-27T00:00:00Z'};
 const target={scope:{entity_type:'post',entity_keys:['x:9'],metric_definition_ids:['post.impressions']},window:{kind:'age_window',target_hours:24,tolerance_hours:1},metric_requirements:[{definition_id:'post.impressions'}]},roles=buildEvidenceRolesV3(state,{target,background_refs:['background'],as_of:'2026-10-26T01:00:00Z'});assert.deepEqual(roles.target_selection.selected.map(item=>item.observation_ref),['target:impressions']);assert.equal(roles.evidence_index.background.evidence_role,'background');
 const changed={...state,import_artifacts:{...state.import_artifacts,extra:{artifact_sha256:'x',source_ref:'other',material_kind:'canonical_json',path:'/private/x'}}},again=buildEvidenceRolesV3(changed,{target,background_refs:['background'],as_of:'2026-10-26T01:00:00Z'});assert.equal(again.evidence_roles_hash,roles.evidence_roles_hash);
});

test('E20/E21 review computation and maturity consume the same exact 24h selection',()=>{
 const state=reviewState(),plan=reviewPlan(state,{baseline_entity_keys:['x:8']});state.experiment_plan_views.view=plan;
 const computation=buildReviewComputation(state,plan,{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']});state.review_computations[computation.computation_id]=computation;
 assert.deepEqual(computation.metric_results[0].target_observation_refs,['target:impressions']);assert.equal(computation.metric_results[0].target_value,120);assert.equal(computation.metric_results[0].baseline_value,100);
 const next=applyExperimentTransitionV3(state,{type:'check_maturity',event_id:'mature',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:['coverage'],at:'2026-10-26T01:00:00Z'});
 assert.equal(next.experiments.exp.status,'ready_for_review');
});

test('E21 does not substitute a 72h observation and distinguishes pending from missing',()=>{
 const state=reviewState(),plan=reviewPlan(state);
 state.snapshots_v2.target.observed_at='2026-10-28T00:00:00Z';
 const pending=buildReviewComputation(state,plan,{as_of:'2026-10-25T12:00:00Z'}),missing=buildReviewComputation(state,plan,{as_of:'2026-10-28T01:00:00Z'});
 assert.equal(pending.target_selection.coverage.pending_n,1);assert.equal(pending.metric_results[0].target_value,null);
 assert.equal(missing.target_selection.coverage.missing_n,1);assert.equal(missing.metric_results[0].target_value,null);
});

test('E22 account event-period review stays pending until end and then matures on the target account',()=>{
 const state=reviewState();state.account={...account,user_id:'acct-1'};state.experiments.exp={...state.experiments.exp,linked_publication_ids:[],planned_primary_metric:{definition_id:'account.impressions'}};
 state.snapshots_v2={account_period:{snapshot_id:'account_period',contract_version:2,entity_type:'account',entity_id:'acct-1',account_id:'acct-1',source_ref:'s',source_series_id:'series',source_locator:'a',observed_at:'2026-10-08T00:00:00Z',period:{start:'2026-10-01T00:00:00Z',end_exclusive:'2026-10-08T00:00:00Z',timezone:'UTC',source_date_start:null,source_date_end_inclusive:null},aggregation_basis:'event_period',distribution:'total',surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:{definition_id:'account.impressions',value:700,value_kind:'count',unit:'count',precision:'exact',raw_display:'700',source_field_path:null,availability:'observed',evidence_locator:'a'}}}};
 const plan={contract_version:3,plan_view_id:'account-view',source_experiment_id:'exp',source_plan_hash:canonicalHash(state.experiments.exp),source_semantic_hash:experimentSemanticHash(state.experiments.exp),interpretation_version:'v3',status:'running',target_entity_keys:[],baseline_entity_keys:[],metric_requirements:[{definition_id:'account.impressions',role:'primary'}],window:{kind:'period',start:'2026-10-01T00:00:00Z',end_exclusive:'2026-10-08T00:00:00Z',timezone:'UTC',aggregation_basis:'event_period'},linked_publication_ids:[],limitations:[]};state.experiment_plan_views[plan.plan_view_id]=plan;
 const early=buildReviewComputation(state,plan,{as_of:'2026-10-02T00:00:00Z'}),mature=buildReviewComputation(state,plan,{as_of:'2026-10-08T00:00:00Z'});
 assert.equal(early.target_selection.coverage.pending_n,1);assert.equal(early.metric_results[0].target_value,null);
 assert.equal(mature.target_selection.scope.entity_type,'account');assert.deepEqual(mature.target_selection.scope.entity_keys,['acct-1']);assert.equal(mature.metric_results[0].target_value,700);
});

test('E24 source status may advance but semantic plan changes stale the computation',()=>{
 const state=reviewState(),plan=reviewPlan(state);state.experiment_plan_views.view=plan;const computation=buildReviewComputation(state,plan,{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']});state.review_computations[computation.computation_id]=computation;
 const ready=applyExperimentTransitionV3(state,{type:'check_maturity',event_id:'mature-semantic',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:['coverage'],at:'2026-10-26T01:01:00Z'});
 const interpretation={conclusion:'continue',reason:'同一计划语义下已成熟',metric_results:computation.metric_results},receipt={contract_version:3,receipt_id:'rr-semantic',computation_ref:computation.computation_id,computation_hash:computation.computation_hash,interpretation_proposal_hash:canonicalHash(interpretation),reviewer:'independent',reviewed_at:'2026-10-26T01:02:00Z',decision:'approved',classifications:['assertion']};
 assert.equal(applyExperimentTransitionV3(ready,{type:'close',event_id:'close-semantic',review_id:'review-semantic',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:['coverage'],at:'2026-10-26T01:03:00Z',interpretation,interpretation_receipt:receipt}).experiments.exp.status,'closed');
 const changed=structuredClone(ready);changed.experiments.exp.single_primary_change='changed after computation';
 assert.throws(()=>applyExperimentTransitionV3(changed,{type:'close',event_id:'close-stale-plan',review_id:'review-stale-plan',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:['coverage'],at:'2026-10-26T01:03:00Z',interpretation,interpretation_receipt:receipt}),/semantics changed/);
});

test('E24 unrelated observations do not stale a frozen review computation',()=>{
 const state=reviewState(),plan=reviewPlan(state);state.experiment_plan_views.view=plan;
 const computation=buildReviewComputation(state,plan,{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']});state.review_computations[computation.computation_id]=computation;
 state.snapshots_v2.unrelated={...structuredClone(state.snapshots_v2.baseline),snapshot_id:'unrelated'};
 assert.equal(applyExperimentTransitionV3(state,{type:'check_maturity',event_id:'mature',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:['coverage'],at:'2026-10-26T02:00:00Z'}).experiments.exp.status,'ready_for_review');
});

test('E23 an incomplete planned window may close only as independently reviewed inconclusive',()=>{
 const state=reviewState(),plan=reviewPlan(state);state.experiment_plan_views.view=plan;
 const computation=buildReviewComputation(state,plan,{as_of:'2026-10-25T12:00:00Z'});state.review_computations[computation.computation_id]=computation;
 const interpretation={conclusion:'inconclusive',reason:'尚未达到计划窗口',metric_results:computation.metric_results},receipt={contract_version:3,receipt_id:'rr-inconclusive',computation_ref:computation.computation_id,computation_hash:computation.computation_hash,interpretation_proposal_hash:canonicalHash(interpretation),reviewer:'independent',reviewed_at:'2026-10-25T12:01:00Z',decision:'approved',classifications:['uncertainty']};
 const next=applyExperimentTransitionV3(state,{type:'close',event_id:'close-inconclusive',review_id:'review-inconclusive',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:[],at:'2026-10-25T12:02:00Z',interpretation,interpretation_receipt:receipt});
 assert.equal(next.experiment_reviews['review-inconclusive'].interpretation.conclusion,'inconclusive');
});

test('E24 close rejects refilled numbers and stale deterministic computations',()=>{
 const state=reviewState(),plan=reviewPlan(state);state.experiment_plan_views.view=plan;const computation=buildReviewComputation(state,plan,{as_of:'2026-10-26T01:00:00Z',coverage_receipt_refs:['coverage']});state.review_computations[computation.computation_id]=computation;
 const interpretation={conclusion:'continue',reason:'目标值已取得',metric_results:[{...computation.metric_results[0],target_value:12000}]},receiptBase={contract_version:3,receipt_id:'rr',computation_ref:computation.computation_id,computation_hash:computation.computation_hash,interpretation_proposal_hash:canonicalHash(interpretation),reviewer:'independent',reviewed_at:'2026-10-26T01:01:00Z',decision:'approved',classifications:['assertion']};
 assert.throws(()=>validateReviewInterpretation(computation,interpretation,receiptBase),/refill deterministic/);
 const corrected={conclusion:'continue',reason:'目标值已取得',metric_results:computation.metric_results},receipt={...receiptBase,interpretation_proposal_hash:canonicalHash(corrected)};
 const changed=structuredClone(state);changed.snapshots_v2.target.metrics.impressions.value=80;
 assert.throws(()=>applyExperimentTransitionV3(changed,{type:'close',event_id:'close',review_id:'review3',experiment_id:'exp',plan_view_ref:'view',computation_ref:computation.computation_id,coverage_receipt_refs:['coverage'],at:'2026-10-26T01:02:00Z',interpretation:corrected,interpretation_receipt:receipt}),/recompute/);
});
