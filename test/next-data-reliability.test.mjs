import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeImportMaterial, inspectImport, normalizeImport, mergeImport, resolvePostContext, sourceDefinitionFingerprint } from '../scripts/lib/imports.mjs';
import { resolvePostIdentity } from '../scripts/lib/post-identity.mjs';
import { calendarEndExclusive, selectMetricObservations, evaluateDeliverableCoverage, computeComparison } from '../scripts/lib/observation-selection.mjs';
import { analyzeAccountV2 } from '../scripts/lib/account.mjs';
import { canonicalHash, textHash, validate } from '../scripts/lib/contracts.mjs';
import { nextPageDecision } from '../scripts/lib/importers/host-observations.mjs';

const account={handle:'fixture_next',profile_url:'https://x.com/fixture_next',user_id:'u-next',identity_basis:'user_provided'};
const coverage={views:{content:'obtained'},completeness:'complete',has_more:false,stop_reason:'fixture',successful_items:1,failed_items:0};
const context={account_identity_ref:'x-user:u-next',measurement_context:{observed_at:null,source_timezone:null,basis:'archive',definition_context:'archive-v1'},imported_at:'2026-10-26T00:00:00Z'};

function imported(raw,source='archive-1'){
 const decoded=decodeImportMaterial('archive_posts',raw),material={kind:'archive_posts',...decoded,sha256:decoded.artifact_sha256,source_ref:source};
 const preview=inspectImport(material,context);return normalizeImport(preview,material,account,context);
}

test('E01 archive JSON array/object decode preserves raw byte hash and rejects invalid JSON',()=>{
 const raw='{"posts":[{"id":"1","text":"正文"}]}\n',decoded=decodeImportMaterial('archive_posts',raw);
 assert.equal(decoded.raw_text,raw);assert.equal(decoded.artifact_sha256,imported(raw).import_batch.artifact_sha256);
 assert.equal(imported(raw).post_entities.length,1);assert.equal(imported('[{"id":"1","text":"正文"}]').post_entities.length,1);
 assert.throws(()=>decodeImportMaterial('archive_posts','{bad'),error=>error.code==='INVALID_INPUT'&&error.path==='/material');
});

test('E02/E03 same text gains sidecar metadata independent of order and conflicts stay explicit',()=>{
 const unknown=imported('[{"id":"1","text":"same"}]','first'),known=imported('[{"id":"1","text":"same","created_at":"2026-10-20T00:00:00Z","post_type":"reply","parent_post_key":"x:9","media_refs":["m1"]}]','second');
 let state={schema_version:3,post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},import_batches:{},post_metadata_facts:{}};
 state=mergeImport(state,unknown).nextState;state=mergeImport(state,known).nextState;
 assert.equal(Object.keys(state.post_versions).length,1);assert.deepEqual(new Set(Object.values(state.post_metadata_facts).map(f=>f.field)),new Set(['created_at','post_type','parent_post_key','media_refs']));
 let reversed={schema_version:3,post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},import_batches:{},post_metadata_facts:{}};reversed=mergeImport(reversed,known).nextState;reversed=mergeImport(reversed,unknown).nextState;
 assert.deepEqual(Object.values(reversed.post_metadata_facts).map(f=>[f.field,f.value]).sort(),Object.values(state.post_metadata_facts).map(f=>[f.field,f.value]).sort());
 const conflict=imported('[{"id":"1","text":"same","created_at":"2026-10-21T00:00:00Z"}]','third');state=mergeImport(state,conflict).nextState;
 const facts=Object.values(state.post_metadata_facts).filter(f=>f.field==='created_at');assert.equal(facts.length,2);
 const parent={post_key:'x:9',post_id:'9',author_id:'u-next',author_handle:'fixture_next',handle_aliases:['fixture_next'],edit_chain_ids:[],current_version_ref:'pv9',evidence_refs:['second'],version_conflict_refs:[]};state.post_entities['x:9']=parent;state.post_versions.pv9={post_version_id:'pv9',post_key:'x:9',content_hash:'parent-hash',text:'parent'};
 const version=Object.values(state.post_versions).find(v=>v.post_key==='x:1'),view=resolvePostContext(state,version.post_version_id,{});
 assert.equal(view.context_selection.parent.status,'seen');assert.equal(view.context_selection.parent.post_version_ref,'pv9');assert.doesNotThrow(()=>validate('ContextSelectionV3',view));for(const fact of Object.values(state.post_metadata_facts))assert.doesNotThrow(()=>validate('PostMetadataFactV3',fact));
});

test('E14/E15 target-only reply resolves stored parent consistently and invalidates only when selected parent version changes',()=>{
 const state={post_aliases:{},post_entities:{'x:a':{current_version_ref:'pa1'},'x:b':{current_version_ref:'pb'}},post_versions:{pa1:{post_version_id:'pa1',post_key:'x:a',content_hash:'parent-1',text:'parent'},pb:{post_version_id:'pb',post_key:'x:b',content_hash:'reply',text:'reply',parent_post_key:'x:a'}},post_metadata_facts:{}};
 const prepared=resolvePostContext(state,'pb',{}),targetOnly=resolvePostContext({...state,post_versions:{pb:state.post_versions.pb,pa1:state.post_versions.pa1}},'pb',{});
 assert.equal(prepared.context_selection.parent.status,'seen');assert.equal(prepared.context_selection_hash,targetOnly.context_selection_hash);
 state.post_versions.pa2={post_version_id:'pa2',post_key:'x:a',content_hash:'parent-2',text:'parent edited'};state.post_entities['x:a'].current_version_ref='pa2';
 assert.notEqual(resolvePostContext(state,'pb',{}).context_selection_hash,prepared.context_selection_hash);
});

test('R08 an external parent missing from account entities is not_seen instead of throwing',()=>{
 const state={post_aliases:{},post_entities:{'x:reply':{current_version_ref:'reply-v1'}},post_versions:{'reply-v1':{post_version_id:'reply-v1',post_key:'x:reply',content_hash:'reply-hash',text:'reply',parent_post_key:'x:external'}},post_metadata_facts:{},sources:{},raw_receipts:{}};
 const resolved=resolvePostContext(state,'reply-v1',{});
 assert.equal(resolved.context_selection.parent.status,'not_seen');assert.equal(resolved.context_selection.parent.post_key,'x:external');assert.equal(resolved.context_selection.parent.post_version_ref,null);assert.match(resolved.limitations.join(' '),/parent context was not selected/);
});

test('R08 an actually read external parent SourceVersion is selected without creating an account post entity',()=>{
 const parentText='YxzRainy external parent text',sourceVersionId='source-version-parent',receiptId='receipt-parent',sourceId='source-parent',factId='fact-parent-source',state={post_aliases:{},post_entities:{'x:reply':{current_version_ref:'reply-v1'}},post_versions:{'reply-v1':{post_version_id:'reply-v1',post_key:'x:reply',content_hash:'reply-hash',text:'reply',parent_post_key:'x:external'}},post_metadata_facts:{[factId]:{contract_version:3,fact_id:factId,post_key:'x:reply',post_version_ref:'reply-v1',field:'parent_source_version_ref',value:sourceVersionId,source_ref:'reply-material',source_locator:'reply',source_hash:'a'.repeat(64),observed_at:null,precision:'exact',supersedes_fact_refs:[],status:'confirmed'}},raw_receipts:{[receiptId]:{status:'succeeded'}},sources:{[sourceId]:{record:{source_id:sourceId,locator:'https://x.com/YxzRainy/status/external'},versions:{[sourceVersionId]:{source_id:sourceId,source_version_id:sourceVersionId,raw_receipt_ref:receiptId,read_status:'read',material_kind:'article_body',captured_text:parentText,captured_text_hash:textHash(parentText),original_url:'https://x.com/YxzRainy/status/external',final_url:'https://x.com/YxzRainy/status/external'}},latest_version_id:sourceVersionId}}};
 const resolved=resolvePostContext(state,'reply-v1',{}),parent=resolved.context_selection.parent;
 assert.equal(parent.status,'seen');assert.equal(parent.post_key,'x:external');assert.equal(parent.post_version_ref,null);assert.equal(parent.source_version_ref,sourceVersionId);assert.equal(parent.source_id,sourceId);assert.equal(parent.source_url,'https://x.com/YxzRainy/status/external');assert.equal(parent.content_hash,textHash(parentText));assert.equal(state.post_entities['x:external'],undefined);assert.ok(resolved.context_refs.includes(sourceVersionId));assert.ok(resolved.context_refs.includes(receiptId));assert.doesNotThrow(()=>validate('ContextSelectionV3',resolved));
 const supplemented=imported(`[{"id":"reply","text":"reply","parent_post_key":"x:external","parent_source_version_ref":"${sourceVersionId}"}]`,'reply-material');assert.equal(supplemented.metadata_facts.find(item=>item.field==='parent_source_version_ref')?.value,sourceVersionId);
});

test('R08 default current context follows a later read SourceVersion and invalidates the old context hash',()=>{
 const sourceId='external-parent',v1='external-v1',v2='external-v2',receipt1='receipt-v1',receipt2='receipt-v2',text1='original external parent',text2='corrected external parent',factId='fact-external-v1';
 const version=(id,receipt,text)=>({source_id:sourceId,source_version_id:id,raw_receipt_ref:receipt,read_status:'read',material_kind:'article_body',captured_text:text,captured_text_hash:textHash(text),original_url:'https://x.com/YxzRainy/status/external',final_url:'https://x.com/YxzRainy/status/external'});
 const state={post_aliases:{},post_entities:{'x:reply':{current_version_ref:'reply-v1'}},post_versions:{'reply-v1':{post_version_id:'reply-v1',post_key:'x:reply',content_hash:'reply-hash',text:'reply',parent_post_key:'x:external'}},post_metadata_facts:{[factId]:{contract_version:3,fact_id:factId,post_key:'x:reply',post_version_ref:'reply-v1',field:'parent_source_version_ref',value:v1,source_ref:'reply-material',source_locator:'reply',source_hash:'b'.repeat(64),observed_at:null,precision:'exact',supersedes_fact_refs:[],status:'confirmed'}},raw_receipts:{[receipt1]:{status:'succeeded'},[receipt2]:{status:'succeeded'}},sources:{[sourceId]:{record:{source_id:sourceId,locator:'https://x.com/YxzRainy/status/external'},versions:{[v1]:version(v1,receipt1,text1),[v2]:version(v2,receipt2,text2)},latest_version_id:v1}}};
 const before=resolvePostContext(state,'reply-v1',{});assert.equal(before.context_selection.parent.source_version_ref,v1);assert.equal(before.context_selection.parent.content_hash,textHash(text1));
 state.sources[sourceId].latest_version_id=v2;
 const after=resolvePostContext(state,'reply-v1',{});assert.equal(after.context_selection.parent.source_version_ref,v2);assert.equal(after.context_selection.parent.content_hash,textHash(text2));assert.notEqual(after.context_selection_hash,before.context_selection_hash);assert.equal(state.post_metadata_facts[factId].value,v1);assert.equal(state.sources[sourceId].versions[v1].captured_text,text1);
});

test('E04/E06 aliases resolve canonically and reject loops or dangling targets',()=>{
 const entities={'x:3':{}},aliases={'x:1':'x:2','x:2':'x:3'};
 assert.equal(resolvePostIdentity('x:1',aliases,{entities}).canonical_key,'x:3');
 assert.throws(()=>resolvePostIdentity('x:1',{'x:1':'x:2','x:2':'x:1'},{entities}),/cycle/);
 assert.throws(()=>resolvePostIdentity('x:1',{'x:1':'x:9'},{entities}),/does not exist/);
});

test('E04 edited IDs merge to one entity while an old observation keeps body attribution unknown',()=>{
 const observationMaterial={kind:'canonical_json',source_ref:'old-metrics',content:{observations:[{entity_type:'post',entity_id:'1',account_id:'u-next',metric_key:'impressions',definition_id:'post.impressions',value:80,value_kind:'count',unit:'count',precision:'exact',availability:'observed',observed_at:'2026-10-21T00:00:00Z',aggregation_basis:'lifetime_as_of',distribution:'organic',surface:'all'}],coverage}};
 const observationContext={...context,measurement_context:{observed_at:'2026-10-21T00:00:00Z',basis:'api',definition_context:'official-v2'}};
 const oldNormalized=normalizeImport(inspectImport(observationMaterial,observationContext),observationMaterial,account,observationContext);
 const body=imported('[{"id":"2","text":"edited body","created_at":"2026-10-20T00:00:00Z","edit_history_ids":["1","2"]}]','new-body');
 let state={schema_version:3,post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},import_batches:{},post_metadata_facts:{}};
 state=mergeImport(state,oldNormalized).nextState;state=mergeImport(state,body).nextState;
 assert.deepEqual(Object.keys(state.post_entities),['x:2']);assert.equal(state.post_aliases['x:1'],'x:2');
 const snapshot=Object.values(state.snapshots_v2)[0];assert.equal(snapshot.entity_id,'x:1');assert.equal(Object.hasOwn(snapshot,'post_version_ref'),false);
 const selection=selectMetricObservations(state,{scope:{entity_type:'post',entity_keys:['x:2'],distribution:'organic',surface:'all',aggregation_basis:'lifetime_as_of'},window:{kind:'age_window',target_hours:24,tolerance_hours:1},metric_requirements:['post.impressions'],as_of:'2026-10-22T00:00:00Z'});
 assert.equal(selection.selected[0].entity_key,'x:2');assert.equal(selection.selected[0].content_attribution,'unknown');assert.equal(selection.selected[0].post_version_ref,null);assert.doesNotThrow(()=>validate('ObservationSelectionV3',selection));
});

test('E05 series definition excludes capture time and selected period but changes for real definition changes',()=>{
 const base={adapter_id:'csv',adapter_version:'2',definition_context:'reported',entity_type:'post',aggregation_basis:'unknown',distribution:'unknown',surface:'all',metric_definitions:['post.impressions']};
 assert.equal(sourceDefinitionFingerprint({...base,observed_at:'2026-01-01',selected_period:'a'}),sourceDefinitionFingerprint({...base,observed_at:'2027-01-01',selected_period:'b'}));
 assert.notEqual(sourceDefinitionFingerprint(base),sourceDefinitionFingerprint({...base,distribution:'organic'}));
 assert.notEqual(sourceDefinitionFingerprint({...base,account_identity_ref:'a'}),sourceDefinitionFingerprint({...base,account_identity_ref:'b'}));
});

test('E05 identical bytes append at distinct actual observation times and exact retry is idempotent',()=>{
 const headers=['Post id','Date','Post text','Post Link','Impressions','Likes','Engagements','Bookmarks','Shares','New follows','Replies','Reposts','Profile visits','Detail Expands','URL Clicks','Hashtag Clicks','Permalink Clicks'];
 const raw=`${headers.join(',')}\n1,"Mon, Oct 26, 2026","same",https://x.com/fixture_next/status/1,100,2,3,0,1,0,1,0,2,4,5,0,1\n`,material={kind:'analytics_csv',source_ref:'same-file',content:raw,raw_text:raw};
 const make=definition_context=>observed_at=>{const ctx={account_identity_ref:'x-user:u-next',account_id:'u-next',measurement_context:{observed_at,basis:'export',definition_context}};return normalizeImport(inspectImport(material,ctx),material,account,ctx);};
 const first=make('reported-v1')('2026-10-26T01:00:00Z'),second=make('reported-v1')('2026-10-26T02:00:00Z'),changed=make('reported-v2')('2026-10-26T03:00:00Z');
 assert.equal(first.source_series[0].source_series_id,second.source_series[0].source_series_id);assert.notEqual(first.import_batch.import_batch_id,second.import_batch.import_batch_id);assert.notEqual(first.source_series[0].source_series_id,changed.source_series[0].source_series_id);
 let state={schema_version:3,post_entities:{},post_versions:{},post_aliases:{},snapshots_v2:{},source_series:{},import_batches:{},post_metadata_facts:{}};state=mergeImport(state,first).nextState;state=mergeImport(state,second).nextState;
 assert.deepEqual(new Set(Object.values(state.snapshots_v2).map(item=>item.observed_at)),new Set(['2026-10-26T01:00:00Z','2026-10-26T02:00:00Z']));
 const retry=mergeImport(state,second);assert.equal(retry.receipt.idempotent,true);assert.equal(Object.keys(retry.nextState.import_batches).length,2);
});

function metric(value){return{definition_id:'post.impressions',value,value_kind:'count',unit:'count',precision:'exact',raw_display:String(value),source_field_path:null,availability:'observed',evidence_locator:'raw'};}
function snap(id,entity,value,observed_at,distribution='organic',period=null){return{snapshot_id:id,contract_version:2,entity_type:'post',entity_id:entity,account_id:'u-next',source_ref:'s',source_series_id:'series',source_locator:id,observed_at,period,aggregation_basis:period?'event_period':'lifetime_as_of',distribution,surface:'all',cohort_definition_ref:null,revision_status:'confirmed',supersedes_snapshot_id:null,metrics:{impressions:metric(value)}};}
function stateFor(snapshots){return{post_aliases:{},post_entities:{'x:1':{current_version_ref:'v1'},'x:2':{current_version_ref:'v2'}},post_versions:{v1:{post_version_id:'v1',post_key:'x:1',created_at:'2026-10-20T00:00:00Z'},v2:{post_version_id:'v2',post_key:'x:2',created_at:'2026-10-25T23:00:00Z'}},snapshots_v2:Object.fromEntries(snapshots.map(s=>[s.snapshot_id,s]))};}

test('E08 calendar inclusive end uses calendar arithmetic and selector separates pending/missing',()=>{
 assert.equal(calendarEndExclusive('2026-12-31'),'2027-01-01');
 const state=stateFor([snap('a','x:1',100,'2026-10-21T00:00:00Z')]);
 const selection=selectMetricObservations(state,{scope:{entity_type:'post',entity_keys:['x:1','x:2'],distribution:'organic',surface:'all',aggregation_basis:'lifetime_as_of'},window:{kind:'age_window',target_hours:24,tolerance_hours:2},metric_requirements:['post.impressions'],as_of:'2026-10-26T00:00:00Z'});
 assert.equal(selection.coverage.valid_n,1);assert.equal(selection.coverage.pending_n,1);assert.equal(selection.completeness,'partial');
 assert.doesNotThrow(()=>validate('ObservationSelectionV3',selection));
});

test('E08 only seven non-overlapping calendar days are summed across month and DST boundaries',()=>{
 const dates=['2026-10-29','2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04'],periodFor=(start,end=start)=>({start:null,end_exclusive:null,timezone:null,source_date_start:start,source_date_end_inclusive:end,raw_period_label:start,completeness:'complete'});
 const rows=dates.map((day,index)=>{const row={...snap(`day-${index}`,'handle:fixture_next',index+1,null,'unknown',periodFor(day)),entity_type:'account',aggregation_basis:'event_period'};row.metrics.impressions.definition_id='account.impressions';return row;});
 const overlap={...snap('overlap','handle:fixture_next',100,null,'unknown',periodFor('2026-11-03','2026-11-04')),entity_type:'account',aggregation_basis:'event_period'};overlap.metrics.impressions.definition_id='account.impressions';
 const outside={...snap('outside','handle:fixture_next',1000,null,'unknown',periodFor('2026-11-05')),entity_type:'account',aggregation_basis:'event_period'};outside.metrics.impressions.definition_id='account.impressions';
 const input={contract_version:2,account,analysis_cutoff:'2026-11-06T00:00:00Z',post_entities:[],post_versions:[],post_aliases:{},snapshots:[...rows,overlap,outside],source_series:[],coverage:[{completeness:'complete',has_more:false,failed_items:0}]};
 const period={period_id:'dst-week',start:null,end_exclusive:null,timezone:'America/New_York',source_date_start:dates[0],source_date_end_inclusive:dates.at(-1),completeness:'complete'};
 const result=analyzeAccountV2(input,{requested_outputs:['account_period'],periods:[period],requested_metric_definition_ids:['account.impressions']});
 assert.equal(result.account_period_results[0].metrics[0].value,28);assert.equal(result.account_period_results[0].completeness,'complete');assert.match(result.account_period_results[0].metrics[0].reasons.join(' '),/cross_boundary/);
 assert.equal(calendarEndExclusive('2026-10-31'),'2026-11-01');assert.equal(calendarEndExclusive('2026-12-31'),'2027-01-01');
});

test('E07 period total and overlapping daily detail are alternatives, never additive',()=>{
 const period={start:null,end_exclusive:null,timezone:null,source_date_start:'2026-10-20',source_date_end_inclusive:'2026-10-26',raw_period_label:'7D',completeness:'complete'},day={...period,source_date_start:'2026-10-22',source_date_end_inclusive:'2026-10-22',raw_period_label:'Oct 22'};
 const total={...snap('total','handle:fixture_next',24000,null,'unknown',period),entity_type:'account',aggregation_basis:'event_period'},daily={...snap('day','handle:fixture_next',3500,null,'unknown',day),entity_type:'account',aggregation_basis:'event_period'};total.metrics.impressions.definition_id='account.impressions';daily.metrics.impressions.definition_id='account.impressions';
 const selection=selectMetricObservations({post_aliases:{},post_entities:{},post_versions:{},snapshots_v2:{total,daily}},{scope:{entity_type:'account',entity_keys:['handle:fixture_next'],distribution:'unknown',surface:'all',aggregation_basis:'event_period'},window:{kind:'period',source_date_start:'2026-10-20',source_date_end_inclusive:'2026-10-26'},metric_requirements:['account.impressions'],as_of:'2026-10-27T00:00:00Z'});
 assert.equal(selection.selected.length,1);assert.notEqual(selection.selected[0].value,27500);
});

test('E09/E10 incompatible distribution cannot produce a delta and explicit entity requests can complete',()=>{
 const current=selectMetricObservations(stateFor([snap('c','x:1',200,'2026-10-21T00:00:00Z','promoted')]),{scope:{entity_type:'post',entity_keys:['x:1'],distribution:'promoted',surface:'all',aggregation_basis:'lifetime_as_of'},window:{kind:'age_window',target_hours:24,tolerance_hours:2},metric_requirements:['post.impressions'],as_of:'2026-10-26T00:00:00Z'});
 const baseline=selectMetricObservations(stateFor([snap('b','x:1',100,'2026-10-21T00:00:00Z','organic')]),{scope:{entity_type:'post',entity_keys:['x:1'],distribution:'organic',surface:'all',aggregation_basis:'lifetime_as_of'},window:{kind:'age_window',target_hours:24,tolerance_hours:2},metric_requirements:['post.impressions'],as_of:'2026-10-26T00:00:00Z',role:'baseline'});
 const comparison=computeComparison(current,baseline,{});assert.equal(comparison.comparability,'incompatible');assert.equal(comparison.relative_delta,null);
 assert.doesNotThrow(()=>validate('ObservationComparisonV3',comparison));
 assert.equal(evaluateDeliverableCoverage({mode:'explicit_entities',entity_keys:['x:1']},current,{completeness:'partial'}).status,'complete');
 assert.equal(evaluateDeliverableCoverage({mode:'full',entity_keys:['x:1']},current,{completeness:'partial'}).status,'partial');
});

test('E11/E12 actual collection coverage downgrades a requested week while an explicit complete entity set can finish',()=>{
 const period={start:'2026-10-20T00:00:00Z',end_exclusive:'2026-10-27T00:00:00Z',timezone:'UTC',source_date_start:null,source_date_end_inclusive:null,raw_period_label:'7D',completeness:'complete'};
 const accountSnapshot={...snap('account-1','handle:fixture_next',100,'2026-10-27T00:00:00Z','organic',period),entity_type:'account',aggregation_basis:'event_period'};accountSnapshot.metrics.impressions.definition_id='account.impressions';
 const input={contract_version:2,account,analysis_cutoff:'2026-10-27T00:00:00Z',post_entities:[],post_versions:[],post_aliases:{},snapshots:[accountSnapshot],source_series:[],coverage:[{completeness:'partial',has_more:true,failed_items:1}]};
 const result=analyzeAccountV2(input,{requested_outputs:['account_period'],periods:[{period_id:'week',start:period.start,end_exclusive:period.end_exclusive,timezone:'UTC',completeness:'complete'}],requested_metric_definition_ids:['account.impressions']});
 assert.equal(result.account_period_results[0].metrics[0].value,100);assert.equal(result.account_period_results[0].completeness,'partial');assert.equal(result.deliverable_status.account_period,'partial');
 const state=stateFor([snap('p','x:1',100,'2026-10-21T00:00:00Z')]),selection=selectMetricObservations(state,{scope:{entity_type:'post',entity_keys:['x:1'],distribution:'organic',surface:'all',aggregation_basis:'lifetime_as_of'},window:{kind:'age_window',target_hours:24,tolerance_hours:2},metric_requirements:['post.impressions'],as_of:'2026-10-26T00:00:00Z'});
 const scoped=evaluateDeliverableCoverage({mode:'explicit_entities',entity_keys:['x:1']},selection,{completeness:'partial'});assert.equal(scoped.status,'complete');assert.match(scoped.limitations.join(' '),/full-account coverage remains unverified/);
 const six=['2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25'].map((day,index)=>{const p={start:null,end_exclusive:null,timezone:null,source_date_start:day,source_date_end_inclusive:day,raw_period_label:day,completeness:'complete'},row={...snap(`six-${index}`,'handle:fixture_next',1,null,'unknown',p),entity_type:'account',aggregation_basis:'event_period'};row.metrics.impressions.definition_id='account.impressions';return row;});
 const sixResult=analyzeAccountV2({...input,snapshots:six,coverage:[{completeness:'complete',has_more:false,failed_items:0}]},{requested_outputs:['account_period'],periods:[{period_id:'declared-week',start:null,end_exclusive:null,timezone:null,source_date_start:'2026-10-20',source_date_end_inclusive:'2026-10-26',completeness:'complete'}],requested_metric_definition_ids:['account.impressions']});
 assert.equal(sixResult.account_period_results[0].metrics[0].value,6);assert.equal(sixResult.account_period_results[0].completeness,'partial');assert.equal(sixResult.deliverable_status.account_period,'partial');
});

test('E13 a still-open day and partial source evidence cannot become a complete deliverable',()=>{
 const period={start:'2026-10-26T00:00:00Z',end_exclusive:'2026-10-27T00:00:00Z',timezone:'UTC',source_date_start:null,source_date_end_inclusive:null,raw_period_label:'Today',completeness:'partial'};
 const accountSnapshot={...snap('today','handle:fixture_next',120,'2026-10-26T12:00:00Z','organic',period),entity_type:'account',aggregation_basis:'event_period'};accountSnapshot.metrics.impressions.definition_id='account.impressions';
 const input={contract_version:2,account,analysis_cutoff:'2026-10-26T12:00:00Z',post_entities:[],post_versions:[],post_aliases:{},snapshots:[accountSnapshot],source_series:[],coverage:[{completeness:'partial',has_more:true,failed_items:1}]};
 const result=analyzeAccountV2(input,{requested_outputs:['account_period'],periods:[{period_id:'today',...period,completeness:'complete'}],requested_metric_definition_ids:['account.impressions']});
 assert.equal(result.account_period_results[0].metrics[0].value,120);
 assert.equal(result.account_period_results[0].completeness,'partial');
 assert.equal(result.deliverable_status.account_period,'partial');
 const raw='impressions=120',start=raw.indexOf('120'),host={kind:'host_observations',source_ref:'api-partial',content:{receipt:{raw_result:raw,raw_hash:canonicalHash(raw),tool_name:'official_api_read',call_ref:'api-call',status:'succeeded'},observations:[{locator:'data[0].impressions',raw_span:{start,end:start+3,text:'120'},entity_type:'account',entity_id:'u-next',account_id:'u-next',metric_key:'impressions',definition_id:'account.impressions',value:120,value_kind:'count',unit:'count',precision:'exact',raw_display:'120',availability:'observed',observed_at:'2026-10-26T12:00:00Z',period,aggregation_basis:'event_period',distribution:'organic',surface:'all'}],coverage:{views:{overview:'obtained'},completeness:'partial',has_more:true,stop_reason:'api_partial_errors',successful_items:1,failed_items:1},errors:[{code:'FETCH_FAILED',path:'/errors/0',message:'one page failed',retryable:true}]}};
 const hostContext={account_identity_ref:'x-user:u-next',measurement_context:{observed_at:'2026-10-26T12:00:00Z',basis:'api',definition_context:'official-v2'}},normalized=normalizeImport(inspectImport(host,hostContext),host,account,hostContext);
 assert.equal(normalized.snapshots.length,1);assert.equal(normalized.errors[0].code,'FETCH_FAILED');assert.equal(normalized.coverage.failed_items,1);
 const hostResult=analyzeAccountV2({contract_version:2,account,analysis_cutoff:'2026-10-26T12:00:00Z',post_entities:[],post_versions:[],post_aliases:{},snapshots:normalized.snapshots,source_series:normalized.source_series,coverage:[normalized.coverage]},{requested_outputs:['account_period'],periods:[{period_id:'today',...period,completeness:'complete'}],requested_metric_definition_ids:['account.impressions']});
 assert.equal(hostResult.account_period_results[0].metrics[0].value,120);assert.equal(hostResult.deliverable_status.account_period,'partial');
 assert.deepEqual(nextPageDecision({next_token:'more',pages_read:3,max_pages:3,items_read:60}),{continue:false,stop_reason:'page_budget_exhausted',next_token:'more'});
});

test('E13/E22 a period observation stays pending until its end_exclusive',()=>{
 const period={start:'2026-10-20T00:00:00Z',end_exclusive:'2026-10-27T00:00:00Z',timezone:'UTC',source_date_start:null,source_date_end_inclusive:null,raw_period_label:'7D',completeness:'complete'},row={...snap('period-total','handle:fixture_next',24000,'2026-10-26T12:00:00Z','organic',period),entity_type:'account',aggregation_basis:'event_period'};row.metrics.impressions.definition_id='account.impressions';
 const state={post_aliases:{},post_entities:{},post_versions:{},snapshots_v2:{[row.snapshot_id]:row}},request={scope:{entity_type:'account',entity_keys:['handle:fixture_next'],distribution:'organic',surface:'all',aggregation_basis:'event_period'},window:{kind:'period',start:period.start,end_exclusive:period.end_exclusive},metric_requirements:['account.impressions']};
 const early=selectMetricObservations(state,{...request,as_of:'2026-10-26T12:00:00Z'});assert.equal(early.selected.length,0);assert.equal(early.coverage.pending_n,1);assert.equal(early.completeness,'unknown');
 const mature=selectMetricObservations(state,{...request,as_of:'2026-10-27T00:00:00Z'});assert.equal(mature.selected.length,1);assert.equal(mature.coverage.pending_n,0);assert.equal(mature.completeness,'complete');
});

test('E02 supplemented created_at becomes usable for age selection without rewriting the post version',()=>{
 const state=stateFor([snap('age','x:1',77,'2026-10-21T00:00:00Z')]);state.post_versions.v1.created_at=null;
 const fact={contract_version:3,fact_id:'fact-created',post_key:'x:1',post_version_ref:'v1',field:'created_at',value:'2026-10-20T00:00:00Z',source_ref:'archive',source_locator:'post:1',source_hash:'a'.repeat(64),observed_at:null,precision:'reported',supersedes_fact_refs:[],status:'confirmed'};state.post_metadata_facts={'fact-created':fact};
 const selection=selectMetricObservations(state,{scope:{entity_type:'post',entity_keys:['x:1'],distribution:'organic',surface:'all',aggregation_basis:'lifetime_as_of'},window:{kind:'age_window',target_hours:24,tolerance_hours:2},metric_requirements:['post.impressions'],as_of:'2026-10-26T00:00:00Z'});
 assert.equal(selection.coverage.valid_n,1);assert.equal(state.post_versions.v1.created_at,null);
});
