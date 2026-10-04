/** Local data format and validation, independent of the Obsidian runtime. */
export const STATUSES = ['inbox', 'ready', 'discussing', 'resolved', 'archived'] as const;
export type Status = typeof STATUSES[number];
export interface Branch {
  id: string;
  modelConclusion: string;
  userJudgment: string;
  source: string;
  updatedAt: string;
}
export interface Thought {
  id: string;
  title: string;
  original: string;
  userThought: string;
  source: string;
  project: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  branches: Branch[];
}
export interface Document {
  thought: Thought;
  prefix: string;
  suffix: string;
}
export interface ImportPayload {
  thoughtId: string;
  branchId: string;
  modelConclusion: string;
  discussionSource?: string;
}
const MARKER = '<!-- thought-inbox:';
const END = '<!-- thought-inbox:end -->';
const MAX_DOCUMENT = 2_000_000;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, limit = 200_000): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${name} must be text of at most ${limit} characters.`);
  if (value.includes(MARKER)) throw new Error(`${name} contains a reserved Thought Inbox marker. Remove it before saving.`);
  return value;
}
export function validateId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(value)) {
    throw new Error('IDs must contain 1–100 letters, numbers, hyphens or underscores.');
  }
  return value;
}
export function validateStatus(value: unknown): Status {
  if (!STATUSES.some(s => s === value)) throw new Error('Unknown status.');
  return value as Status;
}
function timestamp(value: unknown): string {
  const result = text(value, 'Timestamp', 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) throw new Error('Invalid timestamp.');
  return result;
}
function branch(value: unknown): Branch {
  const b = object(value);
  return { id: validateId(b.id), modelConclusion: text(b.modelConclusion, 'Model conclusion'),
    userJudgment: text(b.userJudgment, 'My judgment'), source: text(b.source, 'Discussion source', 2000), updatedAt: timestamp(b.updatedAt) };
}
export function validateThought(value: unknown): Thought {
  const t = object(value);
  if (!Array.isArray(t.branches) || t.branches.length > 100) throw new Error('A thought can have at most 100 branches.');
  const branches = t.branches.map(branch);
  if (new Set(branches.map(b => b.id)).size !== branches.length) throw new Error('Duplicate branch ID.');
  const title = text(t.title, 'Title', 200);
  if (!title.trim()) throw new Error('Enter a title.');
  return { id: validateId(t.id), title, original: text(t.original, 'Original text'), userThought: text(t.userThought, 'My thought'),
    source: text(t.source, 'Source', 2000), project: text(t.project, 'Project', 200), status: validateStatus(t.status),
    createdAt: timestamp(t.createdAt), updatedAt: timestamp(t.updatedAt), branches };
}
/** Validate before normalizePath: traversal must never be silently resolved. */
export function validateInboxPath(input: string, configDir: string): string {
  const path = input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = path.split('/');
  if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || /[:*?"<>|]/.test(p) || Array.from(p).some(c => c.charCodeAt(0) < 32))) {
    throw new Error('Use a relative vault folder such as Thought Inbox. Hidden folders, absolute paths and traversal are not allowed.');
  }
  const config = configDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (path === config || path.startsWith(`${config}/`)) throw new Error('The inbox cannot be inside the vault configuration folder.');
  return path;
}
function region(name: string, value: string): string {
  return `${MARKER}${name} -->\n${value}\n${MARKER}/${name} -->`;
}
export function renderDocument(document: Document): string {
  const t = validateThought(document.thought);
  const { original, userThought, branches, ...meta } = t;
  const content = [
    `${MARKER}record ${JSON.stringify({ schema: 1, ...meta }).replace(/>/g, '\\u003e')} -->`,
    `# ${t.title.replace(/\n/g, ' ')}`,
    `Project: ${t.project.replace(/\n/g, ' ')}  \nStatus: ${t.status}  \nSource: ${t.source.replace(/\n/g, ' ')}  \nID: ${t.id}`,
    `## Original text\n\n${region('original', original)}`,
    `## My thought\n\n${region('thought', userThought)}`,
    '## Discussions',
    ...branches.map(b => {
      const { modelConclusion, userJudgment, ...metadata } = b;
      return [`${MARKER}branch ${JSON.stringify(metadata).replace(/>/g, '\\u003e')} -->`, `### ${b.id}`, `Discussion source: ${b.source.replace(/\n/g, ' ')}`,
        `#### Model conclusion\n\n${region('model', modelConclusion)}`,
        `#### My judgment\n\n${region('judgment', userJudgment)}`, `${MARKER}/branch -->`].join('\n\n');
    }), END
  ].join('\n\n');
  const result = document.prefix + content + document.suffix;
  if (result.length > MAX_DOCUMENT) throw new Error('This note exceeds the 2 MB text limit.');
  return result;
}
function extractRegion(content: string, name: string): string {
  const start = `${MARKER}${name} -->\n`;
  const end = `\n${MARKER}/${name} -->`;
  const a = content.indexOf(start), b = content.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || content.indexOf(start, a + start.length) >= 0 || content.indexOf(end, b + end.length) >= 0) {
    throw new Error(`Missing or duplicate ${name} markers. Restore the note before updating it.`);
  }
  return content.slice(a + start.length, b);
}
export function parseDocument(raw: string): Document {
  if (raw.length > MAX_DOCUMENT) throw new Error('This note exceeds the 2 MB text limit.');
  const content = raw.replace(/\r\n/g, '\n');
  const start = `${MARKER}record `;
  const a = content.indexOf(start), b = content.indexOf(END, a);
  if (a < 0 || b < 0 || content.indexOf(start, a + start.length) >= 0 || content.indexOf(END, b + END.length) >= 0) throw new Error('Invalid Thought Inbox document boundaries.');
  const headerEnd = content.indexOf(' -->', a);
  const meta = object(JSON.parse(content.slice(a + start.length, headerEnd)) as unknown);
  if (meta.schema !== 1) throw new Error('Unsupported note schema.');
  const managed = content.slice(headerEnd + 4, b);
  const branches: Branch[] = [];
  const pattern = /<!-- thought-inbox:branch (.*?) -->\n([\s\S]*?)<!-- thought-inbox:\/branch -->/g;
  for (const match of managed.matchAll(pattern)) {
    const metadata = object(JSON.parse(match[1] ?? '') as unknown);
    const body = match[2] ?? '';
    branches.push(branch({ ...metadata, modelConclusion: extractRegion(body, 'model'), userJudgment: extractRegion(body, 'judgment') }));
  }
  // Reject partially deleted branch delimiters instead of dropping discussion data.
  if (managed.split(`${MARKER}branch `).length - 1 !== branches.length || managed.split(`${MARKER}/branch -->`).length - 1 !== branches.length) throw new Error('Damaged branch markers.');
  const tokens = [...managed.matchAll(/<!-- thought-inbox:(.*?) -->/g)].map(m => (m[1] ?? '').startsWith('branch ') ? 'branch' : m[1]);
  const expected = ['original', '/original', 'thought', '/thought', ...branches.flatMap(() => ['branch', 'model', '/model', 'judgment', '/judgment', '/branch'])];
  if (managed.split(MARKER).length - 1 !== tokens.length || tokens.length !== expected.length || tokens.some((token, index) => token !== expected[index])) {
    throw new Error('Damaged or unexpected content markers. Restore the note before updating it.');
  }
  const thought = validateThought({ ...meta, original: extractRegion(managed, 'original'), userThought: extractRegion(managed, 'thought'), branches });
  return { thought, prefix: content.slice(0, a), suffix: content.slice(b + END.length) };
}
export function newDocument(t: Thought): Document {
  validateThought(t);
  return { thought: t, prefix: `---\nthought_inbox_schema: 1\nthought_id: ${JSON.stringify(t.id)}\n---\n\n`, suffix: '\n\n<!-- Add personal notes below this line; they are preserved on updates. -->\n' };
}
export function parseImport(input: string): ImportPayload {
  if (input.length > 500_000) throw new Error('Import is limited to 500,000 characters.');
  const p = object(JSON.parse(input) as unknown);
  const allowed = new Set(['thoughtId', 'branchId', 'modelConclusion', 'discussionSource']);
  if (Object.keys(p).some(key => !allowed.has(key))) throw new Error('Import allows only thoughtId, branchId, modelConclusion and discussionSource. Personal judgments must be entered by you.');
  const conclusion = text(p.modelConclusion, 'Model conclusion');
  if (!conclusion.trim()) throw new Error('Enter a model conclusion.');
  return { thoughtId: validateId(p.thoughtId), branchId: validateId(p.branchId), modelConclusion: conclusion,
    ...(p.discussionSource === undefined ? {} : { discussionSource: text(p.discussionSource, 'Discussion source', 2000) }) };
}
export function updateDiscussion(t: Thought, p: ImportPayload, now: string, userJudgment?: string): Thought {
  if (t.id !== p.thoughtId) throw new Error('The thought ID does not match this note.');
  const old = t.branches.find(b => b.id === p.branchId);
  const updated = branch({ id: p.branchId, modelConclusion: p.modelConclusion,
    userJudgment: userJudgment ?? old?.userJudgment ?? '', source: p.discussionSource ?? old?.source ?? '', updatedAt: now });
  const branches = old ? t.branches.map(b => b.id === p.branchId ? updated : b) : [...t.branches, updated];
  return validateThought({ ...t, updatedAt: now, branches });
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.';
}
