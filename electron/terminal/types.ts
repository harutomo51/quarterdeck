export const TERMINAL_CHANNELS = {
  start: 'terminal:start',
  input: 'terminal:input',
  resize: 'terminal:resize',
  restart: 'terminal:restart',
  close: 'terminal:close',
  onData: 'terminal:onData',
  onExit: 'terminal:onExit',
  onCwdChange: 'terminal:onCwdChange',
  readClipboard: 'terminal:readClipboard'
} as const;

export type TerminalChannel = (typeof TERMINAL_CHANNELS)[keyof typeof TERMINAL_CHANNELS];

export interface ShellInfo {
  name: 'pwsh.exe' | 'powershell.exe';
  displayName: 'PowerShell 7' | 'Windows PowerShell';
}

export interface TerminalStartResult {
  ok: boolean;
  shell?: ShellInfo;
  cwd?: string;
  error?: string;
}

export interface TerminalPanePayload {
  paneId: string;
}

export interface TerminalStartPayload extends TerminalPanePayload {
  cwd?: string;
}

export interface TerminalInputPayload extends TerminalPanePayload {
  data: string;
}

export interface TerminalResizePayload {
  paneId: string;
  cols: number;
  rows: number;
}

export interface TerminalExitPayload {
  paneId: string;
  exitCode: number | null;
  signal?: number;
}

export interface TerminalCwdChangePayload {
  paneId: string;
  cwd: string;
}

export interface TerminalDataPayload {
  paneId: string;
  data: string;
}

export interface TerminalBridgeApi {
  start: (paneId: string, cwd?: string) => Promise<TerminalStartResult>;
  input: (payload: TerminalInputPayload) => Promise<void>;
  resize: (payload: TerminalResizePayload) => Promise<void>;
  restart: (paneId: string) => Promise<TerminalStartResult>;
  close: (paneId: string) => Promise<void>;
  readClipboard: () => Promise<string>;
  onData: (callback: (payload: TerminalDataPayload) => void) => () => void;
  onExit: (callback: (payload: TerminalExitPayload) => void) => () => void;
  onCwdChange: (callback: (payload: TerminalCwdChangePayload) => void) => () => void;
}
