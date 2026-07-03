import { describe, expect, it } from 'vitest';
import type { FileTreeNode } from '../electron/fileTree/types';
import { getDirectoryPaths, pruneExpandedDirectoryPaths, toggleExpandedDirectoryPath } from '../src/lib/fileTreeState';

const nodes: FileTreeNode[] = [
  {
    name: 'src',
    relativePath: 'src',
    kind: 'directory',
    children: [
      { name: 'App.tsx', relativePath: 'src\\App.tsx', kind: 'file' },
      {
        name: 'components',
        relativePath: 'src\\components',
        kind: 'directory',
        children: [{ name: 'FilePanel.tsx', relativePath: 'src\\components\\FilePanel.tsx', kind: 'file' }]
      }
    ]
  },
  { name: 'README.md', relativePath: 'README.md', kind: 'file' }
];

describe('getDirectoryPaths', () => {
  it('collects directory relative paths recursively', () => {
    expect(getDirectoryPaths(nodes)).toEqual(new Set(['src', 'src\\components']));
  });
});

describe('toggleExpandedDirectoryPath', () => {
  it('adds a closed directory path and removes an open one', () => {
    expect(toggleExpandedDirectoryPath(new Set(['src']), 'src\\components')).toEqual(
      new Set(['src', 'src\\components'])
    );
    expect(toggleExpandedDirectoryPath(new Set(['src']), 'src')).toEqual(new Set());
  });
});

describe('pruneExpandedDirectoryPaths', () => {
  it('keeps only expanded paths that still exist in the tree', () => {
    expect(pruneExpandedDirectoryPaths(new Set(['src', 'old']), nodes)).toEqual(new Set(['src']));
  });
});
