import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { App, PluginManifest } from 'obsidian';
import ThoughtInboxPlugin from '../main';
interface TestPlugin {
  commands: { id: string; name: string; checkCallback?: (checking: boolean) => boolean; editorCheckCallback?: (checking: boolean, editor: { getSelection(): string }, context: { file: null }) => boolean }[];
  events: unknown[];
  disposers: (() => void)[];
}
test('Public API contract: all six commands register without URI and event cleanup is registered', async () => {
  const app = { vault: { configDir: '.custom', on: (name: string) => name }, workspace: { getActiveFile: () => null } };
  const plugin = new ThoughtInboxPlugin(app as unknown as App, {} as PluginManifest);
  await plugin.onload(); const fixture = plugin as unknown as TestPlugin;
  assert.deepEqual(fixture.commands.map(c => c.id).sort(), ['capture-clipboard', 'capture-selection', 'capture-thought', 'edit-thought', 'import-discussion', 'open-queue']);
  assert.ok(fixture.commands.every(c => !c.id.startsWith('thought-inbox:')));
  const selection = fixture.commands.find(c => c.id === 'capture-selection'); assert.ok(selection?.editorCheckCallback);
  assert.equal(selection.editorCheckCallback(true, { getSelection: () => '' }, { file: null }), false);
  assert.equal(selection.editorCheckCallback(true, { getSelection: () => 'Selected Chinese 中文' }, { file: null }), true);
  assert.equal(fixture.commands.find(c => c.id === 'edit-thought')?.checkCallback?.(true), false);
  assert.equal(fixture.events.length, 4); assert.equal(fixture.disposers.length, 1); fixture.disposers[0]?.();
});
test('Corrupt settings use a safe default; a customized configuration directory is protected', async () => {
  const app = { vault: { configDir: 'config', on: () => null }, workspace: { getActiveFile: () => null } };
  const plugin = new ThoughtInboxPlugin(app as unknown as App, {} as PluginManifest);
  plugin.loadData = async () => ({ inboxPath: 'config/plugins' });
  await plugin.onload(); assert.equal(plugin.settings.inboxPath, 'Thought Inbox');
});
