import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { applicationProposalHash, buildRuleContextV5, buildSignalSetV5, loadKnowledgeCatalog, SIGNAL_DEFINITIONS_V5, validateRuleApplicationV5 } from '../scripts/lib/knowledge.mjs';
import { ruleContextCompatibleV5 } from '../scripts/lib/v5-dispatch.mjs';

const T = '2026-10-27T05:00:00.000Z';
const H = value => canonicalHash(value);
const subject = { ref: 'subject:draft:1', content_hash: H('为独立开发者解释缓存失效\n正文证据'), account_ref: 'account:fixture', texts: ['为独立开发者解释缓存失效', '正文证据'], format: 'short_post', post_type: 'original', surface: 'for_you', media: [], full_text: true, read_status: 'read', source_refs: ['draft:1'], observed_at: T };

function semantic(signal, value, unit, source_refs=[subject.ref]) {
  const item = { assessment_id: `assessment-${signal}`, signal, value, unit, subject_ref: subject.ref, subject_hash: subject.content_hash, source_refs, locator: 'texts/0' };
  item.assessment_hash = H(item);
  item.review_receipt_ref = `review-${signal}`;
  item.reviewed_at = T;
  return item;
}

function review(item) {
  return { receipt_id: item.review_receipt_ref, purpose: 'review_signals', subject_ref: subject.ref, subject_hash: subject.content_hash, actual_result_hash: item.assessment_hash, decision: 'approved', reviewed_at: T };
}

test('SignalSetV5 extracts only actually read deterministic content and binds semantics to an exact host review', () => {
  const assessment = semantic('reader_benefit_clear', false, 'flag');
  const set = buildSignalSetV5({ subject, cutoff: T, semantic_evidence: [assessment], actual_reviews: [review(assessment)] });
  assert.equal(set.signals.has_body.value, true);
  assert.equal(set.signals.newline_count.value, 1);
  assert.equal(set.signals.reader_benefit_clear.value, false);
  assert.deepEqual(set.signals.reader_benefit_clear.review_refs, [assessment.review_receipt_ref]);
  assert.equal(set.signals.opening_delivers.value, null);
  assert.equal(set.signal_set_hash, H(Object.fromEntries(Object.entries(set).filter(([key]) => key !== 'signal_set_hash'))));
  assert.doesNotThrow(() => validate('SignalSetV5', set));
  assert.throws(() => buildSignalSetV5({ subject, cutoff: T, semantic_evidence: [assessment], actual_reviews: [{ ...review(assessment), actual_result_hash: H('other') }] }), /actual exact host review/);

  const unread = buildSignalSetV5({ subject: { ...subject, full_text: false, read_status: 'partial' }, cutoff: T });
  assert.equal(unread.signals.has_body.value, null);
  assert.equal(unread.signals.text_length_chars.value, null);
});

test('professional rule signals are typed and substantive repeat requires actual history refs',()=>{
  for(const name of ['opening_promise_present','promise_fulfilled','depends_on_prior_context','goal_reach_new_readers','reusable_information','information_scattered','critical_assets_ready','actual_warning_present','wants_visuals','visual_fit','substantive_repeat'])assert.ok(SIGNAL_DEFINITIONS_V5[name],name);
  const unsupported=semantic('substantive_repeat',true,'flag'),receipt=review(unsupported);
  assert.throws(()=>buildSignalSetV5({subject,cutoff:T,semantic_evidence:[unsupported],actual_reviews:[receipt]}),/actual history reference/);
  const supported=semantic('substantive_repeat',true,'flag',[subject.ref,'history:compatible-post']);
  assert.equal(buildSignalSetV5({subject,cutoff:T,semantic_evidence:[supported],actual_reviews:[review(supported)]}).signals.substantive_repeat.value,true);
});

test('RuleApplicationV5 permits editorial modify with unknown mechanism but rejects double unknown', () => {
  const assessment = semantic('reader_benefit_clear', false, 'flag');
  const signal_set = buildSignalSetV5({ subject, cutoff: T, semantic_evidence: [assessment], actual_reviews: [review(assessment)] });
  const bundle = loadKnowledgeCatalog(undefined, { now: T });
  const context = buildRuleContextV5({ run_id: 'run-v5', intent: 'draft', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance', surface: 'for_you', post_type: 'original', subject_ref: subject.ref, subject_hash: subject.content_hash, cutoff: T, explicit_rule_version_refs: ['operational-op01-v3'], signal_set }, bundle);
  assert.equal(context.selections[0].mechanism_applicability.status, 'unknown');
  assert.equal(context.selections[0].editorial_applicability.status, 'applicable');
  assert.doesNotThrow(() => validate('RuleContextV5', context));
  const application = { contract_version: 5, application_id: 'application-v5', context_ref: context.context_id, selected_rule_context_hash: context.selected_rule_context_hash, subject_ref: subject.ref, actual_input_hash: subject.content_hash, rule_version_refs: ['operational-op01-v3'], checks: [{ check_id: 'semantic-benefit', check_type: 'semantic', status: 'applicable', reviewed_input_hash: subject.content_hash, review_ref: assessment.review_receipt_ref, inspected_refs: [subject.ref], finding: '首句未说明读者收益' }], findings: ['首句未说明读者收益'], actions: [{ action_id: 'action-v5', rule_version_ref: 'operational-op01-v3', disposition: 'modify', text: '在首句说明读者收益', deliverable_refs: [subject.ref], basis_kind: 'editorial_inference', supporting_check_refs: ['semantic-benefit'], signal_refs: ['has_body', 'reader_benefit_clear'] }], keep_unchanged_reason: null, validation_plan: '复核首句是否清楚', deliverable_refs: [subject.ref], application_proposal_hash: '' };
  application.application_proposal_hash = applicationProposalHash(application);
  assert.doesNotThrow(() => validate('RuleApplicationV5', application));
  assert.doesNotThrow(() => validateRuleApplicationV5(application, context, bundle));

  const unknownSet = buildSignalSetV5({ subject: { ...subject, full_text: false, read_status: 'unread', texts: [] }, cutoff: T });
  const unknownContext = buildRuleContextV5({ ...context, context_id: 'context-unknown', run_id: 'run-unknown', signal_set: unknownSet }, bundle);
  const unsupported = { ...application, context_ref: unknownContext.context_id, selected_rule_context_hash: unknownContext.selected_rule_context_hash };
  unsupported.application_proposal_hash = applicationProposalHash(unsupported);
  assert.throws(() => validateRuleApplicationV5(unsupported, unknownContext, bundle), /double-unknown/);
});

test('current rule compatibility ignores unrelated catalog changes but rejects selected dependency changes',()=>{
  const set=buildSignalSetV5({subject,cutoff:T}),bundle=loadKnowledgeCatalog(undefined,{now:T}),context=buildRuleContextV5({run_id:'compat',intent:'draft',goal:{primary_goal:'relevant_reach'},use:'operational_guidance',surface:'for_you',post_type:'original',subject_ref:subject.ref,subject_hash:subject.content_hash,cutoff:T,explicit_rule_version_refs:['operational-op01-v3'],signal_set:set},bundle);
  const unrelated=structuredClone(bundle),other=Object.keys(unrelated.rules).find(ref=>ref!=='operational-op01-v3');unrelated.catalog.catalog_id='catalog-unrelated';unrelated.catalog.catalog_content_hash='a'.repeat(64);unrelated.rules[other]={...unrelated.rules[other],derivation:`${unrelated.rules[other].derivation} unrelated`};
  assert.equal(ruleContextCompatibleV5(context,unrelated),true);
  const related=structuredClone(unrelated),dep=Object.keys(context.selected_dependency_hashes)[0],index=related.dependencies.findIndex(item=>item.dependency_id===dep);related.dependencies[index]={...related.dependencies[index],review_note:`${related.dependencies[index].review_note} changed`};
  assert.equal(ruleContextCompatibleV5(context,related),false);
});
