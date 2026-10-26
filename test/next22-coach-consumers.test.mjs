import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { buildEvidenceBundleV4, coachingProposalHashV4, prepareCoachingV4, validateCoachingProposalV4 } from '../scripts/lib/coaching.mjs';
import { resolvePersonalContextSelection, validatePersonalContextSelection } from '../scripts/lib/consumer-context.mjs';

const account={handle:'fixture_coach22',profile_url:'https://x.com/fixture_coach22',user_id:null,identity_basis:'user_provided'};
function state(){
  return {schema_version:4,revision:1,account,config:{content:{voice_samples:[]}},preference_meta:{},post_aliases:{},post_metadata_facts:{},post_entities:{'x:9':{post_key:'x:9',current_version_ref:'pv9'}},post_versions:{pv9:{post_version_id:'pv9',post_key:'x:9',text:'目标帖',content_hash:canonicalHash('目标帖'),created_at:'2026-10-25T00:00:00Z'}},snapshots_v2:{target:{snapshot_id:'target',contract_version:2,entity_type:'post',entity_id:'x:9',account_id:null,source_ref:'s',source_series_id:'series',source_locator:'t',observed_at:'2026-10-26T00:00:00Z',period:null,aggregation_basis:'lifetime_as_of',distribution:'total',surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:{definition_id:'post.impressions',value:120,value_kind:'count',unit:'count',precision:'exact',raw_display:'120',source_field_path:null,availability:'observed',evidence_locator:'t'}}},future:{snapshot_id:'future',contract_version:2,entity_type:'post',entity_id:'x:9',account_id:null,source_ref:'s',source_series_id:'series',source_locator:'f',observed_at:'2026-10-27T00:00:00Z',period:null,aggregation_basis:'lifetime_as_of',distribution:'total',surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:{definition_id:'post.impressions',value:999,value_kind:'count',unit:'count',precision:'exact',raw_display:'999',source_field_path:null,availability:'observed',evidence_locator:'f'}}}},source_series:{},import_batches:{},collection_receipts:{},content_analyses:{},content_review_receipts:{},coaching_runs:{},coaching_reports:{},evidence_bundles:{},diagnoses:{},actions:{},action_decisions:{},experiments:{},experiment_reviews:{},rule_versions_v2:{},import_artifacts:{},sources:{}};
}
const evidenceRequest={target:{scope:{entity_type:'post',entity_keys:['x:9'],metric_definition_ids:['post.impressions']},window:{kind:'age_window',target_hours:24,tolerance_hours:1},metric_requirements:[{definition_id:'post.impressions'}]},background_refs:[]};

test('B10 V4 evidence bundle uses the runtime role selection and excludes future observations',()=>{
  const bundle=buildEvidenceBundleV4(state(),{...evidenceRequest,as_of:'2026-10-26T01:00:00Z'});
  assert.doesNotThrow(()=>validate('EvidenceBundleV4',bundle));
  assert.deepEqual(bundle.target_selection.selected.map(item=>item.observation_ref),['target:impressions']);
  assert.equal(Object.values(bundle.evidence_index).some(item=>item.evidence_role==='excluded'&&item.locator.observation_ref==='future:impressions'),true);
});

test('B10 proposal fields enforce target/background/excluded roles',()=>{
  const current=state();current.sources.background={source_id:'background'};
  const bundle=buildEvidenceBundleV4(current,{...evidenceRequest,background_refs:['background'],as_of:'2026-10-26T01:00:00Z'}),run={run_id:'run'},rule={context_id:'rule-context',selected_rule_context_hash:'b'.repeat(64)};
  const targetRef=Object.keys(bundle.evidence_index).find(ref=>bundle.evidence_index[ref].evidence_role==='target'),base={contract_version:4,proposal_id:'proposal',run_ref:'run',evidence_bundle_ref:bundle.bundle_id,evidence_bundle_hash:bundle.evidence_bundle_hash,rule_context_ref:'rule-context',selected_rule_context_hash:rule.selected_rule_context_hash,findings:[{finding_id:'f',statement:'当前观测为120',interpretation:'仅描述本轮',support_kind:'target_metric',evidence_refs:[targetRef]}],actions:[{action_id:'a',objective:'继续验证',target:'content',change:'只改开头',primary_metric_ref:targetRef,evidence_refs:[targetRef],status:'proposed'}],gaps:[]};
  const proposal={...base,proposal_hash:coachingProposalHashV4(base)};
  assert.doesNotThrow(()=>validateCoachingProposalV4(proposal,{run,evidence_bundle:bundle,rule_context:rule,state:current}));
  const invalidBase={...base,actions:[{...base.actions[0],primary_metric_ref:'background',evidence_refs:['background']}]},invalid={...invalidBase,proposal_hash:coachingProposalHashV4(invalidBase)};
  assert.throws(()=>validateCoachingProposalV4(invalid,{run,evidence_bundle:bundle,rule_context:rule,state:current}),/primary metric must be target/);
});

test('B09 V4 prepare consumes canonical state input and the real role bundle',()=>{
  const current=state(),goal={primary_goal:'relevant_reach',goal_notes:null,source:'temporary_assumption'},coachingRequest={contract_version:2,account_identity:account,requested_scope:{mode:'full'},requested_deliverables:['diagnosis'],goal_snapshot:goal,constraint_snapshot:{},analysis_cutoff:'2026-10-26T01:00:00Z',selection_policy_version:'v4',analysis_request:{requested_outputs:[],periods:[],requested_metric_definition_ids:[]},requested_post_version_refs:[],content_analysis_version:'reader-v3',content_budget:{max_items:0},available_material_refs:[],rule_version_refs:[],unresolved_questions:[]};
  const catalog={catalog:{catalog_id:'catalog',catalog_content_hash:'a'.repeat(64)},rules:{},dependencies:{},signal_registry:{}};
  const prepared=prepareCoachingV4(current,{run_id:'run',intent:'coach',use:'current',subject_ref:'account',as_of:'2026-10-26T01:00:00Z',coaching_request:coachingRequest,evidence_request:evidenceRequest},{catalog});
  assert.equal(prepared.run.evidence_bundle_hash,prepared.evidence_bundle.evidence_bundle_hash);
  assert.equal(prepared.run.selected_rule_context_hash,prepared.rule_context.selected_rule_context_hash);
  assert.doesNotThrow(()=>validate('CoachingRunV4',prepared.run));
  const changed=state();changed.post_metadata_facts.fact={post_key:'x:9',post_version_ref:'pv9',field:'created_at',value:'2026-10-25T00:00:00Z'};
  const changedPrepared=prepareCoachingV4(changed,{run_id:'run2',intent:'coach',use:'current',subject_ref:'account',as_of:'2026-10-26T01:00:00Z',coaching_request:coachingRequest,evidence_request:evidenceRequest},{catalog});
  assert.notEqual(changedPrepared.run.canonical_state_input_hash,prepared.run.canonical_state_input_hash);
});

test('B14 state4 validates personal goal, use and policy against the actual caller',()=>{
  const current=state(),selection=resolvePersonalContextSelection(current,{goal_hash:'goal',brief_or_use_hash:'use',selection_policy_version:'policy',selected:[]});
  const expected={goal_hash:'goal',brief_or_use_hash:'use',requested_use:'coaching',post_version_refs:['pv9'],selection_policy_version:'policy'};
  assert.doesNotThrow(()=>validatePersonalContextSelection(current,selection,expected));
  assert.throws(()=>validatePersonalContextSelection(current,selection,{...expected,goal_hash:'other'}),/another goal/);
  assert.throws(()=>validatePersonalContextSelection(current,selection,{...expected,brief_or_use_hash:'other'}),/another task use/);
  assert.throws(()=>validatePersonalContextSelection(current,selection,{...expected,selection_policy_version:'other'}),/another policy/);
  assert.throws(()=>validatePersonalContextSelection(current,selection),/actual goal, use and selection policy/);
  assert.throws(()=>validatePersonalContextSelection(current,selection,{...expected,requested_use:'historical_compare',post_version_refs:[]}),/explicit post versions/);
});
