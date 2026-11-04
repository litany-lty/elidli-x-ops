import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canonicalHash, validate } from '../scripts/lib/contracts.mjs';
import { buildRuleContextV5, buildSignalSetV5, loadKnowledgeCatalog, SIGNAL_DEFINITIONS_V5 } from '../scripts/lib/knowledge.mjs';

const T = '2026-11-04T23:59:59.000Z';
const read = path => JSON.parse(readFileSync(new URL(`../assets/algorithm-knowledge/${path}`, import.meta.url), 'utf8'));
const names = ['has_real_question', 'has_readable_discussion_context', 'hot_topic_relevant', 'personal_contribution_available'];
// Explicit synthetic test material, not a real user experience or review.
const texts = ['热点：我亲自实测了，大家怎么看？', '讨论上下文、真实问题、个人贡献这些词本身不构成语义证据。'];
const subject = { ref: 'subject:editorial-signal-fixture', content_hash: canonicalHash(texts), texts, read_status: 'read', full_text: true, post_type: 'original', surface: 'for_you', media: [] };

function assessment(signal, value, unit = 'flag') {
  const item = { assessment_id: `fixture-assessment-${signal}`, signal, value, unit, subject_ref: subject.ref, subject_hash: subject.content_hash, source_refs: [subject.ref], locator: 'texts/0' };
  return { ...item, assessment_hash: canonicalHash(item), review_receipt_ref: `fixture-review-${signal}`, reviewed_at: T };
}

function review(item) {
  return { receipt_id: item.review_receipt_ref, purpose: 'review_signals', subject_ref: subject.ref, subject_hash: subject.content_hash, actual_result_hash: item.assessment_hash, decision: 'approved', reviewed_at: T };
}

test('OP07/OP10 semantic definitions match both packaged predicates and stay unknown without review', () => {
  const set = buildSignalSetV5({ subject, cutoff: T });
  for (const name of names) {
    assert.deepEqual(SIGNAL_DEFINITIONS_V5[name], { type: 'boolean', unit: 'flag', kind: 'semantic' });
    assert.equal(set.signals[name].value, null);
    assert.equal(set.signals[name].status, 'unknown');
    assert.equal(set.signals[name].basis_kind, 'unknown');
    assert.deepEqual(set.signals[name].review_refs, []);
  }
  for (const id of ['op07', 'op10']) {
    const old = read(`playbooks/${id}.json`), candidate = read(`playbooks/b220448/${id}.json`);
    assert.deepEqual(candidate.editorial_predicate, old.editorial_predicate);
    for (const name of old.required_signals) assert.ok(names.includes(name));
  }
  validate('SignalSetV5', set);
});

for (const id of ['op07', 'op10']) {
  const rule = read(`playbooks/${id}.json`);
  for (const replay of rule.replay_cases) {
    test(`${replay.case_id}: reviewed extraction reaches the real V5 rule consumer`, () => {
      const loaded = loadKnowledgeCatalog(undefined, { now: T });
      // Use immutable approved baseline rules even after the new catalog activates.
      const bundle = { ...loaded, rules: { [rule.rule_version_id]: rule }, facts: { ...loaded.history.facts, ...loaded.facts } };
      assert.equal(rule.review_status, 'approved');
      const semantic_evidence = Object.entries(replay.signals).map(([signal, sample]) => assessment(signal, sample.value, sample.unit));
      const signal_set = buildSignalSetV5({ subject, cutoff: T, semantic_evidence, actual_reviews: semantic_evidence.map(review) });
      const context = buildRuleContextV5({ run_id: `fixture-${replay.case_id}`, intent: 'draft', goal: { primary_goal: 'relevant_reach' }, use: 'operational_guidance', surface: 'for_you', post_type: 'original', subject_ref: subject.ref, subject_hash: subject.content_hash, cutoff: T, explicit_rule_version_refs: [rule.rule_version_id], signal_set }, bundle);
      assert.equal(context.selections.length, 1);
      assert.equal(context.selections[0].editorial_applicability.status, replay.expected);
      assert.equal(context.selections[0].mechanism_applicability.status, 'unknown');
      for (const item of semantic_evidence) {
        assert.equal(context.signal_set.signals[item.signal].value, item.value);
        assert.equal(context.signal_set.signals[item.signal].status, 'reviewed');
        assert.deepEqual(context.signal_set.signals[item.signal].review_refs, [item.review_receipt_ref]);
      }
      if (replay.expected === 'unknown') assert.ok(context.selections[0].editorial_applicability.missing_signals.length);
      validate('RuleContextV5', context);
    });
  }
}

for (const name of names) {
  test(`${name}: absent, mismatched, unapproved or altered review evidence is rejected`, () => {
    const item = assessment(name, true), receipt = review(item);
    const build = (evidence = item, receipts = [receipt]) => buildSignalSetV5({ subject, cutoff: T, semantic_evidence: [evidence], actual_reviews: receipts });
    assert.throws(() => build(item, []), /actual exact host review/);
    for (const patch of [{ subject_ref: 'subject:other' }, { subject_hash: canonicalHash('other') }, { actual_result_hash: canonicalHash('other') }, { decision: 'rejected' }, { purpose: 'other' }]) {
      assert.throws(() => build(item, [{ ...receipt, ...patch }]), /actual exact host review/);
    }
    for (const patch of [{ subject_ref: 'subject:other' }, { subject_hash: canonicalHash('other') }, { value: false }]) {
      assert.throws(() => build({ ...item, ...patch }), /bind exact subject and immutable assessment/);
    }
    for (const invalid of [assessment(name, 'true'), assessment(name, true, 'category')]) {
      assert.throws(() => build(invalid, [review(invalid)]), /value or unit/);
    }
  });
}
