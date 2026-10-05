import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ThoughtGraphStore, locateQuote } from '../store.mjs';
import { exportGraph } from '../export.mjs';
const capture = (s, extra = {}) => s.capture({ quoted_text: 'Topology may remain similar across models.', user_followup: '为什么比 coordinates 更 invariant？', source_role: 'assistant', conversation_id: 'public-conversation-A', source_message_id: 'public-message-128', source_text: 'Intro. Topology may remain similar across models. End.', ...extra }).anchor;
const thread = (s, anchor) => s.createThread({ anchor_id: anchor.id, reason: 'User asks to investigate independently.' });
const judgment = (s, t, content) => s.recordJudgment({ thread_id: t.id, judgment: content, reason: '用户明确表达自己的判断。', origin: 'user', explicit_user_statement: true });

test('A: locate a tiny sentence in paragraph 17 of a 2000+ word answer, store no full answer', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const quote = 'Topology may remain similar across models.';
    const answer = Array.from({ length: 30 }, (_, i) => `Paragraph ${i+1}: ${'representation geometry alignment '.repeat(30)}${i === 16 ? quote : ''}`).join('\n\n');
    assert.ok(answer.split(/\s+/).length > 2000);
    const a = capture(s, { source_text: answer });
    assert.equal(a.start_offset, answer.indexOf(quote)); assert.equal(a.end_offset, a.start_offset + quote.length);
    assert.equal(a.location, 'exact'); assert.equal(a.capture_method, 'quote_block_match');
    assert.ok(a.context_before.length <= 160 && a.context_after.length <= 160);
    const graph = s.snapshot(); assert.equal(graph.questions[0].anchor_id, a.id); assert.equal(graph.questions[0].origin, 'user');
    assert.ok(!JSON.stringify(graph).includes(answer)); assert.equal(graph.messages[0].source_id, 'public-message-128');
    assert.equal(graph.reasoning_edges.length, 0);
  } finally { s.close(); }
});
test('B: three distinct quotes have independent retention/stages; C expires after seven days', () => {
  let now = '2026-01-01T00:00:00.000Z';
  const s = new ThoughtGraphStore(':memory:', { now: () => now });
  try {
    const a = capture(s, { quoted_text: 'A', source_text: 'A B C', user_followup: 'Study A' });
    const b = capture(s, { quoted_text: 'B', source_text: 'A B C', user_followup: 'Study B' });
    const c = capture(s, { quoted_text: 'C', source_text: 'A B C', user_followup: 'Explain C' });
    const t = thread(s, a); s.updateThread({ thread_id: t.id, promote_to: 'active_thread', reason: 'Sustained explicit user interest.' });
    s.control({ action: 'keep', anchor_id: b.id });
    assert.equal(s.get(a.id).retention, 'persistent'); assert.equal(s.get(b.id).retention, 'persistent'); assert.equal(s.get(c.id).retention, 'ephemeral');
    now = '2026-01-08T00:00:00.000Z'; assert.equal(s.expire(), 1); assert.throws(() => s.get(c.id));
    assert.equal(s.all('anchor').length, 2); assert.equal(s.all('question').length, 2);
  } finally { s.close(); }
});
test('C + E: side comment → side thread → active → idea; reopen and trace exact ancestry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtgraph-'));
  let s = new ThoughtGraphStore(join(dir, 'store.sqlite'));
  try {
    const a = capture(s); const t = thread(s, a);
    s.updateThread({ thread_id: t.id, promote_to: 'active_thread', reason: 'User continued discussing.' });
    s.updateThread({ thread_id: t.id, promote_to: 'research_idea', reason: 'User asks to make it a research idea.' });
    const idea = s.all('idea')[0]; s.close(); s = new ThoughtGraphStore(join(dir, 'store.sqlite'));
    const c = s.context(idea.id);
    assert.equal(c.thread.stage, 'research_idea'); assert.equal(c.thread.type, 'side_thread');
    assert.equal(c.anchors[0].id, a.id); assert.equal(c.anchors[0].source_message_id, 'public-message-128');
    assert.equal(c.questions[0].content, a.user_followup);
    assert.deepEqual(c.events.filter(e => e.event_type === 'THREAD_PROMOTED').map(e => [e.before.stage, e.after.stage]), [['side_thread', 'active_thread'], ['active_thread', 'research_idea']]);
    assert.equal(s.context(c.questions[0].id).thread.id, t.id);
    assert.ok(c.provenance_edges.some(e => e.type === 'extracted_from'));
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('D: explicit user revisions append before/after; model suggestions never become beliefs', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const t = thread(s, capture(s));
    s.updateThread({ thread_id: t.id, reason: 'A model suggestion', event: { event_type: 'MODEL_SUGGESTION', origin: 'model', content: 'Could imply universality.' } });
    assert.equal(s.context(t.id).current_user_judgment, null);
    assert.ok(!s.all('event').some(e => e.event_type === 'THREAD_UPDATED' && e.origin === 'user'));
    const old = judgment(s, t, 'Topology stability suggests universality.');
    const revision = judgment(s, t, 'Shared tasks may explain similarity; need null models.');
    assert.equal(revision.before, old.content); assert.equal(revision.after, revision.content);
    assert.equal(s.get(old.id).content, old.content); assert.equal(s.context(t.id).current_user_judgment.id, revision.id);
    assert.equal(s.edges('reasoning').filter(e => e.type === 'revises').length, 1);
    assert.throws(() => s.recordJudgment({ thread_id: t.id, judgment: 'Inferred acceptance', origin: 'model', explicit_user_statement: true }));
    assert.throws(() => s.updateThread({ thread_id: t.id, reason: 'Bad origin', event: { event_type: 'MODEL_SUGGESTION', origin: 'user', content: 'Suggestion' } }));
    assert.throws(() => s.updateThread({ thread_id: t.id, reason: 'Bad judgment', event: { event_type: 'USER_JUDGMENT', origin: 'user', content: 'Fake inference' } }));
  } finally { s.close(); }
});
test('Unicode spans, repeated quotes, missing text/IDs are honestly classified', () => {
  assert.deepEqual(locateQuote('句子', '😀开头句子尾'), { location: 'exact', start_offset: 4, end_offset: 6, context_before: '😀开头', context_after: '尾' });
  assert.equal(locateQuote('repeat', 'repeat repeat').location, 'ambiguous');
  assert.equal(locateQuote('repeat', 'repeat repeat', 7).start_offset, 7);
  assert.throws(() => locateQuote('repeat', 'repeat repeat', 3));
  assert.equal(locateQuote('miss', 'source').location, 'unresolved');
  const s = new ThoughtGraphStore(':memory:');
  try {
    const a = capture(s, { source_text: undefined, conversation_id: undefined, source_message_id: undefined });
    assert.equal(a.location, 'unresolved'); assert.equal(a.source_message_id, null); assert.equal(s.all('message').length, 0);
    assert.equal(s.all('conversation').length, 0);
  } finally { s.close(); }
});
test('retry deduplication, OFF, undo/delete and dangling pointer cleanup', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const a = capture(s, { capture_key: 'public-user-turn-3/quote-0' });
    const again = s.capture({ quoted_text: a.quoted_text, user_followup: a.user_followup, source_role: 'assistant', capture_key: 'public-user-turn-3/quote-0' });
    assert.equal(again.anchor.id, a.id); assert.equal(s.all('question').length, 1);
    s.control({ action: 'capture_off' }); assert.equal(s.capture({ source_role: 'assistant', quoted_text: 'x', user_followup: 'y' }).captured, false);
    s.control({ action: 'capture_on' }); s.control({ action: 'undo_last' });
    assert.equal(s.all('anchor').length, 0); assert.equal(s.all('question').length, 0); assert.equal(s.all('message').length, 0); assert.equal(s.all('conversation').length, 0);
    assert.throws(() => s.control({ action: 'undo_last' }));
  } finally { s.close(); }
});
test('fork/merge keeps both histories and origins, never overwrites target judgment', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const t = thread(s, capture(s)); const j = judgment(s, t, 'Need task-matched null models.');
    const a2 = capture(s, { user_followup: 'Does causality follow?' });
    const branch = s.fork({ thread_id: t.id, anchor_id: a2.id, title: 'Topology vs causality', reason: 'User wants a branch' });
    judgment(s, branch, 'Different judgment');
    assert.equal(s.context(branch.id).ancestors[0].id, t.id);
    s.merge({ source_thread: branch.id, target_thread: t.id, reason: 'User requests merging' });
    const c = s.context(t.id); assert.equal(c.current_user_judgment.id, j.id); assert.equal(c.anchors.length, 2);
    assert.ok(c.events.some(e => e.content === 'Different judgment')); assert.equal(c.merged_threads[0].id, branch.id);
    assert.throws(() => s.merge({ source_thread: t.id, target_thread: branch.id, reason: 'cycle' }));
    assert.throws(() => s.updateThread({ thread_id: branch.id, reason: 'use source' }));
  } finally { s.close(); }
});
test('explicit support/challenge is separate from provenance; invalid relations roll back', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const t = thread(s, capture(s));
    s.updateThread({ thread_id: t.id, reason: 'hypothesis', event: { event_type: 'HYPOTHESIS_CREATED', origin: 'user', content: 'Task-induced hypothesis.' } });
    const e = s.all('event').at(-1);
    const count = s.all('event').length;
    assert.throws(() => s.updateThread({ thread_id: t.id, title: 'Do not commit', reason: 'invalid', event: { event_type: 'USER_CHALLENGE', origin: 'user', content: 'Contradiction', relation: { type: 'contains', target_event: e.id } } }));
    assert.equal(s.all('event').length, count); assert.notEqual(s.get(t.id).title, 'Do not commit');
    s.updateThread({ thread_id: t.id, reason: 'explicit challenge', event: { event_type: 'USER_CHALLENGE', origin: 'user', content: 'Matched tasks disagree.', relation: { type: 'challenges', target_event: e.id } } });
    assert.equal(s.edges('reasoning').at(-1).type, 'challenges');
    assert.ok(s.edges('provenance').every(e => !['challenges', 'supports', 'revises'].includes(e.type)));
  } finally { s.close(); }
});
test('search, project/status filters and open-question resolution preserve history', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const t = thread(s, capture(s)); const q = s.context(t.id).questions[0];
    s.updateThread({ thread_id: t.id, project: 'LLM', status: 'dormant', reason: 'user pausing' });
    assert.equal(s.search({ query: 'TOPOLOGY', project: 'LLM', status: 'dormant' })[0].id, t.id);
    assert.equal(s.openQuestions(t.id).length, 1);
    s.updateThread({ thread_id: t.id, question_id: q.id, question_status: 'resolved', reason: 'user resolved question' });
    assert.equal(s.openQuestions(t.id).length, 0); assert.equal(s.get(q.id).status, 'resolved');
  } finally { s.close(); }
});
test('delete persistent anchor preserves independent judgments without retaining quote pointers', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const a = capture(s), t = thread(s, a); judgment(s, t, 'My own judgment');
    s.control({ action: 'delete', anchor_id: a.id });
    const c = s.context(t.id); assert.equal(c.anchors.length, 0); assert.equal(c.current_user_judgment.content, 'My own judgment');
    assert.equal(s.all('message').length, 0); assert.equal(s.all('conversation').length, 0);
    assert.ok(s.all('event').every(e => e.source_anchor !== a.id));
  } finally { s.close(); }
});
test('deduplicate exact anchors and detach without corrupting remaining thread', () => {
  const s = new ThoughtGraphStore(':memory:');
  try {
    const a = capture(s, { capture_key: 'turn1' }), b = capture(s, { capture_key: 'turn2' });
    const t = thread(s, a);
    s.control({ action: 'merge_duplicates', anchor_id: a.id, target_anchor: b.id });
    assert.equal(s.get(t.id).origin_anchor, b.id); assert.equal(s.all('anchor').length, 1); assert.equal(s.get(b.id).retention, 'persistent');
    s.control({ action: 'detach', anchor_id: b.id, thread_id: t.id });
    assert.equal(s.context(t.id).anchors.length, 0); assert.equal(s.get(b.id).retention, 'persistent');
  } finally { s.close(); }
});
test('managed local export is readable, refuses foreign folders/symlinks and refreshes deletion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtgraph-export-')), folder = join(dir, 'ThoughtGraph');
  const s = new ThoughtGraphStore(':memory:');
  try {
    const a = capture(s), t = thread(s, a); judgment(s, t, 'Need controls.');
    exportGraph(s, folder);
    const md = readFileSync(join(folder, 'ThoughtGraph.md'), 'utf8');
    assert.match(md, /Current user judgment/); assert.ok(!md.includes('<!-- thought-inbox:'));
    assert.match(md, /Topology/);
    s.control({ action: 'delete', anchor_id: a.id }); exportGraph(s, folder);
    const g = JSON.parse(readFileSync(join(folder, 'graph.json'), 'utf8')); assert.equal(g.anchors.length, 0);
    assert.throws(() => exportGraph(s, dir), /not owned/);
    symlinkSync(join(folder, 'graph.json'), join(dir, 'evil')); assert.throws(() => exportGraph(s, join(dir, 'evil')));
    writeFileSync(join(folder, '.thoughtgraph-managed'), 'foreign'); assert.throws(() => exportGraph(s, folder), /not owned/);
  } finally { s.close(); rmSync(dir, { recursive: true, force: true }); }
});
