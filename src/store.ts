import { TFile, TFolder, Vault, normalizePath } from 'obsidian';
import { Document, ImportPayload, Thought, errorMessage, newDocument, parseDocument, readableFilename, renderDocument, updateDiscussion, validateInboxPath } from './model';
export interface Entry { file: TFile; raw: string; document: Document }
export interface Scan { entries: Entry[]; issues: string[] }
export class ThoughtStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private vault: Vault, private getFolder: () => string, private renameFile?: (file: TFile, path: string) => Promise<void>) {}
  folder(): string { return normalizePath(validateInboxPath(this.getFolder(), this.vault.configDir)); }
  contains(path: string): boolean { return path.startsWith(`${this.folder()}/`) && path.endsWith('.md'); }
  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task);
    this.pending = result.catch(() => undefined);
    return result;
  }
  async scan(): Promise<Scan> {
    const entries: Entry[] = [], issues: string[] = [];
    const prefix = `${this.folder()}/`;
    for (const file of this.vault.getMarkdownFiles().filter(f => f.path.startsWith(prefix))) {
      const raw = await this.vault.read(file);
      if (!raw.includes('thought_inbox_schema:') && !raw.includes('<!-- thought-inbox:record')) continue;
      try { entries.push({ file, raw, document: parseDocument(raw) }); }
      catch (error) { issues.push(`${file.path}: ${errorMessage(error)}`); }
    }
    const ids = new Set<string>();
    for (const entry of entries) {
      const id = entry.document.thought.id;
      if (ids.has(id)) issues.push(`Duplicate thought ID: ${id}. Remove or re-ID the duplicated note before updating.`);
      ids.add(id);
    }
    entries.sort((a, b) => b.document.thought.updatedAt.localeCompare(a.document.thought.updatedAt));
    return { entries, issues };
  }
  private async find(id: string): Promise<Entry> {
    const scan = await this.scan();
    if (scan.issues.length) throw new Error(`Fix damaged or duplicate notes before updating. ${scan.issues.join('\n')}`);
    const matches = scan.entries.filter(e => e.document.thought.id === id);
    if (matches.length !== 1 || !matches[0]) throw new Error(`Thought ID not found in the configured inbox: ${id}`);
    return matches[0];
  }
  create(thought: Thought): Promise<TFile> {
    return this.serialize(async () => {
      const content = renderDocument(newDocument(thought));
      const scan = await this.scan();
      if (scan.entries.some(e => e.document.thought.id === thought.id)) throw new Error('Thought ID already exists.');
      let parent = '';
      for (const part of this.folder().split('/')) {
        parent = parent ? `${parent}/${part}` : part;
        const existing = this.vault.getAbstractFileByPath(parent);
        if (existing && !(existing instanceof TFolder)) throw new Error(`A file blocks the inbox folder: ${parent}`);
        if (!existing) {
          try { await this.vault.createFolder(parent); }
          catch (error) { if (!(this.vault.getAbstractFileByPath(parent) instanceof TFolder)) throw error; }
        }
      }
      return this.vault.create(this.availablePath(thought), content);
    });
  }
  private availablePath(thought: Thought): string {
    const base = `${this.folder()}/${readableFilename(thought)}`;
    let path = `${base}.md`, number = 2;
    while (this.vault.getAbstractFileByPath(path)) path = `${base} (${number++}).md`;
    return path;
  }
  private async backup(entry: Entry): Promise<void> {
    if (entry.document.schema !== 1) return;
    let path = `${entry.file.path}.v1.bak`, number = 2;
    while (this.vault.getAbstractFileByPath(path)) path = `${entry.file.path}.v1-${number++}.bak`;
    await this.vault.create(path, entry.raw);
  }
  upgradeLegacyNotes(): Promise<number> {
    return this.serialize(async () => {
      const scan = await this.scan();
      if (scan.issues.length) throw new Error(scan.issues.join('\n'));
      const legacy = scan.entries.filter(e => e.document.schema === 1 || e.file.path.endsWith(`/${e.document.thought.id}.md`));
      for (const entry of legacy) {
        const converted = renderDocument(entry.document);
        await this.backup(entry);
        await this.vault.process(entry.file, current => {
          if (current !== entry.raw) throw new Error('Note changed during upgrade. Run the command again.');
          return converted;
        });
        if (this.renameFile && entry.file.path.endsWith(`/${entry.document.thought.id}.md`)) await this.renameFile(entry.file, this.availablePath(entry.document.thought));
      }
      return legacy.length;
    });
  }
  save(thought: Thought, expectedRaw: string): Promise<TFile> {
    return this.serialize(async () => {
      const entry = await this.find(thought.id);
      await this.backup(entry);
      await this.vault.process(entry.file, current => {
        if (current !== expectedRaw) throw new Error('This note changed while the form was open. Reopen it to avoid overwriting your edits.');
        const doc = parseDocument(current);
        return renderDocument({ ...doc, thought });
      });
      return entry.file;
    });
  }
  importDiscussion(payload: ImportPayload): Promise<TFile> {
    return this.serialize(async () => {
      const entry = await this.find(payload.thoughtId);
      await this.backup(entry);
      await this.vault.process(entry.file, current => {
        if (entry.document.schema === 1 && current !== entry.raw) throw new Error('Legacy note changed during import. Retry to preserve its backup.');
        const doc = parseDocument(current);
        const thought = updateDiscussion(doc.thought, payload, new Date().toISOString());
        return renderDocument({ ...doc, thought });
      });
      return entry.file;
    });
  }
  async read(file: TFile): Promise<Entry> {
    if (!this.contains(file.path)) throw new Error('This note is outside the configured inbox.');
    const raw = await this.vault.read(file);
    return { file, raw, document: parseDocument(raw) };
  }
}
