import { Temporal } from '@js-temporal/polyfill';
import { canonicalHash, textHash, newId, summarizeRun, validate, ContractError } from './contracts.mjs';
import { matchSource } from './config.mjs';
import { ingestHostResult, normalizeUrl } from './host-results.mjs';
import { findSourceVersion, saveSourceVersion, reviseClaimStatus, saveDraft } from './state.mjs';
import { checkDraft } from './draft.mjs';

const fail = (code,path,message) => { throw new ContractError(code,path,message,false); };
const iso = value => Temporal.Instant.from(value).toString();
const ms = value => Temporal.Instant.from(value).epochMilliseconds;
const stage = (name,status,evidence=[],reason=null) => ({stage:name,required:true,status,evidence_refs:evidence,reason});
const sourceAllowed = (url, config) => {
  const rules = config.news;
  return (!rules.restricted_sources.length || rules.restricted_sources.some(rule => matchSource(url,[rule]))) && !rules.excluded_sources.some(rule => matchSource(url,[rule]));
};

export function initializeNews(request,effectiveConfig,binding,asOf) {
  validate('NewsRequest',request); validate('EffectiveConfig',effectiveConfig); validate('HostBinding',binding);
  if (binding.data_mode !== request.data_mode) fail('INVALID_INPUT','/binding/data_mode','Fixture and live bindings cannot be mixed');
  const topics = effectiveConfig.config.news.core_topics ?? effectiveConfig.config.content.topics;
  if (!(topics?.length || effectiveConfig.config.news.exploration_topics.length || effectiveConfig.config.news.entities.length)) fail('MISSING_EVIDENCE','/news/core_topics','Set an explicit task topic or entity before news discovery');
  if (request.data_mode === 'live' && Math.abs(ms(asOf)-Date.now()) > 60000) fail('INVALID_INPUT','/requested_at','Live runs must use the actual host time');
  const start = iso(asOf);
  if (Math.abs(ms(start)-ms(effectiveConfig.as_of)) > 1000) fail('INVALID_INPUT','/effective_config/as_of','Freeze configuration at this run start');
  const runId = newId('run');
  return {run_id:runId,schema_version:1,binding_id:binding.binding_id,binding_version:binding.binding_version,
    binding:structuredClone(binding),request:structuredClone(request),effective_config:structuredClone(effectiveConfig),config_hash:effectiveConfig.config_hash,
    started_at:start,cutoff_at:effectiveConfig.window.end,deadline_at:Temporal.Instant.from(start).add({seconds:effectiveConfig.config.news.soft_budget_seconds}).toString(),
    phase:'plan',budget:{search_used:0,read_used:0,discover_search_used:0,discover_read_used:0,discovery_rounds:0},
    plan:null,tickets:{},candidates:{},source_version_ids:[],event_ids:[],claim_ids:[],card_ids:[],draft_refs:[],coverage:[],
    assessments:[],heat_evidence:[],errors:[],stage_results:[],execution_status:'partial',result_kind:'undetermined',stop_reason:null,final_result:null};
}

function checkTask(task,run,state) {
  if (!['search','read'].includes(task.operation) || !['discover','verify','refresh'].includes(task.purpose)) fail('INVALID_INPUT','/plan/tasks','Unknown task operation or purpose');
  if (!task.coverage_ids.every(id => run.plan.required_coverage.some(c => c.coverage_id === id))) fail('MISSING_EVIDENCE','/coverage_ids','Task coverage must refer to the frozen required scope');
  if (task.purpose !== 'discover') {
    const entities = run.effective_config.config.news.entities.map(entity => entity.entity_id);
    if (!task.scope_refs.some(id => run.candidates[id] || state.events[id] || state.claims[id] || entities.includes(id))) fail('MISSING_EVIDENCE','/scope_refs','Verification must link a real candidate, event, claim or configured entity');
  }
  if (task.operation === 'read') {
    let url;
    try { url=normalizeUrl(task.request.ref_id); } catch { url=null; }
    if (url && !sourceAllowed(url,run.effective_config.config)) fail('CONFIG_CONFLICT','/request/ref_id','Read is outside the current source restrictions');
    if (!url && !Object.values(run.candidates).some(c => c.source_ref === task.request.ref_id)) fail('MISSING_EVIDENCE','/request/ref_id','A read reference must be returned by this run or be an allowed URL');
  }
}

function eventInWindow(event,run) {
  const evidence = event.event_time;
  if (!evidence || evidence.precision === 'unknown') return null;
  if (evidence.instant) return ms(evidence.instant) >= ms(run.effective_config.window.start) && ms(evidence.instant) < ms(run.effective_config.window.end);
  if (evidence.precision === 'day' && evidence.timezone) {
    try {
      const date=Temporal.PlainDate.from(evidence.raw);
      const start=date.toZonedDateTime({timeZone:evidence.timezone,plainTime:'00:00'}).toInstant();
      const end=date.add({days:1}).toZonedDateTime({timeZone:evidence.timezone,plainTime:'00:00'}).toInstant();
      if (start.epochMilliseconds >= ms(run.effective_config.window.start) && end.epochMilliseconds <= ms(run.effective_config.window.end)) return true;
      if (end.epochMilliseconds <= ms(run.effective_config.window.start) || start.epochMilliseconds >= ms(run.effective_config.window.end)) return false;
    } catch { return null; }
  }
  return null;
}

function decisionForRun(run,event) {
  for(const assessment of [...run.assessments].reverse()) {
    for(const item of [...assessment.event_assessments].reverse()) {
      const proposed=item.event_ref.kind==='proposal'?assessment.new_events.find(proposal=>proposal.proposal_id===item.event_ref.id):null;
      if((item.event_ref.kind==='existing'&&item.event_ref.id===event.event_id)||proposed?.data.event_key===event.event_key)return item;
    }
    const proposal=assessment.new_events.find(proposal=>proposal.data.event_key===event.event_key);
    if(proposal)return proposal.data.relevance_assessment;
  }
  return null;
}

function verifyLocator(locator,state) {
  const source=findSourceVersion(state,locator.source_version_id);
  if (!source || !['read','partial'].includes(source.read_status) || source.material_kind === 'search_snippet' || !state.raw_receipts[source.raw_receipt_ref]) fail('MISSING_EVIDENCE','/locators','A claim requires an actually read source version and raw receipt');
  if (!Number.isInteger(locator.start) || !Number.isInteger(locator.end) || locator.start < 0 || locator.end <= locator.start || locator.end > source.captured_text.length || source.captured_text.slice(locator.start,locator.end) !== locator.text) fail('MISSING_EVIDENCE','/locators','Claim text must exactly match its UTF-16 source range');
}

function applyAssessment(run,assessment,context,asOf) {
  const state=context.state;
  validate('NewsAssessment',assessment);
  if(new Set([...run.event_ids,...assessment.new_events.map(event=>event.proposal_id)]).size>run.effective_config.config.news.max_events_to_verify)fail('BUDGET_EXHAUSTED','/new_events','Event verification limit exceeded');
  if (!Object.values(run.tickets).some(t=>t.execution_state === 'succeeded')) fail('MISSING_EVIDENCE','/assessment','Assessment requires actual tool returns');
  const idMap={};
  const resolve=(ref,kind)=>{
    const id=ref.kind === 'proposal' ? idMap[ref.id] : ref.id;
    if (!id || !(kind === 'event' ? state.events[id] : state.claims[id])) fail('MISSING_EVIDENCE',`/${kind}_ref`,'Assessment reference is not registered');
    return id;
  };
  for (const proposal of assessment.new_events) {
    if (idMap[proposal.proposal_id]) fail('INVALID_INPUT','/proposal_id','Proposal IDs must be unique');
    const event=structuredClone(proposal.data);
    if (!event.source_version_ids.length || event.source_version_ids.some(id=>!findSourceVersion(state,id))) fail('MISSING_EVIDENCE','/source_version_ids','Event sources must be registered before assessment');
    if (!event.event_time.source_ref || !event.source_version_ids.includes(event.event_time.source_ref)) fail('MISSING_EVIDENCE','/event_time/source_ref','Event time must refer to a supporting source version');
    const older=Object.values(state.events).find(item=>item.event_key === event.event_key);
    if(older&&['entity_name','action','object_name','version'].some(key=>older[key]!==event[key]))fail('RECEIPT_CONFLICT','/event_key','One event key cannot merge different entities, actions, objects or versions');
    if (older) { idMap[proposal.proposal_id]=older.event_id; for(const id of event.source_version_ids) if(!older.source_version_ids.includes(id))older.source_version_ids.push(id); }
    else {
      event.event_id=newId('event'); event.in_window=eventInWindow(event,run);
      validate('NewsEvent',event); state.events[event.event_id]=event; idMap[proposal.proposal_id]=event.event_id;
    }
    if (!run.event_ids.includes(idMap[proposal.proposal_id])) run.event_ids.push(idMap[proposal.proposal_id]);
  }
  for (const proposal of assessment.new_claims) {
    if (idMap[proposal.proposal_id]) fail('INVALID_INPUT','/proposal_id','Proposal IDs must be unique');
    const claim={...structuredClone(proposal.data),claim_id:newId('claim'),event_id:resolve(proposal.event_ref,'event')};
    if (!claim.source_version_ids.length || claim.source_version_ids.some(id=>!findSourceVersion(state,id))) fail('MISSING_EVIDENCE','/source_version_ids','External claims require read sources');
    if (!claim.locators?.length) fail('MISSING_EVIDENCE','/locators','A claim needs exact supporting text locations');
    for(const locator of claim.locators) { if(!claim.source_version_ids.includes(locator.source_version_id)) fail('MISSING_EVIDENCE','/locators','Locator source must be part of this claim'); verifyLocator(locator,state); }
    if (claim.conflicts.length && ['supported','attributed'].includes(claim.support_status)) fail('MISSING_EVIDENCE','/conflicts','Unresolved conflicts cannot pass the fact gate');
    validate('Claim',claim);state.claims[claim.claim_id]=claim;run.claim_ids.push(claim.claim_id);idMap[proposal.proposal_id]=claim.claim_id;
  }
  for(const item of assessment.event_assessments) {
    const event=state.events[resolve(item.event_ref,'event')];
    if (item.source_times) for (const times of item.source_times) {
      const source=findSourceVersion(state,times.source_version_id);
      if (!source || !event.source_version_ids.includes(times.source_version_id)) fail('MISSING_EVIDENCE','/source_times','Time evidence must identify an event source');
      for(const field of ['published_at','updated_at','event_at']) if(times[field]) { validate('TimeEvidence',times[field]); source[field]=structuredClone(times[field]); }
    }
    event.relevance_assessment={relevant:item.relevant,reason:item.assessment.reason,reviewer:item.assessment.reviewer,assessed_at:item.assessment.assessed_at};
    event.in_window=eventInWindow(event,run);
    if(item.region_assessment) {
      for(const locator of item.region_assessment.locators)verifyLocator(locator,state);
      const allowed=run.effective_config.config.news.event_regions;
      if(item.region_assessment.status==='matched'&&(!item.region_assessment.locators.length||!item.region_assessment.matched_regions.some(region=>allowed.includes(region))))fail('MISSING_EVIDENCE','/region_assessment','A regional match needs read source text and an allowed region');
      run.event_region_assessments??={};run.event_region_assessments[event.event_id]=structuredClone(item.region_assessment);
    }
    if (item.new_angle_or_update !== undefined) event.relevance_assessment.new_angle_or_update=item.new_angle_or_update;
  }
  for(const item of assessment.claim_assessments) {
    const id=resolve(item.claim_ref,'claim');
    if (item.support_status === 'invalidated' && (!item.source_version_ref || !findSourceVersion(state,item.source_version_ref))) fail('MISSING_EVIDENCE','/source_version_ref','A correction must identify a new actual source version');
    reviseClaimStatus(state,id,item.support_status,asOf,item.assessment.reason,item.source_version_ref ?? null);
    state.claims[id].assessment=structuredClone(item.assessment);
  }
  for(const item of [...assessment.rejected_candidates,...assessment.unresolved_candidates]) if(!run.candidates[item.candidate_id]) fail('MISSING_EVIDENCE','/candidate_id','Candidate assessment is not linked to a real discovery');
  for(const heat of assessment.heat_evidence) {
    validate('HeatEvidence',heat);
    if (heat.kind === 'unknown' && heat.value !== null) fail('INVALID_INPUT','/heat_evidence/value','Unknown heat is null, not zero');
    if (heat.kind !== 'unknown' && !heat.source_refs.length) fail('MISSING_EVIDENCE','/heat_evidence/source_refs','Observed heat needs an actual source');
    for (const ref of heat.source_refs) if (!state.sources[ref] && !findSourceVersion(state,ref) && !state.raw_receipts[ref]) fail('MISSING_EVIDENCE','/heat_evidence/source_refs','Heat source does not exist');
    if (heat.kind === 'counts' && heat.comparable && (!heat.window || !heat.query_or_scope)) fail('INVALID_INPUT','/heat_evidence','Comparable counts require a fixed query and complete window');
    if (!run.heat_evidence.some(h=>h.evidence_id === heat.evidence_id))run.heat_evidence.push(structuredClone(heat));
  }
  for(const item of assessment.ranking) resolve(item.event_ref,'event');
  run.assessments.push(structuredClone(assessment));run.phase='assess';
  return {id_map:idMap};
}

export function advanceNews(run,operation,payload,context) {
  if (run.phase === 'finalize') fail('STATE_CONFLICT','/phase','A finalized run is immutable; start a linked new run');
  const state=context.state;
  const asOf=context.as_of ?? (run.request.data_mode === 'fixture' ? run.started_at : new Date().toISOString());
  if(operation === 'plan') {
    const plan=validate('SearchPlan',payload.plan);
    if(plan.run_id !== run.run_id) fail('INVALID_INPUT','/plan/run_id','Plan belongs to another run');
    if(!run.plan)run.plan={...structuredClone(plan),tasks:[]};
    else if(canonicalHash(plan.required_coverage)!==canonicalHash(run.plan.required_coverage))fail('CONFIG_CONFLICT','/required_coverage','Required coverage cannot change after init');
    for(const task of plan.tasks) {
      checkTask(task,run,state);
      const old=run.plan.tasks.find(t=>t.logical_task_id === task.logical_task_id);
      if(old && canonicalHash(old)!==canonicalHash(task))fail('CONFIG_CONFLICT','/logical_task_id','A logical task cannot change its request');
      if(!old)run.plan.tasks.push(structuredClone(task));
    }
    return {plan:run.plan};
  }
  if(operation === 'reserve') {
    if(!run.plan)fail('MISSING_EVIDENCE','/plan','Register a search plan before issuing tickets');
    if(ms(asOf)>=ms(run.deadline_at))fail('BUDGET_EXHAUSTED','/deadline_at','Run deadline has passed; finish the acquired material');
    if(new Set(payload.logical_task_ids).size!==payload.logical_task_ids.length)fail('INVALID_INPUT','/logical_task_ids','Ticket batch contains duplicate tasks');
    const pending=Object.values(run.tickets).filter(t=>t.execution_state === 'reserved').length;
    if(pending+payload.logical_task_ids.length>3)fail('BUDGET_EXHAUSTED','/tickets','At most three independent network tasks may be in flight');
    const config=run.effective_config.config.news,budget=structuredClone(run.budget),tickets=[];
    for(const taskId of payload.logical_task_ids) {
      const task=run.plan.tasks.find(item=>item.logical_task_id === taskId);
      if(!task)fail('MISSING_EVIDENCE','/logical_task_ids','Task must be registered before reservation');
      checkTask(task,run,state);
      const attempts=Object.values(run.tickets).filter(t=>t.logical_task_id === taskId);
      if(attempts.some(t=>t.execution_state === 'reserved' || t.execution_state === 'succeeded'))fail('STATE_CONFLICT','/logical_task_id','Task is already pending or completed');
      if(attempts.length>=2)fail('BUDGET_EXHAUSTED','/attempt','At most one reasoned retry is supported');
      if(task.purpose === 'discover' && Object.keys(run.candidates).length>=config.max_candidate_urls)fail('BUDGET_EXHAUSTED','/candidates','Candidate limit reached; verification may continue');
      const key=task.operation === 'search'?'search_used':'read_used';
      const discoverKey=task.operation === 'search'?'discover_search_used':'discover_read_used';
      const total=task.operation === 'search'?config.max_queries:config.max_source_reads;
      const reserved=task.operation === 'search'?config.verification_queries_reserved:config.verification_reads_reserved;
      if(budget[key]>=total || (task.purpose === 'discover' && budget[discoverKey]>=total-reserved))fail('BUDGET_EXHAUSTED','/budget','The task would exceed the total budget or verification reserve');
      budget[key]++;if(task.purpose === 'discover')budget[discoverKey]++;
      tickets.push({ticket_id:newId('ticket'),run_id:run.run_id,logical_task_id:taskId,operation:task.operation,purpose:task.purpose,binding_id:run.binding_id,request:structuredClone(task.request),scope_refs:structuredClone(task.scope_refs),attempt:attempts.length+1,issued_at:iso(asOf),execution_state:'reserved'});
    }
    if(tickets.some(t=>t.purpose==='discover')) {
      if(!budget.discovery_rounds)budget.discovery_rounds=1;
      else if(['verify','assess'].includes(run.phase))budget.discovery_rounds++;
      if(budget.discovery_rounds>config.max_discovery_rounds)fail('BUDGET_EXHAUSTED','/max_discovery_rounds','Discovery round limit reached');
    }
    run.budget=budget;for(const ticket of tickets)run.tickets[ticket.ticket_id]=ticket;
    run.phase=tickets.some(t=>t.purpose!=='discover')?'verify':'discover';return {tickets};
  }
  if(operation === 'ingest') {
    const ticket=run.tickets[payload.ticket_id];
    if(!ticket)fail('MISSING_EVIDENCE','/ticket_id','Network result has no reserved ticket');
    const expectedTool=run.binding[ticket.operation].tool_name;
    if(payload.actual_call.tool_name!==expectedTool)fail('INVALID_INPUT','/actual_call/tool_name','Actual tool does not match this binding');
    const previous=Object.values(state.raw_receipts).find(r=>r.ticket_id===ticket.ticket_id);
    const hash=canonicalHash(payload.raw_object);
    if(previous) { if(previous.raw_hash!==hash)fail('RECEIPT_CONFLICT','/raw_result','Same ticket returned different raw material'); return {receipt_id:previous.receipt_id,idempotent:true}; }
    let result;
    try { result=ingestHostResult(ticket,payload.raw_object,payload.extractions,payload.actual_call); }
    catch(error) { if(!error.raw_receipt)throw error; result={raw_receipt:error.raw_receipt,text_blocks:[],extractions:[]}; }
    const receipt=result.raw_receipt;state.raw_receipts[receipt.receipt_id]=receipt;ticket.execution_state=receipt.status;
    if(receipt.error)run.errors.push(receipt.error);
    const created=[];
    for(const extraction of result.extractions) {
      if(!sourceAllowed(extraction.url,run.effective_config.config))continue;
      if(extraction.kind==='candidate') {
        const existing=Object.values(run.candidates).find(c=>c.url===extraction.url);
        if(existing){created.push(existing.candidate_id);continue;}
        if(Object.keys(run.candidates).length>=run.effective_config.config.news.max_candidate_urls)continue;
        const id=newId('candidate');run.candidates[id]={candidate_id:id,url:extraction.url,title:extraction.title,source_ref:extraction.source_ref,receipt_id:receipt.receipt_id,material_kind:extraction.material_kind,locator:{receipt_id:receipt.receipt_id,block_index:extraction.block_index,start:extraction.start,end:extraction.end},status:'discovered'};created.push(id);
      } else {
        const old=Object.values(state.sources).find(s=>s.record.kind==='public_page' && normalizeUrl(s.record.locator)===extraction.url);
        const sourceId=old?.record.source_id ?? newId('source');
        const unknown={raw:null,instant:null,timezone:null,precision:'unknown',source_ref:receipt.receipt_id};
        const observed={raw:payload.actual_call.returned_at,instant:iso(payload.actual_call.returned_at),timezone:'UTC',precision:'instant',source_ref:receipt.receipt_id};
        const version={source_id:sourceId,source_version_id:newId('source_version'),original_url:extraction.url,final_url:extraction.url,ticket_id:ticket.ticket_id,raw_receipt_ref:receipt.receipt_id,captured_text:extraction.captured_text,captured_text_hash:textHash(extraction.captured_text),material_kind:extraction.material_kind,read_status:'read',published_at:structuredClone(unknown),updated_at:structuredClone(unknown),event_at:structuredClone(unknown),observed_at:observed};
        const record=old?.record ?? {source_id:sourceId,kind:'public_page',locator:extraction.url,retrieved_at:iso(payload.actual_call.returned_at),description:extraction.title,metric_mapping:{},raw_material:{receipt_id:receipt.receipt_id}};
        saveSourceVersion(state,record,version,asOf);run.source_version_ids.push(version.source_version_id);created.push(version.source_version_id);
      }
    }
    return {receipt_id:receipt.receipt_id,created_refs:created,errors:receipt.error?[receipt.error]:[]};
  }
  if(operation === 'assess')return applyAssessment(run,payload.assessment,context,asOf);
  if(operation === 'finalize')return finishNews(run,payload,context,asOf);
  fail('INVALID_INPUT','/operation','Unknown news operation');
}

function finishNews(run,payload,context,asOf) {
  if(!run.plan)fail('MISSING_EVIDENCE','/plan','A result requires an explicit search plan');
  const state=context.state, config=run.effective_config.config.news;
  if(payload.cards.length>config.max_topic_cards || payload.draft_inputs.length>config.max_draft_variants)fail('BUDGET_EXHAUSTED','/cards','Output limits exceeded');
  if(new Set(payload.cards.map(c=>c.event_id)).size!==payload.cards.length)fail('INVALID_INPUT','/cards','One event may occupy at most one card');
  const cards=[];
  for(const proposal of payload.cards) {
    const card=structuredClone(proposal),event=state.events[card.event_id];validate('TopicCard',card);
    const inWindow=event?eventInWindow(event,run):null,decision=event?decisionForRun(run,event):null;
    if(!event || !run.event_ids.includes(event.event_id) || inWindow===null || (!inWindow&&!config.allow_out_of_window) || !decision?.relevant)fail('MISSING_EVIDENCE','/cards/event_id','Event fails time, source, relevance or scope gate');
    if(card.window_status!==(inWindow?'in_window':'out_of_window'))fail('INVALID_INPUT','/window_status','Card must describe this frozen run window');
    if(!run.effective_config.config.news.event_regions.includes('global')&&run.event_region_assessments?.[event.event_id]?.status!=='matched')fail('MISSING_EVIDENCE','/region_assessment','A region-limited task requires an explicit supported regional match; a query keyword is not evidence');
    if(event.event_kind==='old_resurfaced' && !decision.new_angle_or_update)fail('MISSING_EVIDENCE','/event_kind','Old events need an explicit new angle or development');
    if(!card.claim_ids.length)fail('MISSING_EVIDENCE','/cards/claim_ids','A news card needs at least one supported claim');
    for(const id of card.claim_ids) {
      const claim=state.claims[id];
      if(!claim || claim.event_id!==event.event_id || !['supported','attributed','inferred'].includes(claim.support_status))fail('MISSING_EVIDENCE','/cards/claim_ids','Card contains unverified or invalidated claims');
      for(const locator of claim.locators)verifyLocator(locator,state);
    }
    if(card.heat_evidence_ids.some(id=>!run.heat_evidence.some(h=>h.evidence_id===id)))fail('MISSING_EVIDENCE','/heat_evidence_ids','Card heat must link captured observations');
    const historical=Object.values(state.runs).filter(r=>r.run_id!==run.run_id&&r.card_ids?.length).some(r=>r.event_ids?.includes(event.event_id));
    if(historical && run.effective_config.config.history.previously_recommended==='require_new_angle_or_update' && !decision.new_angle_or_update)fail('MISSING_EVIDENCE','/event_id','Previously recommended event requires a new angle or update');
    cards.push(card);
  }
  const drafts=[];
  for(const input of payload.draft_inputs) {
    if(!cards.some(c=>c.card_id===input.card_id))fail('MISSING_EVIDENCE','/card_id','Draft must link a card selected by this run');
    const checked=checkDraft(input,{...context,effective_config:run.effective_config},asOf);
    saveDraft(state,checked.draft);drafts.push(checked);
  }
  for(const item of payload.coverage) {
    if(!run.plan.required_coverage.some(c=>c.coverage_id===item.coverage_id))fail('INVALID_INPUT','/coverage','Unknown coverage item');
    if(item.searched_ticket_ids.some(id=>run.tickets[id]?.operation!=='search'||run.tickets[id].execution_state!=='succeeded') || item.read_ticket_ids.some(id=>run.tickets[id]?.operation!=='read'||run.tickets[id].execution_state!=='succeeded'))fail('MISSING_EVIDENCE','/coverage','Coverage cannot claim failed or nonexistent calls');
    for(const id of [...item.searched_ticket_ids,...item.read_ticket_ids]) {
      const task=run.plan.tasks.find(task=>task.logical_task_id===run.tickets[id].logical_task_id);
      if(!task?.coverage_ids.includes(item.coverage_id))fail('MISSING_EVIDENCE','/coverage','A successful task cannot prove unrelated required coverage');
    }
    if(item.status==='completed'&&!item.searched_ticket_ids.length&&!item.read_ticket_ids.length)fail('MISSING_EVIDENCE','/coverage','Completed coverage needs real executed tasks');
  }
  run.coverage=structuredClone(payload.coverage);run.card_ids=cards.map(c=>c.card_id);run.cards=cards;
  run.draft_refs=drafts.map(d=>({draft_id:d.draft.draft_id,revision:d.draft.revision}));
  run.stop_reason=payload.stop_reason;run.phase='finalize';
  return {cards,draft_checks:drafts,run_result:finalizeRun(run,context)};
}

export function finalizeRun(run,context) {
  const tickets=Object.values(run.tickets),assessments=run.assessments;
  const required=run.plan?.required_coverage ?? [];
  const coverageDone=required.length>0 && required.every(c=>run.coverage.some(item=>item.coverage_id===c.coverage_id&&item.status==='completed'));
  const actualReturns=tickets.filter(t=>t.execution_state==='succeeded');
  const discovery=actualReturns.some(t=>t.purpose==='discover');
  const pending=tickets.some(t=>t.execution_state==='reserved'||t.execution_state==='unknown');
  const rejected=new Set(assessments.flatMap(a=>a.rejected_candidates.map(c=>c.candidate_id)));
  const readUrls=new Set(run.source_version_ids.map(id=>findSourceVersion(context.state,id)?.original_url));
  const unresolved=assessments.flatMap(a=>a.unresolved_candidates);
  const unknownCandidates=Object.values(run.candidates).filter(c=>!rejected.has(c.candidate_id)&&!readUrls.has(c.url));
  const hasCards=run.card_ids.length>0;
  const actualEmpty=discovery&&Object.keys(run.candidates).length===0;
  const excludedAll=Object.keys(run.candidates).length>0&&Object.keys(run.candidates).every(id=>rejected.has(id));
  const knownEmpty=(actualEmpty||excludedAll)&&!unresolved.some(c=>c.critical)&&!pending;
  const hasRequiredEvidence=hasCards?run.cards.every(card=>{
    const event=context.state.events[card.event_id],inWindow=event?eventInWindow(event,run):null;
    return event&&decisionForRun(run,event)?.relevant&&inWindow!==null&&(inWindow||run.effective_config.config.news.allow_out_of_window)&&card.claim_ids.length>0&&card.claim_ids.every(id=>['supported','attributed','inferred'].includes(context.state.claims[id]?.support_status));
  }):knownEmpty;
  const drafts=run.draft_refs.map(ref=>context.state.drafts[ref.draft_id]?.revisions[ref.revision]);
  const draftRequired=run.request.requested_outputs.includes('drafts')&&hasCards;
  const persistence=context.persistence_status==='saved';
  run.stage_results=[stage('plan',run.plan?'passed':'not_run',run.plan?[run.plan.plan_id]:[]),
    stage('discovery',discovery&&!pending?'passed':actualReturns.length?'failed':'blocked',actualReturns.map(t=>t.ticket_id),pending?'Pending or unknown network tasks remain':null),
    stage('coverage',coverageDone?'passed':'failed',run.coverage.map(c=>c.coverage_id)),
    stage('assessment',(assessments.length||actualEmpty)&&(!unresolved.some(c=>c.critical))&&(run.effective_config.config.news.event_regions.includes('global')||run.card_ids.every(id=>{const card=run.cards.find(card=>card.card_id===id);return run.event_region_assessments?.[card.event_id]?.status==='matched';}))?'passed':'failed',run.event_ids),
    stage('persistence',persistence?'passed':'not_run',[],persistence?null:'Current state needs an actual save receipt')];
  if(hasCards)run.stage_results.push(stage('evidence',hasRequiredEvidence?'passed':'failed',run.cards.flatMap(card=>card.claim_ids)),stage('cards',hasRequiredEvidence?'passed':'failed',run.card_ids));
  if(draftRequired)run.stage_results.push(stage('semantic_review',drafts.length&&drafts.every(d=>d?.validity==='ready')?'passed':'failed',run.draft_refs.map(r=>r.draft_id)),stage('length_check',drafts.length&&drafts.every(d=>d?.length_checks.every(c=>c.valid))?'passed':'failed'));
  const limitations=[];
  limitations.push(...run.coverage.flatMap(item=>item.limitations));
  if(unknownCandidates.length)limitations.push(`${unknownCandidates.length} unread candidates remain; unresolved leads are not proof of no news`);
  if(unresolved.length)limitations.push(...unresolved.map(c=>c.reason));
  const requestedScope={requested_outputs:run.request.requested_outputs,required_coverage:required};
  const summary=summarizeRun(run.stage_results,requestedScope,{run_id:run.run_id,intent:'news',effective_config_hash:run.config_hash,as_of:run.cutoff_at,
    delivered_scope:{cards:run.card_ids.length,drafts:run.draft_refs.length},deliverable_refs:[...run.card_ids,...run.draft_refs.map(d=>`${d.draft_id}:${d.revision}`)],limitations,stop_reason:run.stop_reason,persistence_status:context.persistence_status??'unverified',
    has_findings:hasCards,definitive_no_findings:knownEmpty,core_blocked:!discovery});
  run.execution_status=summary.execution_status;run.result_kind=summary.result_kind;run.final_result=summary;
  return summary;
}
