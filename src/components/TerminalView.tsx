import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { SquareSplitHorizontal, SquareSplitVertical, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppLogLevel } from '../App';
import { getTerminalBridge } from '../lib/terminalBridge';
import { shouldForwardTabToPty, shouldPasteFromClipboard } from '../lib/terminalKeys';
import type { TerminalSplitDirection } from '../lib/terminalLayout';
import { detectTerminalTool, detectTerminalToolFromOutput, terminalOutputHasPromptMarker, type TerminalTool } from '../lib/terminalTool';

interface TerminalViewProps {
  paneId: string;
  title: string;
  initialCwd?: string;
  tool: TerminalTool;
  restartToken: number;
  isActive: boolean;
  canClose: boolean;
  onActivate: (paneId: string) => void;
  onClose: (paneId: string) => void;
  onShellChange: (paneId: string, shellName: string) => void;
  onCwdChange: (paneId: string, cwd: string) => void;
  onToolChange: (paneId: string, tool: TerminalTool) => void;
  onLog: (message: string, level?: AppLogLevel) => void;
  onSplit: (paneId: string, direction: TerminalSplitDirection) => void;
}

export function TerminalView({
  paneId,
  title,
  initialCwd,
  tool,
  restartToken,
  isActive,
  canClose,
  onActivate,
  onClose,
  onShellChange,
  onCwdChange,
  onToolChange,
  onLog,
  onSplit
}: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initialCwdRef = useRef(initialCwd);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    let removeDataListener: () => void = () => undefined;
    let removeExitListener: () => void = () => undefined;
    let commandBuffer = '';

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      scrollback: 5000,
      fontFamily: '"Cascadia Mono", "Consolas", monospace',
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: 'rgba(8, 10, 16, 0)',
        foreground: '#f6f8ff',
        cursor: '#ffffff',
        selectionBackground: '#6171ff66'
      },
      allowTransparency: true
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const bridge = getTerminalBridge();

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && shouldForwardTabToPty(event)) {
        event.preventDefault();
        bridge.input({ paneId, data: '\t' }).catch((inputError: unknown) => {
          console.error('Renderer tab IPC failed', inputError);
          setError('Tab key could not be sent to the PTY.');
        });
        return false;
      }

      // Ctrl+V はクリップボードのテキストを xterm の paste 経由で注入する。
      // 生の 0x16 を PTY に送ると Claude Code など raw モードの TUI で貼り付けが効かないため、
      // ここでエミュレータ側が実際の貼り付け（bracketed paste 対応）を行う。
      if (event.type === 'keydown' && shouldPasteFromClipboard(event)) {
        event.preventDefault();
        bridge
          .readClipboard()
          .then((text) => {
            if (text) {
              terminal.paste(text);
            }
          })
          .catch((clipboardError: unknown) => {
            console.error('Renderer clipboard read failed', clipboardError);
            setError('Clipboard text could not be pasted.');
          });
        return false;
      }

      return true;
    });

    const resizePty = () => {
      try {
        fitAddon.fit();
        void bridge.resize({ paneId, cols: terminal.cols, rows: terminal.rows });
      } catch (resizeError) {
        console.error('Renderer resize failed', resizeError);
        onLog('Terminal resize failed.', 'error');
      }
    };

    const observer = new ResizeObserver(resizePty);
    observer.observe(containerRef.current);

    removeDataListener = bridge.onData((payload) => {
      if (payload.paneId === paneId) {
        terminal.write(payload.data);
        const outputTool = detectTerminalToolFromOutput(payload.data);
        if (outputTool !== 'none') {
          onToolChange(paneId, outputTool);
          return;
        }

        if (terminalOutputHasPromptMarker(payload.data)) {
          onToolChange(paneId, 'none');
        }
      }
    });
    removeExitListener = bridge.onExit((payload) => {
      if (payload.paneId === paneId) {
        onLog(`PTY exited: exitCode=${payload.exitCode ?? 'null'}`);
      }
    });

    const inputDisposable = terminal.onData((data) => {
      commandBuffer += data;
      if (data.includes('\r')) {
        onToolChange(paneId, detectTerminalTool(commandBuffer.replace(/\r/g, '').replace(/\n/g, '')));
        commandBuffer = '';
      }

      bridge.input({ paneId, data }).catch((inputError: unknown) => {
        console.error('Renderer input IPC failed', inputError);
        setError('Input could not be sent to the PTY.');
      });
    });

    const start = async () => {
      try {
        const result = restartToken > 0 ? await bridge.restart(paneId) : await bridge.start(paneId, initialCwdRef.current);
        if (!result.ok || !result.shell) {
          const message = result.error ?? 'Failed to start PowerShell.';
          setError(message);
          terminal.writeln(`\r\n[Quarterdeck] ${message}`);
          onLog(message, 'error');
          return;
        }

        setError(null);
        onShellChange(paneId, result.shell.displayName);
        if (result.cwd) {
          onCwdChange(paneId, result.cwd);
        }
        onLog(`${result.shell.name} started.`);
        window.setTimeout(resizePty, 50);
      } catch (startError) {
        const message = startError instanceof Error ? startError.message : 'Renderer initialization failed.';
        console.error('Renderer terminal initialization failed', startError);
        setError(message);
        onLog(message, 'error');
      }
    };

    void start();

    return () => {
      observer.disconnect();
      inputDisposable.dispose();
      removeDataListener();
      removeExitListener();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [paneId, restartToken, onLog, onShellChange, onCwdChange, onToolChange]);

  useEffect(() => {
    if (isActive) {
      terminalRef.current?.focus();
    }
  }, [isActive]);

  return (
    <section
      className={`terminal-frame terminal-frame--tool-${tool}${isActive ? ' terminal-frame--active' : ''}`}
      onMouseDown={() => onActivate(paneId)}
    >
      <div className="terminal-pane-label">
        {title}
        {tool !== 'none' ? <span className="terminal-pane-tool">{tool}</span> : null}
      </div>
      <div className="terminal-pane-toolbar">
        <button type="button" title="Split vertically" onClick={() => onSplit(paneId, 'vertical')}>
          <SquareSplitHorizontal size={15} />
        </button>
        <button type="button" title="Split horizontally" onClick={() => onSplit(paneId, 'horizontal')}>
          <SquareSplitVertical size={15} />
        </button>
        <button type="button" title="Close pane" disabled={!canClose} onClick={() => onClose(paneId)}>
          <X size={15} />
        </button>
      </div>
      {error ? <div className="terminal-error">{error}</div> : null}
      <div className="terminal-host" ref={containerRef} />
    </section>
  );
}
