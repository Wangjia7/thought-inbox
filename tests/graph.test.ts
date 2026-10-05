import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGraph } from '../src/graph';
const graph = { schema: 1, generated_at: '2026-01-01T00:00:00Z', capture_enabled: true, threads: [], anchors: [], questions: [], events: [] };
test('ThoughtGraph browser accepts local schema and rejects malformed/unknown snapshots', () => {
  assert.equal(parseGraph(JSON.stringify(graph)).capture_enabled, true);
  assert.throws(() => parseGraph(JSON.stringify({ ...graph, schema: 2 })));
  assert.throws(() => parseGraph(JSON.stringify({ ...graph, anchors: [{ id: 'a' }] })));
  assert.throws(() => parseGraph('not json'));
  assert.throws(() => parseGraph(' '.repeat(10_000_001)));
});
