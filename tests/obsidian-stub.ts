export { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
/** Minimal public API contract fixture; this is not an Obsidian runtime. */
export class TFile { extension = 'md'; constructor(public path: string) {} }
export class TFolder { constructor(public path: string) {} }
export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/+$/, ''); }
export class Vault {}
export class MarkdownView {}
export class Notice { constructor(_message: string, _duration?: number) {} }
export class Modal {}
export class ItemView {}
export class PluginSettingTab {}
export class Setting {}
export class TextAreaComponent {}
export class WorkspaceLeaf {}
export function debounce(callback: () => void): (() => void) & { cancel(): void } {
  return Object.assign(callback, { cancel: () => undefined });
}
export class Plugin {
  commands: Record<string, unknown>[] = [];
  events: unknown[] = [];
  disposers: (() => void)[] = [];
  constructor(public app: unknown) {}
  async loadData(): Promise<unknown> { return undefined; }
  registerView(_type: string, _factory: unknown): void {}
  addSettingTab(_tab: unknown): void {}
  addRibbonIcon(_icon: string, _name: string, _callback: unknown): void {}
  addCommand(command: Record<string, unknown>): void { this.commands.push(command); }
  registerEvent(event: unknown): void { this.events.push(event); }
  register(callback: () => void): void { this.disposers.push(callback); }
}
