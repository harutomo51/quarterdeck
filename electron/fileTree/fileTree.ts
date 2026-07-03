import { readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FileTreeNode, FileTreeResult } from './types';

const EXCLUDED_NAMES = new Set([
  '.git',
  '.vite',
  'dist',
  'dist-electron',
  'node_modules',
  'out'
]);

export function shouldIncludeFileTreeEntry(name: string): boolean {
  return !EXCLUDED_NAMES.has(name);
}

export function sortFileTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function resolveListPath(rootPath: string, relativePath?: string): string {
  const root = resolve(rootPath);
  if (!relativePath) {
    return root;
  }

  if (isAbsolute(relativePath)) {
    throw new Error('ファイル一覧のパスは相対パスで指定してください。');
  }

  const target = resolve(root, relativePath);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error('ファイル一覧のパスが現在のディレクトリの外を指しています。');
  }

  return target;
}

export async function readFileTree(rootPath = process.cwd(), relativePath?: string): Promise<FileTreeResult> {
  const resolvedRoot = resolve(rootPath);

  try {
    const directoryPath = resolveListPath(resolvedRoot, relativePath);
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      if (!shouldIncludeFileTreeEntry(entry.name)) {
        continue;
      }

      if (!entry.isDirectory() && !entry.isFile()) {
        continue;
      }

      const absolutePath = join(directoryPath, entry.name);
      nodes.push({
        name: entry.name,
        relativePath: relative(resolvedRoot, absolutePath),
        kind: entry.isDirectory() ? 'directory' : 'file'
      });
    }

    return {
      ok: true,
      rootPath: resolvedRoot,
      nodes: sortFileTreeNodes(nodes)
    };
  } catch (error) {
    console.error('Failed to read file tree', error);
    return {
      ok: false,
      rootPath: resolvedRoot,
      error: error instanceof Error ? error.message : 'ファイル一覧の取得に失敗しました。'
    };
  }
}
