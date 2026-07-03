# File Tree Lazy Loading Design

## Goal

Fix the silent truncation of the Files side panel (only the first few alphabetical entries render in large directories) by loading the file tree one directory level at a time instead of recursively with global `MAX_DEPTH` / `MAX_NODES` caps.

## Background

`electron/fileTree/fileTree.ts` builds the whole tree depth-first with `MAX_DEPTH = 3` and a global `MAX_NODES = 220` budget. In a large CWD (e.g. the user home directory) the budget is consumed by the first few subtrees, so the remaining top-level folders and files silently disappear. Content deeper than four levels is also invisible.

## Approved Direction

Extend the existing `fileTree:list` IPC channel with an optional `relativePath` parameter. The main process returns only the direct (non-recursive) entries of the requested directory with no entry-count limit. The renderer fetches children on first expand, keeps them in a cache, and re-fetches only on manual refresh. No new IPC channel is added.

## Architecture

- `electron/fileTree/types.ts` — `FileTreeBridgeApi.list` gains an optional `relativePath` argument. `FileTreeNode.children` is removed from main-process results (renderer owns nesting via its cache).
- `electron/fileTree/fileTree.ts` — remove `MAX_DEPTH` / `MAX_NODES` and recursion. Add `resolveListPath(rootPath, relativePath)` validation following the `resolvePreviewPath` pattern in `electron/filePreview/filePreview.ts:103`: reject absolute paths and any path resolving outside the pane CWD. `relativePath` for returned nodes stays relative to the pane CWD so preview and expansion keys remain unchanged.
- `electron/main.ts` / `electron/preload.ts` — pass `relativePath` through the existing `fileTree:list` handler and bridge.
- `src/lib/fileTreeState.ts` — replace `getDirectoryPaths` / `pruneExpandedDirectoryPaths` with pure helpers for the new state: toggle expansion (kept), and immutable cache updates (`setDirectoryChildren`, `clearDirectoryCache`).
- `src/components/FilePanel.tsx` — hold `childrenByPath: Map<string, FileTreeNode[]>`, `loadingPaths: Set<string>`, and `failedPaths: Map<string, string>` beside `expandedDirectoryPaths`. `FileTree` renders children from the cache instead of `node.children`.

## Data Flow

1. Panel mount / pane switch / CWD change: reset expansion state and cache, then `list(paneId)` for the top level.
2. Directory row click (expand): if the path is cached, render immediately. Otherwise call `list(paneId, relativePath)`, store the result in the cache, then render. Collapse never discards the cache.
3. Refresh button: re-fetch the top level and all currently expanded directories in parallel, replacing cache entries. Expansion state is preserved; directories that disappeared are dropped from expansion and cache.

## UI Behavior

- Every directory row shows a chevron (child existence is unknown before the first expand).
- While a directory is loading, its child slot shows a muted “読み込み中…” row.
- An expanded directory with no entries shows a muted “(空)” row.
- A failed fetch shows a muted error row under that directory and clears its cache entry so the next expand retries. Panel-level errors remain only for top-level load failures.

## Error Handling

- Main rejects absolute paths and traversal outside the pane CWD with `ok: false` results (never throws across IPC).
- `readdir` failures (permissions, deleted directory) return `ok: false` with a user-facing Japanese message; the renderer maps it to the per-directory error row.

## Testing

- `tests/fileTree.test.ts` — non-recursive listing, exclusion list, sorting unchanged; `resolveListPath` rejects absolute paths and `..` traversal and accepts nested relative paths.
- `tests/fileTreeState.test.ts` — expansion toggle kept; cache helpers set/replace/clear entries immutably.
- UI behavior (expand, loading row, refresh, cwd reset) is verified manually per `docs/verification-checklist.md`, plus a Playwright `_electron` smoke check against a large directory to confirm no entries are dropped.
