import type { FileTreeNode } from '../../electron/fileTree/types';

export function toggleExpandedDirectoryPath(paths: ReadonlySet<string>, relativePath: string): Set<string> {
  const nextPaths = new Set(paths);
  if (nextPaths.has(relativePath)) {
    nextPaths.delete(relativePath);
  } else {
    nextPaths.add(relativePath);
  }
  return nextPaths;
}

export function setDirectoryChildren(
  cache: ReadonlyMap<string, FileTreeNode[]>,
  relativePath: string,
  children: FileTreeNode[]
): Map<string, FileTreeNode[]> {
  const nextCache = new Map(cache);
  nextCache.set(relativePath, children);
  return nextCache;
}

export function removeDirectoryChildren(
  cache: ReadonlyMap<string, FileTreeNode[]>,
  relativePath: string
): Map<string, FileTreeNode[]> {
  const nextCache = new Map(cache);
  nextCache.delete(relativePath);
  return nextCache;
}
