import { MarkdownView, Notice, Plugin, TFile, debounce } from 'obsidian';
import { ThoughtStore } from './src/store';
import { errorMessage, validateInboxPath } from './src/model';
import { CaptureModal, ImportModal, QueueView, SettingsTab, VIEW_TYPE } from './src/ui';
export interface InboxSettings { inboxPath: string }
export default class ThoughtInboxPlugin extends Plugin {
  settings: InboxSettings = { inboxPath: 'Thought Inbox' };
  store!: ThoughtStore;
  async onload(): Promise<void> {
    const saved: unknown = await this.loadData();
    if (saved && typeof saved === 'object' && 'inboxPath' in saved && typeof saved.inboxPath === 'string') {
      try { this.settings.inboxPath = validateInboxPath(saved.inboxPath, this.app.vault.configDir); }
      catch { new Notice('Invalid inbox folder. Using the default inbox; your existing notes have not been moved.'); }
    }
    this.store = new ThoughtStore(this.app.vault, () => this.settings.inboxPath, (file, path) => this.app.fileManager.renameFile(file, path));
    this.registerView(VIEW_TYPE, leaf => new QueueView(leaf, this));
    this.addSettingTab(new SettingsTab(this.app, this));
    this.addRibbonIcon('inbox', 'Open question queue', () => { this.run(() => this.openQueue()); });
    this.addCommand({ id: 'capture-selection', name: 'Capture selected text', editorCheckCallback: (checking, editor, context) => {
      if (!editor.getSelection()) return false;
      if (!checking) new CaptureModal(this, editor.getSelection(), context.file ? `[[${context.file.path}]]` : '').open();
      return true;
    } });
    this.addCommand({ id: 'capture-clipboard', name: 'Capture clipboard', callback: () => { this.captureClipboard(); } });
    this.addCommand({ id: 'capture-thought', name: 'Capture a thought', callback: () => { new CaptureModal(this, '', '').open(); } });
    this.addCommand({ id: 'open-queue', name: 'Open question queue', callback: () => { this.run(() => this.openQueue()); } });
    this.addCommand({ id: 'import-discussion', name: 'Import discussion result', callback: () => { new ImportModal(this).open(); } });
    this.addCommand({ id: 'upgrade-legacy-notes', name: 'Upgrade legacy notes', callback: () => {
      this.run(async () => {
        const count = await this.store.upgradeLegacyNotes();
        this.refreshQueue();
        new Notice(`${count} legacy notes upgraded. Original .bak backups were preserved.`);
      });
    } });
    this.addCommand({ id: 'edit-thought', name: 'Edit current thought', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || !this.store.contains(file.path)) return false;
      if (!checking) this.run(async () => {
        const entry = await this.store.read(file);
        new CaptureModal(this, '', '', entry).open();
      });
      return true;
    } });
    const refresh = debounce(() => this.refreshQueue(), 200, true);
    const changed = (file: { path: string }): void => { if (this.store.contains(file.path)) refresh(); };
    this.registerEvent(this.app.vault.on('create', changed));
    this.registerEvent(this.app.vault.on('modify', changed));
    this.registerEvent(this.app.vault.on('delete', changed));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (this.store.contains(file.path) || this.store.contains(oldPath)) refresh();
    }));
    this.register(() => refresh.cancel());
  }
  run(task: () => Promise<unknown>): void {
    void task().catch((error: unknown) => { new Notice(errorMessage(error), 8000); });
  }
  captureClipboard(): void {
    // No automatic clipboard monitoring. The dialog opens before the permission-dependent read.
    const modal = new CaptureModal(this, '', 'Clipboard');
    modal.open();
    this.run(async () => {
      try {
        const text = await navigator.clipboard.readText();
        modal.setOriginal(text);
      } catch { new Notice('Clipboard access is unavailable. Paste the text into the original text field.', 6000); }
    });
  }
  async openQueue(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await leaf.loadIfDeferred();
    await this.app.workspace.revealLeaf(leaf);
  }
  refreshQueue(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof QueueView) this.run(() => view.refresh());
    }
  }
  async openNote(file: TFile): Promise<void> { await this.app.workspace.getLeaf('tab').openFile(file); }
  currentSource(): string {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ? `[[${view.file.path}]]` : '';
  }
}
