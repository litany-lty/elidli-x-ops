#!/usr/bin/env node
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, canonicalHash, newId, summarizeRun, ContractError } from './lib/contracts.mjs';
import { resolveConfig, createDefaultConfig } from './lib/config.mjs';
import { importAccount, analyzeAccount } from './lib/account.mjs';
import { checkDraft } from './lib/draft.mjs';
import { buildReview } from './lib/review.mjs';
import { initializeNews, advanceNews, finalizeRun } from './lib/news.mjs';
import { loadState, commitState, initializeState, registerSources, putImmutable, saveDraft, savePersistenceReceipt, persistenceStatus, findSourceVersion } from './lib/state.mjs';
import { dispatchV2, coachingRunResult } from './lib/v2-dispatch.mjs';
import { verifyCollectionReceipt } from './lib/collection.mjs';
import { buildConsumerContext, goalSnapshotFromState } from './lib/consumer-context.mjs';

const runtimeDir=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const commands=['doctor','config','account-analyze','draft-check','news-step','record','review','data-import','coach-step','state-migrate'];
const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const stage=(name,passed,refs=[],reason=null)=>({stage:name,required:true,status:passed?'passed':'failed',evidence_refs:refs,reason});
const same=(left,right)=>canonicalHash(left)===canonicalHash(right);

function assertAccount(state,account) {
  if(state.account.handle.toLowerCase()!==account.handle.toLowerCase() || (state.account.user_id && account.user_id && state.account.user_id!==account.user_id))fail('IDENTITY_MISMATCH','/account','Input belongs to a different account');
}
function requireState(state) { if(!state)fail('MISSING_EVIDENCE','/state','Initialize this account state first'); }

async function doctor(payload,stateDir,state) {
  validate('HostBinding',payload.binding);
  let stateAccess=false;
  const probe=join(stateDir,`.doctor-${crypto.randomUUID()}.tmp`);
  try { await mkdir(stateDir,{recursive:true,mode:0o700}); await writeFile(probe,'probe',{flag:'wx',mode:0o600}); stateAccess=(await readFile(probe,'utf8'))==='probe'; }
  finally { await unlink(probe).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
  const packageData=JSON.parse(await readFile(join(runtimeDir,'package.json'),'utf8'));
  const versions={};
  for(const name of Object.keys(packageData.dependencies))versions[name]=JSON.parse(await readFile(join(runtimeDir,'node_modules',name,'package.json'),'utf8')).version;
  const capabilities={node:process.versions.node.split('.')[0]==='24'?'verified':'unavailable',filesystem:stateAccess?'verified':'unavailable',search:'unverified',read:'unverified',persistence:'unverified'};
  const refs=[];
  for(const id of payload.probe_receipt_ids) {
    const receipt=state?.raw_receipts[id];if(!receipt||receipt.status!=='succeeded')continue;
    const run=Object.values(state.runs).find(r=>r.tickets?.[receipt.ticket_id]);
    if(run?.binding_id===payload.binding.binding_id&&run.request.data_mode==='live') {
      const ticket=run.tickets[receipt.ticket_id];
      if(receipt.tool_name===payload.binding[ticket.operation].tool_name) {capabilities[ticket.operation]='verified';refs.push(id);}
    }
  }
  if(state&&await persistenceStatus(stateDir,state)==='saved')capabilities.persistence='verified';
  const accountCollection=Object.fromEntries(['visible_analytics_read','analytics_export','history_read','official_api_read'].map(name=>[name,{declared:payload.binding.account_collection?.[name]??'unverified',actual:'unverified'}]));
  for(const receipt of Object.values(state?.collection_receipts??{}).sort((a,b)=>a.captured_at.localeCompare(b.captured_at)||a.receipt_id.localeCompare(b.receipt_id)))if(receipt.binding_id===payload.binding.binding_id&&receipt.data_mode==='live') {
    try {await verifyCollectionReceipt(receipt,state.account);accountCollection[receipt.capability].actual=receipt.status==='succeeded'?'verified':receipt.status;refs.push(receipt.receipt_id);}catch {accountCollection[receipt.capability].actual='unverified';}
  }
  return {runtime_version:process.version,dependency_versions:versions,schema_valid:true,state_access:stateAccess,binding_id:payload.binding.binding_id,capabilities,account_collection:accountCollection,current_account_identity:state?.account??null,evidence_refs:refs,limitations:[...Object.entries(capabilities).filter(([,value])=>value!=='verified').map(([name])=>`${name} has no current successful probe receipt`),...Object.entries(accountCollection).filter(([,value])=>value.actual!=='verified').map(([name,value])=>`${name}: ${value.actual}`)]};
}

function makeRun(context,runId,stageResults,refs,hasFindings,extra={}) {
  return summarizeRun(stageResults,context.requested_scope,{run_id:runId,intent:context.intent,effective_config_hash:context.effective_config.config_hash,as_of:context.effective_config.as_of,
    delivered_scope:extra.delivered_scope??context.requested_scope,deliverable_refs:refs,limitations:extra.limitations??[],stop_reason:extra.stop_reason??'requested_task_finished',persistence_status:'unverified',has_findings:hasFindings,definitive_no_findings:extra.definitive_no_findings??false,core_blocked:false});
}

function collectAccountMaterial(state,input) {
  assertAccount(state,input.account);registerSources(state,input.source_refs);
  for(const post of input.posts)saveLegacyPost(state,post);
  for(const snapshot of input.snapshots)putImmutable(state.snapshots,snapshot.snapshot_id,snapshot);
}

function saveLegacyPost(state,post) {
  const previous=state.posts[post.post_key];
  if(previous&&same({...previous,source_ref:null},{...post,source_ref:null})) {
    // The legacy projection retains its original source; V2 keeps the extra evidence.
    const entity=state.post_entities?.[state.post_aliases?.[post.post_key]??post.post_key];
    if(entity)entity.evidence_refs=[...new Set([...entity.evidence_refs,post.source_ref])];
    return;
  }
  putImmutable(state.posts,post.post_key,post);
}

function requestedCalculationsComplete(input,result) {
  const outputs=input.requested_scope.requested_outputs,metrics=input.requested_scope.selection_policy.requested_metrics;
  const groups=result.metric_groups.filter(g=>g.group_by==='all');
  const valid=(metric,prefix)=>groups.some(g=>g.metric===metric&&g.window.startsWith(prefix)&&g.valid_count>0&&g.missing_count===0);
  return outputs.every(output=>output==='content'||metrics.every(metric=>{
    if(output==='latest')return valid(metric,'current_7:latest');
    if(output==='age_matched')return input.requested_scope.selection_policy.age_windows.every(age=>valid(metric,`current_7:age:${age.target_hours}h`));
    if(output==='comparison')return result.comparisons.some(c=>c.metric===metric&&c.group_by==='all'&&c.current_value!==null&&c.previous_value!==null);
    return false;
  }));
}

async function record(payload,request,stateDir,existing) {
  const {operation,data,as_of:asOf}=payload;
  if(operation==='persistence_receipt') {
    requireState(existing);validate('PersistenceReceipt',data);
    if(request.expected_revision!==existing.revision)fail('STATE_CONFLICT','/expected_revision','Read the current state before saving its receipt');
    await savePersistenceReceipt(stateDir,data);
    const result=request.run_id?currentRunView(existing,request.run_id,'saved'):null;
    return {state:existing,data:{record_refs:[data.artifact_id],run_result:result}};
  }
  let response;
  const next=await commitState(stateDir,request.expected_revision,async state=>{
    if(operation==='initialize') {
      if(state)fail('STATE_CONFLICT','/operation','initialize cannot overwrite an existing account');
      validate('ConfigV1',data);resolveConfig(data,null,asOf);
      response={record_refs:[data.account.profile_url],run_result:null};return initializeState(data);
    }
    requireState(state);
    if(operation==='user_material') {
      registerSources(state,data.source_records);
      for(const fact of data.user_facts) {validate('UserFactRecord',fact);if(!state.sources[fact.source_ref])fail('MISSING_EVIDENCE','/source_ref','User facts must link their actual input material');putImmutable(state.user_facts,fact.user_fact_id,fact);}
      response={record_refs:[...data.source_records.map(s=>s.source_id),...data.user_facts.map(f=>f.user_fact_id)],run_result:null};return state;
    }
    if(operation==='observations') {
      registerSources(state,data.source_refs);
      for(const post of data.posts) {validate('PostRecord',post);if(post.author_handle.toLowerCase()!==state.account.handle.toLowerCase()&&!(state.account.user_id&&post.account_id===state.account.user_id))fail('IDENTITY_MISMATCH','/author_handle','Observation post belongs to another account');saveLegacyPost(state,post);}
      for(const snapshot of data.snapshots) {validate('Snapshot',snapshot);if(!state.sources[snapshot.source_ref])fail('MISSING_EVIDENCE','/source_ref','Observation has no actual source');if(snapshot.entity_type==='post'&&!state.posts[snapshot.entity_id])fail('MISSING_EVIDENCE','/entity_id','Post observation has no linked post');if(snapshot.account_id&&state.account.user_id&&snapshot.account_id!==state.account.user_id)fail('IDENTITY_MISMATCH','/account_id','Observation belongs to another account');putImmutable(state.snapshots,snapshot.snapshot_id,snapshot);}
      response={record_refs:data.snapshots.map(s=>s.snapshot_id),run_result:null};return state;
    }
    if(operation==='adoption') {
      validate('AdoptionRecord',data);
      const draft=state.drafts[data.draft_id]?.revisions[data.revision];
      if(!draft||draft.validity!=='ready')fail('STALE_DRAFT','/revision','Only a currently valid exact draft revision can be adopted');
      if(!data.basis)fail('MISSING_EVIDENCE','/basis','Adoption requires the user selection evidence');
      putImmutable(state.adoptions,data.adoption_id,data);response={record_refs:[data.adoption_id],run_result:null};return state;
    }
    if(operation==='publication') {
      validate('PublicationRecord',data);
      if(data.confirmed_by==='fixture'&&(data.data_mode!=='fixture'||!state.account.handle.startsWith('fixture_')))fail('INVALID_INPUT','/data_mode','Fixture publication is permitted only in an isolated fixture account');
      if(data.data_mode==='live'&&data.confirmed_by==='fixture')fail('INVALID_INPUT','/confirmed_by','Fixture is not live publication evidence');
      if(!data.basis)fail('MISSING_EVIDENCE','/basis','Publication requires a real confirmation basis');
      if(data.adoption_id) {
        const adopted=state.adoptions[data.adoption_id];
        if(!adopted)fail('MISSING_EVIDENCE','/adoption_id','Adoption record does not exist');
        const draft=state.drafts[adopted.draft_id]?.revisions[adopted.revision];
        if(!draft||draft.validity!=='ready')fail('STALE_DRAFT','/adoption_id','The adopted draft is no longer valid');
        const proposal={...draft};for(const key of ['length_checks','text_hashes','validity','status_history'])delete proposal[key];
        if(checkDraft(proposal,{state,effective_config:resolveConfig(state.config,null,asOf),data_mode:data.data_mode},asOf).validity!=='ready')fail('STALE_DRAFT','/draft','Publication draft failed current fact or text recheck');
      }
      const url=new URL(data.url);
      if(!['x.com','twitter.com'].includes(url.hostname)||!url.pathname.endsWith(`/status/${data.post_id}`)||url.pathname.split('/')[1].toLowerCase()!==state.account.handle.toLowerCase())fail('IDENTITY_MISMATCH','/url','Publication URL must identify the exact X post and target account');
      putImmutable(state.publications,data.publication_id,data);response={record_refs:[data.publication_id],run_result:null};return state;
    }
    if(operation==='rule_version') {
      validate('RuleVersion',data);const id=data.rule_version_id;
      if(data.supersedes&&!state.rule_versions[data.supersedes])fail('MISSING_EVIDENCE','/supersedes','Previous rule version does not exist');
      putImmutable(state.rule_versions,id,data);
      response={record_refs:[id],run_result:null};return state;
    }
    const context=payload.run_context;validate('RunContext',context);assertAccount(state,context.effective_config.config.account);
    for(const ruleRef of context.rule_version_refs??[])if(!state.rule_versions_v2?.[ruleRef]&&!state.rule_versions[ruleRef])fail('INVALID_EVIDENCE_REF','/run_context/rule_version_refs','Referenced algorithm rule does not exist');
    const runId=request.run_id??newId('run');if(state.runs[runId])fail('STATE_CONFLICT','/run_id','Non-news completed runs are immutable');
    if(operation==='analysis') {
      if(context.intent!=='account_analysis')fail('INVALID_INPUT','/run_context/intent','Incorrect analysis intent');
      const input=importAccount(data.account_input);collectAccountMaterial(state,input);
      const result=analyzeAccount(input,input.requested_scope.selection_policy);
      validate('AnalysisReport',data.report);
      if(!same(context.requested_scope,input.requested_scope))fail('INVALID_INPUT','/run_context/requested_scope','Analysis scope must match the actual imported request');
      if(!same(result,data.report.account_result))fail('INVALID_INPUT','/report/account_result','Analysis report numbers must equal the production calculation');
      if(data.report.run_id!==runId)fail('INVALID_INPUT','/report/run_id','Report must identify this exact run');
      const evidenceIds=new Set([...input.posts.map(post=>post.post_key),...input.snapshots.map(snapshot=>snapshot.snapshot_id),...input.source_refs.map(source=>source.source_id)]);
      for(const finding of data.report.findings)if(!finding.evidence_refs.length||finding.evidence_refs.some(ref=>!evidenceIds.has(ref)))fail('MISSING_EVIDENCE','/findings','Findings require actual post, source or observation references');
      if(data.report.representative_posts.some(ref=>!input.posts.some(post=>post.post_key===ref)))fail('MISSING_EVIDENCE','/representative_posts','Representative posts must exist in this account input');
      for(const action of data.report.actions)if(!action.basis_refs.length||action.basis_refs.some(ref=>!evidenceIds.has(ref)))fail('MISSING_EVIDENCE','/actions/basis_refs','Actions must link actual account evidence');
      const coverage=input.requested_scope.mode==='sample'||['source_window_complete','user_declared_complete'].includes(result.coverage.status);
      const outputs=input.requested_scope.requested_outputs;
      const numerical=requestedCalculationsComplete(input,result);
      const reportReady=data.report.findings.length>0&&data.report.actions.length>0&&data.report.actions.length<=3&&data.report.findings.every(f=>f.statement.trim()&&f.interpretation.trim())&&data.report.actions.every(a=>a.change.trim()&&a.next_check.trim());
      const stages=[stage('identity',true,[state.account.profile_url]),stage('import',true,input.source_refs.map(s=>s.source_id)),stage('coverage',coverage,[],coverage?null:'Only a sample was obtained for a full request'),stage('requested_calculations',numerical,[],numerical?null:'One or more requested numerical outputs are incomplete'),stage('analysis_report',reportReady,data.report.representative_posts,reportReady?null:'Guidance needs a nonempty finding and one to three executable actions'),stage('persistence',false,[],'Actual persistence receipt is pending')];
      const runResult=makeRun(context,runId,stages,[runId],data.report.findings.length>0,{limitations:result.limitations});
      state.runs[runId]={run_id:runId,intent:context.intent,run_context:context,report:structuredClone(data.report),run_result:runResult};response={record_refs:[runId],run_result:runResult};return state;
    }
    if(operation==='draft') {
      if(context.intent!=='content_optimization')fail('INVALID_INPUT','/run_context/intent','Incorrect draft intent');
      const mode=typeof context.requested_scope==='string'?context.requested_scope:context.requested_scope.mode;
      const stages=[],refs=[];
      if(mode==='suggestions_only') {
        if(data.draft_input||!state.sources[data.original_ref])fail('MISSING_EVIDENCE','/original_ref','Suggestions need an original material source and no fabricated draft');
        for(const id of data.user_fact_ids)if(!state.user_facts[id])fail('MISSING_EVIDENCE','/user_fact_ids','User fact is not registered');
        stages.push(stage('original_material',true,[data.original_ref]),stage('fact_mapping',true,data.user_fact_ids),stage('suggestions',data.suggestions.length>0),stage('persistence',false));
        const result=makeRun(context,runId,stages,[runId],data.suggestions.length>0);
        state.runs[runId]={run_id:runId,intent:context.intent,run_context:context,suggestions:structuredClone(data),run_result:result};response={record_refs:[runId],run_result:result};return state;
      }
      const checked=checkDraft(data.draft_input,{state,effective_config:context.effective_config,data_mode:context.data_mode},asOf);
      if(checked.draft.original_ref&&!state.sources[checked.draft.original_ref]&&!findSourceVersion(state,checked.draft.original_ref))fail('MISSING_EVIDENCE','/original_ref','Original material is not registered');
      if(checked.draft.card_id&&!Object.values(state.runs).some(run=>run.cards?.some(card=>card.card_id===checked.draft.card_id)))fail('MISSING_EVIDENCE','/card_id','The referenced news card is not registered');
      saveDraft(state,checked.draft);refs.push(`${checked.draft.draft_id}:${checked.draft.revision}`);
      stages.push(stage('original_material',Boolean(checked.draft.original_text||checked.draft.original_ref)),stage('fact_mapping',checked.evidence_status==='supported'),stage('draft_generation',true,refs),stage('semantic_review',checked.semantic_status==='approved'),stage('length_check',checked.text_checks.every(c=>c.valid)),stage('persistence',false));
      const result=makeRun(context,runId,stages,refs,true);
      state.runs[runId]={run_id:runId,intent:context.intent,run_context:context,draft_refs:[{draft_id:checked.draft.draft_id,revision:checked.draft.revision}],run_result:result};response={record_refs:refs,run_result:result,draft_check:checked};return state;
    }
    if(operation==='review') {
      if(context.intent!=='review')fail('INVALID_INPUT','/run_context/intent','Incorrect review intent');
      const computed=buildReview(data.review_input,state),report=structuredClone(data.report);
      validate('ReviewResult',report);
      if(computed.limitations.some(reason=>!report.limitations.includes(reason)))fail('INVALID_INPUT','/report/limitations','Computed limitations cannot be removed');
      for(const key of Object.keys(computed))if(!['finding_proposals','next_experiment','limitations','semantic_review_required'].includes(key)&&!same(computed[key],report[key]))fail('INVALID_INPUT',`/report/${key}`,'Review calculations must equal the production result');
      if(!report.finding_proposals.length||!report.next_experiment)fail('MISSING_EVIDENCE','/review_report','Review needs evidence-based findings and one next experiment');
      const reviewEvidence=new Set([...Object.keys(state.posts),...Object.keys(state.snapshots),...Object.keys(state.sources),...Object.keys(state.publications),...Object.keys(state.adoptions)]);
      for(const finding of report.finding_proposals)if(!finding.statement.trim()||!finding.interpretation.trim()||finding.evidence_refs.some(ref=>!reviewEvidence.has(ref)))fail('INVALID_EVIDENCE_REF','/finding_proposals','Review findings require nonempty statements and recoverable evidence');
      if(report.next_experiment.basis_refs.some(ref=>!reviewEvidence.has(ref)))fail('INVALID_EVIDENCE_REF','/next_experiment/basis_refs','Experiment evidence must exist');
      const id=newId('review');state.reviews[id]={review_id:id,review_input:structuredClone(data.review_input),report};
      const stages=[stage('record_linkage',computed.publication_links?.length>0||data.review_input.post_ids.length>0),stage('requested_calculations',computed.descriptive_statistics.metric_groups.some(g=>g.valid_count>0)),stage('review_report',true,[id]),stage('persistence',false)];
      const result=makeRun(context,runId,stages,[id],true,{limitations:report.limitations});state.runs[runId]={run_id:runId,intent:context.intent,run_context:context,report,run_result:result};response={record_refs:[id],run_result:result};return state;
    }
    fail('INVALID_INPUT','/operation','Unsupported record operation');
  });
  return {state:next,data:response};
}

function currentRunView(state,runId,persistence) {
  if(state.coaching_runs?.[runId])return coachingRunResult(state,runId,persistence);
  const run=structuredClone(state.runs[runId]);if(!run)fail('MISSING_EVIDENCE','/run_id','Run does not exist');
  if(run.request&&run.binding)return finalizeRun(run,{state,persistence_status:persistence});
  const old=run.run_result;
  const stages=old.stage_results.map(s=>s.stage==='persistence'?{...s,status:persistence==='saved'?'passed':'not_run',reason:persistence==='saved'?null:'Actual save receipt is missing or stale'}:s);
  const stagePrefixes=old.stage_results.map(item=>`${item.stage}: `);
  const limitations=old.limitations.filter(item=>!stagePrefixes.some(prefix=>item.startsWith(prefix)));
  return summarizeRun(stages,old.requested_scope,{...old,limitations,persistence_status:persistence,has_findings:old.result_kind==='findings',definitive_no_findings:old.result_kind==='no_findings',core_blocked:old.execution_status==='blocked'});
}

async function dispatch(command,request,stateDir) {
  const payload=request.payload;let state=await loadState(stateDir);
  if(payload.contract_version===2)return dispatchV2(command,request,stateDir,state);
  if(command==='doctor')return {data:await doctor(payload,stateDir,state),state};
  if(command==='config') {
    const base=state?.config??createDefaultConfig();
    if(payload.patch?.expected_revision!==undefined&&payload.patch.expected_revision!==request.expected_revision)fail('STATE_CONFLICT','/patch/expected_revision','Patch and envelope revisions must agree');
    const effective=resolveConfig(base,payload.patch,payload.as_of);
    if(payload.operation==='resolve')return {data:effective,state};
    requireState(state);
    if(payload.patch?.scope!=='persistent')fail('INVALID_INPUT','/patch/scope','Long-term updates require an explicitly persistent patch');
    if(payload.patch.expected_revision!==undefined&&payload.patch.expected_revision!==request.expected_revision)fail('STATE_CONFLICT','/patch/expected_revision','Patch and envelope revisions must agree');
    state=await commitState(stateDir,request.expected_revision,working=>{
      working.config=effective.config;working.account=effective.config.account;
      for(const operation of payload.patch.operations)working.preference_meta[operation.path]={basis:'user',source:request.run_id??'explicit_config_request',confirmed_at:payload.as_of};
      return working;
    });return {data:effective,state};
  }
  if(command==='account-analyze') {
    let input;
    if(payload.format==='json')input=importAccount(payload.account_input);
    else input=importAccount({csv_text:await readFile(payload.csv_path,'utf8'),account_context:payload.account_context},payload.mapping);
    if(state)assertAccount(state,input.account);
    return {data:analyzeAccount(input,input.requested_scope.selection_policy),state};
  }
  if(command==='draft-check') {
    requireState(state);return {data:checkDraft(payload.draft_input,{state,effective_config:resolveConfig(state.config,null,payload.as_of),data_mode:state.account.handle.startsWith('fixture_')?'fixture':'live'},payload.as_of),state};
  }
  if(command==='review') {requireState(state);return {data:buildReview(payload.review_input,state),state};}
  if(command==='record')return record(payload,request,stateDir,state);
  if(command==='news-step') {
    requireState(state);let data;
    let internal=payload;
    if(payload.operation==='ingest')internal={...payload,raw_object:JSON.parse(await readFile(payload.raw_result_path,'utf8'))};
    state=await commitState(stateDir,request.expected_revision,working=>{
      if(payload.operation==='init') {
        const run=initializeNews(payload.request,payload.effective_config,payload.binding,payload.request.requested_at);assertAccount(working,run.effective_config.config.account);
        run.consumer_context=buildConsumerContext(working,{intent:'news',goal_snapshot:goalSnapshotFromState(working,run.effective_config.config)});
        const allRules={...working.rule_versions,...working.rule_versions_v2};
        const superseded=new Set(Object.values(allRules).map(rule=>rule.supersedes).filter(Boolean));
        run.rule_version_ids=Object.keys(allRules).filter(id=>!superseded.has(id));
        working.runs[run.run_id]=run;data={run};return working;
      }
      const run=working.runs[request.run_id];if(!run?.binding)fail('MISSING_EVIDENCE','/run_id','News run does not exist');
      const context={state:working,effective_config:run.effective_config,data_mode:run.request.data_mode,as_of:run.request.data_mode==='fixture'?(payload.actual_call?.returned_at??run.started_at):new Date().toISOString()};
      data=advanceNews(run,payload.operation,internal,context);return working;
    });return {data,state};
  }
  fail('INVALID_INPUT','/command','Unknown command');
}

function parseArguments(argv) {
  const [command,...rest]=argv;if(!commands.includes(command))fail('INVALID_INPUT','/command',`Command must be one of ${commands.join(', ')}`);
  const options={};for(let i=0;i<rest.length;i+=2) {if(!['--input','--output','--state-dir'].includes(rest[i])||!rest[i+1]||options[rest[i]])fail('INVALID_INPUT','/arguments','Use unique --input, --output and --state-dir paths');options[rest[i]]=resolve(rest[i+1]);}
  if(!options['--input']||!options['--output']||!options['--state-dir'])fail('INVALID_INPUT','/arguments','All three path arguments are required');
  return {command,options};
}

export async function main(argv=process.argv.slice(2)) {
  let command=argv[0]??'',options={},request=null,envelope,exitCode=0;
  try {
    ({command,options}=parseArguments(argv));
    request=JSON.parse(await readFile(options['--input'],'utf8'));validate('RequestEnvelope',request);validate(`${command}Payload`,request.payload);
    const result=await dispatch(command,request,options['--state-dir']);
    const runResult=result.data?.run_result;
    const status=runResult?.execution_status==='blocked'?'blocked':runResult?.execution_status==='partial'?'partial':'ok';
    exitCode=status==='partial'?3:status==='blocked'?4:0;
    envelope={schema_version:1,command,run_id:request.run_id??runResult?.run_id??result.data?.run?.run_id??null,status,data:result.data,errors:result.data?.errors??[],evidence_refs:result.data?.record_refs??[],state_revision:result.state?.revision??0};
  } catch(error) {
    const code=error instanceof ContractError?error.code:error instanceof SyntaxError?'INVALID_INPUT':'IO_ERROR';
    exitCode=['STATE_CONFLICT','BUDGET_EXHAUSTED','CAPABILITY_UNAVAILABLE','MISSING_EVIDENCE','PERSIST_FAILED','MIGRATION_REQUIRED','AUTH_REQUIRED','ADAPTER_UNVERIFIED'].includes(code)?4:code==='IO_ERROR'?5:2;
    envelope={schema_version:1,command,run_id:request?.run_id??null,status:exitCode===4?'blocked':'error',data:null,errors:[{code,path:error.path??'/',message:error.message,retryable:error.retryable??false}],evidence_refs:[],state_revision:null};
  }
  const output=JSON.stringify(envelope,null,2)+'\n';
  if(options['--output'])try {await mkdir(dirname(options['--output']),{recursive:true});await writeFile(options['--output'],output,{mode:0o600});}catch(error){process.stderr.write(`Output write failed: ${error.code??'IO_ERROR'}\n`);exitCode=5;}
  process.stdout.write(output);return exitCode;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main();
