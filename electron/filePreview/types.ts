export const FILE_PREVIEW_CHANNELS = {
  open: 'filePreview:open'
} as const;

export type FilePreviewKind = 'markdown' | 'html' | 'code' | 'text' | 'pdf' | 'image';

export interface FilePreviewOpenResult {
  ok: boolean;
  error?: string;
}

export interface FilePreviewBridgeApi {
  open: (relativePath: string, paneId?: string) => Promise<FilePreviewOpenResult>;
}
