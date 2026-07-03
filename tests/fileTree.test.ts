import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileTree, resolveListPath, shouldIncludeFileTreeEntry, sortFileTreeNodes } from '../electron/fileTree/fileTree';
import type { FileTreeNode } from '../electron/fileTree/types';

describe('shouldIncludeFileTreeEntry', () => {
  it('excludes heavy generated directories', () => {
    expect(shouldIncludeFileTreeEntry('node_modules')).toBe(false);
    expect(shouldIncludeFileTreeEntry('.git')).toBe(false);
    expect(shouldIncludeFileTreeEntry('out')).toBe(false);
  });

  it('includes normal files and folders', () => {
    expect(shouldIncludeFileTreeEntry('src')).toBe(true);
    expect(shouldIncludeFileTreeEntry('README.md')).toBe(true);
  });
});

describe('sortFileTreeNodes', () => {
  it('sorts directories before files and then by name', () => {
    const nodes: FileTreeNode[] = [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' },
      { name: 'src', relativePath: 'src', kind: 'directory' },
      { name: 'docs', relativePath: 'docs', kind: 'directory' },
      { name: 'package.json', relativePath: 'package.json', kind: 'file' }
    ];

    expect(sortFileTreeNodes(nodes).map((node) => node.name)).toEqual([
      'docs',
      'src',
      'package.json',
      'README.md'
    ]);
  });
});

describe('resolveListPath', () => {
  const root = resolve(tmpdir(), 'quarterdeck-root');

  it('returns the root itself when relativePath is omitted', () => {
    expect(resolveListPath(root)).toBe(resolve(root));
    expect(resolveListPath(root, '')).toBe(resolve(root));
  });

  it('resolves nested relative paths under the root', () => {
    expect(resolveListPath(root, join('src', 'components'))).toBe(resolve(root, 'src', 'components'));
  });

  it('rejects absolute paths', () => {
    expect(() => resolveListPath(root, root)).toThrow('相対パス');
  });

  it('rejects traversal outside the root', () => {
    expect(() => resolveListPath(root, join('..', 'other'))).toThrow('現在のディレクトリの外');
  });

  it('accepts paths under a drive root working directory', () => {
    const driveRoot = parse(resolve(tmpdir())).root;
    expect(resolveListPath(driveRoot, 'foo')).toBe(resolve(driveRoot, 'foo'));
  });
});

describe('readFileTree (lazy)', () => {
  let root = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'quarterdeck-tree-'));
    await writeFile(join(root, 'a.txt'), 'a');
    await mkdir(join(root, 'sub', 'nested'), { recursive: true });
    await writeFile(join(root, 'sub', 'b.txt'), 'b');
    await writeFile(join(root, 'sub', 'nested', 'c.txt'), 'c');
    await mkdir(join(root, 'node_modules'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists only direct entries of the root without children', async () => {
    const result = await readFileTree(root);
    expect(result.ok).toBe(true);
    expect(result.nodes?.map((node) => node.name)).toEqual(['sub', 'a.txt']);
    expect(result.nodes?.every((node) => !('children' in node))).toBe(true);
  });

  it('lists a subdirectory with relativePath keys relative to the root', async () => {
    const result = await readFileTree(root, 'sub');
    expect(result.ok).toBe(true);
    expect(result.nodes?.map((node) => node.relativePath)).toEqual([
      join('sub', 'nested'),
      join('sub', 'b.txt')
    ]);
  });

  it('returns ok:false for traversal without throwing', async () => {
    const result = await readFileTree(root, join('..', 'escape'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('現在のディレクトリの外');
  });

  it('returns ok:false for a missing directory', async () => {
    const result = await readFileTree(root, 'no-such-dir');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
