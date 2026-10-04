import { App, ItemView, Modal, Notice, PluginSettingTab, Setting, SettingDefinitionItem, TextAreaComponent, WorkspaceLeaf, normalizePath } from 'obsidian';
import type ThoughtInboxPlugin from '../main';
import { Branch, ImportPayload, STATUSES, Status, Thought, automaticTitle, errorMessage, parseImport, updateDiscussion, validateInboxPath } from './model';
import { Entry, Scan } from './store';
export const VIEW_TYPE = 'thought-inbox-queue';
function makeId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function input(container: HTMLElement, name: string, value: string, change: (value: string) => void): void {
  new Setting(container).setName(name).addText(t => t.setValue(value).onChange(change));
}
function area(container: HTMLElement, name: string, value: string, change: (value: string) => void): TextAreaComponent {
  let component!: TextAreaComponent;
  new Setting(container).setName(name).addTextArea(t => {
    component = t;
    t.setValue(value).onChange(change);
    t.inputEl.rows = 5;
    t.inputEl.setAttribute('aria-label', name);
  });
  return component;
}
function statusInput(container: HTMLElement, status: Status, change: (value: Status) => void): void {
  new Setting(container).setName('Status').addDropdown(d => {
    for (const s of STATUSES) d.addOption(s, s);
    d.setValue(status).onChange(value => change(value as Status));
  });
}
function showError(container: HTMLElement, error: unknown): void { container.setText(errorMessage(error)); }
export class CaptureModal extends Modal {
  private thought: Thought;
  private originalInput?: TextAreaComponent;
  private closed = false;
  constructor(private plugin: ThoughtInboxPlugin, original: string, source: string, private entry?: Entry) {
    super(plugin.app);
    const now = new Date().toISOString();
    this.thought = entry ? { ...entry.document.thought, branches: entry.document.thought.branches.map(b => ({ ...b })) } : {
      id: makeId(), title: automaticTitle(now), original, userThought: '', source, project: '', status: 'inbox', createdAt: now, updatedAt: now, branches: []
    };
  }
  setOriginal(value: string): void {
    if (!this.closed && !this.thought.original) { this.thought.original = value; this.originalInput?.setValue(value); }
  }
  onOpen(): void {
    this.contentEl.addClass('thought-inbox-modal');
    this.setTitle(this.entry ? 'Edit thought' : 'Capture thought');

    this.originalInput = area(this.contentEl, 'Original text', this.thought.original, v => { this.thought.original = v; });
    area(this.contentEl, 'My thought', this.thought.userThought, v => { this.thought.userThought = v; });
    input(this.contentEl, 'Source', this.thought.source, v => { this.thought.source = v; });
    input(this.contentEl, 'Project', this.thought.project, v => { this.thought.project = v; });
    statusInput(this.contentEl, this.thought.status, v => { this.thought.status = v; });
    const error = this.contentEl.createDiv({ cls: 'thought-inbox-error', attr: { role: 'alert' } });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Cancel').onClick(() => this.close())).addButton(b => {
      b.setButtonText('Save').setCta().onClick(() => {
        this.plugin.run(async () => {
          b.setDisabled(true);
          try {
            if (!this.thought.original.trim() && !this.thought.userThought.trim()) throw new Error('Enter original text or your thought.');
            this.thought.title = automaticTitle(this.thought.createdAt);
            this.thought.updatedAt = new Date().toISOString();
            if (this.entry) await this.plugin.store.save(this.thought, this.entry.raw);
            else await this.plugin.store.create(this.thought);
            this.plugin.refreshQueue();
            new Notice('Thought saved.');
            this.close();
          } catch (e) { showError(error, e); }
          finally { b.setDisabled(false); }
        });
      });
    });
  }
  onClose(): void { this.closed = true; this.contentEl.empty(); }
}
export class BranchModal extends Modal {
  constructor(private plugin: ThoughtInboxPlugin, private entry: Entry) { super(plugin.app); }
  onOpen(): void {
    this.setTitle('Update discussion');
    this.contentEl.addClass('thought-inbox-modal');
    const t = this.entry.document.thought;
    this.contentEl.createEl('p', { text: t.title, cls: 'thought-inbox-meta' });
    let branchId = '', selectedId = '', conclusion = '', judgment = '', source = '';
    let idInput: { setValue(value: string): unknown };
    let conclusionInput: TextAreaComponent, judgmentInput: TextAreaComponent;
    let sourceInput: { setValue(value: string): unknown };
    const load = (b?: Branch): void => {
      branchId = b?.id ?? ''; selectedId = branchId;
      conclusion = b?.modelConclusion ?? '';
      judgment = b?.userJudgment ?? '';
      source = b?.source ?? '';
      idInput.setValue(branchId); conclusionInput.setValue(conclusion); judgmentInput.setValue(judgment); sourceInput.setValue(source);
    };
    new Setting(this.contentEl).setName('Existing branch').addDropdown(d => {
      d.addOption('', 'New branch');
      for (const b of t.branches) d.addOption(b.id, b.id);
      d.onChange(id => load(t.branches.find(b => b.id === id)));
    });
    new Setting(this.contentEl).setName('Branch ID').setDesc('Use a new ID to add a branch, or select an existing branch to update it.').addText(i => {
      idInput = i; i.onChange(v => { branchId = v; });
    });
    conclusionInput = area(this.contentEl, 'Model conclusion', '', v => { conclusion = v; });
    judgmentInput = area(this.contentEl, 'My judgment', '', v => { judgment = v; });
    new Setting(this.contentEl).setName('Discussion source').addText(i => { sourceInput = i; i.onChange(v => { source = v; }); });
    const error = this.contentEl.createDiv({ cls: 'thought-inbox-error', attr: { role: 'alert' } });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Cancel').onClick(() => this.close())).addButton(b => {
      b.setButtonText('Save discussion').setCta().onClick(() => {
        this.plugin.run(async () => {
          b.setDisabled(true);
          try {
            // Manually typing an existing ID must not silently erase its judgment.
            const old = t.branches.find(existing => existing.id === branchId);
            if (old && selectedId !== branchId) throw new Error('Select the existing branch first to review its conclusion and personal judgment.');
            const payload = parseImport(JSON.stringify({ thoughtId: t.id, branchId, modelConclusion: conclusion, discussionSource: source }));
            const updated = updateDiscussion(t, payload, new Date().toISOString(), judgment);
            await this.plugin.store.save(updated, this.entry.raw);
            this.plugin.refreshQueue(); this.close(); new Notice('Discussion saved.');
          } catch (e) { showError(error, e); }
          finally { b.setDisabled(false); }
        });
      });
    });
  }
  onClose(): void { this.contentEl.empty(); }
}
export class ImportModal extends Modal {
  constructor(private plugin: ThoughtInboxPlugin, private thoughtId = '') { super(plugin.app); }
  onOpen(): void {
    this.setTitle('Import discussion result');
    this.contentEl.addClass('thought-inbox-modal');
    this.contentEl.createEl('p', { text: 'Paste one JSON object. Preview the target before applying. Imports update model conclusions and preserve your judgment and the thought status.' });
    let json = JSON.stringify({ thoughtId: this.thoughtId || 'paste-thought-id', branchId: 'branch-1', modelConclusion: '', discussionSource: '' }, null, 2);
    let approved: ImportPayload | undefined;
    area(this.contentEl, 'Discussion JSON', json, v => { json = v; approved = undefined; preview.empty(); });
    const preview = this.contentEl.createDiv({ cls: 'thought-inbox-preview', attr: { 'aria-live': 'polite' } });
    const error = this.contentEl.createDiv({ cls: 'thought-inbox-error', attr: { role: 'alert' } });
    new Setting(this.contentEl).addButton(b => b.setButtonText('Preview').onClick(() => {
      this.plugin.run(async () => {
        approved = undefined; b.setDisabled(true); error.empty(); preview.empty();
        const previewInput = json;
        try {
          const payload = parseImport(previewInput);
          const scan = await this.plugin.store.scan();
          if (scan.issues.length) throw new Error(scan.issues.join('\n'));
          const target = scan.entries.find(e => e.document.thought.id === payload.thoughtId);
          if (!target) throw new Error('Thought ID not found in the configured inbox.');
          if (json !== previewInput) return;
          preview.createEl('p', { text: `Target: ${target.document.thought.title} (${payload.thoughtId})` });
          preview.createEl('p', { text: `${target.document.thought.branches.some(x => x.id === payload.branchId) ? 'Replace model conclusion in' : 'Add'} branch: ${payload.branchId}` });
          preview.createEl('pre', { text: payload.modelConclusion });
          approved = payload;
        } catch (e) { showError(error, e); }
        finally { b.setDisabled(false); }
      });
    })).addButton(b => b.setButtonText('Apply import').setCta().onClick(() => {
      this.plugin.run(async () => {
        b.setDisabled(true);
        try {
          if (!approved) throw new Error('Preview the current JSON before applying it.');
          await this.plugin.store.importDiscussion(approved);
          this.plugin.refreshQueue(); this.close(); new Notice('Discussion imported. Your judgment was preserved.');
        } catch (e) { showError(error, e); }
        finally { b.setDisabled(false); }
      });
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}
export class QueueView extends ItemView {
  private scan: Scan = { entries: [], issues: [] };
  private query = '';
  private status = 'open';
  private project = '';
  private list!: HTMLElement;
  private message!: HTMLElement;
  private generation = 0;
  private closed = false;
  constructor(leaf: WorkspaceLeaf, private plugin: ThoughtInboxPlugin) { super(leaf); }
  getViewType(): string { return VIEW_TYPE; }
  getDisplayText(): string { return 'Question queue'; }
  getIcon(): string { return 'inbox'; }
  async onOpen(): Promise<void> {
    this.closed = false;
    this.contentEl.empty(); this.contentEl.addClass('thought-inbox-queue');
    new Setting(this.contentEl).setName('Question queue').setDesc('Capture, review, and keep model conclusions separate from your own judgment.').addButton(b => b.setButtonText('Capture').onClick(() => {
      new CaptureModal(this.plugin, '', this.plugin.currentSource()).open();
    })).addButton(b => b.setButtonText('Import').onClick(() => new ImportModal(this.plugin).open())).addButton(b => b.setButtonText('Refresh').onClick(() => this.plugin.run(() => this.refresh())));
    new Setting(this.contentEl).setName('Filter').addSearch(s => s.setPlaceholder('Search title, text or source').onChange(v => { this.query = v; this.draw(); })).addDropdown(d => {
      d.addOption('open', 'Open questions').addOption('all', 'All statuses');
      for (const s of STATUSES) d.addOption(s, s);
      d.setValue(this.status).onChange(v => { this.status = v; this.draw(); });
    });
    input(this.contentEl, 'Project filter', this.project, v => { this.project = v; this.draw(); });
    this.message = this.contentEl.createDiv({ cls: 'thought-inbox-meta', attr: { 'aria-live': 'polite' } });
    this.list = this.contentEl.createDiv();
    await this.refresh();
  }
  async refresh(): Promise<void> {
    if (this.closed || !this.list) return;
    const generation = ++this.generation;
    const scan = await this.plugin.store.scan();
    if (this.closed || generation !== this.generation) return;
    this.scan = scan; this.draw();
  }
  private draw(): void {
    if (!this.list || this.closed) return;
    this.list.empty(); this.message.empty();
    const query = this.query.trim().toLocaleLowerCase(), project = this.project.trim().toLocaleLowerCase();
    const filtered = this.scan.entries.filter(({ document: { thought: t } }) => {
      const status = this.status === 'all' || (this.status === 'open' ? !['resolved', 'archived'].includes(t.status) : t.status === this.status);
      const haystack = [t.title, t.original, t.userThought, t.source, ...t.branches.flatMap(b => [b.modelConclusion, b.userJudgment])].join('\n').toLocaleLowerCase();
      return status && (!query || haystack.includes(query)) && (!project || t.project.toLocaleLowerCase().includes(project));
    });
    this.message.createEl('p', { text: `${filtered.length} of ${this.scan.entries.length} thoughts · ${this.plugin.settings.inboxPath}` });
    if (this.scan.issues.length) this.message.createEl('p', { text: this.scan.issues.join('\n'), cls: 'thought-inbox-error' });
    if (!filtered.length) this.list.createEl('p', { text: 'No matching thoughts. Capture a thought or change the filters.' });
    for (const entry of filtered) this.card(entry);
  }
  private card(entry: Entry): void {
    const t = entry.document.thought;
    const card = this.list.createDiv({ cls: 'thought-inbox-card' });
    card.createEl('h3', { text: t.title });
    card.createEl('p', { text: `${t.status} · ${t.project || 'No project'} · ${t.branches.length} branches`, cls: 'thought-inbox-meta' });
    card.createEl('p', { text: (t.userThought || t.original).slice(0, 300), cls: 'thought-inbox-excerpt' });
    card.createEl('p', { text: `Source: ${t.source || 'None'}`, cls: 'thought-inbox-meta' });

    for (const b of t.branches) {
      const branch = card.createEl('details');
      branch.createEl('summary', { text: b.id });
      branch.createEl('p', { text: 'Model conclusion', cls: 'thought-inbox-label' });
      branch.createEl('p', { text: b.modelConclusion, cls: 'thought-inbox-excerpt' });
      branch.createEl('p', { text: 'My judgment', cls: 'thought-inbox-label' });
      branch.createEl('p', { text: b.userJudgment || 'Not recorded', cls: 'thought-inbox-excerpt' });
    }
    new Setting(card).addButton(b => b.setButtonText('Open note').onClick(() => this.plugin.run(() => this.plugin.openNote(entry.file))))
      .addButton(b => b.setButtonText('Edit').onClick(() => new CaptureModal(this.plugin, '', '', entry).open()))
      .addButton(b => b.setButtonText('Discussion').onClick(() => new BranchModal(this.plugin, entry).open()))
      .addButton(b => b.setButtonText('Import').onClick(() => new ImportModal(this.plugin, t.id).open()))
      .addButton(b => b.setButtonText('Copy ID').onClick(() => this.plugin.run(async () => {
        try { await navigator.clipboard.writeText(t.id); new Notice('Thought ID copied.'); }
        catch { new Notice(`Copy this ID from the queue: ${t.id}`, 8000); }
      })));
  }
  async onClose(): Promise<void> { this.closed = true; this.generation++; this.contentEl.empty(); await Promise.resolve(); }
}
export class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: ThoughtInboxPlugin) { super(app, plugin); }
  getSettingDefinitions(): SettingDefinitionItem[] {
    return [{
      name: 'Inbox folder',
      desc: 'Relative to the vault root. Changing this folder does not move existing notes; switch back to see them again.',
      aliases: ['path', '收件箱', '路径'],
      render: setting => {
        let folder = this.plugin.settings.inboxPath;
        setting.addText(t => t.setValue(folder).onChange(v => { folder = v; })).addButton(b => b.setButtonText('Save folder').onClick(() => {
          this.plugin.run(async () => {
            b.setDisabled(true);
            try {
              const inboxPath = normalizePath(validateInboxPath(folder, this.app.vault.configDir));
              await this.plugin.saveData({ inboxPath });
              this.plugin.settings = { inboxPath };
              this.plugin.refreshQueue(); new Notice('Inbox folder saved. Existing notes have not been moved.');
            } finally { b.setDisabled(false); }
          });
        }));
      }
    }, {
      name: 'Privacy',
      desc: 'All processing is local. No accounts, network requests, telemetry, or automatic clipboard monitoring.'
    }];
  }
}
