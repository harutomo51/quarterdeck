# File Tree Lazy Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サイドバーのファイルツリーを「ディレクトリ単位の遅延読み込み」に変更し、`MAX_NODES`/`MAX_DEPTH` による黙示的な表示欠けを解消する。

**Architecture:** 既存 `fileTree:list` IPC に省略可能な `relativePath` を追加し、main は指定ディレクトリ直下のみを非再帰・件数無制限で返す。renderer(`FilePanel`)は展開時に子階層を取得して `childrenByPath` キャッシュに保持し、更新ボタンでルート+展開中ディレクトリを並列再取得、cwd 変更・ペイン切替で全リセットする。

**Tech Stack:** Electron (main/preload/renderer), React 18, TypeScript, Vitest。

**Spec:** `docs/superpowers/specs/2026-07-03-file-tree-lazy-loading-design.md`

## Global Constraints

- ファイルツリーは **現在の PTY pane の cwd 配下の相対パスのみ** 許可。絶対パスと `..` traversal は main 側で reject(CLAUDE.md 変更ルール)。
- IPC を変更するときは `electron/fileTree/types.ts` のチャネル定数・型を main / preload / renderer の3点で共有する。
- Vitest は純ロジックのみ対象。UI 挙動は手動検証(`docs/verification-checklist.md`)。
- エラーを黙って握りつぶさない。ユーザー向けメッセージは日本語。
- 1ディレクトリあたりの件数上限は設けない(ユーザー決定)。
- 展開済みディレクトリはキャッシュ保持。再取得は更新ボタンまたは cwd 変更/ペイン切替時のみ(ユーザー決定)。

---

### Task 1: main プロセス — パス検証と非再帰リスト化

**Files:**
- Modify: `electron/fileTree/types.ts`
- Modify: `electron/fileTree/fileTree.ts`
- Modify: `electron/main.ts:153`
- Modify: `electron/preload.ts:48-50`
- Test: `tests/fileTree.test.ts`

**Interfaces:**
- Consumes: なし(起点タスク)
- Produces:
  - `readFileTree(rootPath: string, relativePath?: string): Promise<FileTreeResult>` — 非再帰。`relativePath` 省略時は cwd 直下。返す `FileTreeNode` の `relativePath` は常に **cwd からの相対パス**(OS ネイティブ区切り)。`children` は返さない。
  - `resolveListPath(rootPath: string, relativePath?: string): string` — 検証済み絶対パスを返す。絶対パス・cwd 外は throw。
  - `FileTreeBridgeApi.list(paneId?: string, relativePath?: string): Promise<FileTreeResult>`

- [ ] **Step 1: 失敗するテストを書く**

`tests/fileTree.test.ts` の既存 describe はそのまま残し、import を差し替えて以下を追加する。実 FS を使った一時ディレクトリで検証する(vitest は Node 環境)。

```ts
// import 行を次に変更
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileTree, resolveListPath, shouldIncludeFileTreeEntry, sortFileTreeNodes } from '../electron/fileTree/fileTree';
import type { FileTreeNode } from '../electron/fileTree/types';
```

```ts
describe('resolveListPath', () => {
  const root = resolve(tmpdir(), 'quarterdeck-root');

  it('returns the root itself when relativePath is omitted', () => {
    expect(resolveListPath(root)).toBe(resolve(root));
    expect(resolveListPath(root, '')).toBe(resolve(root));
  });

  it('resolves nested relative paths under the root', () => {
    expect(resolveListPath(root, join('src', 'components'))).toBe(resolve(root, 'src', 'components'));
  });

  it('rejects absolute paths', () => {
    expect(() => resolveListPath(root, root)).toThrow('相対パス');
  });

  it('rejects traversal outside the root', () => {
    expect(() => resolveListPath(root, join('..', 'other'))).toThrow('現在のディレクトリの外');
  });
});

describe('readFileTree (lazy)', () => {
  let root = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'quarterdeck-tree-'));
    await writeFile(join(root, 'a.txt'), 'a');
    await mkdir(join(root, 'sub', 'nested'), { recursive: true });
    await writeFile(join(root, 'sub', 'b.txt'), 'b');
    await writeFile(join(root, 'sub', 'nested', 'c.txt'), 'c');
    await mkdir(join(root, 'node_modules'));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists only direct entries of the root without children', async () => {
    const result = await readFileTree(root);
    expect(result.ok).toBe(true);
    expect(result.nodes?.map((node) => node.name)).toEqual(['sub', 'a.txt']);
    expect(result.nodes?.every((node) => node.children === undefined)).toBe(true);
  });

  it('lists a subdirectory with relativePath keys relative to the root', async () => {
    const result = await readFileTree(root, 'sub');
    expect(result.ok).toBe(true);
    expect(result.nodes?.map((node) => node.relativePath)).toEqual([
      join('sub', 'nested'),
      join('sub', 'b.txt')
    ]);
  });

  it('returns ok:false for traversal without throwing', async () => {
    const result = await readFileTree(root, join('..', 'escape'));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('現在のディレクトリの外');
  });

  it('returns ok:false for a missing directory', async () => {
    const result = await readFileTree(root, 'no-such-dir');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/fileTree.test.ts`
Expected: FAIL — `resolveListPath` が export されていない / `readFileTree` が children を返す。

- [ ] **Step 3: 実装**

`electron/fileTree/fileTree.ts` 全体を以下に置き換える(`MAX_DEPTH`/`MAX_NODES`/再帰を撤廃)。

```ts
import { readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { FileTreeNode, FileTreeResult } from './types';

const EXCLUDED_NAMES = new Set([
  '.git',
  '.vite',
  'dist',
  'dist-electron',
  'node_modules',
  'out'
]);

export function shouldIncludeFileTreeEntry(name: string): boolean {
  return !EXCLUDED_NAMES.has(name);
}

export function sortFileTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

export function resolveListPath(rootPath: string, relativePath?: string): string {
  const root = resolve(rootPath);
  if (!relativePath) {
    return root;
  }

  if (isAbsolute(relativePath)) {
    throw new Error('ファイル一覧のパスは相対パスで指定してください。');
  }

  const target = resolve(root, relativePath);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error('ファイル一覧のパスが現在のディレクトリの外を指しています。');
  }

  return target;
}

export async function readFileTree(rootPath = process.cwd(), relativePath?: string): Promise<FileTreeResult> {
  const resolvedRoot = resolve(rootPath);

  try {
    const directoryPath = resolveListPath(resolvedRoot, relativePath);
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const nodes: FileTreeNode[] = [];

    for (const entry of entries) {
      if (!shouldIncludeFileTreeEntry(entry.name)) {
        continue;
      }

      if (!entry.isDirectory() && !entry.isFile()) {
        continue;
      }

      const absolutePath = join(directoryPath, entry.name);
      nodes.push({
        name: entry.name,
        relativePath: relative(resolvedRoot, absolutePath),
        kind: entry.isDirectory() ? 'directory' : 'file'
      });
    }

    return {
      ok: true,
      rootPath: resolvedRoot,
      nodes: sortFileTreeNodes(nodes)
    };
  } catch (error) {
    console.error('Failed to read file tree', error);
    return {
      ok: false,
      rootPath: resolvedRoot,
      error: error instanceof Error ? error.message : 'ファイル一覧の取得に失敗しました。'
    };
  }
}
```

`electron/fileTree/types.ts` の `FileTreeBridgeApi` を変更(`FileTreeNode.children` は Task 3 で削除するため、ここではまだ触らない):

```ts
export interface FileTreeBridgeApi {
  list: (paneId?: string, relativePath?: string) => Promise<FileTreeResult>;
}
```

`electron/main.ts:153` のハンドラを変更:

```ts
  ipcMain.handle(FILE_TREE_CHANNELS.list, (_event, paneId?: string, relativePath?: string) => readFileTree(ptyManager.getCurrentCwd(paneId), relativePath));
```

`electron/preload.ts:48-50` の bridge を変更:

```ts
const fileTreeApi: FileTreeBridgeApi = {
  list: (paneId?: string, relativePath?: string) => ipcRenderer.invoke(FILE_TREE_CHANNELS.list, paneId, relativePath) as Promise<FileTreeResult>
};
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/fileTree.test.ts && npm run typecheck`
Expected: 全 PASS。typecheck は既存 renderer コードが `children` を参照していても型上は optional なのでエラーなし。

- [ ] **Step 5: コミット**

```bash
git add electron/fileTree/fileTree.ts electron/fileTree/types.ts electron/main.ts electron/preload.ts tests/fileTree.test.ts
git commit -m "feat(file-tree): list a single directory level with path validation"
```

---

### Task 2: renderer 純ロジック — キャッシュヘルパー

**Files:**
- Modify: `src/lib/fileTreeState.ts`(全面書き換え)
- Test: `tests/fileTreeState.test.ts`(全面書き換え)

**Interfaces:**
- Consumes: `FileTreeNode`(`electron/fileTree/types.ts`)
- Produces(Task 3 が使用):
  - `toggleExpandedDirectoryPath(paths: ReadonlySet<string>, relativePath: string): Set<string>`(既存を維持、引数を ReadonlySet に)
  - `setDirectoryChildren(cache: ReadonlyMap<string, FileTreeNode[]>, relativePath: string, children: FileTreeNode[]): Map<string, FileTreeNode[]>`
  - `removeDirectoryChildren(cache: ReadonlyMap<string, FileTreeNode[]>, relativePath: string): Map<string, FileTreeNode[]>`
  - 旧 `getDirectoryPaths` / `pruneExpandedDirectoryPaths` は削除。

- [ ] **Step 1: 失敗するテストを書く**

`tests/fileTreeState.test.ts` 全体を以下に置き換える:

```ts
import { describe, expect, it } from 'vitest';
import type { FileTreeNode } from '../electron/fileTree/types';
import { removeDirectoryChildren, setDirectoryChildren, toggleExpandedDirectoryPath } from '../src/lib/fileTreeState';

const children: FileTreeNode[] = [
  { name: 'App.tsx', relativePath: 'src\\App.tsx', kind: 'file' },
  { name: 'components', relativePath: 'src\\components', kind: 'directory' }
];

describe('toggleExpandedDirectoryPath', () => {
  it('adds a closed directory path and removes an open one', () => {
    expect(toggleExpandedDirectoryPath(new Set(['src']), 'src\\components')).toEqual(
      new Set(['src', 'src\\components'])
    );
    expect(toggleExpandedDirectoryPath(new Set(['src']), 'src')).toEqual(new Set());
  });

  it('does not mutate the input set', () => {
    const input = new Set(['src']);
    toggleExpandedDirectoryPath(input, 'docs');
    expect(input).toEqual(new Set(['src']));
  });
});

describe('setDirectoryChildren', () => {
  it('stores children under the directory path without mutating the input map', () => {
    const input = new Map<string, FileTreeNode[]>();
    const next = setDirectoryChildren(input, 'src', children);
    expect(next.get('src')).toEqual(children);
    expect(input.size).toBe(0);
  });

  it('replaces an existing entry', () => {
    const input = new Map([['src', children]]);
    const next = setDirectoryChildren(input, 'src', []);
    expect(next.get('src')).toEqual([]);
  });
});

describe('removeDirectoryChildren', () => {
  it('removes only the given path without mutating the input map', () => {
    const input = new Map([
      ['src', children],
      ['docs', []]
    ]);
    const next = removeDirectoryChildren(input, 'src');
    expect(next.has('src')).toBe(false);
    expect(next.get('docs')).toEqual([]);
    expect(input.has('src')).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/fileTreeState.test.ts`
Expected: FAIL — `setDirectoryChildren` / `removeDirectoryChildren` が存在しない。

- [ ] **Step 3: 実装**

`src/lib/fileTreeState.ts` 全体を以下に置き換える:

```ts
import type { FileTreeNode } from '../../electron/fileTree/types';

export function toggleExpandedDirectoryPath(paths: ReadonlySet<string>, relativePath: string): Set<string> {
  const nextPaths = new Set(paths);
  if (nextPaths.has(relativePath)) {
    nextPaths.delete(relativePath);
  } else {
    nextPaths.add(relativePath);
  }
  return nextPaths;
}

export function setDirectoryChildren(
  cache: ReadonlyMap<string, FileTreeNode[]>,
  relativePath: string,
  children: FileTreeNode[]
): Map<string, FileTreeNode[]> {
  const nextCache = new Map(cache);
  nextCache.set(relativePath, children);
  return nextCache;
}

export function removeDirectoryChildren(
  cache: ReadonlyMap<string, FileTreeNode[]>,
  relativePath: string
): Map<string, FileTreeNode[]> {
  const nextCache = new Map(cache);
  nextCache.delete(relativePath);
  return nextCache;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run tests/fileTreeState.test.ts`
Expected: 全 PASS。`npm run typecheck` はこの時点では **FAIL してよい**(`FilePanel.tsx` が削除済みの `pruneExpandedDirectoryPaths` を import しているため — Task 3 で解消)。

- [ ] **Step 5: コミット**

```bash
git add src/lib/fileTreeState.ts tests/fileTreeState.test.ts
git commit -m "feat(file-tree): add immutable children cache helpers for lazy loading"
```

---

### Task 3: renderer UI — FilePanel の遅延読み込み化

**Files:**
- Modify: `src/components/FilePanel.tsx`
- Modify: `src/styles/app.css`

**Interfaces:**
- Consumes: Task 1 の `FileTreeBridgeApi.list(paneId?, relativePath?)`、Task 2 の `toggleExpandedDirectoryPath` / `setDirectoryChildren` / `removeDirectoryChildren`
- Produces: なし(末端 UI)

- [ ] **Step 1: FilePanel の state と import を変更**

`src/components/FilePanel.tsx` の import 行を変更(先頭の BOM `﻿` もこの機会に除去する):

```ts
import { removeDirectoryChildren, setDirectoryChildren, toggleExpandedDirectoryPath } from '../lib/fileTreeState';
```

`FilePanel` 冒頭の state(`FilePanel.tsx:70-77` 付近)を以下にする:

```tsx
  const [activeTab, setActiveTab] = useState<SidePanelTab>('files');
  const [expandedDirectoryPaths, setExpandedDirectoryPaths] = useState<Set<string>>(() => new Set());
  const [childrenByPath, setChildrenByPath] = useState<ReadonlyMap<string, FileTreeNode[]>>(() => new Map());
  const [loadingPaths, setLoadingPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [failedPaths, setFailedPaths] = useState<ReadonlyMap<string, string>>(() => new Map());
```

- [ ] **Step 2: 読み込み・リセット・更新ロジックを実装**

`loadFileTree` を以下に置き換える(`pruneExpandedDirectoryPaths` 呼び出しを撤去し、リセット関数と更新関数を追加):

```tsx
  const resetDirectoryState = useCallback(() => {
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
    const expanded = [...expandedDirectoryPaths];
    setState((current) => ({ ...current, loading: true, error: null }));

    try {
      const bridge = getFileTreeBridge();
      const [rootResult, ...childResults] = await Promise.all([
        bridge.list(activePaneId),
        ...expanded.map((path) => bridge.list(activePaneId, path))
      ]);

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
      resetDirectoryState();
      setState({
        rootPath: '',
        nodes: [],
        error: error instanceof Error ? error.message : 'ファイル一覧を取得できませんでした。',
        loading: false
      });
    }
  }, [activePaneId, expandedDirectoryPaths, resetDirectoryState]);
```

`toggleDirectory`(`FilePanel.tsx:210-216` 付近)を以下に置き換える:

```tsx
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

      setLoadingPaths((current) => new Set(current).add(path));
      try {
        const result = await getFileTreeBridge().list(activePaneId, path);
        if (!result.ok) {
          setFailedPaths((current) => new Map(current).set(path, result.error ?? '読み込みに失敗しました。'));
          setChildrenByPath((current) => removeDirectoryChildren(current, path));
        } else {
          setChildrenByPath((current) => setDirectoryChildren(current, path, result.nodes ?? []));
        }
      } catch (error) {
        console.error('Renderer file tree children loading failed', error);
        setFailedPaths((current) =>
          new Map(current).set(path, error instanceof Error ? error.message : '読み込みに失敗しました。')
        );
      } finally {
        setLoadingPaths((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
      }
    },
    [activePaneId, childrenByPath, expandedDirectoryPaths]
  );
```

マウント/ペイン切替時の effect(`FilePanel.tsx:239-241`)と cwd 変更 listener(`FilePanel.tsx:252-266`)でリセットを行う:

```tsx
  useEffect(() => {
    resetDirectoryState();
    void loadFileTree();
  }, [loadFileTree, resetDirectoryState]);
```

cwd 変更 listener 内の file tree 再読込部分を次に変更(他のタブ処理は既存のまま):

```tsx
      if (payload.paneId === activePaneId) {
        resetDirectoryState();
        void loadFileTree();
```

(この useEffect の依存配列に `resetDirectoryState` を追加する。)

更新ボタン(`FilePanel.tsx:306-308`)を `refreshFileTree` に差し替える:

```tsx
        <button type="button" title="ファイル一覧を更新" onClick={() => void refreshFileTree()}>
```

- [ ] **Step 3: FileTree コンポーネントをキャッシュ参照に変更**

`FilePanel.tsx` 内の `<FileTree>` 呼び出し(`FilePanel.tsx:316-323`)を以下にする:

```tsx
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
```

`FileTree` 関数(`FilePanel.tsx:613-690` 付近)を以下に置き換える:

```tsx
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
```

ポイント: ディレクトリは子の有無が展開まで不明なため、シェブロンは `isVisible={isDirectory}` で**常に表示**する(旧 `hasChildren` 判定は削除)。ファイル末尾には改行を残す。

- [ ] **Step 4: CSS にノート行スタイルを追加**

`src/styles/app.css` の `.file-tree__row--expanded` ブロック(`app.css:565`)の直後に追加:

```css
.file-tree__note {
  margin: 0;
  min-height: 22px;
  display: flex;
  align-items: center;
  color: #6f7d99;
  font-size: 11px;
}

.file-tree__note--error {
  color: #ffb3b9;
}
```

- [ ] **Step 5: typecheck と全テスト**

Run: `npm run typecheck && npm test`
Expected: 全 PASS(Task 2 で FAIL していた typecheck がここで解消)。

- [ ] **Step 6: コミット**

```bash
git add src/components/FilePanel.tsx src/styles/app.css
git commit -m "feat(file-tree): lazy-load directory children with cache in side panel"
```

---

### Task 4: 型クリーンアップ — `FileTreeNode.children` の削除

**Files:**
- Modify: `electron/fileTree/types.ts:7-12`
- Modify: `tests/fileTree.test.ts`(fixture から `children: []` を削除)

**Interfaces:**
- Consumes: Task 1-3 完了後、`children` を参照するコードが残っていないこと
- Produces: `FileTreeNode = { name: string; relativePath: string; kind: FileTreeNodeKind }`

- [ ] **Step 1: 参照が残っていないことを確認**

Run: `grep -rn "\.children" src/ electron/ tests/`
Expected: `FileTreeNode` の `children` への参照が 0 件(他機能のヒットは対象外)。残っていれば先にそれを除去する。

- [ ] **Step 2: 型から削除**

`electron/fileTree/types.ts` の `FileTreeNode` を以下にする:

```ts
export interface FileTreeNode {
  name: string;
  relativePath: string;
  kind: FileTreeNodeKind;
}
```

`tests/fileTree.test.ts` の `sortFileTreeNodes` テスト fixture から `children: []` を2箇所削除する:

```ts
    const nodes: FileTreeNode[] = [
      { name: 'README.md', relativePath: 'README.md', kind: 'file' },
      { name: 'src', relativePath: 'src', kind: 'directory' },
      { name: 'docs', relativePath: 'docs', kind: 'directory' },
      { name: 'package.json', relativePath: 'package.json', kind: 'file' }
    ];
```

Task 1 の `readFileTree` テスト内 `children === undefined` アサーションは型エラーになるため次に変更する:

```ts
    expect(result.nodes?.every((node) => !('children' in node))).toBe(true);
```

- [ ] **Step 3: typecheck と全テスト**

Run: `npm run typecheck && npm test`
Expected: 全 PASS。

- [ ] **Step 4: コミット**

```bash
git add electron/fileTree/types.ts tests/fileTree.test.ts
git commit -m "refactor(file-tree): drop unused children field from FileTreeNode"
```

---

### Task 5: 実機検証とチェックリスト更新

**Files:**
- Modify: `docs/verification-checklist.md`
- (検証用スクリプトは scratchpad の `e2e/shot.js` を流用可能。リポジトリには含めない)

**Interfaces:**
- Consumes: Task 1-4 の完成品
- Produces: なし(検証タスク)

- [ ] **Step 1: ビルドして実アプリで確認**

Run: `npm run build`、その後 Playwright `_electron` スモーク(調査時の scratchpad スクリプトを流用)またはアプリを手動起動。

確認項目:
1. ホームディレクトリなど大きな cwd で、**トップレベルの全項目**が表示される(調査時は4件しか出なかった)。
2. ディレクトリ展開で子が表示され、折りたたみ→再展開が即時(キャッシュ)。
3. 空ディレクトリ展開で「(空)」表示。
4. 更新ボタンで展開状態が維持されたまま内容が更新される。
5. `cd` で cwd を変えるとツリーがリセットされ新しい cwd の内容になる。

- [ ] **Step 2: 手動検証チェックリストに追記**

`docs/verification-checklist.md` のファイルツリー関連セクションに以下の項目を追加する(セクションが無ければ「ファイルツリー」見出しを作る):

```markdown
- [ ] 大きなディレクトリ(例: ホームディレクトリ)を cwd にしてもトップレベルの全フォルダ・ファイルが表示される
- [ ] フォルダ展開時に子階層が読み込まれ、再展開はキャッシュから即時表示される
- [ ] 空フォルダを展開すると「(空)」が表示される
- [ ] 更新ボタンで展開中フォルダの内容が最新化され、展開状態は維持される
- [ ] cd による cwd 変更でツリーと展開状態がリセットされる
```

- [ ] **Step 3: コミット**

```bash
git add docs/verification-checklist.md
git commit -m "docs: add lazy-loading file tree items to verification checklist"
```
