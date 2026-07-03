import {
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  File,
  FileCode2,
  FileImage,
  FileJson2,
  FileText,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Hash,
  Lock,
  RefreshCw,
  Settings,
  TriangleAlert,
  Unlink,
  Zap
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileTreeNode } from '../../electron/fileTree/types';
import type { GitCommit } from '../../electron/gitLog/types';
import type { GitWorktree } from '../../electron/gitWorktree/types';
import { getFileIconKind, type FileIconKind } from '../lib/fileIcon';
import { getGitCommitDetailBridge } from '../lib/gitCommitDetailBridge';
import { getFilePreviewBridge } from '../lib/filePreviewBridge';
import { getFileTreeBridge } from '../lib/fileTreeBridge';
import { removeDirectoryChildren, setDirectoryChildren, toggleExpandedDirectoryPath } from '../lib/fileTreeState';
import {
  computeGitGraphLayout,
  type GitGraphEdge,
  type GitGraphLayout,
  type GitGraphNode
} from '../lib/gitGraphLayout';
import { getGitLogBridge } from '../lib/gitLogBridge';
import { getGitWorktreeBridge } from '../lib/gitWorktreeBridge';
import { getTerminalBridge } from '../lib/terminalBridge';

interface FilePanelState {
  rootPath: string;
  nodes: FileTreeNode[];
  error: string | null;
  loading: boolean;
}

interface FilePanelProps {
  activePaneId: string;
}

type SidePanelTab = 'files' | 'git' | 'worktree';

interface GitPanelState {
  rootPath: string;
  commits: GitCommit[];
  error: string | null;
  loading: boolean;
}

interface GitWorktreePanelState {
  rootPath: string;
  worktrees: GitWorktree[];
  error: string | null;
  loading: boolean;
}

export function FilePanel({ activePaneId }: FilePanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<SidePanelTab>('files');
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<Set<string>>(() => new Set());
  const [childrenByPath, setChildrenByPath] = useState<ReadonlyMap<string, FileTreeNode[]>>(() => new Map());
  const [loadingPaths, setLoadingPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [failedPaths, setFailedPaths] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [state, setState] = useState<FilePanelState>({
    rootPath: '',
    nodes: [],
    error: null,
    loading: true
  });
  const [gitState, setGitState] = useState<GitPanelState>({
    rootPath: '',
    commits: [],
    error: null,
    loading: false
  });
  const [worktreeState, setWorktreeState] = useState<GitWorktreePanelState>({
    rootPath: '',
    worktrees: [],
    error: null,
    loading: false
  });

  const fetchGenerationRef = useRef(0);

  const resetDirectoryState = useCallback(() => {
    fetchGenerationRef.current += 1;
    setExpandedDirectoryPaths(new Set());
    setChildrenByPath(new Map());
    setLoadingPaths(new Set());
    setFailedPaths(new Map());
  }, []);

  const loadFileTree = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const result = await getFileTreeBridge().list(activePaneId);
      if (!result.ok) {
        setState({
          rootPath: result.rootPath ?? '',
          nodes: [],
          error: result.error ?? 'ファイル一覧を取得できませんでした。',
          loading: false
        });
        return;
      }

      setState({
        rootPath: result.rootPath ?? '',
        nodes: result.nodes ?? [],
        error: null,
        loading: false
      });
    } catch (error) {
      console.error('Renderer file tree loading failed', error);
      setState({
        rootPath: '',
        nodes: [],
        error: error instanceof Error ? error.message : 'ファイル一覧を取得できませんでした。',
        loading: false
      });
    }
  }, [activePaneId]);

  const refreshFileTree = useCallback(async () => {
    const generation = fetchGenerationRef.current;
    const expanded = [...expandedDirectoryPaths];
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const bridge = getFileTreeBridge();
      const [rootResult, ...childResults] = await Promise.all([
        bridge.list(activePaneId),
        ...expanded.map((path) => bridge.list(activePaneId, path))
      ]);

      if (fetchGenerationRef.current !== generation) {
        return;
      }

      if (!rootResult.ok) {
        resetDirectoryState();
        setState({
          rootPath: rootResult.rootPath ?? '',
          nodes: [],
          error: rootResult.error ?? 'ファイル一覧を取得できませんでした。',
          loading: false
        });
        return;
      }

      const nextCache = new Map<string, FileTreeNode[]>();
      const nextExpanded = new Set<string>();
      expanded.forEach((path, index) => {
        const childResult = childResults[index];
        if (childResult.ok) {
          nextCache.set(path, childResult.nodes ?? []);
          nextExpanded.add(path);
        }
      });

      setChildrenByPath(nextCache);
      setExpandedDirectoryPaths(nextExpanded);
      setLoadingPaths(new Set());
      setFailedPaths(new Map());
      setState({
        rootPath: rootResult.rootPath ?? '',
        nodes: rootResult.nodes ?? [],
        error: null,
        loading: false
      });
    } catch (error) {
      console.error('Renderer file tree refresh failed', error);
      if (fetchGenerationRef.current !== generation) {
        return;
      }
      resetDirectoryState();
      setState({
        rootPath: '',
        nodes: [],
        error: error instanceof Error ? error.message : 'ファイル一覧を取得できませんでした。',
        loading: false
      });
    }
  }, [activePaneId, expandedDirectoryPaths, resetDirectoryState]);

  const loadGitLog = useCallback(async () => {
    setGitState((current) => ({ ...current, loading: true, error: null }));

    try {
      const result = await getGitLogBridge().list(activePaneId);
      if (!result.ok) {
        setGitState({
          rootPath: result.rootPath ?? '',
          commits: [],
          error: result.error ?? 'Git log could not be loaded.',
          loading: false
        });
        return;
      }

      setGitState({
        rootPath: result.rootPath ?? '',
        commits: result.commits ?? [],
        error: null,
        loading: false
      });
    } catch (error) {
      console.error('Renderer Git log loading failed', error);
      setGitState({
        rootPath: '',
        commits: [],
        error: error instanceof Error ? error.message : 'Git log could not be loaded.',
        loading: false
      });
    }
  }, [activePaneId]);

  const loadGitWorktrees = useCallback(async () => {
    setWorktreeState((current) => ({ ...current, loading: true, error: null }));

    try {
      const result = await getGitWorktreeBridge().list(activePaneId);
      if (!result.ok) {
        setWorktreeState({
          rootPath: result.rootPath ?? '',
          worktrees: [],
          error: result.error ?? 'Git worktrees could not be loaded.',
          loading: false
        });
        return;
      }

      setWorktreeState({
        rootPath: result.rootPath ?? '',
        worktrees: result.worktrees ?? [],
        error: null,
        loading: false
      });
    } catch (error) {
      console.error('Renderer Git worktree loading failed', error);
      setWorktreeState({
        rootPath: '',
        worktrees: [],
        error: error instanceof Error ? error.message : 'Git worktrees could not be loaded.',
        loading: false
      });
    }
  }, [activePaneId]);

  const openPreview = async (node: FileTreeNode) => {
    if (node.kind !== 'file') {
      return;
    }

    try {
      const result = await getFilePreviewBridge().open(node.relativePath, activePaneId);
      if (!result.ok) {
        setState((current) => ({
          ...current,
          error: result.error ?? 'ファイルプレビューを開けませんでした。'
        }));
      }
    } catch (error) {
      console.error('Renderer file preview failed', error);
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'ファイルプレビューを開けませんでした。'
      }));
    }
  };

  const toggleDirectory = useCallback(
    async (node: FileTreeNode) => {
      if (node.kind !== 'directory') {
        return;
      }

      const path = node.relativePath;
      const isExpanding = !expandedDirectoryPaths.has(path);
      setExpandedDirectoryPaths((current) => toggleExpandedDirectoryPath(current, path));

      if (!isExpanding) {
        return;
      }

      setFailedPaths((current) => {
        const next = new Map(current);
        next.delete(path);
        return next;
      });

      if (childrenByPath.has(path)) {
        return;
      }

      const generation = fetchGenerationRef.current;
      setLoadingPaths((current) => new Set(current).add(path));
      try {
        const result = await getFileTreeBridge().list(activePaneId, path);
        if (fetchGenerationRef.current !== generation) {
          return;
        }
        if (!result.ok) {
          console.error('Renderer file tree children loading failed', result.error);
          setFailedPaths((current) => new Map(current).set(path, result.error ?? '読み込みに失敗しました。'));
          setChildrenByPath((current) => removeDirectoryChildren(current, path));
        } else {
          setChildrenByPath((current) => setDirectoryChildren(current, path, result.nodes ?? []));
        }
      } catch (error) {
        console.error('Renderer file tree children loading failed', error);
        if (fetchGenerationRef.current !== generation) {
          return;
        }
        setFailedPaths((current) =>
          new Map(current).set(path, error instanceof Error ? error.message : '読み込みに失敗しました。')
        );
      } finally {
        if (fetchGenerationRef.current === generation) {
          setLoadingPaths((current) => {
            const next = new Set(current);
            next.delete(path);
            return next;
          });
        }
      }
    },
    [activePaneId, childrenByPath, expandedDirectoryPaths]
  );

  const openCommitDetail = useCallback(
    async (hash: string) => {
      try {
        const result = await getGitCommitDetailBridge().open(hash, activePaneId);
        if (!result.ok) {
          setGitState((current) => ({
            ...current,
            error: result.error ?? 'Commit detail could not be loaded.'
          }));
        }
      } catch (error) {
        console.error('Renderer Git commit detail failed', error);
        setGitState((current) => ({
          ...current,
          error: error instanceof Error ? error.message : 'Commit detail could not be loaded.'
        }));
      }
    },
    [activePaneId]
  );

  useEffect(() => {
    resetDirectoryState();
    void loadFileTree();
  }, [loadFileTree, resetDirectoryState]);

  useEffect(() => {
    if (activeTab === 'git') {
      void loadGitLog();
    }
    if (activeTab === 'worktree') {
      void loadGitWorktrees();
    }
  }, [activeTab, loadGitLog, loadGitWorktrees]);

  useEffect(() => {
    const removeCwdListener = getTerminalBridge().onCwdChange((payload) => {
      if (payload.paneId === activePaneId) {
        resetDirectoryState();
        void loadFileTree();
        if (activeTab === 'git') {
          void loadGitLog();
        }
        if (activeTab === 'worktree') {
          void loadGitWorktrees();
        }
      }
    });

    return removeCwdListener;
  }, [activePaneId, activeTab, loadFileTree, loadGitLog, loadGitWorktrees, resetDirectoryState]);

  return (
    <section className="file-panel" aria-label="current directory files">
      <div className="side-panel-tabs" role="tablist" aria-label="side panel views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'files'}
          className={activeTab === 'files' ? 'side-panel-tabs__tab side-panel-tabs__tab--active' : 'side-panel-tabs__tab'}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'git'}
          className={activeTab === 'git' ? 'side-panel-tabs__tab side-panel-tabs__tab--active' : 'side-panel-tabs__tab'}
          onClick={() => setActiveTab('git')}
        >
          Git
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'worktree'}
          className={activeTab === 'worktree' ? 'side-panel-tabs__tab side-panel-tabs__tab--active' : 'side-panel-tabs__tab'}
          onClick={() => setActiveTab('worktree')}
        >
          Worktree
        </button>
      </div>
      {activeTab === 'files' ? (
        <>
      <div className="panel-header">
        <div>
          <h2>Files</h2>
          <p title={state.rootPath}>{state.rootPath || '現在のディレクトリ'}</p>
        </div>
        <button type="button" title="ファイル一覧を更新" onClick={() => void refreshFileTree()}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="file-panel__body">
        {state.loading ? <p className="panel-empty">読み込み中...</p> : null}
        {state.error ? <p className="panel-error">{state.error}</p> : null}
        {!state.loading && !state.error && state.nodes.length === 0 ? (
          <p className="panel-empty">表示できるファイルがありません。</p>
        ) : null}
        {!state.loading && !state.error ? (
          <FileTree
            nodes={state.nodes}
            expandedDirectoryPaths={expandedDirectoryPaths}
            childrenByPath={childrenByPath}
            loadingPaths={loadingPaths}
            failedPaths={failedPaths}
            onPreview={openPreview}
            onToggleDirectory={(node) => void toggleDirectory(node)}
          />
        ) : null}
      </div>
        </>
      ) : activeTab === 'git' ? (
        <GitGraphPanel
          state={gitState}
          onRefresh={() => void loadGitLog()}
          onSelectCommit={(hash) => void openCommitDetail(hash)}
        />
      ) : (
        <GitWorktreePanel state={worktreeState} onRefresh={() => void loadGitWorktrees()} />
      )}
    </section>
  );
}

const GIT_GRAPH_ROW_HEIGHT = 26;
const GIT_GRAPH_LANE_WIDTH = 16;
const GIT_GRAPH_PADDING_X = 10;
const GIT_GRAPH_NODE_RADIUS = 4.5;
const GIT_GRAPH_LANE_COLOR_COUNT = 8;

function GitGraphPanel({
  state,
  onRefresh,
  onSelectCommit
}: {
  state: GitPanelState;
  onRefresh: () => void;
  onSelectCommit: (hash: string) => void;
}): JSX.Element {
  const layout = useMemo(() => computeGitGraphLayout(state.commits), [state.commits]);
  const hasCommits = !state.loading && !state.error && layout.nodes.length > 0;

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>Git Graph</h2>
          <p title={state.rootPath}>{state.rootPath || 'No repository selected'}</p>
        </div>
        <button type="button" title="Refresh Git graph" onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="git-panel__body">
        {state.loading ? <p className="panel-empty">Loading Git log...</p> : null}
        {state.error ? <p className="panel-error">{state.error}</p> : null}
        {!state.loading && !state.error && layout.nodes.length === 0 ? (
          <p className="panel-empty">No commits to display.</p>
        ) : null}
        {hasCommits ? <GitGraphView layout={layout} onSelectCommit={onSelectCommit} /> : null}
      </div>
    </>
  );
}

function GitWorktreePanel({
  state,
  onRefresh
}: {
  state: GitWorktreePanelState;
  onRefresh: () => void;
}): JSX.Element {
  const hasWorktrees = !state.loading && !state.error && state.worktrees.length > 0;

  return (
    <>
      <div className="panel-header">
        <div>
          <h2>Worktrees</h2>
          <p title={state.rootPath}>{state.rootPath || 'No repository selected'}</p>
        </div>
        <button type="button" title="Refresh worktree list" onClick={onRefresh}>
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="worktree-panel__body">
        {state.loading ? <p className="panel-empty">Loading worktrees...</p> : null}
        {state.error ? <p className="panel-error">{state.error}</p> : null}
        {!state.loading && !state.error && state.worktrees.length === 0 ? (
          <p className="panel-empty">No worktrees registered.</p>
        ) : null}
        {hasWorktrees ? (
          <ol className="worktree-list">
            {state.worktrees.map((worktree) => (
              <GitWorktreeRow key={worktree.path} worktree={worktree} />
            ))}
          </ol>
        ) : null}
      </div>
    </>
  );
}

function GitWorktreeRow({ worktree }: { worktree: GitWorktree }): JSX.Element {
  const refLabel = worktree.isBare
    ? 'bare'
    : worktree.isDetached
      ? worktree.head
        ? `detached @ ${worktree.head.slice(0, 7)}`
        : 'detached'
      : worktree.branch ?? 'unknown';
  const RefIcon = worktree.isBare ? FolderGit2 : worktree.isDetached ? Unlink : GitBranch;

  return (
    <li className="worktree-list__item">
      <div className="worktree-list__header">
        <RefIcon className="worktree-list__ref-icon" size={14} />
        <span className="worktree-list__ref" title={refLabel}>{refLabel}</span>
        {worktree.head && !worktree.isBare ? (
          <span className="worktree-list__hash" title={worktree.head}>{worktree.head.slice(0, 7)}</span>
        ) : null}
      </div>
      <div className="worktree-list__path" title={worktree.path}>{worktree.path}</div>
      {worktree.isLocked || worktree.isPrunable ? (
        <div className="worktree-list__flags">
          {worktree.isLocked ? (
            <span className="worktree-badge worktree-badge--locked" title={worktree.lockReason ?? 'locked'}>
              <Lock size={11} />
              {worktree.lockReason ? `locked: ${worktree.lockReason}` : 'locked'}
            </span>
          ) : null}
          {worktree.isPrunable ? (
            <span className="worktree-badge worktree-badge--prunable" title={worktree.prunableReason ?? 'prunable'}>
              <TriangleAlert size={11} />
              {worktree.prunableReason ? `prunable: ${worktree.prunableReason}` : 'prunable'}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function GitGraphView({
  layout,
  onSelectCommit
}: {
  layout: GitGraphLayout;
  onSelectCommit: (hash: string) => void;
}): JSX.Element {
  const laneCount = Math.max(layout.laneCount, 1);
  const canvasWidth = GIT_GRAPH_PADDING_X * 2 + laneCount * GIT_GRAPH_LANE_WIDTH;
  const canvasHeight = layout.nodes.length * GIT_GRAPH_ROW_HEIGHT;

  return (
    <div
      className="git-graph"
      style={{
        ['--git-row-height' as string]: `${GIT_GRAPH_ROW_HEIGHT}px`,
        ['--git-canvas-width' as string]: `${canvasWidth}px`
      }}
    >
      <svg
        className="git-graph__canvas"
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        focusable="false"
        aria-hidden="true"
      >
        <g className="git-graph__edges">
          {layout.edges.map((edge, index) => (
            <GitGraphEdgePath key={`edge-${index}`} edge={edge} />
          ))}
        </g>
        <g className="git-graph__nodes">
          {layout.nodes.map((node) => (
            <GitGraphNodeMark key={node.hash} node={node} />
          ))}
        </g>
      </svg>
      <ol className="git-graph__rows">
        {layout.nodes.map((node) => (
          <li key={node.hash} className="git-graph__row">
            <button
              type="button"
              className="git-graph__row-button"
              title={`${node.hash}  ${node.subject}`}
              onClick={() => onSelectCommit(node.hash)}
            >
              {node.decorations.length > 0 ? (
                <span className="git-graph__decorations">
                  {node.decorations.map((decoration) => (
                    <span className={getDecorationClassName(decoration)} key={decoration}>
                      {decoration}
                    </span>
                  ))}
                </span>
              ) : null}
              <span className="git-graph__subject">{node.subject}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function laneCenterX(lane: number): number {
  return GIT_GRAPH_PADDING_X + lane * GIT_GRAPH_LANE_WIDTH + GIT_GRAPH_LANE_WIDTH / 2;
}

function rowCenterY(row: number): number {
  return row * GIT_GRAPH_ROW_HEIGHT + GIT_GRAPH_ROW_HEIGHT / 2;
}

function buildEdgePath(edge: GitGraphEdge): string {
  const x1 = laneCenterX(edge.fromLane);
  const y1 = rowCenterY(edge.fromRow);
  const x2 = laneCenterX(edge.toLane);
  const y2 = rowCenterY(edge.toRow);

  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const rowHeight = GIT_GRAPH_ROW_HEIGHT;

  if (edge.kind === 'merge-parent') {
    const curveEndY = Math.min(y1 + rowHeight, y2);
    const controlY = (y1 + curveEndY) / 2;
    if (curveEndY >= y2) {
      return `M ${x1} ${y1} C ${x1} ${controlY}, ${x2} ${controlY}, ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} C ${x1} ${controlY}, ${x2} ${controlY}, ${x2} ${curveEndY} L ${x2} ${y2}`;
  }

  const curveStartY = Math.max(y2 - rowHeight, y1);
  const controlY = (curveStartY + y2) / 2;
  if (curveStartY <= y1) {
    return `M ${x1} ${y1} C ${x1} ${controlY}, ${x2} ${controlY}, ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} L ${x1} ${curveStartY} C ${x1} ${controlY}, ${x2} ${controlY}, ${x2} ${y2}`;
}

function GitGraphEdgePath({ edge }: { edge: GitGraphEdge }): JSX.Element {
  const color = `var(--git-lane-${edge.colorLane % GIT_GRAPH_LANE_COLOR_COUNT})`;
  return <path className="git-graph__edge" d={buildEdgePath(edge)} stroke={color} />;
}

function GitGraphNodeMark({ node }: { node: GitGraphNode }): JSX.Element {
  const cx = laneCenterX(node.lane);
  const cy = rowCenterY(node.row);
  const color = `var(--git-lane-${node.lane % GIT_GRAPH_LANE_COLOR_COUNT})`;

  if (node.isMerge) {
    const outerRadius = GIT_GRAPH_NODE_RADIUS + 1.6;
    const markLength = outerRadius - 1.6;
    return (
      <g>
        <circle className="git-graph__node git-graph__node--merge" cx={cx} cy={cy} r={outerRadius} stroke={color} />
        <line
          className="git-graph__merge-mark"
          x1={cx - markLength}
          y1={cy}
          x2={cx + markLength}
          y2={cy}
          stroke={color}
        />
        <line
          className="git-graph__merge-mark"
          x1={cx}
          y1={cy - markLength}
          x2={cx}
          y2={cy + markLength}
          stroke={color}
        />
      </g>
    );
  }

  return <circle className="git-graph__node" cx={cx} cy={cy} r={GIT_GRAPH_NODE_RADIUS} stroke={color} />;
}

function getDecorationClassName(decoration: string): string {
  const baseClassName = 'git-graph__badge';
  if (decoration === 'HEAD' || decoration.startsWith('HEAD ->')) {
    return `${baseClassName} ${baseClassName}--head`;
  }
  if (decoration.startsWith('tag:')) {
    return `${baseClassName} ${baseClassName}--tag`;
  }
  if (decoration.startsWith('origin/') || decoration.startsWith('refs/remotes/')) {
    return `${baseClassName} ${baseClassName}--remote`;
  }
  return `${baseClassName} ${baseClassName}--branch`;
}

function FileTree({
  nodes,
  depth = 0,
  expandedDirectoryPaths,
  childrenByPath,
  loadingPaths,
  failedPaths,
  onPreview,
  onToggleDirectory
}: {
  nodes: FileTreeNode[];
  depth?: number;
  expandedDirectoryPaths: ReadonlySet<string>;
  childrenByPath: ReadonlyMap<string, FileTreeNode[]>;
  loadingPaths: ReadonlySet<string>;
  failedPaths: ReadonlyMap<string, string>;
  onPreview: (node: FileTreeNode) => void;
  onToggleDirectory: (node: FileTreeNode) => void;
}): JSX.Element {
  const notePaddingLeft = `${depth * 12 + 40}px`;

  return (
    <ul className="file-tree">
      {nodes.map((node) => {
        const isDirectory = node.kind === 'directory';
        const isExpanded = isDirectory && expandedDirectoryPaths.has(node.relativePath);
        const children = childrenByPath.get(node.relativePath);
        const isLoading = loadingPaths.has(node.relativePath);
        const failure = failedPaths.get(node.relativePath);
        const rowClassName = [
          'file-tree__row',
          `file-tree__row--${node.kind}`,
          isExpanded ? 'file-tree__row--expanded' : ''
        ].filter(Boolean).join(' ');

        return (
          <li className="file-tree__item" key={node.relativePath}>
            <button
              aria-expanded={isDirectory ? isExpanded : undefined}
              className={rowClassName}
              title={node.kind === 'file' ? `${node.relativePath} をプレビュー` : node.relativePath}
              type="button"
              style={{ paddingLeft: `${depth * 12}px` }}
              onClick={() => (isDirectory ? onToggleDirectory(node) : onPreview(node))}
            >
              <FileTreeDisclosureIcon isExpanded={isExpanded} isVisible={isDirectory} />
              <FileTreeIcon iconKind={getFileIconKind(node.name, node.kind)} isExpanded={isExpanded} />
              <span>{node.name}</span>
            </button>
            {isExpanded && isLoading ? (
              <p className="file-tree__note" style={{ paddingLeft: notePaddingLeft }}>読み込み中…</p>
            ) : null}
            {isExpanded && !isLoading && failure ? (
              <p className="file-tree__note file-tree__note--error" style={{ paddingLeft: notePaddingLeft }}>{failure}</p>
            ) : null}
            {isExpanded && !isLoading && !failure && children && children.length === 0 ? (
              <p className="file-tree__note" style={{ paddingLeft: notePaddingLeft }}>(空)</p>
            ) : null}
            {isExpanded && children && children.length > 0 ? (
              <FileTree
                nodes={children}
                depth={depth + 1}
                expandedDirectoryPaths={expandedDirectoryPaths}
                childrenByPath={childrenByPath}
                loadingPaths={loadingPaths}
                failedPaths={failedPaths}
                onPreview={onPreview}
                onToggleDirectory={onToggleDirectory}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function FileTreeDisclosureIcon({
  isExpanded,
  isVisible
}: {
  isExpanded: boolean;
  isVisible: boolean;
}): JSX.Element {
  const Icon = isExpanded ? ChevronDown : ChevronRight;
  return (
    <span className={isVisible ? 'file-tree__disclosure' : 'file-tree__disclosure file-tree__disclosure--hidden'}>
      {isVisible ? <Icon size={13} /> : null}
    </span>
  );
}

function FileTreeIcon({ iconKind, isExpanded = false }: { iconKind: FileIconKind; isExpanded?: boolean }): JSX.Element {
  const className = `file-tree__icon file-tree__icon--${iconKind}`;
  const size = 15;

  if (iconKind === 'folder') {
    return isExpanded ? <FolderOpen className={className} size={size} /> : <Folder className={className} size={size} />;
  }
  if (iconKind === 'typescript') return <Zap className={className} size={size} />;
  if (iconKind === 'javascript') return <Zap className={className} size={size} />;
  if (iconKind === 'json') return <Braces className={className} size={size} />;
  if (iconKind === 'markdown') return <FileText className={className} size={size} />;
  if (iconKind === 'html') return <Code2 className={className} size={size} />;
  if (iconKind === 'css') return <Hash className={className} size={size} />;
  if (iconKind === 'powershell') return <FileCode2 className={className} size={size} />;
  if (iconKind === 'config') return <Settings className={className} size={size} />;
  if (iconKind === 'image') return <FileImage className={className} size={size} />;
  if (iconKind === 'text') return <FileText className={className} size={size} />;
  if (iconKind === 'code') return <FileCode2 className={className} size={size} />;
  if (iconKind === 'file') return <File className={className} size={size} />;

  return <FileJson2 className={className} size={size} />;
}
