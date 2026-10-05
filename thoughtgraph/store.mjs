import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const THREAD_STATUSES = ['emerging', 'exploring', 'active', 'dormant', 'resolved', 'rejected', 'merged'];
export const EVENT_TYPES = ['QUESTION_CREATED', 'HYPOTHESIS_CREATED', 'MODEL_SUGGESTION', 'USER_CHALLENGE', 'EXTERNAL_EVIDENCE', 'BELIEF_REVISION', 'USER_JUDGMENT', 'OPEN_QUESTION', 'DECISION'];
const PROVENANCE = new Set(['contains', 'extracted_from', 'triggered', 'originated_from', 'recorded_in']);
const REASONING = new Set(['supports', 'challenges', 'forks_from', 'merged_into', 'revises']);
const DAY = 86400000;
const shortTitle = text => text.replace(/\s+/g, ' ').trim().slice(0, 70) || 'Untitled thread';
const pointerId = (kind, ...parts) => `${kind}_${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24)}`;

// Offsets are UTF-16 code units, end-exclusive. No full source message is persisted.
export function locateQuote(quote, source, selectionStart) {
  if (source === undefined) return { location: 'unresolved', start_offset: null, end_offset: null, context_before: '', context_after: '' };
  let starts = [], cursor = 0;
  while (cursor <= source.length) {
    const found = source.indexOf(quote, cursor);
    if (found < 0) break;
    starts.push(found); cursor = found + Math.max(1, quote.length);
  }
  if (selectionStart !== undefined && !starts.includes(selectionStart)) throw new Error('Selected offsets do not match the exact quote.');
  const start = selectionStart ?? (starts.length === 1 ? starts[0] : undefined);
  if (start === undefined) return { location: starts.length ? 'ambiguous' : 'unresolved', start_offset: null, end_offset: null, context_before: '', context_after: '' };
  return { location: 'exact', start_offset: start, end_offset: start + quote.length, context_before: source.slice(Math.max(0, start - 160), start), context_after: source.slice(start + quote.length, start + quote.length + 160) };
}

export class ThoughtGraphStore {
  constructor(path, { now = () => new Date().toISOString() } = {}) {
    this.now = now;
    if (path !== ':memory:') { mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 }); }
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS node_kind ON nodes(kind);
      CREATE TABLE IF NOT EXISTS edges (graph TEXT NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, type TEXT NOT NULL,
        PRIMARY KEY(graph,source,target,type));`);
    const version = this.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value;
    if (version && version !== '1') { this.db.close(); throw new Error('Unsupported database schema.'); }
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES('schema','1')").run();
    this.db.prepare("INSERT OR IGNORE INTO meta VALUES('capture_enabled','true')").run();
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  put(kind, node) {
    this.db.prepare('INSERT INTO nodes VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(node.id, kind, JSON.stringify(node));
    return node;
  }
  get(id, kind) {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id=?').get(id);
    if (!row || (kind && row.kind !== kind)) throw new Error(`${kind ?? 'Object'} not found: ${id}`);
    return JSON.parse(row.data);
  }
  all(kind) { return this.db.prepare('SELECT data FROM nodes WHERE kind=? ORDER BY rowid').all(kind).map(r => JSON.parse(r.data)); }
  edge(graph, source, target, type) {
    if (!(graph === 'provenance' ? PROVENANCE : REASONING).has(type)) throw new Error('Invalid graph relation.');
    this.get(source); this.get(target);
    this.db.prepare('INSERT OR IGNORE INTO edges VALUES(?,?,?,?)').run(graph, source, target, type);
  }
  event(thread, type, origin, content, extra = {}) {
    const event = this.put('event', { id: randomUUID(), thread_id: thread.id, event_type: type, origin, content, created_at: this.now(), source_anchor: thread.origin_anchor, ...extra });
    this.edge('provenance', event.id, thread.id, 'recorded_in');
    return event;
  }
  captureEnabled() { return this.db.prepare("SELECT value FROM meta WHERE key='capture_enabled'").get().value === 'true'; }
  capture(input) {
    return this.transaction(() => {
      this.expireInternal();
      if (!this.captureEnabled()) return { captured: false, reason: 'Capture is OFF. No quote was saved.' };
      if (input.source_role !== 'assistant') throw new Error('Only explicit quotes of assistant text can be captured.');
      const location = locateQuote(input.quoted_text, input.source_text, input.selection_start);
      const method = input.manual ? 'manual_anchor' : 'quote_block_match';
      // Unknown source IDs stay unknown. Never deduplicate unrelated unknown messages.
      const key = input.capture_key ? pointerId('capture', input.capture_key) : input.conversation_id && input.source_message_id
        ? pointerId('capture', input.conversation_id, input.source_message_id, input.quoted_text, location.start_offset, input.user_followup) : null;
      const duplicate = key && this.all('anchor').find(a => a.capture_key === key);
      if (duplicate) {
        if (duplicate.quoted_text !== input.quoted_text || duplicate.user_followup !== input.user_followup || (input.conversation_id && duplicate.conversation_id !== input.conversation_id) || (input.source_message_id && duplicate.source_message_id !== input.source_message_id)) throw new Error('Capture key already belongs to a different quote or follow-up.');
        return { captured: true, duplicate: true, anchor: duplicate, questions: this.all('question').filter(q => q.anchor_id === duplicate.id) };
      }
      let conversation = null, message = null;
      if (input.conversation_id) conversation = this.put('conversation', { id: pointerId('conversation', input.conversation_id), source_id: input.conversation_id });
      if (input.source_message_id) {
        message = this.put('message', { id: pointerId('message', input.conversation_id ?? null, input.source_message_id), source_id: input.source_message_id, conversation_id: input.conversation_id ?? null, source_role: 'assistant' });
        if (conversation) this.edge('provenance', conversation.id, message.id, 'contains');
      }
      const now = this.now();
      const anchor = this.put('anchor', { id: randomUUID(), quote_id: input.quote_id ?? null, conversation_id: input.conversation_id ?? null, source_message_id: input.source_message_id ?? null,
        source_role: 'assistant', source_pointer: message?.id ?? null, quoted_text: input.quoted_text, user_followup: input.user_followup,
        ...location, offset_encoding: 'utf16', capture_method: method, created_at: now, captured_at: input.timestamp ?? now,
        retention: 'ephemeral', expires_at: new Date(Date.parse(now) + 7 * DAY).toISOString(), capture_key: key, trivial: false });
      if (message) this.edge('provenance', anchor.id, message.id, 'extracted_from');
      const question = this.put('question', { id: randomUUID(), anchor_id: anchor.id, thread_id: null, content: input.user_followup, origin: 'user', status: 'open', created_at: now });
      this.edge('provenance', anchor.id, question.id, 'triggered');
      return { captured: true, anchor, question };
    });
  }
  keep(anchor) { anchor.retention = 'persistent'; anchor.expires_at = null; return this.put('anchor', anchor); }
  createThread(input) { return this.transaction(() => this.createThreadInternal(input)); }
  createThreadInternal(input) {
    const anchor = this.get(input.anchor_id, 'anchor');
    const parent = input.parent_thread ? this.get(input.parent_thread, 'thread') : null;
    if (parent?.status === 'merged') throw new Error('Use the final merge target as parent.');
    const now = this.now();
    const thread = this.put('thread', { id: randomUUID(), title: shortTitle(input.title ?? anchor.user_followup), type: input.type ?? 'side_thread', status: 'emerging', stage: 'side_thread',
      origin_anchor: anchor.id, parent_thread: parent?.id ?? null, project: input.project ?? '', created_at: now, updated_at: now });
    this.keep(anchor); this.edge('provenance', thread.id, anchor.id, 'originated_from');
    for (const q of this.all('question').filter(q => q.anchor_id === anchor.id && q.thread_id === null)) {
      q.thread_id = thread.id; this.put('question', q); this.event(thread, 'QUESTION_CREATED', 'user', q.content, { question_id: q.id });
    }
    if (parent) this.edge('reasoning', thread.id, parent.id, 'forks_from');
    this.event(thread, 'QUOTE_CAPTURED', 'user', 'A quoted moment became a durable thread.', { capture_method: anchor.capture_method, location: anchor.location });
    this.event(thread, parent ? 'NEW_BRANCH' : 'THREAD_CREATED', 'user', input.reason ?? 'User continued or promoted this quote.');
    return thread;
  }
  updateThread(input) {
    return this.transaction(() => {
      const thread = this.get(input.thread_id, 'thread');
      if (thread.status === 'merged') throw new Error('Continue the merge target instead of the merged thread.');
      const before = { title: thread.title, status: thread.status, stage: thread.stage, project: thread.project };
      if (input.title !== undefined) thread.title = shortTitle(input.title);
      if (input.project !== undefined) thread.project = input.project;
      if (input.status === 'merged') throw new Error('Use merge_threads to preserve ancestry.');
      if (input.status !== undefined) thread.status = input.status;
      if (input.promote_to) {
        if (input.promote_to === 'active_thread') { thread.stage = 'active_thread'; thread.status = 'active'; }
        else {
          thread.stage = 'research_idea'; thread.status = 'active';
          const existing = this.all('idea').find(i => i.thread_id === thread.id);
          if (!existing) {
            const idea = this.put('idea', { id: randomUUID(), thread_id: thread.id, title: thread.title, created_at: this.now() });
            this.edge('provenance', idea.id, thread.id, 'originated_from');
          }
        }
      }
      thread.updated_at = this.now(); this.put('thread', thread);
      const after = { title: thread.title, status: thread.status, stage: thread.stage, project: thread.project };
      if (JSON.stringify(before) !== JSON.stringify(after)) this.event(thread, input.promote_to ? 'THREAD_PROMOTED' : 'THREAD_UPDATED', 'user', input.reason ?? 'User requested this change.', { before, after });
      if (input.event) this.recordEventInternal(thread, input.event);
      if (input.question_id) {
        const question = this.get(input.question_id, 'question');
        if (question.thread_id !== thread.id) throw new Error('Question belongs to a different thread.');
        question.status = input.question_status; this.put('question', question);
        this.event(thread, 'QUESTION_STATUS_CHANGED', 'user', question.content, { question_id: question.id, status: question.status });
      }
      return this.context(thread.id);
    });
  }
  recordEventInternal(thread, input) {
    if (['USER_JUDGMENT', 'BELIEF_REVISION'].includes(input.event_type)) throw new Error('Use record_judgment with an explicit user statement.');
    if (input.event_type === 'MODEL_SUGGESTION' && input.origin !== 'model') throw new Error('A model suggestion must have model origin.');
    if (['USER_CHALLENGE', 'DECISION'].includes(input.event_type) && input.origin !== 'user') throw new Error('This event requires user origin.');
    if (input.event_type === 'EXTERNAL_EVIDENCE' && (input.origin !== 'external_source' || !input.source_external)) throw new Error('External evidence needs an external source pointer.');
    const source = input.source_external ? this.put('source', { id: pointerId('source', input.source_external), pointer: input.source_external }) : null;
    const event = this.event(thread, input.event_type, input.origin, input.content, { source_message: input.source_message ?? null, source_external: source?.id ?? null });
    if (['QUESTION_CREATED', 'OPEN_QUESTION'].includes(input.event_type)) {
      const question = this.put('question', { id: randomUUID(), thread_id: thread.id, anchor_id: thread.origin_anchor, content: input.content, origin: input.origin, status: 'open', created_at: this.now() });
      this.edge('provenance', thread.origin_anchor, question.id, 'triggered');
      event.question_id = question.id; this.put('event', event);
    }
    if (input.relation) {
      const target = this.get(input.relation.target_event, 'event');
      this.edge('reasoning', event.id, target.id, input.relation.type);
    }
    return event;
  }
  recordJudgment(input) {
    return this.transaction(() => {
      if (input.origin !== 'user' || input.explicit_user_statement !== true) throw new Error('User judgment requires an explicit user statement; model inference is not consent.');
      const thread = this.get(input.thread_id, 'thread');
      if (thread.status === 'merged') throw new Error('Record judgment on the merge target.');
      const previous = this.all('event').filter(e => e.thread_id === thread.id && ['USER_JUDGMENT', 'BELIEF_REVISION'].includes(e.event_type)).at(-1);
      const event = this.event(thread, previous ? 'BELIEF_REVISION' : 'USER_JUDGMENT', 'user', input.judgment, { before: previous?.content ?? null, after: input.judgment, reason: input.reason, source_message: input.source_message ?? null });
      if (previous) this.edge('reasoning', event.id, previous.id, 'revises');
      thread.updated_at = this.now(); this.put('thread', thread);
      return event;
    });
  }
  fork(input) { return this.transaction(() => {
    const parent = this.get(input.thread_id, 'thread');
    if (parent.status === 'merged') throw new Error('Fork the merge target instead.');
    return this.createThreadInternal({ anchor_id: input.anchor_id ?? parent.origin_anchor, parent_thread: parent.id, title: input.title, project: parent.project, reason: input.reason });
  }); }
  merge(input) { return this.transaction(() => {
    if (input.source_thread === input.target_thread) throw new Error('Cannot merge a thread into itself.');
    const source = this.get(input.source_thread, 'thread'), target = this.get(input.target_thread, 'thread');
    if (source.status === 'merged' || target.status === 'merged') throw new Error('A thread already merged; use its final target.');
    // Never copy events as new user beliefs. Context traverses preserved source histories.
    source.status = 'merged'; source.merged_into = target.id; source.updated_at = this.now(); this.put('thread', source);
    target.updated_at = this.now(); this.put('thread', target);
    this.edge('reasoning', source.id, target.id, 'merged_into');
    this.event(source, 'THREAD_MERGED', 'user', input.reason, { target_thread: target.id });
    this.event(target, 'THREAD_MERGED', 'user', input.reason, { source_thread: source.id });
    return this.context(target.id);
  }); }
  context(id) {
    let row = this.get(id);
    if (this.all('anchor').some(a => a.id === row.id)) {
      const linked = this.all('thread').find(t => t.origin_anchor === row.id && t.status !== 'merged');
      if (!linked) throw new Error('Anchor has no durable thread yet.');
      row = linked;
    }
    if (row.thread_id && !row.origin_anchor) row = this.get(row.thread_id, 'thread');
    const root = this.get(row.id, 'thread');
    const threads = this.all('thread');
    const ancestors = [], visited = new Set([root.id]);
    let parent = root.parent_thread;
    while (parent && !visited.has(parent)) { visited.add(parent); const t = this.get(parent, 'thread'); ancestors.push(t); parent = t.parent_thread; }
    // Recursively include merged histories; chronology alone creates no reasoning edges.
    const merged = [], mergedVisited = new Set([root.id]); const gather = target => {
      for (const t of threads.filter(t => t.merged_into === target && !mergedVisited.has(t.id))) { mergedVisited.add(t.id); merged.push(t); gather(t.id); }
    }; gather(root.id);
    const included = new Set([root.id, ...ancestors.map(t => t.id), ...merged.map(t => t.id)]);
    const anchors = [...new Set([root, ...ancestors, ...merged].map(t => t.origin_anchor).filter(Boolean))].map(a => this.get(a, 'anchor'));
    const events = this.all('event').filter(e => included.has(e.thread_id));
    const judgments = events.filter(e => e.thread_id === root.id && ['USER_JUDGMENT', 'BELIEF_REVISION'].includes(e.event_type));
    const objectIds = new Set([...included, ...anchors.map(a => a.id), ...events.map(e => e.id), ...anchors.map(a => a.source_pointer).filter(Boolean)]);
    const messages = this.all('message').filter(m => anchors.some(a => a.source_pointer === m.id));
    const conversations = this.all('conversation').filter(c => anchors.some(a => a.conversation_id === c.source_id));
    return { messages, conversations, thread: root, ancestors, merged_threads: merged, child_threads: threads.filter(t => t.parent_thread === root.id), anchors,
      ideas: this.all('idea').filter(i => included.has(i.thread_id)), questions: this.all('question').filter(q => included.has(q.thread_id)),
      current_user_judgment: judgments.at(-1) ?? null, events, provenance_edges: this.edges('provenance').filter(e => objectIds.has(e.source) || objectIds.has(e.target)), reasoning_edges: this.edges('reasoning').filter(e => objectIds.has(e.source) || objectIds.has(e.target)) };
  }
  edges(graph) { return this.db.prepare('SELECT * FROM edges WHERE graph=? ORDER BY rowid').all(graph); }
  search(input) {
    const query = (input.query ?? '').toLocaleLowerCase();
    return this.all('thread').filter(t => (!input.status || t.status === input.status) && (!input.project || t.project === input.project)).filter(t => {
      const c = this.context(t.id);
      const text = [t.title, t.project, ...c.anchors.map(a => a.quoted_text), ...c.events.map(e => e.content), ...c.questions.map(q => q.content)].join('\n').toLocaleLowerCase();
      return !query || text.includes(query);
    }).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, input.limit ?? 30);
  }
  openQuestions(threadId) {
    const ids = threadId ? new Set([threadId, ...this.context(threadId).merged_threads.map(t => t.id)]) : null;
    return this.all('question').filter(q => q.status === 'open' && (!ids || ids.has(q.thread_id)));
  }
  removeAnchor(id) {
    this.get(id, 'anchor');
    const attached = this.all('thread').filter(t => t.origin_anchor === id);
    for (const t of attached) {
      t.origin_anchor = null; this.put('thread', t);
      this.event(t, 'ANCHOR_DELETED', 'user', 'Quote content and source metadata were deleted.');
    }
    const questions = this.all('question').filter(q => q.anchor_id === id);
    for (const q of questions) {
      if (q.thread_id) { q.anchor_id = null; this.put('question', q); }
      else { this.db.prepare('DELETE FROM nodes WHERE id=?').run(q.id); this.db.prepare('DELETE FROM edges WHERE source=? OR target=?').run(q.id, q.id); }
    }
    for (const e of this.all('event').filter(e => e.source_anchor === id)) { e.source_anchor = null; this.put('event', e); }
    this.db.prepare('DELETE FROM edges WHERE source=? OR target=?').run(id, id);
    this.db.prepare('DELETE FROM nodes WHERE id=?').run(id);
    this.prunePointers();
  }
  prunePointers() {
    for (const kind of ['message', 'conversation']) for (const p of this.all(kind)) {
      const count = this.db.prepare('SELECT count(*) AS n FROM edges WHERE source=? OR target=?').get(p.id, p.id).n;
      const used = kind === 'message' && this.all('anchor').some(a => a.source_pointer === p.id);
      // A message's incoming conversation edge alone does not keep an orphan pointer alive.
      const anchorUse = kind === 'message' && this.db.prepare("SELECT count(*) AS n FROM edges WHERE target=? AND type='extracted_from'").get(p.id).n;
      if (!used && (kind === 'message' ? !anchorUse : !count)) { this.db.prepare('DELETE FROM edges WHERE source=? OR target=?').run(p.id, p.id); this.db.prepare('DELETE FROM nodes WHERE id=?').run(p.id); }
    }
  }
  expireInternal() {
    const expired = this.all('anchor').filter(a => a.retention === 'ephemeral' && a.expires_at <= this.now());
    for (const a of expired) this.removeAnchor(a.id);
    return expired.length;
  }
  expire() { return this.transaction(() => this.expireInternal()); }
  control(input) { return this.transaction(() => {
    if (input.action === 'capture_on' || input.action === 'capture_off') {
      this.db.prepare("UPDATE meta SET value=? WHERE key='capture_enabled'").run(input.action === 'capture_on' ? 'true' : 'false');
      return { capture_enabled: this.captureEnabled() };
    }
    if (input.action === 'expire') return { deleted: this.expireInternal() };
    const id = input.action === 'undo_last' ? this.all('anchor').at(-1)?.id : input.anchor_id;
    if (!id) throw new Error('Anchor ID required, or no anchor exists.');
    const anchor = this.get(id, 'anchor');
    if (['undo_last', 'delete', 'trivial'].includes(input.action)) { this.removeAnchor(id); return { deleted: id }; }
    if (input.action === 'keep') return this.keep(anchor);
    if (input.action === 'detach') {
      const thread = this.get(input.thread_id, 'thread');
      if (thread.origin_anchor !== id) throw new Error('Anchor is not attached to this thread.');
      thread.origin_anchor = null; this.put('thread', thread);
      this.db.prepare("DELETE FROM edges WHERE graph='provenance' AND source=? AND target=?").run(thread.id, id);
      for (const q of this.all('question').filter(q => q.thread_id === thread.id && q.anchor_id === id)) { q.anchor_id = null; this.put('question', q); }
      this.event(thread, 'ANCHOR_DETACHED', 'user', 'User detached the original quote.', { detached_anchor: id });
      return thread;
    }
    if (input.action === 'merge_duplicates') {
      const target = this.get(input.target_anchor, 'anchor');
      if (id === target.id || anchor.quoted_text !== target.quoted_text || !anchor.source_message_id || anchor.source_message_id !== target.source_message_id || anchor.conversation_id !== target.conversation_id || anchor.start_offset !== target.start_offset) throw new Error('Only identical quotes with matching known source pointers and offsets can be merged.');
      for (const t of this.all('thread').filter(t => t.origin_anchor === id)) { t.origin_anchor = target.id; this.put('thread', t); this.keep(target); }
      for (const q of this.all('question').filter(q => q.anchor_id === id)) { q.anchor_id = target.id; this.put('question', q); }
      if (anchor.retention === 'persistent') this.keep(target);
      for (const e of this.all('event').filter(e => e.source_anchor === id)) { e.source_anchor = target.id; this.put('event', e); }
      for (const graph of ['provenance', 'reasoning']) for (const e of this.edges(graph).filter(e => e.source === id || e.target === id)) this.edge(graph, e.source === id ? target.id : e.source, e.target === id ? target.id : e.target, e.type);
      this.removeAnchor(id); return target;
    }
    throw new Error('Unknown control action.');
  }); }
  snapshot() { return this.transaction(() => { this.expireInternal(); return this.snapshotInternal(); }); }
  snapshotInternal() {
    return { schema: 1, generated_at: this.now(), capture_enabled: this.captureEnabled(), threads: this.all('thread'), anchors: this.all('anchor'), questions: this.all('question'), events: this.all('event'), ideas: this.all('idea'), sources: this.all('source'), messages: this.all('message'), conversations: this.all('conversation'), provenance_edges: this.edges('provenance'), reasoning_edges: this.edges('reasoning') };
  }
}
