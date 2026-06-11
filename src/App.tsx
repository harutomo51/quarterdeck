import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { AppearanceSettings } from './components/AppearanceSettings';
import { FilePanel } from './components/FilePanel';
import { TerminalView } from './components/TerminalView';
import { UsageBar } from './components/UsageBar';
import { clampSidePanelWidth, loadSidePanelWidth, saveSidePanelWidth } from './lib/sidePanelLayout';
import { getAppearanceBridge } from './lib/appearanceBridge';
import { loadAppearance, saveAppearance, type BackgroundMode } from './lib/appearanceStorage';
import { normalizeHexColor } from './lib/backgroundColor';
import { normalizeOpacity } from './lib/opacity';
import { getTerminalBridge } from './lib/terminalBridge';
import {
  collectTerminalPaneIds,
  createInitialTerminalLayout,
  removeTerminalPane,
  splitTerminalPane,
  type TerminalLayoutNode,
  type TerminalSplitDirection
} from './lib/terminalLayout';
import type { TerminalTool } from './lib/terminalTool';
import './styles/terminal.css';

export type AppLogLevel = 'info' | 'error';

interface TerminalPane {
  id: string;
  shellName: string;
  cwd: string;
  tool: TerminalTool;
}

export default function App(): JSX.Element {
  const initialAppearance = useRef(loadAppearance());
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>(initialAppearance.current.backgroundMode);
  const [customBackgroundColor, setCustomBackgroundColor] = useState(initialAppearance.current.customBackgroundColor);
  const [terminalBackgroundColor, setTerminalBackgroundColor] = useState(initialAppearance.current.terminalBackgroundColor);
  const [terminalOpacity, setTerminalOpacity] = useState(initialAppearance.current.terminalOpacity);
  const [isAppearanceOpen, setAppearanceOpen] = useState(false);
  const [isSidePanelVisible, setSidePanelVisible] = useState(true);
  const [sidePanelWidth, setSidePanelWidth] = useState<number>(() => loadSidePanelWidth());
  const [isResizingSidePanel, setResizingSidePanel] = useState(false);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [panes, setPanes] = useState<TerminalPane[]>([{ id: 'pane-1', shellName: 'Not started', cwd: '', tool: 'none' }]);
  const [activePaneId, setActivePaneId] = useState('pane-1');
  const [terminalLayout, setTerminalLayout] = useState<TerminalLayoutNode>(() => createInitialTerminalLayout('pane-1'));

  const addLog = useCallback((message: string, level: AppLogLevel = 'info') => {
    if (level === 'error') {
      console.error(message);
      return;
    }

    console.info(message);
  }, []);

  const updatePaneShell = useCallback((paneId: string, shellName: string) => {
    setPanes((current) => current.map((pane) => (pane.id === paneId ? { ...pane, shellName } : pane)));
  }, []);

  const updatePaneCwd = useCallback((paneId: string, cwd: string) => {
    setPanes((current) => current.map((pane) => (pane.id === paneId ? { ...pane, cwd } : pane)));
  }, []);

  const updatePaneTool = useCallback((paneId: string, tool: TerminalTool) => {
    setPanes((current) => current.map((pane) => (pane.id === paneId ? { ...pane, tool } : pane)));
  }, []);

  const splitPane = useCallback((paneId: string, direction: TerminalSplitDirection) => {
    const newPaneId = `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setTerminalLayout((current) => splitTerminalPane(current, paneId, newPaneId, direction));
    setPanes((current) => {
      const index = current.findIndex((pane) => pane.id === paneId);
      const sourceCwd = index === -1 ? '' : current[index].cwd;
      const newPane = { id: newPaneId, shellName: 'Not started', cwd: sourceCwd, tool: 'none' as TerminalTool };
      if (index === -1) {
        return [...current, newPane];
      }

      return [
        ...current.slice(0, index + 1),
        newPane,
        ...current.slice(index + 1)
      ];
    });
    setActivePaneId(newPaneId);
  }, []);

  const closePane = useCallback((paneId: string) => {
    if (panes.length <= 1) {
      return;
    }

    void getTerminalBridge().close(paneId).catch((error: unknown) => {
      console.error('Renderer terminal close IPC failed', error);
      addLog('Terminal pane close failed.', 'error');
    });

    setTerminalLayout((current) => {
      const next = removeTerminalPane(current, paneId) ?? current;
      const nextPaneIds = collectTerminalPaneIds(next);
      if (activePaneId === paneId) {
        setActivePaneId(nextPaneIds[0]);
      }
      return next;
    });
    setPanes((current) => current.filter((pane) => pane.id !== paneId));
  }, [activePaneId, addLog, panes.length]);

  const renderTerminalLayout = useCallback((node: TerminalLayoutNode, paneOrder: string[]): JSX.Element => {
    if (node.type === 'split') {
      return (
        <div className={`terminal-split terminal-split--${node.direction}`}>
          {renderTerminalLayout(node.children[0], paneOrder)}
          {renderTerminalLayout(node.children[1], paneOrder)}
        </div>
      );
    }

    const pane = panes.find((item) => item.id === node.paneId);
    const paneIndex = paneOrder.indexOf(node.paneId);

    return (
      <TerminalView
        key={node.paneId}
        paneId={node.paneId}
        title={`Pane ${paneIndex + 1} - ${pane?.shellName ?? 'Not started'}`}
        initialCwd={pane?.cwd}
        tool={pane?.tool ?? 'none'}
        restartToken={0}
        isActive={node.paneId === activePaneId}
        canClose={panes.length > 1}
        onActivate={setActivePaneId}
        onClose={closePane}
        onShellChange={updatePaneShell}
        onCwdChange={updatePaneCwd}
        onToolChange={updatePaneTool}
        onLog={addLog}
        onSplit={splitPane}
      />
    );
  }, [activePaneId, addLog, closePane, panes, splitPane, updatePaneShell, updatePaneCwd, updatePaneTool]);

  const cycleBackground = useCallback(() => {
    setBackgroundMode((current) => {
      if (current === 'aurora') return 'sunset';
      if (current === 'sunset') return 'image';
      if (current === 'image') return 'custom';
      return 'aurora';
    });
  }, []);

  const updateCustomBackgroundColor = (value: string) => {
    setCustomBackgroundColor(normalizeHexColor(value, customBackgroundColor));
    setBackgroundMode('custom');
  };

  const updateTerminalBackgroundColor = (value: string) => {
    setTerminalBackgroundColor(normalizeHexColor(value, terminalBackgroundColor));
  };

  const updateTerminalOpacity = (value: number) => {
    setTerminalOpacity(normalizeOpacity(value));
  };

  useEffect(() => {
    try {
      const bridge = getAppearanceBridge();
      return bridge.onCommand((payload) => {
        if (payload.command === 'open-settings') {
          setAppearanceOpen(true);
          return;
        }

        if (payload.command === 'cycle-background') {
          cycleBackground();
          setAppearanceOpen(true);
        }
      });
    } catch (error) {
      console.error('Failed to initialize appearance menu bridge', error);
      addLog('Appearance menu bridge is unavailable.', 'error');
      return undefined;
    }
  }, [addLog, cycleBackground]);

  useEffect(() => {
    saveAppearance({ backgroundMode, customBackgroundColor, terminalBackgroundColor, terminalOpacity });
  }, [backgroundMode, customBackgroundColor, terminalBackgroundColor, terminalOpacity]);

  useEffect(() => {
    const bridge = getTerminalBridge();
    return bridge.onCwdChange((payload) => {
      updatePaneCwd(payload.paneId, payload.cwd);
    });
  }, [updatePaneCwd]);

  useEffect(() => {
    const activePane = panes.find((pane) => pane.id === activePaneId);
    document.title = activePane?.cwd ? `Quarterdeck : ${activePane.cwd}` : 'Quarterdeck';
  }, [activePaneId, panes]);

  useEffect(() => {
    const handleViewportResize = () => {
      setSidePanelWidth((current) => clampSidePanelWidth(current, window.innerWidth));
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  const handleSidePanelResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    setResizingSidePanel(true);

    const workspaceRect = workspace.getBoundingClientRect();

    const handleMove = (pointerEvent: PointerEvent) => {
      const nextWidth = workspaceRect.right - pointerEvent.clientX;
      setSidePanelWidth(clampSidePanelWidth(nextWidth, window.innerWidth));
    };

    const handleUp = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== event.pointerId) {
        return;
      }

      target.releasePointerCapture(event.pointerId);
      target.removeEventListener('pointermove', handleMove);
      target.removeEventListener('pointerup', handleUp);
      target.removeEventListener('pointercancel', handleUp);
      setResizingSidePanel(false);
      setSidePanelWidth((current) => {
        saveSidePanelWidth(current);
        return current;
      });
    };

    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp);
    target.addEventListener('pointercancel', handleUp);
  }, []);

  const handleSidePanelResizeKey = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidePanelWidth((current) => {
        const next = clampSidePanelWidth(current + step, window.innerWidth);
        saveSidePanelWidth(next);
        return next;
      });
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidePanelWidth((current) => {
        const next = clampSidePanelWidth(current - step, window.innerWidth);
        saveSidePanelWidth(next);
        return next;
      });
    }
  }, []);

  const paneOrder = collectTerminalPaneIds(terminalLayout);

  return (
    <main
      className={`app-shell app-shell--${backgroundMode}`}
      style={{
        '--terminal-opacity': terminalOpacity,
        '--custom-background-color': customBackgroundColor,
        '--terminal-background-color': terminalBackgroundColor
      } as React.CSSProperties}
    >
      <div className="app-overlay" />
      <AppearanceSettings
        isOpen={isAppearanceOpen}
        backgroundMode={backgroundMode}
        customBackgroundColor={customBackgroundColor}
        terminalBackgroundColor={terminalBackgroundColor}
        terminalOpacity={terminalOpacity}
        onClose={() => setAppearanceOpen(false)}
        onCycleBackground={cycleBackground}
        onCustomBackgroundColorChange={updateCustomBackgroundColor}
        onTerminalBackgroundColorChange={updateTerminalBackgroundColor}
        onTerminalOpacityChange={updateTerminalOpacity}
      />
      <button
        type="button"
        className="side-panel-toggle"
        title={isSidePanelVisible ? 'Hide side panel' : 'Show side panel'}
        onClick={() => setSidePanelVisible((current) => !current)}
      >
        {isSidePanelVisible ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
      </button>
      <section
        ref={workspaceRef}
        className={`workspace${isSidePanelVisible ? '' : ' workspace--side-panel-hidden'}${isResizingSidePanel ? ' workspace--resizing' : ''}`}
        style={isSidePanelVisible ? ({ '--side-panel-width': `${sidePanelWidth}px` } as React.CSSProperties) : undefined}
      >
        <div className="terminal-layout-root">
          {renderTerminalLayout(terminalLayout, paneOrder)}
        </div>
        {isSidePanelVisible ? (
          <>
            <div
              role="separator"
              aria-label="Resize side panel"
              aria-orientation="vertical"
              aria-valuenow={sidePanelWidth}
              tabIndex={0}
              className={`side-panel-resizer${isResizingSidePanel ? ' side-panel-resizer--active' : ''}`}
              onPointerDown={handleSidePanelResizeStart}
              onKeyDown={handleSidePanelResizeKey}
            />
            <aside className="side-panel">
              <FilePanel activePaneId={activePaneId} />
            </aside>
          </>
        ) : null}
      </section>
      <UsageBar />
    </main>
  );
}
