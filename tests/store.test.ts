import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Vault } from 'obsidian';
import { TFile, TFolder } from './obsidian-stub';
import { ThoughtStore } from '../src/store';
import { readableFilename, parseDocument, newDocument, renderDocument } from '../src/model';
import { renderDocument as legacyRender, newDocument as legacyNew } from './legacy/model-v1';
import { thought } from './fixtures';
class MemoryVault {
  configDir = '.test-config';
  files = new Map<string, { file: TFile; content: string }>();
  folders = new Map<string, TFolder>();
  writes = 0;
  getMarkdownFiles(): TFile[] { return [...this.files.values()].map(e => e.file).filter(f => f.path.endsWith('.md')); }
  getAbstractFileByPath(path: string): TFile | TFolder | undefined { return this.files.get(path)?.file ?? this.folders.get(path); }
  async read(file: TFile): Promise<string> {
    const entry = this.files.get(file.path); if (!entry) throw new Error('Not found'); return entry.content;
  }
  async createFolder(path: string): Promise<void> { this.folders.set(path, new TFolder(path)); }
  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path)) throw new Error('Exists');
    const file = new TFile(path); this.files.set(path, { file, content }); this.writes++; return file;
  }
  async process(file: TFile, fn: (value: string) => string): Promise<string> {
    const entry = this.files.get(file.path); if (!entry) throw new Error('Not found');
    const updated = fn(entry.content); entry.content = updated; this.writes++; return updated;
  }
  rename(oldPath: string, newPath: string): void {
    const entry = this.files.get(oldPath); if (!entry) throw new Error('Not found');
    this.files.delete(oldPath); entry.file.path = newPath; this.files.set(newPath, entry);
  }
}
function fixture(): { vault: MemoryVault; store: ThoughtStore } {
  const vault = new MemoryVault(); return { vault, store: new ThoughtStore(vault as unknown as Vault, () => 'Projects/Thought Inbox') };
}
test('Creation builds nested vault folders and a loadable Markdown record', async () => {
  const { vault, store } = fixture(); const file = await store.create(thought());
  assert.equal(file.path, `Projects/Thought Inbox/${readableFilename(thought())}.md`);
  assert.equal(vault.folders.size, 2); assert.equal((await store.scan()).entries.length, 1);
  await assert.rejects(store.create(thought()), /already exists/);
});
test('Import identifies renamed notes by ID, keeps independent judgment and is idempotent', async () => {
  const { vault, store } = fixture(); const t = thought();
  t.branches.push({ id: 'b', modelConclusion: 'Old', userJudgment: 'My view', source: 'Local', updatedAt: t.updatedAt });
  const file = await store.create(t); vault.rename(file.path, 'Projects/Thought Inbox/renamed.md');
  const payload = { thoughtId: t.id, branchId: 'b', modelConclusion: 'New' };
  await store.importDiscussion(payload); await store.importDiscussion(payload);
  const result = parseDocument(await vault.read(new TFile('Projects/Thought Inbox/renamed.md'))).thought;
  assert.equal(result.branches.length, 1); assert.equal(result.branches[0]?.userJudgment, 'My view'); assert.equal(result.branches[0]?.modelConclusion, 'New');
});
test('Concurrent imports to different branches both survive serialized writes', async () => {
  const { store } = fixture(); await store.create(thought());
  await Promise.all(['a', 'b', 'c'].map(branchId => store.importDiscussion({ thoughtId: 'thought-123', branchId, modelConclusion: branchId })));
  assert.deepEqual((await store.scan()).entries[0]?.document.thought.branches.map(b => b.id), ['a', 'b', 'c']);
});
test('Duplicate IDs abort updates without modifying either note', async () => {
  const { vault, store } = fixture(); const file = await store.create(thought());
  await vault.create('Projects/Thought Inbox/duplicate.md', await vault.read(file as unknown as TFile));
  const before = vault.writes;
  await assert.rejects(store.importDiscussion({ thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'X' }), /Duplicate/);
  assert.equal(vault.writes, before);
});
test('Unknown IDs and malformed notes fail without writes; queue reports problems', async () => {
  const { vault, store } = fixture(); await store.create(thought());
  await assert.rejects(store.importDiscussion({ thoughtId: 'missing', branchId: 'b', modelConclusion: 'X' }), /not found/);
  await vault.create('Projects/Thought Inbox/broken.md', '---\nthought_inbox_schema: 1\n---\nmissing boundaries');
  const before = vault.writes;
  assert.equal((await store.scan()).issues.length, 1);
  await assert.rejects(store.importDiscussion({ thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'X' }), /damaged/);
  assert.equal(vault.writes, before);
});
test('Stale edits are rejected and the write queue recovers after failure', async () => {
  const { store } = fixture(); await store.create(thought()); const entry = (await store.scan()).entries[0]; assert.ok(entry);
  await store.importDiscussion({ thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'New' });
  await assert.rejects(store.save({ ...entry.document.thought, title: 'Stale' }, entry.raw), /changed/);
  await store.importDiscussion({ thoughtId: 'thought-123', branchId: 'c', modelConclusion: 'More' });
  assert.equal((await store.scan()).entries[0]?.document.thought.branches.length, 2);
});
test('Non-plugin notes are ignored and custom folder changes do not migrate data', async () => {
  const vault = new MemoryVault(); let path = 'First'; const store = new ThoughtStore(vault as unknown as Vault, () => path);
  await store.create(thought()); await vault.create('First/ordinary.md', '# User note');
  await vault.create('Outside/other.md', renderDocument(newDocument(thought('outside'))));
  assert.equal((await store.scan()).entries.length, 1);
  path = 'Second'; assert.equal((await store.scan()).entries.length, 0);
  await store.create(thought('second')); path = 'First'; assert.equal((await store.scan()).entries[0]?.document.thought.id, 'thought-123');
});
test('Personal appendix survives store-level import; malformed branch is never erased', async () => {
  const { vault, store } = fixture(); const file = await store.create(thought());
  const value = vault.files.get(file.path); assert.ok(value); value.content += '\nManual appendix';
  await store.importDiscussion({ thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'X' });
  assert.ok(value.content.endsWith('Manual appendix'));
  value.content = value.content.replace('#### My judgment', '#### Broken judgment');
  const before = value.content;
  await assert.rejects(store.importDiscussion({ thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'Y' }));
  assert.equal(value.content, before);
});

test('Same-second captures use readable, collision-free filenames and independent IDs', async () => {
  const { store } = fixture(); const a = await store.create(thought('a')); const b = await store.create(thought('b'));
  assert.notEqual(a.path, b.path); assert.ok(b.path.endsWith(' (2).md')); assert.equal((await store.scan()).entries.length, 2);
});
test('Legacy upgrade backs up exact originals, renames UUID filenames and remains idempotent', async () => {
  const vault = new MemoryVault(); const path = 'Projects/Thought Inbox/thought-123.md';
  const raw = legacyRender(legacyNew(thought())); await vault.create(path, raw);
  const store = new ThoughtStore(vault as unknown as Vault, () => 'Projects/Thought Inbox', async (file, next) => { vault.rename(file.path, next); });
  assert.equal(await store.upgradeLegacyNotes(), 1);
  assert.equal(vault.files.get(`${path}.v1.bak`)?.content, raw);
  const entry = (await store.scan()).entries[0]; assert.ok(entry); assert.equal(entry.document.thought.id, 'thought-123');
  assert.ok(entry.file.path.includes('思考 ')); assert.ok(!entry.raw.includes('<!-- thought-inbox:'));
  assert.equal(await store.upgradeLegacyNotes(), 0);
  await store.importDiscussion({ thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'New' });
  assert.equal((await store.scan()).entries[0]?.document.thought.branches.length, 1);
});
test('Legacy import makes a backup and preserves prior personal judgment during format upgrade', async () => {
  const { vault, store } = fixture(); const t = thought(); t.branches.push({ id: 'b', modelConclusion: 'Old', userJudgment: 'Independent', source: '', updatedAt: t.updatedAt });
  const path = 'Projects/Thought Inbox/legacy.md'; const raw = legacyRender(legacyNew(t)); await vault.create(path, raw);
  await store.importDiscussion({ thoughtId: t.id, branchId: 'b', modelConclusion: 'New' });
  assert.equal(vault.files.get(`${path}.v1.bak`)?.content, raw);
  assert.equal((await store.scan()).entries[0]?.document.thought.branches[0]?.userJudgment, 'Independent');
  assert.ok(!vault.files.get(path)?.content.includes('<!-- thought-inbox:'));
});
