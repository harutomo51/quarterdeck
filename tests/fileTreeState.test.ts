import { describe, expect, it } from 'vitest';
import type { FileTreeNode } from '../electron/fileTree/types';
import { removeDirectoryChildren, setDirectoryChildren, toggleExpandedDirectoryPath } from '../src/lib/fileTreeState';

const children: FileTreeNode[] = [
  { name: 'App.tsx', relativePath: 'src\\App.tsx', kind: 'file' },
  { name: 'components', relativePath: 'src\\components', kind: 'directory' }
];

describe('toggleExpandedDirectoryPath', () => {
  it('adds a closed directory path and removes an open one', () => {
    expect(toggleExpandedDirectoryPath(new Set(['src']), 'src\\components')).toEqual(
      new Set(['src', 'src\\components'])
    );
    expect(toggleExpandedDirectoryPath(new Set(['src']), 'src')).toEqual(new Set());
  });

  it('does not mutate the input set', () => {
    const input = new Set(['src']);
    toggleExpandedDirectoryPath(input, 'docs');
    expect(input).toEqual(new Set(['src']));
  });
});

describe('setDirectoryChildren', () => {
  it('stores children under the directory path without mutating the input map', () => {
    const input = new Map<string, FileTreeNode[]>();
    const next = setDirectoryChildren(input, 'src', children);
    expect(next.get('src')).toEqual(children);
    expect(input.size).toBe(0);
  });

  it('replaces an existing entry', () => {
    const input = new Map([['src', children]]);
    const next = setDirectoryChildren(input, 'src', []);
    expect(next.get('src')).toEqual([]);
  });
});

describe('removeDirectoryChildren', () => {
  it('removes only the given path without mutating the input map', () => {
    const input = new Map([
      ['src', children],
      ['docs', []]
    ]);
    const next = removeDirectoryChildren(input, 'src');
    expect(next.has('src')).toBe(false);
    expect(next.get('docs')).toEqual([]);
    expect(input.has('src')).toBe(true);
  });
});
