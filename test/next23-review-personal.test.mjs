import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultConfigV5 } from '../scripts/lib/config.mjs';
import { canonicalHash } from '../scripts/lib/contracts.mjs';
import { buildOperationalContext } from '../scripts/lib/consumer-context.mjs';
import { buildRuleContextV5, buildSignalSetV5, knowledgeBundleFromState } from '../scripts/lib/knowledge.mjs';
import { applyExplicitPreferencePatch, personalPatternContentHash, recordFeedbackV5 } from '../scripts/lib/personal-model.mjs';
import { personalStep } from '../scripts/lib/personal.mjs';
import { initializeState, loadState } from '../scripts/lib/state.mjs';
import { currentGuidanceV5 } from '../scripts/lib/v5-dispatch.mjs';

const account={handle:'review_personal',profile_url:'https://x.com/review_personal',user_id:null,identity_basis:'user_provided'};
const scope={goal:'relevant_reach',topics:['ai'],formats:['short_post'],surfaces:['for_you'],use:'current'};
const T1='2026-10-27T01:00:00Z',T2='2026-10-27T02:00:00Z',T3='2026-10-27T03:00:00Z';
function state(){return{schema_version:5,revision:1,account,config:createDefaultConfigV5(account),personal_patterns:{},feedback_events:{},strategy_definitions:{strategy1:{strategy_version_id:'strategy1',account_ref:'handle:review_personal',status:'active',strategy_hash:'a'.repeat(64)}},experiment_reviews:{},experiments:{},actions:{},publications:{}};}
function selector(overrides={}){return{intent:'draft',use:'current',goal:'relevant_reach',cutoff:T3,subject_descriptor:{ref:'draft1',content_hash:'b'.repeat(64)},subject_ref:'draft1',topic_refs:['ai'],format:'short_post',surface:'for_you',task_constraints:{},temporary_overrides:{},content_evidence_refs:[],metric_evidence_refs:[],selected_signals:[],knowledge_dependency_versions:{},...overrides};}
function preference(current,id,value,at,supersedes_ref=null){return applyExplicitPreferencePatch(current,{schema_version:5,scope:'persistent',operations:[{op:'set',path:'/content/preferences/short_text_on_images',value}]},{feedback_id:id,source_quote:`偏好 ${value}`,source_ref:`chat:${id}`,scope,persistence:'long_term',supersedes_ref,retracts_ref:null,recorded_at:at});}
function pattern(id,metric='post.impressions',overrides={}){const base={contract_version:5,pattern_version_id:id,pattern_chain_id:`chain-${id}`,account_ref:'handle:review_personal',scope,strategy_version_ref:'strategy1',algorithm_dependency_versions:{},metric_definition:{definition_id:metric},observation_window:{kind:'age_window',target_hours:24,tolerance_hours:2},publication_refs:['pub1'],observation_refs:['obs1'],experiment_review_refs:['review1'],valid_n:1,independent_publication_count:1,coverage:{completeness:'complete'},comparability:{status:'compatible'},effect_kind:'descriptive',result_direction:'positive',dispersion:null,alternative_explanations:['主题差异'],counter_evidence_refs:[],limitations:[],evidence_status:'insufficient',lifecycle_status:'active',statement:'相关经验',selection_policy_version:'personal-v5',candidate_ref:'candidate',pattern_review_ref:'host',supersedes_ref:null,created_at:T1,reviewed_at:T1,activated_at:T1,...overrides};return{...base,pattern_content_hash:personalPatternContentHash(base)};}

test('forget derives affected fields and cannot overwrite a later explicit instruction',()=>{
  let current=preference(state(),'f1',true,T1).state;current=preference(current,'f2',false,T2,'f1').state;
  const result=personalStep(current,{contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'f1',feedback:{feedback_id:'forget-f1',source_quote:'撤销第一条',source_ref:'chat:forget',recorded_at:T3}});
  assert.equal(result.state.config.content.preferences.short_text_on_images,false);
  assert.deepEqual(result.result.event.operations,[]);
  assert.deepEqual(result.result.event.retracted_paths,['/content/preferences/short_text_on_images']);
  assert.deepEqual(result.result.applied_paths,[]);
});

test('forgetting the current head resets the field to its canonical default without caller patch',()=>{
  const current=preference(state(),'f1',true,T1).state;
  const result=personalStep(current,{contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'f1',feedback:{feedback_id:'forget-f1',source_quote:'不再采用',source_ref:'chat:forget',recorded_at:T2}});
  assert.equal(result.state.config.content.preferences.short_text_on_images,null);
  assert.deepEqual(result.result.applied_paths,['/content/preferences/short_text_on_images']);
});

test('legacy preference history without a provable field head preserves the current config',()=>{
  let current=preference(state(),'legacy-one',true,T1).state;current=preference(current,'legacy-two',false,T2).state;delete current.preference_meta;delete current.feedback_events['legacy-one'].committed_revision;delete current.feedback_events['legacy-two'].committed_revision;
  const result=personalStep(current,{contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'legacy-one',feedback:{feedback_id:'forget-legacy',source_quote:'撤销旧记录',source_ref:'chat:legacy',recorded_at:T3}});assert.equal(result.state.config.content.preferences.short_text_on_images,false);assert.deepEqual(result.result.applied_paths,[]);assert.deepEqual(result.result.preserved_paths,['/content/preferences/short_text_on_images']);
});

test('preference heads protect newer parent and child JSON-pointer writes from older forgets',()=>{
  let current=preference(state(),'leaf-old',true,T1).state,parentValue={...structuredClone(current.config.content.preferences),short_text_on_images:false};current=applyExplicitPreferencePatch(current,{schema_version:5,scope:'persistent',operations:[{op:'set',path:'/content/preferences',value:parentValue}]},{feedback_id:'parent-new',source_quote:'整体偏好更新',source_ref:'chat:parent',scope,persistence:'long_term',recorded_at:T1}).state;
  let result=personalStep(current,{contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'leaf-old',feedback:{feedback_id:'forget-leaf',source_quote:'撤销旧叶子',source_ref:'chat:forget-leaf',recorded_at:T2}});assert.equal(result.state.config.content.preferences.short_text_on_images,false);assert.deepEqual(result.result.applied_paths,[]);
  current=applyExplicitPreferencePatch(state(),{schema_version:5,scope:'persistent',operations:[{op:'set',path:'/content/preferences',value:{...createDefaultConfigV5(account).content.preferences,short_text_on_images:true,image_usage:'prefer'}}]},{feedback_id:'parent-old',source_quote:'整体旧偏好',source_ref:'chat:parent-old',scope,persistence:'long_term',recorded_at:T1}).state;current=preference(current,'leaf-new',false,T1).state;
  result=personalStep(current,{contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'parent-old',feedback:{feedback_id:'forget-parent',source_quote:'撤销旧父级',source_ref:'chat:forget-parent',recorded_at:T2}});assert.equal(result.state.config.content.preferences.short_text_on_images,false);assert.equal(result.state.config.content.preferences.image_usage,null);assert.deepEqual(result.result.preserved_paths,['/content/preferences/short_text_on_images']);assert.ok(result.result.applied_paths.includes('/content/preferences/image_usage'));assert.ok(result.result.applied_paths.includes('/content/preferences/topic_boundaries'));
});

test('personal model summary groups incompatible metrics and deduplicates one publication execution',()=>{
  const current=state();current.publications.pub1={platform_post_id:'x1',post_id:'x1'};current.experiment_reviews.review1={review_id:'review1',experiment_id:'exp1'};current.experiments.exp1={experiment_id:'exp1',linked_publication_ids:['pub1']};current.personal_patterns.a=pattern('a');current.personal_patterns.b=pattern('b');current.personal_patterns.c=pattern('c','post.likes');
  const context=buildOperationalContext(current,selector());
  assert.equal(context.personal_model_summary.grouping,'strategy_scope_metric_window_algorithm');
  assert.equal(context.personal_model_summary.groups.length,2);
  const impressions=context.personal_model_summary.groups.find(group=>group.metric_definition.definition_id==='post.impressions');
  assert.equal(impressions.independent_publication_count,1);assert.equal(impressions.independent_experiment_count,1);assert.equal(impressions.valid_n,1);
  const filtered=buildOperationalContext(current,selector({metric_definition:{definition_id:'post.impressions'},observation_window:{kind:'age_window',target_hours:24,tolerance_hours:2}}));
  assert.equal(filtered.personal_model_summary.grouping,'requested_strategy_scope_metric_window_algorithm');assert.deepEqual(filtered.selected_patterns.map(item=>item.pattern_version_ref),['a','b']);
});

test('personal summary uses canonical experiment sample groups and keeps uncertain evidence out of positive refs',()=>{
  const current=state();current.post_aliases={'x:alias':'x:one'};Object.assign(current.publications,{p1:{publication_id:'p1',platform_post_id:'one',post_id:'one'},p1dup:{publication_id:'p1dup',platform_post_id:'one',post_id:'alias'},p2:{publication_id:'p2',platform_post_id:'two',post_id:'two'},p3:{publication_id:'p3',platform_post_id:'three',post_id:'three'},p4:{publication_id:'p4',platform_post_id:'four',post_id:'four'}});current.actions={a1:{strategy_version_ref:'strategy1'},a2:{strategy_version_ref:'strategy2'}};current.experiments={multi:{experiment_id:'multi',originating_action_id:'a1',linked_publication_ids:['p1','p1dup','p2']},cadence:{experiment_id:'cadence',originating_action_id:'a2',linked_publication_ids:['p3','p4'],cadence_group_ref:'cadence-one'},single:{experiment_id:'single',originating_action_id:'a1',linked_publication_ids:['p1']}};current.experiment_reviews={rm1:{review_id:'rm1',experiment_id:'multi'},rm2:{review_id:'rm2',experiment_id:'multi'},rc:{review_id:'rc',experiment_id:'cadence'},rs:{review_id:'rs',experiment_id:'single'}};
  current.personal_patterns.multiPositive=pattern('multi-positive','post.impressions',{experiment_review_refs:['rm1'],publication_refs:['p1','p1dup','p2'],observation_refs:['om1']});current.personal_patterns.multiMixed=pattern('multi-mixed','post.impressions',{experiment_review_refs:['rm2'],publication_refs:['p1','p2'],observation_refs:['om2'],result_direction:'mixed'});current.personal_patterns.cadence=pattern('cadence-pattern','post.impressions',{strategy_version_ref:'strategy2',experiment_review_refs:['rc'],publication_refs:['p3','p4'],observation_refs:['oc']});current.personal_patterns.otherWindow=pattern('other-window','post.impressions',{experiment_review_refs:['rs'],publication_refs:['p1'],observation_refs:['os'],observation_window:{kind:'age_window',target_hours:168,tolerance_hours:2}});
  const groups=buildOperationalContext(current,selector()).personal_model_summary.groups,multi=groups.find(group=>group.pattern_refs.includes('multi-positive')),cadence=groups.find(group=>group.pattern_refs.includes('cadence-pattern')),otherWindow=groups.find(group=>group.pattern_refs.includes('other-window'));
  assert.equal(groups.length,3);assert.equal(multi.valid_n,2);assert.equal(multi.independent_experiment_count,1);assert.equal(multi.independent_publication_count,2);assert.ok(multi.positive_evidence_refs.includes('multi-positive'));assert.ok(!multi.positive_evidence_refs.includes('multi-mixed'));assert.ok(multi.uncertain_evidence_refs.includes('multi-mixed'));assert.equal(cadence.valid_n,1);assert.equal(cadence.independent_experiment_count,1);assert.equal(cadence.independent_publication_count,2);assert.equal(otherWindow.valid_n,1);assert.equal(otherWindow.independent_experiment_count,1);assert.equal(otherWindow.independent_publication_count,1);
});

test('only relevant unresolved failures enter coach/draft/content context and hash',()=>{
  let current=state();
  current=recordFeedbackV5(current,{feedback_id:'relevant',type:'quality_failure',output_ref:'old-draft',output_hash:'c'.repeat(64),issue_type:'format',review_issue:'回复格式错误',revision_ref:null,dedupe_key:'format',resolved_by_ref:null,scope,consumer_intents:['draft'],strategy_version_ref:null,recorded_at:T1}).state;
  current=recordFeedbackV5(current,{feedback_id:'other',type:'quality_failure',output_ref:'other',output_hash:'d'.repeat(64),issue_type:'topic',review_issue:'其他主题',revision_ref:null,dedupe_key:'other',resolved_by_ref:null,scope:{...scope,topics:['cooking']},consumer_intents:['draft'],strategy_version_ref:null,recorded_at:T1}).state;
  const first=buildOperationalContext(current,selector());assert.deepEqual(first.unresolved_failures.map(item=>item.feedback_id),['relevant']);
  current.drafts={fixed:{revisions:{'1':{texts:['修复'],format:'short_post'}}}};current=recordFeedbackV5(current,{feedback_id:'resolved',type:'quality_failure',output_ref:'old-draft',output_hash:'c'.repeat(64),issue_type:'format',review_issue:'回复格式错误',revision_ref:'fixed:1',dedupe_key:'format',resolved_by_ref:'fixed:1',scope,consumer_intents:['draft'],strategy_version_ref:null,recorded_at:T2}).state;
  const second=buildOperationalContext(current,selector());assert.deepEqual(second.unresolved_failures,[]);assert.notEqual(second.selected_context_hash,first.selected_context_hash);
});

test('caller cannot invent algorithm dependency versions',()=>{
  assert.throws(()=>buildOperationalContext(state(),selector({knowledge_dependency_versions:{catalog_ref:'made-up',catalog_content_hash:'a'.repeat(64)}})),/saved knowledge catalog/);
});

test('an exact saved historical catalog remains replayable after an unrelated catalog activation',()=>{
  const current=initializeState(createDefaultConfigV5(account),5),bundle=knowledgeBundleFromState(current),dependencies={catalog_ref:bundle.catalog.catalog_id,catalog_content_hash:bundle.catalog.catalog_content_hash},first=buildOperationalContext(current,selector({knowledge_dependency_versions:dependencies}));
  current.knowledge_catalogs.unrelated={...structuredClone(bundle.catalog),catalog_id:'unrelated',catalog_content_hash:'f'.repeat(64)};current.knowledge_events.unrelated={...structuredClone(bundle.event),event_id:'unrelated',catalog_ref:'unrelated',prior_catalog_ref:bundle.catalog.catalog_id};
  const replayed=buildOperationalContext(current,selector({knowledge_dependency_versions:dependencies}));assert.equal(replayed.selected_context_hash,first.selected_context_hash);assert.deepEqual(replayed.knowledge_dependency_versions,dependencies);
  assert.throws(()=>buildOperationalContext(current,selector({knowledge_dependency_versions:{...dependencies,catalog_content_hash:'0'.repeat(64)}})),/exact saved catalog/);
});

test('next coach context keeps patterns across unrelated rule changes and excludes changed or unbound relevant dependencies',()=>{
  const current=initializeState(createDefaultConfigV5(account),5),bundle=knowledgeBundleFromState(current),ruleRefs=Object.keys(bundle.rules),ruleRef=ruleRefs.find(ref=>(bundle.rules[ref].dependency_ids??[]).length)||ruleRefs[0],rule=bundle.rules[ruleRef],dependencyMap=Object.fromEntries(bundle.dependencies.map(item=>[item.dependency_id,item]));assert.ok(ruleRef);current.strategy_definitions.strategy1={strategy_version_id:'strategy1',account_ref:'handle:review_personal',status:'active',strategy_hash:'a'.repeat(64),rule_refs:[ruleRef]};
  const algorithm={source_rule_context_ref:'rule-context-frozen',source_catalog_ref:bundle.catalog.catalog_id,rules:{[ruleRef]:canonicalHash(rule)},facts:Object.fromEntries((rule.fact_version_refs??[]).map(ref=>[ref,canonicalHash(bundle.facts[ref])])),dependencies:Object.fromEntries((rule.dependency_ids??[]).map(ref=>[ref,canonicalHash(dependencyMap[ref])]))};current.personal_patterns.bound=pattern('bound','post.impressions',{algorithm_dependency_versions:algorithm});current.personal_patterns.unbound=pattern('unbound','post.impressions',{pattern_chain_id:'unbound-chain'});
  const coach=overrides=>buildOperationalContext(current,selector({intent:'coach',...overrides}));let context=coach();assert.ok(context.selected_patterns.some(item=>item.pattern_version_ref==='bound'));assert.ok(context.excluded_patterns.some(item=>item.pattern_version_ref==='unbound'&&item.reasons.includes('algorithm_dependency_unbound')));
  const unrelated=ruleRefs.find(ref=>ref!==ruleRef);if(unrelated)current.operational_rules[unrelated]={...current.operational_rules[unrelated],derivation:`${current.operational_rules[unrelated].derivation??''} unrelated update`};context=coach();assert.ok(context.selected_patterns.some(item=>item.pattern_version_ref==='bound'));
  current.operational_rules[ruleRef]={...current.operational_rules[ruleRef],derivation:`${current.operational_rules[ruleRef].derivation??''} relevant update`};context=coach();assert.ok(!context.selected_patterns.some(item=>item.pattern_version_ref==='bound'));assert.ok(context.excluded_patterns.some(item=>item.pattern_version_ref==='bound'&&item.reasons.includes('algorithm_dependency_changed')));
});

test('formal CLI forget persists across a fresh process without reviving the older preference or losing the model',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xops-personal-review-')),initial=initializeState(createDefaultConfigV5(account),5);initial.revision=1;initial.personal_patterns.model=pattern('model');await writeFile(join(dir,'account-state.json'),`${JSON.stringify(initial,null,2)}\n`);
  const entry=fileURLToPath(new URL('../scripts/x-ops.mjs',import.meta.url));
  const call=async(command,payload)=>{const saved=await loadState(dir),id=randomUUID(),input=join(dir,`${id}.json`),output=join(dir,`${id}.out.json`);await writeFile(input,JSON.stringify({schema_version:1,run_id:id,expected_revision:saved.revision,payload}));const proc=spawnSync(process.execPath,[entry,command,'--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'}),envelope=JSON.parse(proc.stdout);assert.equal(proc.status,0,JSON.stringify(envelope.errors));return envelope;};
  await call('config',{contract_version:5,operation:'update',patch:{schema_version:5,scope:'persistent',operations:[{op:'set',path:'/content/preferences/short_text_on_images',value:true}]},source_quote:'以后少字图',source_ref:'chat:first',as_of:T1});
  const afterFirst=await loadState(dir),firstRef=Object.values(afterFirst.feedback_events).find(item=>item.source_ref==='chat:first').feedback_id;
  await call('config',{contract_version:5,operation:'update',patch:{schema_version:5,scope:'persistent',operations:[{op:'set',path:'/content/preferences/short_text_on_images',value:false}]},source_quote:'后来明确允许多字',source_ref:'chat:later',as_of:T2});
  await call('personal-step',{contract_version:5,operation:'forget',target_kind:'feedback',target_ref:firstRef,feedback:{feedback_id:'forget-first',source_quote:'撤销旧指令',source_ref:'chat:forget',recorded_at:T3}});
  const inspected=await call('personal-step',{contract_version:5,operation:'inspect'}),reloaded=await loadState(dir);
  assert.equal(reloaded.config.content.preferences.short_text_on_images,false);assert.equal(inspected.data.patterns.some(item=>item.pattern_version_id==='model'),true);assert.deepEqual(reloaded.feedback_events['forget-first'].operations,[]);
});

test('formal CLI uses committed field heads when same-time feedback IDs sort opposite to commit order',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xops-preference-head-')),initial=initializeState(createDefaultConfigV5(account),5);initial.revision=1;await writeFile(join(dir,'account-state.json'),`${JSON.stringify(initial,null,2)}\n`);const entry=fileURLToPath(new URL('../scripts/x-ops.mjs',import.meta.url));
  const call=async(payload)=>{const saved=await loadState(dir),id=randomUUID(),input=join(dir,`${id}.json`),output=join(dir,`${id}.out.json`);await writeFile(input,JSON.stringify({schema_version:1,run_id:id,expected_revision:saved.revision,payload}));const proc=spawnSync(process.execPath,[entry,'personal-step','--input',input,'--output',output,'--state-dir',dir],{encoding:'utf8'}),envelope=JSON.parse(proc.stdout);assert.equal(proc.status,0,JSON.stringify(envelope.errors));return envelope;};
  const feedback=(feedback_id,value)=>({feedback_id,type:'explicit_preference',source_quote:`偏好 ${value}`,source_ref:`chat:${feedback_id}`,scope,persistence:'long_term',patch:{operations:[{op:'set',path:'/content/preferences/short_text_on_images',value}]},supersedes_ref:null,retracts_ref:null,recorded_at:T1});
  await call({contract_version:5,operation:'record-feedback',feedback:feedback('z-older',true)});await call({contract_version:5,operation:'record-feedback',feedback:feedback('a-newer',false)});let result=await call({contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'z-older',feedback:{feedback_id:'forget-z',source_quote:'撤销旧值',source_ref:'chat:forget-z',recorded_at:T1}}),saved=await loadState(dir);assert.equal(saved.config.content.preferences.short_text_on_images,false);assert.deepEqual(result.data.applied_paths,[]);assert.deepEqual(result.data.preserved_paths,['/content/preferences/short_text_on_images']);
  await call({contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'a-newer',feedback:{feedback_id:'forget-a',source_quote:'撤销当前值',source_ref:'chat:forget-a',recorded_at:T1}});result=await call({contract_version:5,operation:'forget',target_kind:'feedback',target_ref:'z-older',feedback:{feedback_id:'forget-z-again',source_quote:'再次撤销旧值',source_ref:'chat:forget-z-again',recorded_at:T1}});saved=await loadState(dir);assert.equal(saved.config.content.preferences.short_text_on_images,null);assert.equal(result.data.deduplicated,true);
});

test('legacy V5 operational contexts load while new contexts persist replay selection and invalidate old guidance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'xops-operational-compat-')),current=initializeState(createDefaultConfigV5(account),5);current.revision=1;
  const subject={ref:'proposal-old',content_hash:canonicalHash('legacy proposal'),account_ref:'handle:review_personal',texts:['旧提案'],format:'short_post',post_type:'original',surface:'for_you',media:[],full_text:true,read_status:'read',source_refs:['proposal-old'],observed_at:T1},bundle=knowledgeBundleFromState(current),selection={metric_definition:{definition_id:'post.impressions'},observation_window:{kind:'age_window',target_hours:24,tolerance_hours:2}};
  const fresh=buildOperationalContext(current,selector({subject_ref:subject.ref,subject_descriptor:subject,model_selection:selection,knowledge_dependency_versions:{catalog_ref:bundle.catalog.catalog_id,catalog_content_hash:bundle.catalog.catalog_content_hash}}));
  assert.deepEqual(fresh.model_selection,selection);assert.ok(fresh.personal_model_summary);assert.deepEqual(fresh.unresolved_failures,[]);
  const legacy=structuredClone(fresh);delete legacy.model_selection;delete legacy.personal_model_summary;delete legacy.unresolved_failures;delete legacy.selected_context_hash;legacy.selected_context_hash=canonicalHash(legacy);
  const signalSet=buildSignalSetV5({subject,cutoff:T3}),ruleContext=buildRuleContextV5({run_id:'run-old',intent:'coach',goal:{primary_goal:'relevant_reach',goal_notes:null,source:'user_confirmed'},use:'current',surface:'for_you',post_type:'original',subject_ref:subject.ref,subject_hash:subject.content_hash,cutoff:T3,signal_set:signalSet,personal_context_selection_ref:`operational-context-${legacy.selected_context_hash.slice(0,24)}`,personal_context_selection_hash:legacy.selected_context_hash,operational_context:legacy,explicit_rule_version_refs:[]},bundle);
  current.rule_contexts[ruleContext.context_id]=ruleContext;current.coaching_runs['run-old']={contract_version:5,run_id:'run-old',intent:'coach',goal:{primary_goal:'relevant_reach',goal_notes:null,source:'user_confirmed'},use:'current',subject_ref:subject.ref,subject_hash:subject.content_hash,cutoff:T3,canonical_state_input_hash:'a'.repeat(64),evidence_bundle_ref:'bundle-old',evidence_bundle_hash:'b'.repeat(64),operational_context:legacy,selected_operational_context_hash:legacy.selected_context_hash,rule_context_ref:ruleContext.context_id,selected_rule_context_hash:ruleContext.selected_rule_context_hash,status:'awaiting_review'};
  await writeFile(join(dir,'account-state.json'),`${JSON.stringify(current,null,2)}\n`);const loaded=await loadState(dir);assert.equal(loaded.coaching_runs['run-old'].operational_context.personal_model_summary,undefined);
  const gate=await currentGuidanceV5(loaded,subject.ref,{resolveSubjectV5:async()=>subject,verifyHostReviewV5:async value=>value,intent:'coach',use:'current',goal:{primary_goal:'relevant_reach',goal_notes:null,source:'user_confirmed'}});assert.equal(gate.readiness,'needs_review');
  const replayed=buildOperationalContext(loaded,selector({subject_ref:subject.ref,subject_descriptor:subject,model_selection:fresh.model_selection,knowledge_dependency_versions:fresh.knowledge_dependency_versions}));assert.deepEqual(replayed.model_selection,selection);assert.notEqual(replayed.selected_context_hash,legacy.selected_context_hash);
});
