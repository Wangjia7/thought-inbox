import { test } from 'node:test';
import assert from 'node:assert/strict';
import { automaticTitle, readableFilename, newDocument, parseDocument, renderDocument, parseImport, updateDiscussion, validateInboxPath } from '../src/model';
import { renderDocument as legacyRender, newDocument as legacyNew } from './legacy/model-v1';
import { thought, NOW } from './fixtures';
test('Unicode, multiline content and whitespace round-trip in plain Markdown', () => {
  const t = thought(); t.original = ' \n# heading\n---\n```json\n{}\n```\n '; t.source = 'https://example.org/?a=1&b=2';
  assert.deepEqual(parseDocument(renderDocument(newDocument(t))).thought, t);
});
test('Metadata containing HTML comment closing text round-trips safely', () => {
  const t = thought(); t.source = 'data --> literal';
  assert.deepEqual(parseDocument(renderDocument(newDocument(t))).thought, t);
});
test('Multiple branches and personal judgments round-trip independently', () => {
  let t = updateDiscussion(thought(), { thoughtId: 'thought-123', branchId: 'branch-a', modelConclusion: 'Model A' }, NOW, 'I disagree');
  t = updateDiscussion(t, { thoughtId: t.id, branchId: 'branch-b', modelConclusion: 'Model B' }, NOW, 'Needs evidence');
  assert.deepEqual(parseDocument(renderDocument(newDocument(t))).thought, t);
});
test('Import same branch updates in place and preserves user judgment and metadata', () => {
  const base = updateDiscussion(thought(), { thoughtId: 'thought-123', branchId: 'b1', modelConclusion: 'Old', discussionSource: 'offline conversation' }, NOW, 'My independent conclusion');
  const result = updateDiscussion(base, parseImport('{"thoughtId":"thought-123","branchId":"b1","modelConclusion":"New"}'), '2026-10-05T01:00:00Z');
  assert.equal(result.branches.length, 1); assert.equal(result.branches[0]?.userJudgment, 'My independent conclusion');
  assert.equal(result.branches[0]?.source, 'offline conversation'); assert.equal(result.original, base.original);
  assert.equal(result.userThought, base.userThought); assert.equal(result.status, base.status);
});
test('Reject model supplied personal judgments, status changes, arrays and unknown fields', () => {
  for (const extra of [{ userJudgment: 'trust me' }, { status: 'resolved' }, { original: 'overwrite' }]) {
    assert.throws(() => parseImport(JSON.stringify({ thoughtId: 't', branchId: 'b', modelConclusion: 'X', ...extra })));
  }
  for (const input of ['[]', '{}', 'null', '{bad json', '{"thoughtId":"../x","branchId":"b","modelConclusion":"X"}']) assert.throws(() => parseImport(input));
});
test('Unknown schema, damaged markers and duplicate branches fail closed', () => {
  const valid = legacyRender(legacyNew(thought()));
  for (const broken of [valid.replace('"schema":1', '"schema":2'), valid.replace('<!-- thought-inbox:/original -->', ''), valid + '<!-- thought-inbox:end -->']) assert.throws(() => parseDocument(broken));
  const t = updateDiscussion(thought(), { thoughtId: 'thought-123', branchId: 'b1', modelConclusion: 'X' }, NOW);
  const withBranch = legacyRender(legacyNew(t));
  assert.throws(() => parseDocument(withBranch.replace('<!-- thought-inbox:/branch -->', '')));
  assert.throws(() => parseDocument(withBranch.replace(/<!-- thought-inbox:branch .*? -->/, '').replace('<!-- thought-inbox:/branch -->', '')));
  assert.throws(() => renderDocument(newDocument({ ...t, branches: [...t.branches, ...t.branches] })));
});
test('Reserved content markers are rejected, with size limits', () => {
  assert.throws(() => renderDocument(newDocument({ ...thought(), original: '<!-- thought-inbox:end -->' })));
  assert.throws(() => parseImport('x'.repeat(500_001)));
  assert.throws(() => renderDocument(newDocument({ ...thought(), original: 'x'.repeat(200_001) })));
});
test('Path validation blocks absolute, traversal, hidden and customized config folders', () => {
  for (const path of ['../outside', '/tmp/a', 'C:\\tmp', '.obsidian/plugins', 'A/../B', 'A/./B', '', 'A//B', 'A\u0000B', 'config/plugins']) assert.throws(() => validateInboxPath(path, 'config'));
  assert.equal(validateInboxPath(' Projects\\思考/ ', 'config'), 'Projects/思考');
  assert.equal(validateInboxPath('Thought Inbox', '.custom'), 'Thought Inbox');
});
test('Personal notes and manually edited blockquotes survive a discussion update', () => {
  const document = newDocument(thought()); document.prefix += 'Personal preface\n'; document.suffix += '\nPersonal appendix\n';
  const manuallyEdited = renderDocument(document).replace('> 原文\n> \n> second line', '> My edited original');
  const parsed = parseDocument(manuallyEdited);
  const updated = renderDocument({ ...parsed, thought: updateDiscussion(parsed.thought, { thoughtId: 'thought-123', branchId: 'b', modelConclusion: 'X' }, NOW) });
  assert.ok(updated.endsWith(document.suffix)); assert.ok(updated.includes(document.prefix)); assert.equal(parseDocument(updated).thought.original, 'My edited original');
});
test('Wrong target ID is never applied', () => {
  assert.throws(() => updateDiscussion(thought(), { thoughtId: 'different', branchId: 'b', modelConclusion: 'X' }, NOW));
});

test('New notes have readable date titles, metadata properties and no internal comments in the body', () => {
  const t = thought(); t.title = 'garbled title';
  const raw = renderDocument(newDocument(t));
  const body = raw.split('\n---\n\n')[1] ?? '';
  assert.ok(body.startsWith('## Original text'));
  assert.ok(!raw.includes('<!-- thought-inbox:'));
  assert.ok(!body.includes('Project:') && !body.includes('ID:') && !body.includes('Status:'));
  assert.equal(parseDocument(raw).thought.title, automaticTitle(NOW));
  assert.match(readableFilename(t), /^思考 \d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}$/);
});
test('Quoted content preserves nested section headings, fences and arbitrary Markdown literally', () => {
  const t = thought(); t.original = '## My thought\n\n```markdown\n## Personal notes\n```\n> Nested quote\n\n';
  t.userThought = '### branch-1\n#### Model conclusion\n\n';
  assert.deepEqual(parseDocument(renderDocument(newDocument(t))).thought, t);
});
test('Legacy upgrade preserves text, branch judgments, free notes, identity and extra properties', () => {
  const t = thought(); t.branches.push({ id: 'b', modelConclusion: 'Model', userJudgment: 'My view', source: '讨论', updatedAt: NOW });
  const legacy = legacyNew(t); legacy.prefix += 'Preface\n'; legacy.prefix = legacy.prefix.replace('thought_inbox_schema: 1', 'custom_field: keep\nthought_inbox_schema: 1'); legacy.suffix += 'Appendix';
  const raw = renderDocument(parseDocument(legacyRender(legacy)));
  const parsed = parseDocument(raw);
  assert.deepEqual(parsed.thought, t); assert.equal(parsed.properties?.custom_field, 'keep');
  assert.ok(parsed.suffix.includes('Preface') && parsed.suffix.includes('Appendix'));
  assert.ok(!raw.includes('<!-- thought-inbox:') && !raw.includes('<!-- Add personal notes'));
});
test('Manual YAML property edits and custom properties survive saves', () => {
  const doc = newDocument(thought()); doc.properties = { custom: ['one', 'two'] };
  const raw = renderDocument(doc).replace('status: ready', 'status: resolved');
  const parsed = parseDocument(raw);
  assert.equal(parsed.thought.status, 'resolved'); assert.deepEqual(parseDocument(renderDocument(parsed)).properties?.custom, ['one', 'two']);
});
test('Missing headings, malformed quoted text and unknown new schema abort without dropping content', () => {
  const raw = renderDocument(newDocument(thought()));
  for (const broken of [raw.replace('## My thought', '## Missing'), raw.replace('> 我的问题', 'bare text'), raw.replace('thought_inbox_schema: 2', 'thought_inbox_schema: 3')]) assert.throws(() => parseDocument(broken));
});
