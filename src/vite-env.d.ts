/// <reference types="vite/client" />

import type { TerminalBridgeApi } from '../electron/terminal/types';
import type { FileTreeBridgeApi } from '../electron/fileTree/types';
import type { FilePreviewBridgeApi } from '../electron/filePreview/types';
import type { GitCommitDetailBridgeApi } from '../electron/gitCommitDetail/types';
import type { GitLogBridgeApi } from '../electron/gitLog/types';
import type { GitWorktreeBridgeApi } from '../electron/gitWorktree/types';
import type { AppearanceBridgeApi } from '../electron/appearance/types';
import type { UsageBridgeApi } from '../electron/usage/types';

declare global {
  interface Window {
    terminalApi?: TerminalBridgeApi;
    fileTreeApi?: FileTreeBridgeApi;
    filePreviewApi?: FilePreviewBridgeApi;
    gitLogApi?: GitLogBridgeApi;
    gitWorktreeApi?: GitWorktreeBridgeApi;
    gitCommitDetailApi?: GitCommitDetailBridgeApi;
    appearanceApi?: AppearanceBridgeApi;
    usageApi?: UsageBridgeApi;
  }
}
