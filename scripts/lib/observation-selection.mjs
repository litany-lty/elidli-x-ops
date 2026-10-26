import { Temporal } from '@js-temporal/polyfill';
import { canonicalHash, ContractError } from './contracts.mjs';
import { METRIC_DEFINITIONS, buildObservationIndex, compatibilityKey } from './metrics.mjs';
import { resolvePostIdentity } from './post-identity.mjs';
import { resolvePostMetadataView } from './imports.mjs';

const fail=(code,path,message)=>{throw new ContractError(code,path,message,false);};
const values=value=>Object.values(value??{});
const instant=value=>{try{return Temporal.Instant.from(value);}catch{fail('INVALID_INPUT','/as_of','Expected an ISO instant with offset');}};
const date=value=>{try{return Temporal.PlainDate.from(value);}catch{fail('INVALID_INPUT','/window','Expected an ISO calendar date');}};

export function calendarEndExclusive(inclusiveDate) { return date(inclusiveDate).add({days:1}).toString(); }

function observationRef(snapshot,key){return`${snapshot.snapshot_id}:${key}`;}
function observedMetric(snapshot,requirement){return Object.entries(snapshot.metrics??{}).find(([,metric])=>metric.definition_id===requirement.definition_id);}
function normalizedPeriod(period){return period?{start:period.start??null,end_exclusive:period.end_exclusive??null,timezone:period.timezone??null,source_date_start:period.source_date_start??null,source_date_end_inclusive:period.source_date_end_inclusive??null,raw_period_label:period.raw_period_label??null,completeness:period.completeness??'unknown'}:null;}
function periodMatches(snapshot,window) {
  const instantWindow=window.start!==null&&window.start!==undefined||window.end_exclusive!==null&&window.end_exclusive!==undefined;
  const calendarWindow=Boolean(window.source_date_start||window.source_date_end_inclusive);
  if(instantWindow&&calendarWindow)return false;
  if(instantWindow){if(!window.start||!window.end_exclusive)return false;return snapshot.period?.start===window.start&&snapshot.period?.end_exclusive===window.end_exclusive;}
  if(!window.source_date_start||!window.source_date_end_inclusive)return false;
  const p=snapshot.period;if(!p?.source_date_start)return false;
  return Boolean(p.source_date_end_inclusive)&&p.source_date_start>=window.source_date_start&&p.source_date_end_inclusive<=window.source_date_end_inclusive;
}
function scopeCompatible(snapshot,scope) {
  return (!scope.distribution||snapshot.distribution===scope.distribution)&&(!scope.surface||snapshot.surface===scope.surface)&&(!scope.aggregation_basis||snapshot.aggregation_basis===scope.aggregation_basis);
}

/** One deterministic selector shared by analysis, coaching, review and experiments. */
export function selectMetricObservations(state,{scope,window,metric_requirements,as_of,role='target',selection_policy_version='observation-selection-v3'}={}) {
  if(!['target','baseline','background','excluded'].includes(role))fail('INVALID_INPUT','/role','Unknown evidence role');
  if(!window||!['period','age_window'].includes(window.kind))fail('INVALID_INPUT','/window/kind','Window must be period or age_window');
  const cutoff=instant(as_of),aliases=state.post_aliases??{},entities=state.post_entities??{},versions=state.post_versions??{};
  const rawKeys=scope.entity_keys??[];
  const entityKeys=[...new Set(rawKeys.map(key=>scope.entity_type==='post'?resolvePostIdentity(key,aliases,{entities}).canonical_key:key))].sort();
  const requirements=(metric_requirements??[]).map(item=>typeof item==='string'?{definition_id:item}:item);
  for(const req of requirements)if(!METRIC_DEFINITIONS[req.definition_id]&&!String(req.definition_id).startsWith('legacy.v1.'))fail('METRIC_DEFINITION_UNRESOLVED','/metric_requirements',`Unknown metric definition: ${req.definition_id}`);
  const selected=[],excluded=[],pending=new Set(),missing=new Set(),conflicts=new Set(),fulfilled=new Set(),partial=new Set();
  const snapshots=values(state.snapshots_v2).filter(snapshot=>snapshot.entity_type===scope.entity_type);
  const indexedSnapshots=snapshots.map(snapshot=>snapshot.entity_type==='post'?{...snapshot,entity_id:resolvePostIdentity(snapshot.entity_id,aliases,{entities}).canonical_key}:snapshot);
  const index=buildObservationIndex(indexedSnapshots,{version:selection_policy_version});
  const conflictRefs=new Set(index.conflicts.flatMap(item=>item.observation_refs));
  const selectedRefs=new Set([...index.selected.values()].map(item=>observationRef(item.snapshot,item.metric_key)));
  const supersededRefs=new Set(index.superseded_observation_refs);
  for(const entityKey of entityKeys)for(const requirement of requirements){
    const requirementKey=`${entityKey}:${requirement.definition_id}`;
    const version=scope.entity_type==='post'?versions[entities[entityKey]?.current_version_ref]:null,createdView=version?resolvePostMetadataView(state,version.post_version_id,'created_at'):null,createdValue=createdView?.status==='confirmed'?createdView.value:null;
    const createdAt=createdValue?instant(createdValue):null;
    if(window.kind==='period'&&window.end_exclusive&&Temporal.Instant.compare(cutoff,instant(window.end_exclusive))<0){pending.add(`${entityKey}:${requirement.definition_id}`);continue;}
    if(window.kind==='age_window'&&!createdAt){missing.add(`${entityKey}:${requirement.definition_id}`);continue;}
    if(window.kind==='age_window'&&Temporal.Instant.compare(cutoff,createdAt.add({hours:window.target_hours+window.tolerance_hours}))<0){pending.add(`${entityKey}:${requirement.definition_id}`);continue;}
    const candidates=[];
    for(const snapshot of snapshots){
      const canonical=snapshot.entity_type==='post'?resolvePostIdentity(snapshot.entity_id,aliases,{entities}).canonical_key:snapshot.entity_id;
      if(canonical!==entityKey)continue;
      const pair=observedMetric(snapshot,requirement);if(!pair)continue;const [metricKey,metric]=pair,ref=observationRef(snapshot,metricKey);
      if(snapshot.observed_at&&Temporal.Instant.compare(instant(snapshot.observed_at),cutoff)>0){excluded.push({observation_ref:ref,reason:'after_cutoff'});continue;}
      if(!scopeCompatible(snapshot,scope)){excluded.push({observation_ref:ref,reason:'scope_mismatch'});continue;}
      if(supersededRefs.has(ref)){excluded.push({observation_ref:ref,reason:'superseded'});continue;}
      if(conflictRefs.has(ref)){conflicts.add(`${entityKey}:${requirement.definition_id}`);excluded.push({observation_ref:ref,reason:'conflict'});continue;}
      if(!selectedRefs.has(ref)){excluded.push({observation_ref:ref,reason:'equivalent_not_selected'});continue;}
      if(metric.availability!=='observed'||metric.value===null){excluded.push({observation_ref:ref,reason:metric.availability});continue;}
      if(window.kind==='period'&&!periodMatches(snapshot,window)){excluded.push({observation_ref:ref,reason:'period_mismatch'});continue;}
      if(window.kind==='age_window'){
        if(!snapshot.observed_at){excluded.push({observation_ref:ref,reason:'observed_at_unknown'});continue;}
        const age=Number(instant(snapshot.observed_at).epochMilliseconds-createdAt.epochMilliseconds)/3_600_000;
        if(Math.abs(age-window.target_hours)>window.tolerance_hours){excluded.push({observation_ref:ref,reason:'age_window_mismatch'});continue;}
        candidates.push({snapshot,metricKey,metric,ref,distance:Math.abs(age-window.target_hours)});continue;
      }
      const exactCalendar=window.source_date_start&&snapshot.period?.source_date_start===window.source_date_start&&snapshot.period?.source_date_end_inclusive===window.source_date_end_inclusive;
      const exactInstant=window.start!==null&&window.start!==undefined&&snapshot.period?.start===window.start&&snapshot.period?.end_exclusive===window.end_exclusive;
      candidates.push({snapshot,metricKey,metric,ref,distance:exactCalendar||exactInstant?0:1});
    }
    candidates.sort((a,b)=>a.distance-b.distance||String(b.snapshot.observed_at??'').localeCompare(String(a.snapshot.observed_at??''))||a.ref.localeCompare(b.ref));
    if(candidates.length){
      let chosen=[];
      if(window.kind==='period'){
        const exact=candidates.filter(item=>item.distance===0);
        if(exact.length){chosen=[exact[0]];if(exact[0].snapshot.period?.completeness!=='complete')partial.add(requirementKey);}
        else {
          const definition=METRIC_DEFINITIONS[requirement.definition_id],days=new Map();
          for(const item of candidates){const p=item.snapshot.period,single=Boolean(p?.source_date_start&&p.source_date_start===p.source_date_end_inclusive);if(!single){excluded.push({observation_ref:item.ref,reason:'overlapping_or_non_daily_period'});continue;}if(!days.has(p.source_date_start))days.set(p.source_date_start,item);else excluded.push({observation_ref:item.ref,reason:'overlapping_day'});}
          chosen=definition?.additivity==='additive_nonoverlap'?[...days.values()].sort((a,b)=>a.snapshot.period.source_date_start.localeCompare(b.snapshot.period.source_date_start)):[candidates[0]];
          if(window.source_date_start&&window.source_date_end_inclusive){const expected=date(window.source_date_start).until(date(window.source_date_end_inclusive)).days+1;if(chosen.length!==expected)partial.add(requirementKey);}
        }
      } else chosen=[candidates[0]];
      if(chosen.some(item=>item.snapshot.period?.completeness&&item.snapshot.period.completeness!=='complete'))partial.add(requirementKey);
      for(const item of chosen){const postVersionRef=item.snapshot.entity_type==='post'?(item.snapshot.post_version_ref??null):null;selected.push({observation_ref:item.ref,observation_hash:canonicalHash({snapshot:item.snapshot,metric:item.metric}),entity_key:entityKey,metric_definition_id:requirement.definition_id,value:item.metric.value,unit:item.metric.unit,precision:item.metric.precision,compatibility_key:compatibilityKey(item.snapshot,item.metricKey),observed_at:item.snapshot.observed_at,period:normalizedPeriod(item.snapshot.period),distribution:item.snapshot.distribution,surface:item.snapshot.surface,aggregation_basis:item.snapshot.aggregation_basis,post_version_ref:postVersionRef,content_attribution:postVersionRef?'confirmed':'unknown'});}
      if(chosen.length)fulfilled.add(requirementKey);
      const chosenRefs=new Set(chosen.map(item=>item.ref));for(const other of candidates)if(!chosenRefs.has(other.ref)&&!excluded.some(item=>item.observation_ref===other.ref))excluded.push({observation_ref:other.ref,reason:'not_selected'});
    }
    else if(!pending.has(`${entityKey}:${requirement.definition_id}`)&&!conflicts.has(`${entityKey}:${requirement.definition_id}`))missing.add(`${entityKey}:${requirement.definition_id}`);
  }
  const eligible_n=entityKeys.length*requirements.length,valid_n=fulfilled.size,coverage={eligible_n,selected_n:selected.length,valid_n,missing_n:missing.size,pending_n:pending.size,conflicting_n:conflicts.size,missing_keys:[...missing].sort(),pending_keys:[...pending].sort(),conflicting_keys:[...conflicts].sort()};
  const completeness=eligible_n>0&&valid_n===eligible_n&&!partial.size?'complete':valid_n>0?'partial':'unknown';
  const limitations=[...(missing.size?['Requested observations are missing']:[]),...(pending.size?['Some entities have not reached the planned window']:[]),...(conflicts.size?['Conflicting observations were excluded']:[])];
  const base={contract_version:3,role,scope:{...scope,entity_keys:entityKeys},window:structuredClone(window),selected,excluded:excluded.sort((a,b)=>a.observation_ref.localeCompare(b.observation_ref)||a.reason.localeCompare(b.reason)),coverage,completeness,selection_policy_version,limitations};
  return{...base,selection_hash:canonicalHash(base)};
}

export function evaluateDeliverableCoverage(request,selection,sourceCoverage={}) {
  const requested=new Set(request?.entity_keys??selection.scope.entity_keys),requirements=(request?.metric_requirements??[]).map(item=>typeof item==='string'?item:item.definition_id),coveredPairs=new Set(selection.selected.map(item=>`${item.entity_key}:${item.metric_definition_id}`)),covered=new Set(selection.selected.map(item=>item.entity_key));
  const actualComplete=sourceCoverage.completeness==='complete'||sourceCoverage.status==='complete';
  const scoped=requested.size>0&&[...requested].every(key=>covered.has(key)&&requirements.every(metric=>coveredPairs.has(`${key}:${metric}`)));
  const scopeLimitation=!actualComplete?(request?.mode==='explicit_entities'?'The explicit entity scope is complete; full-account coverage remains unverified':'Collection coverage is not complete'):null;
  return {status:scoped&&(actualComplete||request?.mode==='explicit_entities')?'complete':covered.size?'partial':'unknown',requested_n:requested.size,covered_n:covered.size,source_completeness:sourceCoverage.completeness??'unknown',limitations:[...selection.limitations,...(scopeLimitation?[scopeLimitation]:[])]};
}

export function computeComparison(current,baseline,{method='descriptive'}={}) {
  const currentKeys=new Set(current.selected.map(item=>item.compatibility_key)),baselineKeys=new Set(baseline.selected.map(item=>item.compatibility_key));
  const compatible=currentKeys.size===1&&baselineKeys.size===1&&[...currentKeys][0]===[...baselineKeys][0]&&current.completeness==='complete'&&baseline.completeness==='complete';
  const sum=selection=>selection.selected.reduce((total,item)=>total+item.value,0),currentValue=current.selected.length?sum(current):null,baselineValue=baseline.selected.length?sum(baseline):null;
  const base={contract_version:3,method,current_selection_hash:current.selection_hash,baseline_selection_hash:baseline.selection_hash,current_value:currentValue,baseline_value:baselineValue,absolute_delta:compatible?currentValue-baselineValue:null,relative_delta:compatible&&baselineValue!==0?(currentValue-baselineValue)/baselineValue:null,comparability:compatible?'compatible':currentValue!==null&&baselineValue!==null?'incompatible':'insufficient',reasons:compatible?[]:['scope_or_coverage_incompatible']};
  return{...base,comparison_hash:canonicalHash(base)};
}
