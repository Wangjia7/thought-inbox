import { ItemView, Setting, TFile, WorkspaceLeaf } from 'obsidian';
import type ThoughtInboxPlugin from '../main';
import { errorMessage } from './model';
export const GRAPH_VIEW = 'thoughtgraph-browser';
export interface GraphThread { id: string; title: string; type: string; stage: string; status: string; origin_anchor: string | null; parent_thread: string | null; merged_into?: string; project: string; created_at: string; updated_at: string }
export interface GraphAnchor { id: string; quoted_text: string; user_followup: string; capture_method: string; location: string; retention: string; created_at: string; context_before: string; context_after: string; conversation_id: string | null; source_message_id: string | null; start_offset: number | null; end_offset: number | null }
export interface GraphQuestion { id: string; content: string; origin: string; status: string; thread_id: string | null; anchor_id: string | null }
export interface GraphEvent { id: string; thread_id: string; content: string; origin: string; event_type: string; created_at: string; before?: unknown; after?: unknown; reason?: string }
export interface GraphSnapshot { schema: number; generated_at: string; capture_enabled: boolean; threads: GraphThread[]; anchors: GraphAnchor[]; questions: GraphQuestion[]; events: GraphEvent[] }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function parseGraph(raw: string): GraphSnapshot {
  if (raw.length > 10_000_000) throw new Error('ThoughtGraph projection exceeds the 10 MB browser limit. Use MCP search to review the database.');
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.schema !== 1 || typeof data.generated_at !== 'string' || typeof data.capture_enabled !== 'boolean') throw new Error('Unsupported ThoughtGraph projection.');
  const fields: Record<string, string[]> = { threads: ['id', 'title', 'type', 'stage', 'status', 'project', 'created_at', 'updated_at'], anchors: ['id', 'quoted_text', 'user_followup', 'capture_method', 'location', 'retention', 'created_at', 'context_before', 'context_after'], questions: ['id', 'content', 'origin', 'status'], events: ['id', 'thread_id', 'content', 'origin', 'event_type', 'created_at'] };
  for (const [key, names] of Object.entries(fields)) {
    const list = data[key];
    if (!Array.isArray(list) || list.some((entry: unknown) => !record(entry) || names.some(name => typeof entry[name] !== 'string'))) throw new Error(`Invalid ThoughtGraph ${key}.`);
    const ids = list.map((entry: Record<string, unknown>) => entry.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ThoughtGraph ${key} IDs.`);
  }
  return data as unknown as GraphSnapshot;
}
const originName = (origin: string): string => ({ user: '用户', model: '模型', external_source: '外部证据', mixed: '混合来源' }[origin] ?? origin);
const eventName = (name: string): string => ({ USER_JUDGMENT: '我的判断', BELIEF_REVISION: '判断修订', MODEL_SUGGESTION: '模型建议', USER_CHALLENGE: '用户反驳', OPEN_QUESTION: '待解决问题', THREAD_PROMOTED: '线程提升', HYPOTHESIS_CREATED: '假设', EXTERNAL_EVIDENCE: '外部证据' }[name] ?? name);
export class ThoughtGraphView extends ItemView {
  private data?: GraphSnapshot;
  private mode = 'active';
  private query = '';
  private project = '';
  private list?: HTMLElement;
  private message?: HTMLElement;
  private generation = 0;
  private closed = false;
  constructor(leaf: WorkspaceLeaf, private plugin: ThoughtInboxPlugin) { super(leaf); }
  getViewType(): string { return GRAPH_VIEW; }
  getDisplayText(): string { return 'ThoughtGraph'; }
  getIcon(): string { return 'git-branch'; }
  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.empty(); this.contentEl.addClass('thoughtgraph-browser');
    this.contentEl.createEl('h2', { text: 'ThoughtGraph' });
    this.contentEl.createEl('p', { text: '从哪句话开始，又为什么改变了判断。', cls: 'thought-inbox-meta' });
    new Setting(this.contentEl).setName('浏览').addDropdown(d => {
      for (const [key, label] of [['active', '活跃线程'], ['origins', '引用起点'], ['questions', '待解决问题'], ['revisions', '判断变化'], ['dormant', '休眠旁支'], ['all', '全部线程']]) d.addOption(key ?? '', label ?? '');
      d.setValue(this.mode).onChange(v => { this.mode = v; this.draw(); });
    }).addButton(b => b.setButtonText('刷新').onClick(() => this.plugin.run(() => this.refresh())));
    new Setting(this.contentEl).setName('搜索').addText(t => t.setPlaceholder('问题、原句或判断').onChange(v => { this.query = v; this.draw(); }));
    new Setting(this.contentEl).setName('项目').addText(t => t.setPlaceholder('所有项目').onChange(v => { this.project = v; this.draw(); }));
    this.message = this.contentEl.createDiv({ attr: { 'aria-live': 'polite' } });
    this.list = this.contentEl.createDiv();
    await this.refresh();
  }
  async refresh(): Promise<void> {
    const generation = ++this.generation;
    if (this.closed || !this.list) return;
    try {
      const file = this.app.vault.getAbstractFileByPath(`${this.plugin.settings.graphPath}/graph.json`);
      if (!(file instanceof TFile)) {
        this.data = undefined; this.list.empty(); this.message?.empty();
        this.message?.createEl('p', { text: '尚未连接本地 ThoughtGraph。先在 Codex 使用配套 MCP + Skill；需要浏览时，将导出目录设到此 Vault 的 ThoughtGraph 文件夹。' });
        return;
      }
      const raw = await this.app.vault.read(file);
      if (this.closed || generation !== this.generation) return;
      this.data = parseGraph(raw); this.draw();
    } catch (error) {
      if (!this.closed && generation === this.generation) { this.data = undefined; this.list.empty(); this.message?.setText(errorMessage(error)); }
    }
  }
  private draw(): void {
    if (!this.data || !this.list || !this.message || this.closed) return;
    const graph = this.data; this.list.empty(); this.message.empty();
    this.message.createEl('p', { text: `捕捉${graph.capture_enabled ? '开启' : '关闭'} · 更新于 ${new Date(graph.generated_at).toLocaleString()}`, cls: 'thought-inbox-meta' });
    this.message.createEl('p', { text: '通过 Codex 继续、提升或修订线程；这里显示本地导出的记录。', cls: 'thought-inbox-meta' });
    const query = this.query.trim().toLocaleLowerCase();
    const threads = graph.threads.filter(t => (!this.project || t.project.toLocaleLowerCase().includes(this.project.trim().toLocaleLowerCase())) && (!query || [t.title, graph.anchors.find(a => a.id === t.origin_anchor)?.quoted_text, ...graph.events.filter(e => e.thread_id === t.id).map(e => e.content), ...graph.questions.filter(q => q.thread_id === t.id).map(q => q.content)].join('\n').toLocaleLowerCase().includes(query)));
    if (this.mode === 'origins') {
      for (const a of graph.anchors.filter(a => !query || [a.quoted_text, a.user_followup].join('\n').toLocaleLowerCase().includes(query)).filter(a => !this.project || threads.some(t => t.origin_anchor === a.id))) {
        const card = this.list.createDiv({ cls: 'thoughtgraph-card' });
        const linked = threads.filter(t => t.origin_anchor === a.id);
        card.createEl('h3', { text: linked[0]?.title ?? a.user_followup.slice(0, 70) }); this.quote(card, a);
        card.createEl('p', { text: linked.map(t => `${t.stage} · ${t.title}`).join('\n') || '临时引用，尚未成为长期线程' });
      }
    } else if (this.mode === 'questions') {
      for (const q of graph.questions.filter(q => q.status === 'open' && (q.thread_id ? threads.some(t => t.id === q.thread_id) : !this.project && (!query || q.content.toLocaleLowerCase().includes(query))))) {
        const card = this.list.createDiv({ cls: 'thoughtgraph-card' }); card.createEl('h3', { text: q.content });
        card.createEl('p', { text: `${originName(q.origin)} · ${threads.find(t => t.id === q.thread_id)?.title ?? '临时引用'}` });
        const a = graph.anchors.find(a => a.id === q.anchor_id); if (a) this.quote(card, a);
      }
    } else if (this.mode === 'revisions') {
      for (const e of graph.events.filter(e => e.event_type === 'BELIEF_REVISION' && threads.some(t => t.id === e.thread_id))) {
        const card = this.list.createDiv({ cls: 'thoughtgraph-card' }); card.createEl('h3', { text: threads.find(t => t.id === e.thread_id)?.title ?? '判断变化' });
        card.createEl('p', { text: e.created_at, cls: 'thought-inbox-meta' }); card.createEl('p', { text: `之前：${typeof e.before === 'string' ? e.before : ''}` });
        card.createEl('p', { text: `现在：${e.content}`, cls: 'thoughtgraph-judgment' }); card.createEl('p', { text: `原因：${e.reason ?? ''}` });
      }
    } else {
      for (const t of threads.filter(t => this.mode === 'all' || (this.mode === 'dormant' ? t.status === 'dormant' && t.type === 'side_thread' : ['active', 'exploring', 'emerging'].includes(t.status))).sort((a, b) => b.updated_at.localeCompare(a.updated_at))) this.threadCard(t);
    }
    if (!this.list.childElementCount) this.list.createEl('p', { text: '此视图暂无记录。可以调整筛选，或在 Codex 中继续一个引用。' });
  }
  private quote(card: HTMLElement, a: GraphAnchor): void {
    card.createEl('blockquote', { text: a.quoted_text });
    card.createEl('p', { text: `最初的问题：${a.user_followup}` });
    card.createEl('p', { text: `${a.retention === 'persistent' ? '长期锚点' : '7 天临时锚点'} · ${a.location === 'exact' ? '原句匹配精确' : a.location === 'ambiguous' ? '存在多处匹配，位置待确认' : '原消息不可定位'} · ${a.capture_method}`, cls: 'thought-inbox-meta' });
    const detail = card.createEl('details'); detail.createEl('summary', { text: '来源与上下文' });
    detail.createEl('p', { text: `Conversation: ${a.conversation_id ?? '未知'}\nMessage: ${a.source_message_id ?? '未知'}\nUTF-16 span: ${a.start_offset ?? '?'}–${a.end_offset ?? '?'}` });
    detail.createEl('p', { text: `${a.context_before}【${a.quoted_text}】${a.context_after}`, cls: 'thought-inbox-excerpt' });
  }
  private threadCard(t: GraphThread): void {
    if (!this.data || !this.list) return;
    const graph = this.data, card = this.list.createDiv({ cls: 'thoughtgraph-card' });
    card.createEl('h3', { text: t.title });
    card.createEl('p', { text: `${t.stage} · ${t.status}${t.project ? ` · ${t.project}` : ''}`, cls: 'thought-inbox-meta' });
    const events = graph.events.filter(e => e.thread_id === t.id);
    const judgment = events.filter(e => e.origin === 'user' && ['USER_JUDGMENT', 'BELIEF_REVISION'].includes(e.event_type)).at(-1);
    card.createEl('p', { text: judgment ? `我的当前判断：${judgment.content}` : '我的判断：尚未记录', cls: 'thoughtgraph-judgment' });
    const a = graph.anchors.find(a => a.id === t.origin_anchor); if (a) this.quote(card, a);
    const parent = graph.threads.find(p => p.id === t.parent_thread), merged = graph.threads.filter(p => p.merged_into === t.id);
    if (parent) card.createEl('p', { text: `从旁支发展而来：${parent.title}` });
    if (merged.length) card.createEl('p', { text: `保留的合并来源：${merged.map(m => m.title).join('、')}` });
    if (t.merged_into) card.createEl('p', { text: `合并至：${graph.threads.find(m => m.id === t.merged_into)?.title ?? t.merged_into}` });
    for (const q of graph.questions.filter(q => q.thread_id === t.id && q.status === 'open')) card.createEl('p', { text: `待解决：${q.content}` });
    const timeline = card.createEl('details'); timeline.createEl('summary', { text: `思想变化 · ${events.length} 条` });
    for (const e of events) {
      const entry = timeline.createDiv({ cls: 'thoughtgraph-event' });
      entry.createEl('p', { text: `${originName(e.origin)} · ${eventName(e.event_type)} · ${new Date(e.created_at).toLocaleString()}`, cls: 'thought-inbox-meta' });
      entry.createEl('p', { text: e.content, cls: e.origin === 'user' ? 'thoughtgraph-user' : 'thought-inbox-excerpt' });
      if (typeof e.before === 'string') entry.createEl('p', { text: `之前：${e.before}` });
    }
    new Setting(card).addButton(b => b.setButtonText('复制继续思考指令').onClick(() => this.plugin.run(async () => {
      await navigator.clipboard.writeText(`用 $thoughtgraph 继续“${t.title}”，请先调用 get_thread_context，id: ${t.merged_into ?? t.id}。`);
    })));
  }
  async onClose(): Promise<void> { this.closed = true; this.generation++; this.contentEl.empty(); await Promise.resolve(); }
}
