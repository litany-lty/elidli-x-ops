import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectImport, mergeImport, normalizeImport, resolvePostMetadataView } from '../scripts/lib/imports.mjs';
import { selectMetricObservations, evaluateDeliverableCoverage } from '../scripts/lib/observation-selection.mjs';
import { analyzeAccountV2 } from '../scripts/lib/account.mjs';
import { canonicalStateInput } from '../scripts/lib/state-input.mjs';

const account={handle:'fixture_v22',profile_url:'https://x.com/fixture_v22',user_id:'u-v22',identity_basis:'user_provided'};
const metric=(value,definition_id='account.impressions')=>({definition_id,value,value_kind:'count',unit:'count',precision:'exact',raw_display:String(value),source_field_path:null,availability:'observed',evidence_locator:'fixture'});
const period=(start,end=start,completeness='complete')=>({start:null,end_exclusive:null,timezone:'UTC',source_date_start:start,source_date_end_inclusive:end,raw_period_label:start,completeness});
const snapshot=(id,value,p,{entity_type='account',entity_id='x-user:u-v22',definition_id='account.impressions',distribution='organic',surface='all',supersedes_snapshot_id=null}={})=>({snapshot_id:id,contract_version:2,entity_type,entity_id,account_id:'u-v22',source_ref:'fixture',source_series_id:'series',source_locator:id,observed_at:null,period:p,aggregation_basis:p?'event_period':'lifetime_as_of',distribution,surface,cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id,metrics:{value:metric(value,definition_id)}});

test('A-B01 import identity deduplicates equal interpretation independently of logical source',()=>{
 const raw='{"observations":[]}',base={kind:'canonical_json',content:JSON.parse(raw),raw_text:raw,sha256:null};
 const context={account_identity_ref:'x-user:u-v22',measurement_context:{observed_at:'2026-10-27T00:00:00Z',basis:'api',definition_context:'fixture'}};
 const normalized=source_ref=>{const material={...base,source_ref};const preview=inspectImport(material,context);return normalizeImport(preview,material,account,context);};
 const first=normalized('source-a'),retry=normalized('source-a'),second=normalized('source-b');
 assert.equal(first.import_batch.import_batch_id,retry.import_batch.import_batch_id);
 assert.equal(first.import_batch.import_batch_id,second.import_batch.import_batch_id);
 assert.equal(first.import_batch.identity_policy_version,'import-batch-v2');
});

test('A-B02 period selection sums seven additive days and marks a six-day subtotal partial',()=>{
 const days=['2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25','2026-10-26'];
 const rows=days.map((day,index)=>snapshot(`d${index}`,index+1,period(day)));
 const make=items=>({post_aliases:{},post_entities:{},post_versions:{},snapshots_v2:Object.fromEntries(items.map(item=>[item.snapshot_id,item]))});
 const request={scope:{entity_type:'account',entity_keys:['x-user:u-v22'],distribution:'organic',surface:'all',aggregation_basis:'event_period'},window:{kind:'period',source_date_start:days[0],source_date_end_inclusive:days.at(-1)},metric_requirements:['account.impressions'],as_of:'2026-10-28T00:00:00Z'};
 const complete=selectMetricObservations(make(rows),request),partial=selectMetricObservations(make(rows.slice(0,6)),request);
 assert.equal(complete.selected.reduce((sum,item)=>sum+item.value,0),28);assert.equal(complete.completeness,'complete');
 assert.equal(partial.selected.reduce((sum,item)=>sum+item.value,0),21);assert.equal(partial.completeness,'partial');
});

test('A-B03 superseded observations cannot be selected again regardless of input order',()=>{
 const p=period('2026-10-20'),old=snapshot('old',1000,p),corrected=snapshot('corrected',100,p,{supersedes_snapshot_id:'old'}),request={scope:{entity_type:'account',entity_keys:['x-user:u-v22'],distribution:'organic',surface:'all',aggregation_basis:'event_period'},window:{kind:'period',source_date_start:'2026-10-20',source_date_end_inclusive:'2026-10-20'},metric_requirements:['account.impressions'],as_of:'2026-10-22T00:00:00Z'};
 for(const rows of [[old,corrected],[corrected,old]]){const state={post_aliases:{},post_entities:{},post_versions:{},snapshots_v2:Object.fromEntries(rows.map(item=>[item.snapshot_id,item]))},selection=selectMetricObservations(state,request);assert.deepEqual(selection.selected.map(item=>item.value),[100]);assert.ok(selection.excluded.some(item=>item.observation_ref==='old:value'&&item.reason==='superseded'));}
});

test('A-B04 account comparison consumes actual coverage and measurement scope',()=>{
 const days=(prefix,start)=>Array.from({length:7},(_,i)=>{const date=`2026-10-${String(start+i).padStart(2,'0')}`;return snapshot(`${prefix}${i}`,i+1,period(date));});
 const current=days('c',20),baseline=days('b',13);current.pop();
 const input={contract_version:2,account,analysis_cutoff:'2026-10-28T00:00:00Z',post_entities:[],post_versions:[],post_aliases:{},snapshots:[...baseline,...current],source_series:[],coverage:[]};
 const periods=[{period_id:'baseline',...period('2026-10-13','2026-10-19')},{period_id:'current',...period('2026-10-20','2026-10-26')}];
 const result=analyzeAccountV2(input,{requested_outputs:['account_period'],periods,requested_metric_definition_ids:['account.impressions']});
 assert.equal(result.account_period_results[1].completeness,'partial');assert.equal(result.comparisons[0].comparability_status,'incompatible');assert.equal(result.comparisons[0].relative_delta,null);
});

test('A-B05 account aggregation consumes canonical alias observations once',()=>{
 const post=snapshot('old-id',80,null,{entity_type:'post',entity_id:'x:1',definition_id:'post.impressions'});post.aggregation_basis='lifetime_as_of';
 const input={contract_version:2,account,analysis_cutoff:'2026-10-22T00:00:00Z',post_entities:[{post_key:'x:2',post_id:'2',author_id:'u-v22',author_handle:'fixture_v22',handle_aliases:['fixture_v22'],edit_chain_ids:['1','2'],current_version_ref:'v2',evidence_refs:[],version_conflict_refs:[]}],post_versions:[{post_version_id:'v2',post_key:'x:2',created_at:'2026-10-20T00:00:00Z',post_type:'original'}],post_aliases:{'x:1':'x:2'},snapshots:[post],source_series:[],coverage:[]};
 const result=analyzeAccountV2(input,{requested_outputs:['publication_cohort'],publication_periods:[{period_id:'all',created_start:null,created_end_exclusive:null}],requested_metric_definition_ids:['post.impressions'],target_post_keys:['x:2']});
 assert.equal(result.publication_structure[0].total,1);assert.equal(result.post_cohort_results.find(item=>item.post_type==='all').median,80);
});

test('A-B06 a formal metadata correction supersedes the immutable base value',()=>{
 const baseRef='base:v1:created_at',fact={contract_version:3,fact_id:'fact-correction',post_key:'x:1',post_version_ref:'v1',field:'created_at',value:'2026-10-21T00:00:00Z',source_ref:'correction',source_locator:'post:1',source_hash:'a'.repeat(64),observed_at:null,precision:'exact',supersedes_fact_refs:[baseRef],status:'confirmed'};
 const state={post_versions:{v1:{post_version_id:'v1',post_key:'x:1',created_at:'2026-10-20T00:00:00Z'}},post_metadata_facts:{[fact.fact_id]:fact}};
 assert.deepEqual(resolvePostMetadataView(state,'v1','created_at'),{status:'confirmed',value:'2026-10-21T00:00:00Z',fact_refs:['fact-correction']});assert.equal(state.post_versions.v1.created_at,'2026-10-20T00:00:00Z');
});

test('A-B06 archive import carries a material-backed metadata correction in either order',()=>{
 const context={account_identity_ref:'x-user:u-v22',measurement_context:{observed_at:null,basis:'archive',definition_context:'fixture'}},make=content=>{const raw=JSON.stringify(content),material={kind:'archive_posts',content,raw_text:raw,source_ref:content[0].created_at};return normalizeImport(inspectImport(material,context),material,account,context);};
 const first=make([{id:'1',text:'same',created_at:'2026-10-20T00:00:00Z'}]),versionRef=first.post_versions[0].post_version_id,baseRef=`base:${versionRef}:created_at`,firstFact=first.metadata_facts.find(item=>item.field==='created_at').fact_id,correction=make([{id:'1',text:'same',created_at:'2026-10-21T00:00:00Z',metadata_supersedes:{created_at:[baseRef,firstFact]}}]);
 for(const order of [[first,correction],[correction,first]]){let state={post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},import_batches:{},post_metadata_facts:{}};for(const item of order)state=mergeImport(state,item).nextState;assert.equal(resolvePostMetadataView(state,versionRef,'created_at').value,'2026-10-21T00:00:00Z');}
 let normal={post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},import_batches:{},post_metadata_facts:{}};normal=mergeImport(normal,first).nextState;normal=mergeImport(normal,correction).nextState;assert.equal(normal.post_versions[versionRef].created_at,'2026-10-20T00:00:00Z');
});

test('A-B07 coverage requires every requested metric and canonical input preserves relevant context',()=>{
 const selected={scope:{entity_keys:['x:1']},selected:[{entity_key:'x:1',metric_definition_id:'post.impressions'}],limitations:[]};
 const result=evaluateDeliverableCoverage({mode:'explicit_entities',entity_keys:['x:1'],metric_requirements:['post.impressions','post.likes']},selected,{completeness:'complete'});
 assert.equal(result.status,'partial');
 const input=canonicalStateInput({account,post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},post_metadata_facts:{},collection_receipts:{},import_batches:{b:{import_batch_id:'b',coverage:{completeness:'partial'},measurement_context:{period:{source_date_start:'2026-10-20',source_date_end_inclusive:'2026-10-20'}}}}},'2026-10-28T00:00:00Z');
 assert.equal(input.coverage[0].import_batch_id,'b');assert.deepEqual(input.coverage[0].measurement_context.period,{source_date_start:'2026-10-20',source_date_end_inclusive:'2026-10-20'});
});
