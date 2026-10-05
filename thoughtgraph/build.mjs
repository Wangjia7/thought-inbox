import { build } from 'esbuild';
import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist/thoughtgraph', { recursive: true });
const buildResult = await build({ metafile: true, entryPoints: ['thoughtgraph/server.mjs'], outfile: 'dist/thoughtgraph/thoughtgraph-server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" } });
for (const file of ['setup.mjs', 'README.md']) await copyFile(`thoughtgraph/${file}`, `dist/thoughtgraph/${file}`);
await copyFile('LICENSE', 'dist/thoughtgraph/LICENSE');
await cp('thoughtgraph/skills', 'dist/thoughtgraph/skills', { recursive: true });
console.log('Built standalone local MCP + Skill package (Node >=22.13).');

const packages = new Set(Object.keys(buildResult.metafile.inputs).filter(p => p.includes('node_modules/')).map(p => {
  const parts = p.split('node_modules/').at(-1).split('/');
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}));
let notices = '# Bundled third-party software\n\nThe original licenses below apply to the bundled MCP dependencies. ThoughtGraph source is MIT.\n';
for (const name of [...packages].sort()) {
  const meta = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
  let license = '';
  for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT', 'LICENSE-MIT.txt', 'LICENCE', 'license', 'license.md']) {
    try { license = await readFile(`node_modules/${name}/${file}`, 'utf8'); break; } catch { /* Try conventional license filename. */ }
  }
  if (!license) throw new Error(`Missing bundled license for ${name}.`);
  notices += `\n## ${name} ${meta.version} (${meta.license})\n\n${license}\n`;
}
await writeFile('dist/thoughtgraph/THIRD_PARTY_NOTICES.md', notices);
