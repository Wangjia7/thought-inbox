import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, lstatSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const OWNER = 'ThoughtGraph managed export v1\n';
const quoted = text => String(text ?? '').split('\n').map(line => `> ${line}`).join('\n');
export function renderMarkdown(graph) {
  const lines = ['# ThoughtGraph', '', 'Generated local view. Edit through Codex MCP; manual changes here are replaced on the next export.', '', '## Threads', ''];
  for (const t of graph.threads) {
    const anchor = graph.anchors.find(a => a.id === t.origin_anchor);
    lines.push(`### ${t.title.replace(/[\r\n]/g, ' ')}`, '', `${t.stage} · ${t.status}${t.project ? ` · ${t.project}` : ''}`, '');
    if (anchor) lines.push('**Origin quote**', '', quoted(anchor.quoted_text), '', '**Initial question**', '', quoted(anchor.user_followup), '', `Location: ${anchor.location} · ${anchor.capture_method}`, '');
    const events = graph.events.filter(e => e.thread_id === t.id);
    const judgment = events.filter(e => ['USER_JUDGMENT', 'BELIEF_REVISION'].includes(e.event_type)).at(-1);
    if (judgment) lines.push('**Current user judgment**', '', quoted(judgment.content), '');
    lines.push('**Open questions**', '', ...graph.questions.filter(q => q.thread_id === t.id && q.status === 'open').flatMap(q => [quoted(q.content), '']), '**Evolution**', '');
    for (const e of events) {
      lines.push(`${e.created_at} · ${e.origin} · ${e.event_type}`, '', quoted(e.content), '');
      if (e.event_type === 'BELIEF_REVISION') lines.push('Before:', '', quoted(e.before), '', 'After:', '', quoted(e.after), '');
    }
  }
  if (!graph.threads.length) lines.push('No durable threads yet. Quote a sentence in Codex, then continue or promote it to a thread.', '');
  return lines.join('\n');
}
export function exportGraph(store, folder) {
  // Serialize snapshot + writes across multiple local MCP processes sharing the database.
  return store.transaction(() => { store.expireInternal(); return exportGraphInternal(store, folder); });
}
function exportGraphInternal(store, folder) {
  const graph = store.snapshotInternal();
  if (!folder) return graph;
  const target = resolve(folder), marker = join(target, '.thoughtgraph-managed');
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink()) throw new Error('Export folder must not use symbolic links.');
    if (!existsSync(marker) || lstatSync(marker).isSymbolicLink() || readFileSync(marker, 'utf8') !== OWNER) throw new Error('Export folder already exists and is not owned by ThoughtGraph. Choose a new dedicated folder.');
  } else {
    mkdirSync(target, { recursive: true, mode: 0o700 });
    writeFileSync(marker, OWNER, { mode: 0o600, flag: 'wx' });
  }
  for (const [name, content] of [['graph.json', JSON.stringify(graph, null, 2)], ['ThoughtGraph.md', renderMarkdown(graph)]]) {
    const path = join(target, name);
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Export file must not be a symbolic link.');
    const temp = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temp, content, { mode: 0o600, flag: 'wx' }); renameSync(temp, path); }
    finally { rmSync(temp, { force: true }); }
  }
  return graph;
}
