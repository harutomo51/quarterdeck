export const FILE_TREE_CHANNELS = {
  list: 'fileTree:list'
} as const;

export type FileTreeNodeKind = 'file' | 'directory';

export interface FileTreeNode {
  name: string;
  relativePath: string;
  kind: FileTreeNodeKind;
  children?: FileTreeNode[];
}

export interface FileTreeResult {
  ok: boolean;
  rootPath?: string;
  nodes?: FileTreeNode[];
  error?: string;
}

export interface FileTreeBridgeApi {
  list: (paneId?: string, relativePath?: string) => Promise<FileTreeResult>;
}
