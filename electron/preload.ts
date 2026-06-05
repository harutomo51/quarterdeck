import { contextBridge, ipcRenderer } from 'electron';
import { APPEARANCE_CHANNELS, type AppearanceBridgeApi, type AppearanceCommandPayload } from './appearance/types';
import { FILE_PREVIEW_CHANNELS, type FilePreviewBridgeApi, type FilePreviewOpenResult } from './filePreview/types';
import { FILE_TREE_CHANNELS, type FileTreeBridgeApi, type FileTreeResult } from './fileTree/types';
import {
  GIT_COMMIT_DETAIL_CHANNELS,
  type GitCommitDetailBridgeApi,
  type GitCommitDetailResult
} from './gitCommitDetail/types';
import { GIT_LOG_CHANNELS, type GitLogBridgeApi, type GitLogResult } from './gitLog/types';
import { GIT_WORKTREE_CHANNELS, type GitWorktreeBridgeApi, type GitWorktreeResult } from './gitWorktree/types';
import {
  TERMINAL_CHANNELS,
  type TerminalBridgeApi,
  type TerminalCwdChangePayload,
  type TerminalDataPayload,
  type TerminalExitPayload,
  type TerminalInputPayload,
  type TerminalResizePayload,
  type TerminalStartResult
} from './terminal/types';

const terminalApi: TerminalBridgeApi = {
  start: (paneId: string, cwd?: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.start, { paneId, cwd }) as Promise<TerminalStartResult>,
  input: (payload: TerminalInputPayload) => ipcRenderer.invoke(TERMINAL_CHANNELS.input, payload) as Promise<void>,
  resize: (payload: TerminalResizePayload) => ipcRenderer.invoke(TERMINAL_CHANNELS.resize, payload) as Promise<void>,
  restart: (paneId: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.restart, { paneId }) as Promise<TerminalStartResult>,
  close: (paneId: string) => ipcRenderer.invoke(TERMINAL_CHANNELS.close, { paneId }) as Promise<void>,
  readClipboard: () => ipcRenderer.invoke(TERMINAL_CHANNELS.readClipboard) as Promise<string>,
  onData: (callback: (payload: TerminalDataPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataPayload) => callback(payload);
    ipcRenderer.on(TERMINAL_CHANNELS.onData, listener);
    return () => ipcRenderer.off(TERMINAL_CHANNELS.onData, listener);
  },
  onExit: (callback: (payload: TerminalExitPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitPayload) => callback(payload);
    ipcRenderer.on(TERMINAL_CHANNELS.onExit, listener);
    return () => ipcRenderer.off(TERMINAL_CHANNELS.onExit, listener);
  },
  onCwdChange: (callback: (payload: TerminalCwdChangePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalCwdChangePayload) => callback(payload);
    ipcRenderer.on(TERMINAL_CHANNELS.onCwdChange, listener);
    return () => ipcRenderer.off(TERMINAL_CHANNELS.onCwdChange, listener);
  }
};

const fileTreeApi: FileTreeBridgeApi = {
  list: (paneId?: string) => ipcRenderer.invoke(FILE_TREE_CHANNELS.list, paneId) as Promise<FileTreeResult>
};

const filePreviewApi: FilePreviewBridgeApi = {
  open: (relativePath: string, paneId?: string) => ipcRenderer.invoke(FILE_PREVIEW_CHANNELS.open, relativePath, paneId) as Promise<FilePreviewOpenResult>
};

const gitLogApi: GitLogBridgeApi = {
  list: (paneId?: string) => ipcRenderer.invoke(GIT_LOG_CHANNELS.list, paneId) as Promise<GitLogResult>
};

const gitWorktreeApi: GitWorktreeBridgeApi = {
  list: (paneId?: string) => ipcRenderer.invoke(GIT_WORKTREE_CHANNELS.list, paneId) as Promise<GitWorktreeResult>
};

const gitCommitDetailApi: GitCommitDetailBridgeApi = {
  open: (hash: string, paneId?: string) => ipcRenderer.invoke(GIT_COMMIT_DETAIL_CHANNELS.open, hash, paneId) as Promise<GitCommitDetailResult>
};

const appearanceApi: AppearanceBridgeApi = {
  onCommand: (callback: (payload: AppearanceCommandPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AppearanceCommandPayload) => callback(payload);
    ipcRenderer.on(APPEARANCE_CHANNELS.onCommand, listener);
    return () => ipcRenderer.off(APPEARANCE_CHANNELS.onCommand, listener);
  }
};

contextBridge.exposeInMainWorld('terminalApi', terminalApi);
contextBridge.exposeInMainWorld('fileTreeApi', fileTreeApi);
contextBridge.exposeInMainWorld('filePreviewApi', filePreviewApi);
contextBridge.exposeInMainWorld('gitLogApi', gitLogApi);
contextBridge.exposeInMainWorld('gitWorktreeApi', gitWorktreeApi);
contextBridge.exposeInMainWorld('gitCommitDetailApi', gitCommitDetailApi);
contextBridge.exposeInMainWorld('appearanceApi', appearanceApi);
