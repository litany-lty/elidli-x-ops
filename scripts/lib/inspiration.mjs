import { canonicalHash, ContractError, validate } from './contracts.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const values=value=>Object.values(value??{});
const unique=items=>[...new Set(items.filter(Boolean))].sort();
const accountRef=state=>state.account?.user_id??`handle:${state.account?.handle}`;
const instant=(value,path)=>{const parsed=Date.parse(value);if(!Number.isFinite(parsed))fail('INVALID_INPUT',path,'Expected an ISO instant');return new Date(parsed).toISOString();};
const stableId=(prefix,value)=>`${prefix}-${canonicalHash(value).slice(0,24)}`;

function contentHash(value,field){const copy=structuredClone(value);delete copy[field];return canonicalHash(copy);}
function seed(value){const base={...value,seed_id:stableId('seed',{kind:value.kind,value:value.value,source_tier:value.source_tier,basis_refs:value.basis_refs})};return validate('InspirationSeedV5',{...base,seed_hash:contentHash(base,'seed_hash')});}
function newsLimits(state){const news=state.config?.news??{};return{search:news.max_queries??0,read:news.max_source_reads??0};}

function selectSeeds(state,payload){
  const request=payload.request_scope??{},explicit=[];
  for(const value of request.explicit_topics??[])explicit.push(seed({kind:'topic',value,priority:4,basis_refs:[payload.request_ref],source_tier:'current_request',temporary:true}));
  for(const value of request.reader_questions??[])explicit.push(seed({kind:'reader_question',value,priority:4,basis_refs:[payload.request_ref],source_tier:'current_request',temporary:true}));
  if(explicit.length)return explicit;
  const configured=state.config?.news?.core_topics??state.config?.content?.topics??[];
  const historical=[];
  const cutoff=Date.parse(payload.cutoff),analyses=values(state.content_analyses).filter(item=>!item.reviewed_at||Date.parse(item.reviewed_at)<=cutoff),latest=new Map();
  for(const item of analyses.sort((a,b)=>Date.parse(a.reviewed_at??0)-Date.parse(b.reviewed_at??0)||a.analysis_id.localeCompare(b.analysis_id)))latest.set(item.post_version_ref??item.analysis_id,item);
  for(const item of latest.values()){
    if(configured.length&&item.primary_topic&&!configured.some(topic=>String(topic).toLowerCase()===String(item.primary_topic).toLowerCase()))continue;
    if(item.primary_topic)historical.push(seed({kind:'topic',value:item.primary_topic,priority:2,basis_refs:[item.analysis_id],source_tier:'current_history',temporary:false}));
    if(item.reader_problem)historical.push(seed({kind:'reader_question',value:item.reader_problem,priority:2,basis_refs:[item.analysis_id],source_tier:'current_history',temporary:false}));
  }
  for(const item of values(state.personal_patterns).filter(item=>item.contract_version===5&&item.lifecycle_status==='active'&&item.account_ref===accountRef(state)))for(const value of item.scope?.topics??[])historical.push(seed({kind:'history_followup',value,priority:2,basis_refs:[item.pattern_version_id],source_tier:'current_history',temporary:false}));
  const configuredSeeds=configured.map(value=>seed({kind:'topic',value,priority:3,basis_refs:['config'],source_tier:'confirmed_config',temporary:false}));
  if(configuredSeeds.length||historical.length)return [...new Map([...configuredSeeds,...historical].map(item=>[item.seed_id,item])).values()];
  return (request.temporary_assumptions??[]).map(value=>seed({kind:'temporary_hypothesis',value,priority:1,basis_refs:[payload.request_ref],source_tier:'temporary_assumption',temporary:true}));
}

function snapshotHash(snapshot){return contentHash(snapshot,'session_content_hash');}
function current(entry){return entry.revisions[String(entry.latest_revision)];}
function appendRevision(entry,changes,at){
  const previous=current(entry),revision=entry.latest_revision+1;
  const base={...structuredClone(previous),...structuredClone(changes),revision,created_at:instant(at,'/as_of')};
  const next=validate('InspirationSessionSnapshotV5',{...base,session_content_hash:snapshotHash(base)});
  entry.revisions[String(revision)]=next;entry.latest_revision=revision;return next;
}
function requireEntry(state,sessionId){const entry=state.inspiration_sessions?.[sessionId];if(!entry)fail('MISSING_EVIDENCE','/session_id','Inspiration session does not exist');return entry;}

export function inspirationBudgetView(entry){
  const tickets=values(entry.runtime.ticket_ledger),count=(operation,statuses)=>tickets.filter(item=>item.operation===operation&&statuses.includes(item.status)).length;
  const snapshot=current(entry),result={};
  for(const operation of ['search','read'])result[operation]={allocated:snapshot.budget_policy[`${operation}_allocated`],reserved:count(operation,['reserved','unknown']),attempted:count(operation,['succeeded','failed']),used:count(operation,['reserved','unknown','succeeded','failed'])};
  return result;
}

function parentForRun(state,runId){return values(state.inspiration_sessions).find(entry=>entry.runtime?.child_news_run_refs?.includes(runId))??null;}

export function assertParentNewsReserve(state,run,logicalTaskIds){
  const entry=parentForRun(state,run.run_id);if(!entry)return null;
  const relation=entry.runtime.child_relations[run.run_id];if(!relation)fail('STATE_CONFLICT','/inspiration_sessions','Parent-owned news run lacks its frozen relation');
  const tasks=logicalTaskIds.map(id=>run.plan?.tasks?.find(item=>item.logical_task_id===id));
  if(tasks.some(item=>!item))fail('MISSING_EVIDENCE','/logical_task_ids','Parent reserve requires planned child tasks');
  const view=inspirationBudgetView(entry);
  const childTickets=values(entry.runtime.ticket_ledger).filter(item=>item.child_news_run_ref===run.run_id);
  for(const operation of ['search','read']){
    const requested=tasks.filter(item=>item.operation===operation).length,childUsed=childTickets.filter(item=>item.operation===operation).length;
    if(childUsed+requested>relation[`allocated_${operation}`]||view[operation].used+requested>view[operation].allocated)fail('BUDGET_EXHAUSTED','/inspiration_sessions/budget','Child reserve would exceed its parent allocation');
  }
  return{session_id:entry.session_id,relation:structuredClone(relation),budget:view};
}

export function recordParentNewsTickets(state,run,tickets){
  const entry=parentForRun(state,run.run_id);if(!entry)return null;
  for(const ticket of tickets){
    const existing=entry.runtime.ticket_ledger[ticket.ticket_id];
    const item={ticket_id:ticket.ticket_id,child_news_run_ref:run.run_id,logical_task_ref:ticket.logical_task_id,operation:ticket.operation,purpose:ticket.purpose,status:ticket.execution_state,issued_at:ticket.issued_at};
    if(existing&&canonicalHash(existing)!==canonicalHash(item))fail('RECEIPT_CONFLICT','/ticket_id','Parent ticket ledger identity changed');
    entry.runtime.ticket_ledger[ticket.ticket_id]=validate('InspirationTicketLedgerEntryV5',item);
  }
  return inspirationBudgetView(entry);
}

export function syncParentNewsTicket(state,run,ticket){
  const entry=parentForRun(state,run.run_id);if(!entry)return null;
  const ledger=entry.runtime.ticket_ledger[ticket.ticket_id];if(!ledger)fail('STATE_CONFLICT','/ticket_id','Parent-owned ticket was not reserved through the parent ledger');
  ledger.status=ticket.execution_state==='reserved'?ledger.status:ticket.execution_state;validate('InspirationTicketLedgerEntryV5',ledger);return inspirationBudgetView(entry);
}

export function personalAngleHash({event_refs=[],goal,seed_refs=[],history_refs=[],pattern_version_refs=[],selection_policy_version='inspiration-v5'}={}){return canonicalHash({event_refs:unique(event_refs),goal,seed_refs:unique(seed_refs),history_refs:unique(history_refs),pattern_version_refs:unique(pattern_version_refs),selection_policy_version});}

function queryTask(value,seeds,childRefs){
  if(!value.seed_refs?.length||value.seed_refs.some(ref=>!seeds.has(ref)))fail('INVALID_EVIDENCE_REF','/query_tasks/seed_refs','Every query must bind a selected seed');
  if(!childRefs.has(value.child_news_run_ref))fail('INVALID_EVIDENCE_REF','/query_tasks/child_news_run_ref','Query must use a parent-owned child news run');
  const base={...structuredClone(value),status:'planned'};return validate('InspirationQueryTaskV5',{...base,query_hash:contentHash(base,'query_hash')});
}
function actualSource(state,ref){return Boolean(state.sources?.[ref]||Object.values(state.sources??{}).some(source=>source.versions?.[ref])||state.raw_receipts?.[ref]);}
function novelty(value){if(!value)return null;const base=structuredClone(value);return validate('NoveltyDeltaV5',{...base,delta_hash:contentHash(base,'delta_hash')});}
function candidateHash(value){const copy=structuredClone(value);for(const field of ['candidate_hash','selection_status','selection_reason','rejection_reason'])delete copy[field];return canonicalHash(copy);}
function eventIsCurrent(state,event,cutoff){
  const instantValue=event?.event_time?.instant;if(!instantValue)return false;
  const at=Date.parse(instantValue),end=Date.parse(cutoff),window=state.config?.news?.window;
  if(!Number.isFinite(at)||!Number.isFinite(end))return false;
  if(window?.mode==='rolling')return at>=end-window.hours*3_600_000&&at<end;
  if(window?.mode==='interval')return at>=Date.parse(window.start)&&at<Date.parse(window.end)&&at<end;
  return event.in_window===true&&at<end;
}
function candidate(state,value,snapshot){
  if(!value.seed_refs?.length||value.seed_refs.some(ref=>!snapshot.seeds.some(seed=>seed.seed_id===ref)))fail('INVALID_EVIDENCE_REF','/candidates/seed_refs','Candidate must bind selected seeds');
  const newsKind=['fresh_event','event_update'].includes(value.kind);
  if(newsKind&&(!value.event_refs?.length||!value.claim_refs?.length))fail('MISSING_EVIDENCE','/candidates','News inspiration requires verified event and claim refs');
  if(newsKind&&(value.event_refs.some(ref=>!state.events?.[ref])||value.claim_refs.some(ref=>!state.claims?.[ref])))fail('INVALID_EVIDENCE_REF','/candidates','News inspiration references missing news evidence');
  if(value.kind==='fresh_event'&&value.event_refs.some(ref=>!eventIsCurrent(state,state.events[ref],snapshot.cutoff)))fail('INVALID_EVIDENCE_REF','/event_refs','Fresh-event inspiration requires an event inside the current frozen news window');
  if(!newsKind&&value.event_refs?.length)fail('INVALID_INPUT','/event_refs','Non-news inspiration cannot invent an event identity or event time');
  if((value.source_refs??[]).some(ref=>!actualSource(state,ref)))fail('INVALID_EVIDENCE_REF','/source_refs','Candidate source must be actually saved or read');
  const delta=novelty(value.novelty_delta);
  if((value.kind==='event_update'||value.kind==='history_followup'||value.history_refs?.length)&&!delta)fail('MISSING_EVIDENCE','/novelty_delta','Update and historical angles require an actual NoveltyDelta');
  if(value.kind==='event_update'&&(!delta.new_material_refs.every(ref=>(value.source_refs??[]).includes(ref))||delta.new_material_refs.some(ref=>delta.prior_refs.includes(ref))))fail('INVALID_EVIDENCE_REF','/novelty_delta','Event update requires actually new saved material distinct from prior references');
  const angle=personalAngleHash({event_refs:value.event_refs,goal:snapshot.goal,seed_refs:value.seed_refs,history_refs:value.history_refs,pattern_version_refs:value.pattern_version_refs,selection_policy_version:value.selection_policy_version});
  const base={...structuredClone(value),version:value.version??1,novelty_delta:delta,selection_status:'eligible',selection_reason:null,rejection_reason:null,personal_angle_hash:angle};delete base.pattern_version_refs;delete base.selection_policy_version;
  return validate('InspirationCandidateV5',{...base,candidate_hash:candidateHash(base)});
}

export function resolveInspirationRef(state,ref){
  const match=/^inspiration:([^:]+):(\d+):([^:]+)$/.exec(ref);if(!match)fail('INVALID_INPUT','/ref','Expected inspiration:<session>:<revision>:<candidate>');
  const [,sessionId,revisionText,candidateId]=match,entry=requireEntry(state,sessionId),snapshot=entry.revisions[revisionText];
  if(!snapshot)fail('MISSING_EVIDENCE','/ref','Inspiration revision does not exist');
  const candidate=snapshot.candidates.find(item=>item.candidate_id===candidateId);if(!candidate)fail('MISSING_EVIDENCE','/ref','Candidate does not exist in the exact revision');
  return{entry,snapshot,candidate,ref};
}

export function advanceInspiration(state,payload,context={}){
  if(state?.schema_version!==5)fail('MIGRATION_REQUIRED','/state/schema_version','inspiration-step requires state 5');
  if(payload?.contract_version!==5)fail('INVALID_INPUT','/contract_version','inspiration-step requires contract version 5');
  const next=structuredClone(state);next.inspiration_sessions??={};const at=context.as_of??new Date().toISOString();
  if(payload.operation==='prepare'){
    if(next.inspiration_sessions[payload.session_id])fail('STATE_CONFLICT','/session_id','Inspiration session already exists');
    const seeds=selectSeeds(next,payload);if(!seeds.length)fail('MISSING_EVIDENCE','/seeds','No explicit, configured, historical, or temporary inspiration seed is available');
    const limits=newsLimits(next),budget={search_allocated:payload.budget_policy?.search_allocated??limits.search,read_allocated:payload.budget_policy?.read_allocated??limits.read};
    if(budget.search_allocated>limits.search||budget.read_allocated>limits.read)fail('BUDGET_EXHAUSTED','/budget_policy','Parent allocation exceeds the existing news budget');
    const selector=payload.operational_context_selector??{subject_ref:'account',intent:'news',use:payload.use,goal:structuredClone(payload.goal),cutoff:instant(payload.cutoff,'/cutoff'),topic_refs:seeds.filter(item=>item.kind==='topic').map(item=>item.value),format:null,surface:null,task_constraints:structuredClone(payload.request_scope??{}),temporary_overrides:{},content_evidence_refs:unique(seeds.flatMap(item=>item.basis_refs).filter(ref=>!['config',payload.request_ref].includes(ref))),metric_evidence_refs:[],selected_signals:[],knowledge_dependency_versions:{},selection_policy_version:'operational-context-v5'};
    const base={contract_version:5,session_id:payload.session_id,revision:1,account_ref:accountRef(next),goal:structuredClone(payload.goal),use:payload.use,request_scope:structuredClone(payload.request_scope??{}),config_hash:canonicalHash(next.config),cutoff:instant(payload.cutoff,'/cutoff'),budget_policy:budget,operational_context_selector:selector,operational_context_hash:payload.operational_context_hash,seeds,query_tasks:[],candidates:[],media_candidates:[],status:'prepared',created_at:instant(at,'/as_of')};
    const snapshot=validate('InspirationSessionSnapshotV5',{...base,session_content_hash:snapshotHash(base)}),entry={session_id:payload.session_id,latest_revision:1,revisions:{1:snapshot},runtime:{child_news_run_refs:[],child_relations:{},ticket_ledger:{},pending_work:[],status:'active'}};
    next.inspiration_sessions[payload.session_id]=validate('InspirationSessionEntryV5',entry);return{state:next,result:{snapshot,budget:inspirationBudgetView(entry)},changed:true};
  }
  const entry=requireEntry(next,payload.session_id);
  if(payload.operation==='plan'){
    const previous=current(entry),childRefs=new Set(payload.child_news_runs.map(item=>item.run_id)),seeds=new Set(previous.seeds.map(item=>item.seed_id));
    const tasks=payload.query_tasks.map(item=>queryTask(item,seeds,childRefs));
    for(const child of payload.child_news_runs){
      if(entry.runtime.child_relations[child.run_id])fail('STATE_CONFLICT','/child_news_runs','Child news run is already allocated');
      const relation={allocated_search:child.allocated_search,allocated_read:child.allocated_read,query_refs:unique(tasks.filter(item=>item.child_news_run_ref===child.run_id).map(item=>item.query_id))};
      entry.runtime.child_news_run_refs.push(child.run_id);entry.runtime.child_relations[child.run_id]=relation;
    }
    const allocated=values(entry.runtime.child_relations).reduce((sum,item)=>({search:sum.search+item.allocated_search,read:sum.read+item.allocated_read}),{search:0,read:0});
    if(allocated.search>previous.budget_policy.search_allocated||allocated.read>previous.budget_policy.read_allocated)fail('BUDGET_EXHAUSTED','/child_news_runs','Child allocations exceed the parent cap');
    const snapshot=appendRevision(entry,{query_tasks:tasks,status:'planned'},at);entry.runtime.pending_work=tasks.map(item=>item.query_id);return{state:next,result:{snapshot,budget:inspirationBudgetView(entry)},changed:true};
  }
  if(payload.operation==='assess'){
    const previous=current(entry),media=(payload.media_candidates??[]).map(item=>{if(item.asset_ref&&!next.media_assets?.[item.asset_ref])fail('INVALID_EVIDENCE_REF','/media_candidates/asset_ref','Successful media must reference an existing media asset');return validate('InspirationMediaCandidateV5',item);});
    const candidates=payload.candidates.map(item=>candidate(next,item,previous));
    const snapshot=appendRevision(entry,{candidates,media_candidates:media,status:'assessed'},at);return{state:next,result:{snapshot},changed:true};
  }
  if(payload.operation==='finalize'){
    const previous=current(entry),selected=new Set(payload.selected_candidate_ids??[]);if(selected.size>3)fail('BUDGET_EXHAUSTED','/selected_candidate_ids','At most three inspiration candidates may be selected');
    if([...selected].some(id=>!previous.candidates.some(item=>item.candidate_id===id)))fail('MISSING_EVIDENCE','/selected_candidate_ids','Selected inspiration candidate is missing');
    if(previous.request_scope.today_only&&previous.candidates.filter(item=>selected.has(item.candidate_id)).some(item=>!['fresh_event','event_update'].includes(item.kind)))fail('INVALID_INPUT','/selected_candidate_ids','A today-only request cannot be completed with evergreen inspiration');
    const candidates=previous.candidates.map(item=>({...item,selection_status:selected.has(item.candidate_id)?'selected':'rejected',selection_reason:selected.has(item.candidate_id)?payload.selection_reasons?.[item.candidate_id]??'selected for current goal':null,rejection_reason:selected.has(item.candidate_id)?null:payload.rejection_reasons?.[item.candidate_id]??'not selected'}));
    const snapshot=appendRevision(entry,{candidates,status:'finalized'},at);entry.runtime.status='complete';entry.runtime.pending_work=[];return{state:next,result:{snapshot,selected_refs:candidates.filter(item=>item.selection_status==='selected').map(item=>`inspiration:${entry.session_id}:${snapshot.revision}:${item.candidate_id}`),result_kind:selected.size?'findings':'no_findings'},changed:true};
  }
  if(payload.operation==='resume'){
    const previous=current(entry),contextHash=context.operational_context?.selected_context_hash??previous.operational_context_hash;
    if(contextHash!==previous.operational_context_hash){
      const snapshot=appendRevision(entry,{operational_context_hash:contextHash,status:previous.candidates.length?'assessed':'planned'},at);
      entry.runtime.status='active';entry.runtime.pending_work=unique([...entry.runtime.pending_work,'reassess_personal_angles']);
      return{state:next,result:{snapshot,runtime:structuredClone(entry.runtime),budget:inspirationBudgetView(entry),reselection_required:true},changed:true};
    }
    return{state,result:{snapshot:structuredClone(previous),runtime:structuredClone(entry.runtime),budget:inspirationBudgetView(entry),reselection_required:false},changed:false};
  }
  if(payload.operation==='reserve-news'){
    const run=next.runs?.[payload.child_news_run_ref];if(!run)fail('MISSING_EVIDENCE','/child_news_run_ref','Saved child news run is required');
    return{state:next,result:assertParentNewsReserve(next,run,payload.logical_task_ids),changed:false};
  }
  fail('INVALID_INPUT','/operation','Unsupported inspiration-step operation');
}
