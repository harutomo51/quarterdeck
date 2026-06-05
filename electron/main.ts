import { app, BrowserWindow, clipboard, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { APPEARANCE_CHANNELS, type AppearanceCommand } from './appearance/types';
import { openFilePreview } from './filePreview/filePreview';
import { FILE_PREVIEW_CHANNELS } from './filePreview/types';
import { openGitCommitDetail } from './gitCommitDetail/gitCommitDetail';
import { GIT_COMMIT_DETAIL_CHANNELS } from './gitCommitDetail/types';
import { readFileTree } from './fileTree/fileTree';
import { FILE_TREE_CHANNELS } from './fileTree/types';
import { readGitLog } from './gitLog/gitLog';
import { GIT_LOG_CHANNELS } from './gitLog/types';
import { readGitWorktrees } from './gitWorktree/gitWorktree';
import { GIT_WORKTREE_CHANNELS } from './gitWorktree/types';
import { PtyManager } from './terminal/ptyManager';
import { TERMINAL_CHANNELS, type TerminalInputPayload, type TerminalPanePayload, type TerminalResizePayload, type TerminalStartPayload } from './terminal/types';

let mainWindow: BrowserWindow | null = null;
const ptyManager = new PtyManager();

function getApplicationIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'image/icon/application_icon.png');
  }

  return join(__dirname, '../../image/icon/application_icon.png');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 780,
    minHeight: 480,
    title: 'Quarterdeck',
    icon: getApplicationIconPath(),
    backgroundColor: '#10131a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  ptyManager.onData((payload) => {
    mainWindow?.webContents.send(TERMINAL_CHANNELS.onData, payload);
  });

  ptyManager.onExit((payload) => {
    mainWindow?.webContents.send(TERMINAL_CHANNELS.onExit, payload);
  });

  ptyManager.onCwdChange((payload) => {
    mainWindow?.webContents.send(TERMINAL_CHANNELS.onCwdChange, payload);
  });

  mainWindow.maximize();

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    ptyManager.dispose();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.harutomo51.quarterdeck');
  }

  registerIpcHandlers();
  createWindow();
  setApplicationMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  ptyManager.dispose();
});

app.on('window-all-closed', () => {
  ptyManager.dispose();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function setApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Appearance',
          submenu: [
            {
              label: 'Open Appearance Settings',
              accelerator: 'CmdOrCtrl+,',
              click: () => sendAppearanceCommand('open-settings')
            },
            {
              label: 'Cycle Background',
              click: () => sendAppearanceCommand('cycle-background')
            }
          ]
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendAppearanceCommand(command: AppearanceCommand): void {
  mainWindow?.webContents.send(APPEARANCE_CHANNELS.onCommand, { command });
}

function registerIpcHandlers(): void {
  ipcMain.handle(FILE_PREVIEW_CHANNELS.open, (_event, relativePath: string, paneId?: string) => openFilePreview(ptyManager.getCurrentCwd(paneId), relativePath));
  ipcMain.handle(FILE_TREE_CHANNELS.list, (_event, paneId?: string) => readFileTree(ptyManager.getCurrentCwd(paneId)));
  ipcMain.handle(GIT_LOG_CHANNELS.list, (_event, paneId?: string) => readGitLog(ptyManager.getCurrentCwd(paneId)));
  ipcMain.handle(GIT_WORKTREE_CHANNELS.list, (_event, paneId?: string) => readGitWorktrees(ptyManager.getCurrentCwd(paneId)));
  ipcMain.handle(GIT_COMMIT_DETAIL_CHANNELS.open, (_event, hash: string, paneId?: string) => openGitCommitDetail(ptyManager.getCurrentCwd(paneId), hash));
  ipcMain.handle(TERMINAL_CHANNELS.start, (_event, payload: TerminalStartPayload) => ptyManager.start(payload.paneId, payload.cwd));
  ipcMain.handle(TERMINAL_CHANNELS.restart, (_event, payload: TerminalPanePayload) => ptyManager.restart(payload.paneId));
  ipcMain.handle(TERMINAL_CHANNELS.close, (_event, payload: TerminalPanePayload) => {
    ptyManager.close(payload.paneId);
  });
  ipcMain.handle(TERMINAL_CHANNELS.readClipboard, () => clipboard.readText());
  ipcMain.handle(TERMINAL_CHANNELS.input, (_event, payload: TerminalInputPayload) => {
    try {
      ptyManager.write(payload.paneId, payload.data);
    } catch (error) {
      console.error('Failed to write PTY input', error);
      throw error;
    }
  });
  ipcMain.handle(TERMINAL_CHANNELS.resize, (_event, payload: TerminalResizePayload) => {
    try {
      ptyManager.resize(payload);
    } catch (error) {
      console.error('Failed to resize PTY', error);
      throw error;
    }
  });
}
