import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await mkdir('.test-build', { recursive: true });
try {
  await build({ entryPoints: ['tests/model.test.ts', 'tests/store.test.ts', 'tests/plugin.test.ts', 'tests/graph.test.ts'], outdir: '.test-build', bundle: true, external: ['yaml'], platform: 'node', format: 'esm', target: 'node22', alias: { obsidian: './tests/obsidian-stub.ts' } });
  const result = spawnSync(process.execPath, ['--test', '.test-build/model.test.js', '.test-build/store.test.js', '.test-build/plugin.test.js', '.test-build/graph.test.js'], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally { await rm('.test-build', { recursive: true, force: true }); }
