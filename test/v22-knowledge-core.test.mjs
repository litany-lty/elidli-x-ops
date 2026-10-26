import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalHash, ContractError, validate } from '../scripts/lib/contracts.mjs';
import {
  TRI, applicationProposalHash, buildRuleContextV4, evaluatePredicate,
  activateKnowledgeCatalog, catalogContentHash, knowledgeBundleFromState,
  loadKnowledgeCatalog, proposeKnowledgeUpdate,
  ruleContextHash, validateRuleApplication
} from '../scripts/lib/knowledge.mjs';
import {
  evaluateCurrentDeliverable, guidanceOutputContentHash, guidanceReviewSubjectHash,
  validateGuidanceOutput, validateGuidanceReceipt
} from '../scripts/lib/guidance.mjs';

const packageDir = new URL('../assets/algorithm-knowledge', import.meta.url).pathname;
const H = value => canonicalHash(value);

test('A-K01 installed package verifies exact offline bytes and does not hide damage', () => {
  const bundle = loadKnowledgeCatalog();
  assert.equal(Object.keys(bundle.facts).length, 30);
  assert.equal(Object.keys(bundle.rules).length, 10);
  assert.equal(bundle.catalog.dependencies.length, 110);
  assert.doesNotThrow(() => validate('RuleCatalogSnapshotV4', bundle.catalog));
  assert.equal(bundle.dependencies.length, 110);
  assert.equal(bundle.catalog.coverage.public_scope_status, 'public_scope_complete');
  assert.deepEqual(bundle.catalog.coverage.unreviewed_public_dependency_ids, []);
  assert(bundle.catalog.coverage.external_unpublished_dependency_ids.includes('external:hidden_label_classifiers'));
  assert(bundle.catalog.coverage.external_unpublished_dependency_ids.includes('external:limited_actions_policy_config'));
  assert.equal(bundle.dependencies.filter(item => item.source_visibility !== 'external_unpublished').every(item => item.evidence_material_path && item.evidence_content_hash), true);
  assert.equal(bundle.dependencies.find(item => item.dependency_id === 'selector:TopKScoreSelector').path, 'home-mixer/selectors/top_k_score_selector.rs');
  assert(bundle.facts[`fact-c16-6258a1549ef8-timefix1`]);
  assert(bundle.facts[`fact-c19-6258a1549ef8-timefix1`]);
  assert(bundle.rules['operational-op08-v3']);
  assert(bundle.rules['operational-op09-v3']);
  const temp = mkdtempSync(join(tmpdir(), 'xops-knowledge-'));
  try {
    cpSync(packageDir, temp, { recursive: true });
    writeFileSync(join(temp, 'source-snapshots/excerpts/sc01.txt'), Buffer.concat([readFileSync(join(temp, 'source-snapshots/excerpts/sc01.txt')), Buffer.from('\ntampered')]));
    assert.throws(() => loadKnowledgeCatalog(temp), error => error instanceof ContractError && error.code === 'MISSING_EVIDENCE');
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

function knowledgeState(bundle = loadKnowledgeCatalog()) {
  return {schema_version:4,knowledge_artifacts:structuredClone(bundle.artifacts),knowledge_catalogs:{[bundle.catalog.catalog_id]:structuredClone(bundle.catalog)},knowledge_events:{[bundle.event.event_id]:structuredClone(bundle.event)},operational_rules:structuredClone(bundle.rules),rule_versions_v2:structuredClone(bundle.facts)};
}

test('active state bundle is derived from one activation chain and never falls back to bundled files', () => {
  const state = knowledgeState(), active = knowledgeBundleFromState(state);
  assert.equal(active.catalog.catalog_id, 'x-algorithm-public-v4');
  assert.equal(active.rules['operational-op09-v3'].rule_id, 'OP09');
  state.knowledge_events.candidate={contract_version:4,event_id:'candidate',event_type:'candidate_update',catalog_ref:active.catalog.catalog_id,prior_catalog_ref:active.catalog.catalog_id,checked_at:'2026-10-27T01:00:00Z',observed_head_commit:active.catalog.upstream.commit,affected_rule_version_refs:[],gaps:[]};
  assert.equal(knowledgeBundleFromState(state).event.event_id, active.event.event_id);
  const nextCatalog={...structuredClone(active.catalog),catalog_id:'x-algorithm-next-fixture',catalog_version:'1.2.0'};nextCatalog.catalog_content_hash=catalogContentHash(nextCatalog,nextCatalog.dependencies);state.knowledge_catalogs[nextCatalog.catalog_id]=nextCatalog;
  state.knowledge_events.activated3={contract_version:4,event_id:'activated3',event_type:'activated',catalog_ref:nextCatalog.catalog_id,prior_catalog_ref:active.catalog.catalog_id,checked_at:'2026-10-27T02:00:00Z',observed_head_commit:nextCatalog.upstream.commit,affected_rule_version_refs:[],gaps:active.event.gaps,review_receipt_ref:'review-3'};
  assert.equal(knowledgeBundleFromState(state).catalog.catalog_id,nextCatalog.catalog_id);
});

test('active state bundle rejects ambiguous events, hash drift and unsupported gaps', () => {
  const state=knowledgeState(),bundle=knowledgeBundleFromState(state);
  const ambiguous=structuredClone(state),other={...structuredClone(bundle.catalog),catalog_id:'unrelated'};other.catalog_content_hash=catalogContentHash(other,other.dependencies);ambiguous.knowledge_catalogs.unrelated=other;ambiguous.knowledge_events.other={...structuredClone(bundle.event),event_id:'other',catalog_ref:'unrelated',prior_catalog_ref:null};
  assert.throws(()=>knowledgeBundleFromState(ambiguous),/one active catalog event/);
  const drift=structuredClone(state);drift.knowledge_catalogs[bundle.catalog.catalog_id].dependencies[0].review_note+=' changed';assert.throws(()=>knowledgeBundleFromState(drift),/dependency snapshot hash mismatch/);
  const missing=structuredClone(state);delete missing.operational_rules['operational-op09-v3'];assert.throws(()=>knowledgeBundleFromState(missing),/operational rule is missing/);
  const gap=structuredClone(state);gap.knowledge_events[bundle.event.event_id].gaps.push('not-a-dependency');assert.throws(()=>knowledgeBundleFromState(gap),/unsupported gap/);
  const legacy=structuredClone(state);delete legacy.knowledge_catalogs[bundle.catalog.catalog_id].dependencies;assert.throws(()=>knowledgeBundleFromState(legacy),/lacks its immutable dependency snapshot/);
});

test('A-K03 tri-state DSL distinguishes missing, zero and false and rejects units or code', () => {
  const registry = { n: { type: 'number', unit: 'count' }, flag: { type: 'boolean', unit: 'flag' } };
  assert.equal(evaluatePredicate({ eq: { signal: 'n', value: 0, unit: 'count' } }, { n: { value: 0, unit: 'count' } }, registry).status, TRI.TRUE);
  assert.equal(evaluatePredicate({ eq: { signal: 'flag', value: false, unit: 'flag' } }, { flag: { value: false, unit: 'flag' } }, registry).status, TRI.TRUE);
  assert.equal(evaluatePredicate({ not: { eq: { signal: 'n', value: 0, unit: 'count' } } }, {}, registry).status, TRI.UNKNOWN);
  assert.throws(() => evaluatePredicate({ eq: { signal: 'n', value: 0, unit: 'ratio' } }, { n: { value: 0, unit: 'count' } }, registry), /requires unit count/);
  assert.throws(() => evaluatePredicate({ javascript: 'process.exit()' }, {}, registry), /allowed operator/);
});

test('A-K02 every dependency has a strict disposition and offline review evidence or an explicit unpublished gap', () => {
  const bundle = loadKnowledgeCatalog();
  for (const dependency of bundle.dependencies) assert.doesNotThrow(() => validate('KnowledgeDependencyV4', dependency), dependency.dependency_id);
  assert.equal(bundle.dependencies.filter(item => ['public', 'partially_public'].includes(item.source_visibility) && item.review_depth === 'entry_only').length, 0);
  const limited = bundle.dependencies.find(item => item.dependency_id === 'action_consumer:LimitedActionsPolicies');
  assert.equal(limited.source_visibility, 'partially_public');
  assert.deepEqual(limited.missing_dependencies, ['external:limited_actions_policy_config']);
  const bundledCoverage = readFileSync(new URL('../assets/algorithm-knowledge/references/algorithm-coverage.md', import.meta.url), 'utf8');
  const publicCoverage = readFileSync(new URL('../references/algorithm-coverage.md', import.meta.url), 'utf8');
  assert.equal(publicCoverage, bundledCoverage);
  assert.match(publicCoverage, /110 项依赖/);
});

test('A-K09 every operational rule replays applicable, not-applicable and unknown cases', () => {
  const bundle = loadKnowledgeCatalog();
  for (const rule of Object.values(bundle.rules)) for (const replay of rule.replay_cases) {
    assert.equal(evaluatePredicate(rule.editorial_predicate, replay.signals, bundle.signal_registry).status, replay.expected, `${rule.rule_id}/${replay.case_id}`);
  }
});

function contextFixture(bundle) {
  return buildRuleContextV4({
    run_id: 'run-1', intent: 'draft', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance',
    subject_ref: 'draft:1', cutoff: '2026-10-27T00:00:00Z', surface: 'home_for_you', post_type: 'original',
    personal_context_selection_ref: 'selection-1', personal_context_selection_hash: H('personal'),
    evidence_bundle_ref: 'bundle-1', evidence_bundle_hash: H('bundle'),
    explicit_rule_version_refs: ['operational-op01-v1'],
    signals: { has_body: { value: true, unit: 'flag' }, reader_benefit_clear: { value: false, unit: 'flag' } }
  }, bundle);
}

test('A-K04/A-K05 selection applies editorial evidence without upgrading unknown mechanism', () => {
  const bundle = loadKnowledgeCatalog(), context = contextFixture(bundle);
  assert.deepEqual(context.selections.map(item => item.rule_version_ref), ['operational-op01-v1']);
  assert.equal(context.selections[0].mechanism_applicability.status, 'unknown');
  assert.equal(context.selections[0].editorial_applicability.status, 'applicable');
  assert.equal(ruleContextHash(context), context.selected_rule_context_hash);
  const unrelated = structuredClone(bundle); unrelated.catalog = { ...unrelated.catalog, created_at: '2026-10-27T01:00:00Z' };
  assert.equal(buildRuleContextV4({ ...context, context_id: context.context_id, signals: { has_body: { value: true, unit: 'flag' }, reader_benefit_clear: { value: false, unit: 'flag' } } }, unrelated).selected_rule_context_hash, context.selected_rule_context_hash);
});

function applicationFixture(context) {
  const application = {
    contract_version: 4, application_id: 'application-1', context_ref: context.context_id,
    selected_rule_context_hash: context.selected_rule_context_hash, subject_ref: 'draft:1', actual_input_hash: H('actual draft'),
    rule_version_refs: ['operational-op01-v1'],
    checks: [{ check_id: 'reader-benefit', check_type: 'semantic', status: 'applicable', reviewed_input_hash: H('actual draft'), inspected_refs: ['draft:1'], finding: '开头未说明读者收益' }],
    findings: ['开头未说明读者收益'], actions: [{ action_id: 'rewrite-opening', rule_version_ref: 'operational-op01-v1', disposition: 'modify', text: '明确目标读者和收益', deliverable_refs: ['draft:1'] }],
    keep_unchanged_reason: null, validation_plan: '核对开头与正文兑现', deliverable_refs: ['draft:1'], application_proposal_hash: ''
  };
  application.application_proposal_hash = applicationProposalHash(application);
  return application;
}

test('A-K06 application binds actual semantic input and frozen proposal', () => {
  const bundle = loadKnowledgeCatalog(), context = contextFixture(bundle), application = applicationFixture(context);
  assert.doesNotThrow(() => validateRuleApplication(application, context, bundle));
  assert.throws(() => validateRuleApplication({ ...application, actual_input_hash: H('changed') }, context, bundle), /actual input|proposal hash/);
  const empty={...structuredClone(application),rule_version_refs:[],actions:[],keep_unchanged_reason:'未使用任何规则'};empty.application_proposal_hash=applicationProposalHash(empty);
  assert.throws(()=>validateRuleApplication(empty,context,bundle),/cannot be recorded as applied without an actual rule/);
  const wrongAction={...structuredClone(application),actions:[{...application.actions[0],rule_version_ref:'operational-op02-v1'}]};wrongAction.application_proposal_hash=applicationProposalHash(wrongAction);
  assert.throws(()=>validateRuleApplication(wrongAction,context,bundle),/not actually selected and applied/);
  const noSelection=buildRuleContextV4({run_id:'run-none',intent:'draft',goal:{primary_goal:'relevant_reach'},use:'operational_guidance',subject_ref:'draft:1',cutoff:'2026-10-27T00:00:00Z',explicit_rule_version_refs:['not-a-rule'],signals:{}},bundle);
  const bounded={...structuredClone(application),context_ref:noSelection.context_id,selected_rule_context_hash:noSelection.selected_rule_context_hash,rule_version_refs:[],actions:[],keep_unchanged_reason:'当前范围没有选中规则，只保留一般编辑边界'};bounded.application_proposal_hash=applicationProposalHash(bounded);
  assert.doesNotThrow(()=>validateRuleApplication(bounded,noSelection,bundle));
});

function guidanceFixture() {
  const bundle = loadKnowledgeCatalog(), context = contextFixture(bundle), application = applicationFixture(context);
  const output = { contract_version: 4, output_id: 'guidance-1', delivery_id: 'delivery-1', goal: context.goal, use: context.use, guidance_text: '先把开头改成“给正在选工具的人：三步避开误区”。原因是当前开头没有说明读者收益。发布后按同一窗口观察目标读者的有效回复；目前缺少内部推荐条件。', actions: ['重写开头'], rationale: ['读者收益不清楚'], observation_plan: ['同一窗口观察有效回复'], gaps: ['内部推荐条件未知'], deliverable_refs: ['draft:1'], generator_ref: 'writer-1', output_content_hash: '', created_at: '2026-10-27T00:01:00Z' };
  output.output_content_hash = guidanceOutputContentHash(output);
  const subject = { ref: 'draft:1', content_hash: application.actual_input_hash };
  const binding = { delivery_id: output.delivery_id, subject_ref: subject.ref, subject_content_hash: subject.content_hash, output_material_ref: output.output_id, output_content_hash: output.output_content_hash, personal_context_selection_hash: context.personal_context_selection_hash, personal_context_absence_reason: context.personal_context_absence_reason, selected_rule_context_hash: context.selected_rule_context_hash, application_ref: application.application_id, application_proposal_hash: application.application_proposal_hash };
  const reviewSubject = guidanceReviewSubjectHash(binding);
  const actual = { receipt_id: 'actual-review-1', subject_hash: reviewSubject, generator_ref: 'reviewer-1', decision: 'approved', checks: { action_matches: true, evidence_bounded: true }, issues: [] };
  const receipt = { contract_version: 4, receipt_id: 'guidance-receipt-1', ...binding, review_subject_hash: reviewSubject, actual_review_receipt_ref: actual.receipt_id, decision: actual.decision, checks: actual.checks, issues: actual.issues, reviewed_at: '2026-10-27T00:02:00Z', supersedes_receipt_ref: null };
  return { bundle, context, application, output, subject, actual, receipt };
}

function reboundGuidance(x,{checks={action_matches:true,evidence_bounded:true},issues=[],decision='approved'}={}){
  const binding={delivery_id:x.output.delivery_id,subject_ref:x.subject.ref,subject_content_hash:x.subject.content_hash,output_material_ref:x.output.output_id,output_content_hash:x.output.output_content_hash,personal_context_selection_hash:x.context.personal_context_selection_hash,personal_context_absence_reason:x.context.personal_context_absence_reason,selected_rule_context_hash:x.context.selected_rule_context_hash,application_ref:x.application.application_id,application_proposal_hash:x.application.application_proposal_hash},reviewSubject=guidanceReviewSubjectHash(binding);
  const actual={receipt_id:'actual-review-rebound',subject_hash:reviewSubject,generator_ref:'reviewer-2',decision,checks,issues},receipt={contract_version:4,receipt_id:'guidance-receipt-rebound',...binding,review_subject_hash:reviewSubject,actual_review_receipt_ref:actual.receipt_id,decision,checks,issues,reviewed_at:'2026-10-27T00:03:00Z',supersedes_receipt_ref:null};return{actual,receipt};
}

test('A-K06/A-K07 full guidance text and independent review are exact and non-circular', () => {
  const x = guidanceFixture();
  assert.doesNotThrow(() => validateGuidanceOutput(x.output));
  assert.doesNotThrow(() => validateGuidanceReceipt(x.receipt, { output: x.output, application: x.application, context: x.context, subject: x.subject, actualReviewReceipt: x.actual }));
  assert.throws(() => validateGuidanceReceipt({ ...x.receipt, decision: 'revision_required' }, { output: x.output, application: x.application, context: x.context, subject: x.subject, actualReviewReceipt: x.actual }), /differs from actual review/);
  assert.throws(() => validateGuidanceReceipt(x.receipt, { output: { ...x.output, guidance_text: '只保存摘要' }, application: x.application, context: x.context, subject: x.subject, actualReviewReceipt: x.actual }), /complete output/);
});

test('guidance approval binds goal, use, subject, applied deliverables and substantive checks',()=>{
  const base=guidanceFixture();
  for(const changed of [
    {...base,output:{...base.output,goal:{primary_goal:'conversion'}}},
    {...base,output:{...base.output,use:'topic_selection'}},
    {...base,subject:{ref:'draft:other',content_hash:base.subject.content_hash}},
    {...base,subject:{...base.subject,content_hash:H('changed subject')}},
    {...base,output:{...base.output,deliverable_refs:['draft:other']}}
  ]){
    changed.output.output_content_hash=guidanceOutputContentHash(changed.output);const review=reboundGuidance(changed);
    assert.throws(()=>validateGuidanceReceipt(review.receipt,{output:changed.output,application:changed.application,context:changed.context,subject:changed.subject,actualReviewReceipt:review.actual}),/goal and use|subject must match|cover the actual subject/);
  }
  const expanded={...base,application:{...structuredClone(base.application),deliverable_refs:['draft:1','asset:1']}};expanded.application.application_proposal_hash=applicationProposalHash(expanded.application);const expandedReview=reboundGuidance(expanded);
  assert.throws(()=>validateGuidanceReceipt(expandedReview.receipt,{output:expanded.output,application:expanded.application,context:expanded.context,subject:expanded.subject,actualReviewReceipt:expandedReview.actual}),/every applied deliverable/);
  for(const review of [reboundGuidance(base,{checks:{},issues:[]}),reboundGuidance(base,{checks:{action_matches:false},issues:[]}),reboundGuidance(base,{checks:{action_matches:true},issues:['仍有问题']})])assert.throws(()=>validateGuidanceReceipt(review.receipt,{output:base.output,application:base.application,context:base.context,subject:base.subject,actualReviewReceipt:review.actual}),/non-empty all-true checks and no issues/);
});

test('guidance gate is derived from actual intent/use and plain edit remains available', () => {
  const x = guidanceFixture(), content = { readiness: 'ready' };
  assert.equal(evaluateCurrentDeliverable({ intent: 'coach', use: 'coaching', content_readiness: content, guidance: { output: x.output, application: x.application, context: x.context, subject: x.subject, receipts: [x.receipt], actualReviewReceipts: { [x.actual.receipt_id]: x.actual } } }).task_readiness, 'ready');
  assert.equal(evaluateCurrentDeliverable({ intent: 'coach', use: 'coaching', content_readiness: content }).task_readiness, 'not_ready');
  assert.equal(evaluateCurrentDeliverable({ intent: 'draft', use: 'plain_edit', content_readiness: content }).task_readiness, 'ready');
});

test('A-K08 update is append-only and affected rules require exact review plus three cases', () => {
  const current = loadKnowledgeCatalog(), candidate = structuredClone(current);
  candidate.catalog = { ...candidate.catalog, catalog_id: 'x-algorithm-next-fixture', catalog_content_hash: H('candidate catalog') };
  candidate.dependencies = candidate.dependencies.map(item => item.dependency_id === 'scorer:compute_weighted_score' ? { ...item, review_note: `${item.review_note} updated` } : item);
  const proposal = proposeKnowledgeUpdate(current, candidate, { checked_at: '2026-10-27T01:00:00Z', head_commit: 'f'.repeat(40) });
  assert(proposal.affected_rule_version_refs.includes('operational-op01-v1'));
  assert.throws(() => activateKnowledgeCatalog(current, proposal, { review_receipt: { receipt_id: 'review', subject_hash: candidate.catalog.catalog_content_hash, decision: 'approved' }, case_results: [] }), /three replay cases/);
  const cases = proposal.affected_rule_version_refs.map(rule_version_ref => ({ rule_version_ref, applicable: true, not_applicable: true, unknown: true }));
  const activated = activateKnowledgeCatalog(current, proposal, { review_receipt: { receipt_id: 'review', subject_hash: candidate.catalog.catalog_content_hash, decision: 'approved' }, case_results: cases });
  assert.equal(activated.event.event_type, 'activated');
  assert.equal(current.catalog.catalog_id, 'x-algorithm-public-v4');
});
