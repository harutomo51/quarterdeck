import type { FileTreeNode } from '../../electron/fileTree/types';

export function getDirectoryPaths(nodes: FileTreeNode[]): Set<string> {
  const paths = new Set<string>();

  for (const node of nodes) {
    if (node.kind !== 'directory') {
      continue;
    }

    paths.add(node.relativePath);
    if (node.children) {
      for (const childPath of getDirectoryPaths(node.children)) {
        paths.add(childPath);
      }
    }
  }

  return paths;
}

export function toggleExpandedDirectoryPath(paths: Set<string>, relativePath: string): Set<string> {
  const nextPaths = new Set(paths);
  if (nextPaths.has(relativePath)) {
    nextPaths.delete(relativePath);
  } else {
    nextPaths.add(relativePath);
  }
  return nextPaths;
}

export function pruneExpandedDirectoryPaths(paths: Set<string>, nodes: FileTreeNode[]): Set<string> {
  const availablePaths = getDirectoryPaths(nodes);
  return new Set([...paths].filter((path) => availablePaths.has(path)));
}
