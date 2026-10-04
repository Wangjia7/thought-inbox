import { automaticTitle, Thought } from '../src/model';
export const NOW = '2026-10-05T00:00:00.000Z';
export function thought(id = 'thought-123'): Thought {
  return { id, title: automaticTitle(NOW), original: '原文\n\nsecond line', userThought: '我的问题', source: '[[source.md]]', project: '科研', status: 'ready', createdAt: NOW, updatedAt: NOW, branches: [] };
}
