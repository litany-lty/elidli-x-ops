import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { createDefaultConfigV5 } from '../scripts/lib/config.mjs';
import { buildOperationalContext } from '../scripts/lib/consumer-context.mjs';
import { activatePersonalPatternV5, applyExplicitPreferencePatch, personalPatternContentHash, proposePersonalPatternV5, recordFeedbackV5 } from '../scripts/lib/personal-model.mjs';
import { personalStep } from '../scripts/lib/personal.mjs';

const T='2026-10-27T01:00:00Z';
const account={handle:'fixture_personal',profile_url:'https://x.com/fixture_personal',user_id:null,identity_basis:'user_provided'};
const scope={goal:'relevant_reach',topics:['ai'],formats:['short_post'],surfaces:['for_you'],use:'current'};

function baseState(){return{schema_version:5,revision:1,account,config:createDefaultConfigV5(account),personal_patterns:{},feedback_events:{},strategy_definitions:{strategy1:{strategy_version_id:'strategy1',account_ref:'handle:fixture_personal',status:'active',strategy_hash:'a'.repeat(64)}},experiments:{},actions:{}};}

function pattern(overrides={}){
  const base={contract_version:5,pattern_version_id:'p-active',pattern_chain_id:'chain',account_ref:'handle:fixture_personal',scope,strategy_version_ref:'strategy1',metric_definition:{definition_id:'post.impressions'},observation_window:{kind:'age_window',target_hours:24,tolerance_hours:2},publication_refs:['pub1'],observation_refs:['obs1'],experiment_review_refs:['review1'],valid_n:1,independent_publication_count:1,coverage:{completeness:'complete'},comparability:{status:'compatible'},effect_kind:'descriptive',result_direction:'positive',dispersion:null,alternative_explanations:['可能受主题影响'],counter_evidence_refs:[],limitations:[],evidence_status:'insufficient',lifecycle_status:'active',statement:'清楚开头与较高触达相关',selection_policy_version:'personal-v5',candidate_ref:'p-candidate',pattern_review_ref:'host-review',supersedes_ref:null,created_at:'2026-10-26T01:00:00Z',reviewed_at:'2026-10-26T02:00:00Z',activated_at:'2026-10-26T02:00:00Z',...overrides};
  return{...base,pattern_content_hash:personalPatternContentHash(base)};
}

function contextInput(){return{intent:'draft',use:'current',goal:'relevant_reach',cutoff:T,subject_descriptor:{ref:'draft1',content_hash:'b'.repeat(64)},topic_refs:['ai'],format:'short_post',surface:'for_you',task_constraints:{max_changes:1},temporary_overrides:{},selected_signals:[{signal_id:'clear-opening'}],knowledge_dependency_versions:{}};}

test('operational context selects only compatible active patterns and reindexes related counterevidence',()=>{
  const state=baseState();state.personal_patterns.active=pattern();state.personal_patterns.other=pattern({pattern_version_id:'p-other',pattern_chain_id:'other',scope:{...scope,topics:['cooking']}});
  const first=buildOperationalContext(state,contextInput());
  assert.deepEqual(first.selected_patterns.map(item=>item.pattern_version_ref),['p-active']);
  assert.deepEqual(first.excluded_patterns,[],'unrelated pattern chains stay out of the selected context');
  state.personal_patterns.counter=pattern({pattern_version_id:'p-stale',lifecycle_status:'stale',supersedes_ref:'p-active',counter_evidence_refs:['review-counter'],created_at:'2026-10-26T03:00:00Z'});
  const second=buildOperationalContext(state,contextInput());
  assert.notEqual(second.selection_index_hash,first.selection_index_hash);
  assert.deepEqual(second.counter_evidence_refs,['p-stale','review-counter']);
});

test('explicit content preferences remain visible and a confirmed style change updates the context hash',()=>{
  const state=baseState();state.config.content.style_notes=['少用夸张标题'];state.config.content.audience='开发者';
  const recorded=recordFeedbackV5(state,{feedback_id:'global-weak',type:'output_feedback',subject_ref:'draft-global',subject_hash:'d'.repeat(64),response:'modified',reason:'所有目标都偏好更直接的开头',scope:{...scope,goal:null},supersedes_ref:null,retracts_ref:null,recorded_at:T});
  const scoped=recordFeedbackV5(recorded.state,{feedback_id:'other-goal-weak',type:'output_feedback',subject_ref:'draft-other',subject_hash:'e'.repeat(64),response:'modified',reason:'仅用于另一个目标',scope:{...scope,goal:'followers_growth'},supersedes_ref:null,retracts_ref:null,recorded_at:T});
  const first=buildOperationalContext(scoped.state,contextInput());assert.deepEqual(first.explicit_preferences.style_notes,['少用夸张标题']);assert.equal(first.explicit_preferences.audience,'开发者');assert.deepEqual(first.inferred_preferences.map(item=>item.feedback_ref),['global-weak']);scoped.state.config.content.style_notes=['避免夸张标题','先给结论'];const second=buildOperationalContext(scoped.state,contextInput());assert.notEqual(second.selected_context_hash,first.selected_context_hash);
});

test('a narrower new chain head prevents the older broad active version from reviving outside its scope',()=>{
  const state=baseState();state.personal_patterns.old=pattern({pattern_version_id:'old-wide'});state.personal_patterns.narrow=pattern({pattern_version_id:'new-narrow',scope:{...scope,topics:['cooking']},supersedes_ref:'old-wide',activated_at:'2026-10-26T04:00:00Z'});
  const context=buildOperationalContext(state,contextInput());assert.deepEqual(context.selected_patterns,[]);assert.ok(context.excluded_patterns.some(item=>item.pattern_version_ref==='new-narrow'&&item.reasons.includes('topic_mismatch')));
});

test('an active pattern is not selectable before its actual activation time',()=>{
  const state=baseState();state.personal_patterns.future=pattern({pattern_version_id:'future-active',created_at:'2026-10-26T01:00:00Z',activated_at:'2026-10-28T01:00:00Z'});
  const context=buildOperationalContext(state,contextInput());assert.deepEqual(context.selected_patterns,[]);assert.equal(context.selection_index_hash.length,64);
});

test('proposal counts publications, not 24h/7d observations, and continue is not supported',()=>{
  const state=baseState();Object.assign(state,{post_aliases:{},post_entities:{'x:x1':{current_version_ref:'pv1'}},post_versions:{pv1:{post_version_id:'pv1',created_at:'2026-10-25T00:00:00Z'}},post_metadata_facts:{},publications:{pub1:{platform_post_id:'x1',post_id:'x1'},pub2:{platform_post_id:'x1',post_id:'x1'}},experiment_reviews:{review1:{contract_version:4,review_id:'review1',experiment_id:'exp1',plan_view_ref:'plan1',computation_ref:'comp1',result_trust:'verified',interpretation:{conclusion:'continue'}}},experiments:{exp1:{experiment_id:'exp1',status:'closed',goal:'relevant_reach',planned_primary_metric:{definition_id:'post.impressions'},linked_publication_ids:['pub1','pub2'],cadence_group_ref:'cadence-one'}},review_computations:{comp1:{contract_version:4,target_selection:{completeness:'complete'},computation_request:{as_of:T,coverage_bindings:[{completeness:'complete'}]},metric_results:[{difference:10,target_observation_refs:['obs24','obs7'] }],comparability:'compatible'}},experiment_plan_views:{plan1:{window:{kind:'age_window',target_hours:24,tolerance_hours:2},metric_requirements:[{role:'primary',definition_id:'post.impressions'}]}}});
  const candidate=proposePersonalPatternV5(state,{experiment_review_ref:'review1',strategy_version_ref:'strategy1',pattern_version_id:'candidate',pattern_chain_id:'chain',scope,statement:'清楚开头与触达相关',alternative_explanations:['主题可能不同'],created_at:T});
  assert.equal(candidate.lifecycle_status,'candidate');assert.equal(candidate.independent_publication_count,1);assert.equal(candidate.valid_n,1);assert.equal(candidate.effect_kind,'descriptive');assert.equal(candidate.evidence_status,'insufficient');
  state.publications.pub2={platform_post_id:'x2',post_id:'x2'};state.publications.pub3={platform_post_id:'x3',post_id:'x3'};state.post_entities['x:x2']={current_version_ref:'pv2'};state.post_entities['x:x3']={current_version_ref:'pv3'};state.post_versions.pv2={post_version_id:'pv2',created_at:'2026-10-25T00:00:00Z'};state.post_versions.pv3={post_version_id:'pv3',created_at:'2026-10-25T00:00:00Z'};state.experiments.exp1.linked_publication_ids=['pub1','pub2','pub3'];
  const cadence=proposePersonalPatternV5(state,{experiment_review_ref:'review1',strategy_version_ref:'strategy1',pattern_version_id:'candidate-cadence',pattern_chain_id:'chain-cadence',scope,statement:'同一节奏组的三帖是一次策略执行',alternative_explanations:['单帖内容不同'],created_at:T});assert.equal(cadence.independent_publication_count,3);assert.equal(cadence.valid_n,1);assert.equal(cadence.effect_kind,'descriptive');
});

test('activation requires exact independent actual review and appends an active version',()=>{
  const state=baseState(),candidate=pattern({pattern_version_id:'candidate',lifecycle_status:'candidate',candidate_ref:null,pattern_review_ref:null,reviewed_at:null,activated_at:null});state.personal_patterns.candidate=candidate;
  const actual={purpose:'review_pattern',subject_ref:'candidate',subject_content_hash:candidate.pattern_content_hash,decision:'approved',issues:[],actual_at:T};
  const result=activatePersonalPatternV5(state,{candidate_ref:'candidate',pattern_version_id:'active2',actual_review_receipt_ref:'host1',activated_at:T},{actual_review_receipts:{host1:actual}});
  assert.equal(result.pattern.lifecycle_status,'active');assert.equal(result.pattern.candidate_ref,'candidate');assert.equal(result.pattern.pattern_review_ref,'host1');
  assert.throws(()=>activatePersonalPatternV5(state,{candidate_ref:'candidate',pattern_version_id:'bad',actual_review_receipt_ref:'host1',activated_at:T},{actual_review_receipts:{host1:{...actual,subject_content_hash:'0'.repeat(64)}}}),/exact candidate/);
});

test('long-term explicit preference atomically updates config and history while temporary does not',()=>{
  const state=baseState(),meta={feedback_id:'f1',source_quote:'以后图片少放字',source_ref:'chat:1',scope:{...scope,topics:[]},persistence:'long_term',recorded_at:T};
  const saved=applyExplicitPreferencePatch(state,{schema_version:5,scope:'persistent',operations:[{op:'set',path:'/content/preferences/short_text_on_images',value:true}]},meta);
  assert.equal(saved.state.config.content.preferences.short_text_on_images,true);assert.equal(saved.state.feedback_events.f1.type,'explicit_preference');
  const temporary=recordFeedbackV5(saved.state,{feedback_id:'f2',type:'explicit_preference',source_quote:'这次可以多字',source_ref:'chat:2',scope:{...scope,topics:[]},persistence:'temporary',patch:{operations:[{op:'set',path:'/content/preferences/short_text_on_images',value:false}]},supersedes_ref:null,retracts_ref:null,recorded_at:T});
  assert.equal(temporary.state.config.content.preferences.short_text_on_images,true);
});

test('unresolved failures deduplicate and no output rejection is inferred',()=>{
  const state=baseState(),failure={feedback_id:'failure1',type:'execution_failure',run_ref:'run1',step:'fetch',error:'timeout',minimal_reproduction:'fetch once',expected:'success',actual:'timeout',dedupe_key:'fetch-timeout',resolved_by_ref:null,recorded_at:T};
  const first=recordFeedbackV5(state,failure),second=recordFeedbackV5(first.state,{...failure,feedback_id:'failure2'});assert.equal(second.deduplicated,true);assert.equal(second.event.feedback_id,'failure1');
  assert.throws(()=>recordFeedbackV5(state,{feedback_id:'out1',type:'output_feedback',subject_ref:'draft1',subject_hash:canonicalHash('draft'),reason:'no response',scope,supersedes_ref:null,retracts_ref:null,recorded_at:T}),/No response is inferred/);
});

test('a real repair appends resolution history and removes the failure from the unresolved inspect view',()=>{
  const state=baseState(),failure={feedback_id:'quality1',type:'quality_failure',output_ref:'review-denied',output_hash:'b'.repeat(64),issue_type:'format_mismatch',review_issue:'A reply was stored as a short post',revision_ref:null,dedupe_key:'reply-format',resolved_by_ref:null,recorded_at:'2026-10-27T01:00:00Z'};
  const first=recordFeedbackV5(state,failure),duplicate=recordFeedbackV5(first.state,{...failure,feedback_id:'quality-duplicate',recorded_at:'2026-10-27T01:01:00Z'});
  assert.equal(duplicate.deduplicated,true);
  assert.throws(()=>recordFeedbackV5(duplicate.state,{...failure,feedback_id:'quality-missing-resolution',revision_ref:'draft-fixed:2',resolved_by_ref:'draft-fixed:2',recorded_at:'2026-10-27T01:02:00Z'}),/Resolution reference must exist/);
  duplicate.state.drafts={'draft-fixed':{revisions:{'2':{texts:['保留原文'],format:'reply'}}}};
  const resolved=recordFeedbackV5(duplicate.state,{...failure,feedback_id:'quality-resolved',revision_ref:'draft-fixed:2',resolved_by_ref:'draft-fixed:2',recorded_at:'2026-10-27T01:02:00Z'});
  const inspected=personalStep(resolved.state,{contract_version:5,operation:'inspect'}).result;
  assert.equal(resolved.deduplicated,false);assert.equal(resolved.state.feedback_events.quality1.resolved_by_ref,null);assert.equal(resolved.state.feedback_events.quality1.review_issue,'A reply was stored as a short post');assert.equal(resolved.event.revision_ref,'draft-fixed:2');assert.equal(resolved.event.resolved_by_ref,'draft-fixed:2');assert.equal(inspected.feedback_events.length,2);assert.deepEqual(inspected.unresolved_failures,[]);
});
