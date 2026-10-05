import { existsSync, cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const base = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const allowed = ['--write-skill', '--output', '--data-dir', '--export-dir', '--help'];
let installSkill = false, out = resolve('thoughtgraph-config.toml'), data = join(homedir(), '.thoughtgraph'), exportDir;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!allowed.includes(arg)) throw new Error(`Unknown option: ${arg}`);
  if (arg === '--help') { console.log('node setup.mjs [--output FILE] [--data-dir FOLDER] [--export-dir NEW_FOLDER] [--write-skill]\nGenerates a config snippet. Does not edit Codex config or connect a Vault. --write-skill installs the bundled Skill into ~/.agents/skills/thoughtgraph; existing Skill is never overwritten.'); process.exit(0); }
  if (arg === '--write-skill') { installSkill = true; continue; }
  const value = args[++i];
  if (!value || value.startsWith('--')) throw new Error(`${arg} needs a path.`);
  if (arg === '--output') out = resolve(value);
  if (arg === '--data-dir') data = resolve(value);
  if (arg === '--export-dir') exportDir = resolve(value);
}
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node 22.13 or newer required.');
const server = join(base, 'thoughtgraph-server.mjs');
if (!existsSync(server)) throw new Error('Run this from the built release package. Developers: npm run build:graph first.');
if (existsSync(out)) throw new Error('Output exists. Choose a new --output file; nothing was overwritten.');
// JSON quoted strings are valid TOML basic strings for these filesystem paths.
const q = value => JSON.stringify(value);
let snippet = `[mcp_servers.thoughtgraph]\ncommand = ${q(process.execPath)}\nargs = [${q(server)}]\n\n[mcp_servers.thoughtgraph.env]\nTHOUGHTGRAPH_DATA_DIR = ${q(data)}\n`;
if (exportDir) snippet += `THOUGHTGRAPH_EXPORT_DIR = ${q(exportDir)}\n`;
mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, snippet, { mode: 0o600, flag: 'wx' });
console.log(`Created ${out}. Copy its section into Codex MCP configuration; preserve all existing sections. Restart Codex afterward. Keep this unpacked package at its current path.`);
if (installSkill) {
  const target = join(homedir(), '.agents', 'skills', 'thoughtgraph');
  if (existsSync(target)) throw new Error(`Skill already exists at ${target}. Configuration snippet created; existing skill was preserved.`);
  mkdirSync(dirname(target), { recursive: true }); cpSync(join(base, 'skills', 'thoughtgraph'), target, { recursive: true, errorOnExist: true, force: false });
  console.log(`Installed Skill at ${target}. In Codex, enable $thoughtgraph in the conversation.`);
}
