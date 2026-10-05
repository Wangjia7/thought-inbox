import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('bundled MCP: initialize, list ten tools, capture, promote, revise, search, restore and privacy controls', { timeout: 20000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtgraph-mcp-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/thoughtgraph/thoughtgraph-server.mjs')], env: { THOUGHTGRAPH_DATA_DIR: join(dir, 'data'), THOUGHTGRAPH_EXPORT_DIR: join(dir, 'export') }, stderr: 'pipe' });
  const client = new Client({ name: 'thoughtgraph-acceptance', version: '1' });
  let stderr = ''; transport.stderr?.on('data', data => { stderr += data; });
  try {
    await client.connect(transport);
    const listed = await client.listTools(); assert.equal(listed.tools.length, 10);
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, undefined, JSON.stringify(result));
      return JSON.parse(result.content[0].text).result;
    };
    const result = await call('capture_quote_anchor', { quoted_text: 'Topology could be stable.', user_followup: 'Why?', source_role: 'assistant', source_text: 'Start. Topology could be stable. End.', source_message_id: 'real-public-msg-1', conversation_id: 'real-public-chat-1', capture_key: 'real-public-turn-1:q0' });
    assert.equal(result.anchor.location, 'exact');
    const t = await call('create_thread', { anchor_id: result.anchor.id, reason: 'User wants a side thread' });
    await call('update_thread', { thread_id: t.id, promote_to: 'active_thread', reason: 'User continued' });
    await call('record_judgment', { thread_id: t.id, judgment: 'Stable topology implies universality.', reason: 'First explicit user judgment', origin: 'user', explicit_user_statement: true });
    await call('record_judgment', { thread_id: t.id, judgment: 'Task controls are necessary.', reason: 'User reconsidered', origin: 'user', explicit_user_statement: true });
    assert.equal((await call('search_threads', { query: 'TASK' }))[0].id, t.id);
    const context = await call('get_thread_context', { id: t.id }); assert.equal(context.current_user_judgment.event_type, 'BELIEF_REVISION');
    assert.equal((await call('list_open_questions', { thread_id: t.id })).length, 1);
    const bad = await client.callTool({ name: 'record_judgment', arguments: { thread_id: t.id, judgment: 'Model', reason: 'guess', origin: 'model', explicit_user_statement: false } });
    assert.equal(bad.isError, true);
    const invented = await client.callTool({ name: 'capture_quote_anchor', arguments: { quoted_text: 'x', user_followup: 'y', source_role: 'assistant', capture_method: 'native_quote_event' } });
    assert.equal(invented.isError, true);
    const incomplete = await client.callTool({ name: 'update_thread', arguments: { thread_id: t.id, reason: 'invalid', question_id: 'some-id' } }); assert.equal(incomplete.isError, true);
    await call('control_capture', { action: 'capture_off' });
    assert.equal((await call('capture_quote_anchor', { quoted_text: 'x', user_followup: 'y', source_role: 'assistant' })).captured, false);
    await call('control_capture', { action: 'delete', anchor_id: result.anchor.id });
    const graph = JSON.parse(readFileSync(join(dir, 'export', 'graph.json'), 'utf8')); assert.equal(graph.anchors.length, 0); assert.equal(graph.capture_enabled, false);
    assert.equal(graph.messages.length, 0);
    assert.ok(existsSync(join(dir, 'data', 'thoughtgraph.sqlite')));
    assert.ok(!stderr.includes('Error:'), stderr);
  } finally { await client.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('setup generates quoted paths, installs nothing by default, refuses overwrites and missing values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'thoughtgraph-setup-'));
  try {
    const path = join(dir, 'config.toml');
    const run = args => spawnSync(process.execPath, [resolve('dist/thoughtgraph/setup.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
    const good = run(['--output', path, '--data-dir', join(dir, 'data with spaces'), '--export-dir', join(dir, 'Vault', 'Graph')]);
    assert.equal(good.status, 0, good.stderr); const snippet = readFileSync(path, 'utf8');
    assert.match(snippet, /mcp_servers.thoughtgraph/); assert.match(snippet, /data with spaces/); assert.match(snippet, /THOUGHTGRAPH_EXPORT_DIR/);
    assert.equal(existsSync(join(dir, 'data with spaces')), false);
    assert.notEqual(run(['--output', path]).status, 0);
    assert.notEqual(run(['--data-dir']).status, 0);
    assert.notEqual(run(['--unknown']).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
