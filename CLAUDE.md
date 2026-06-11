# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

Windows 11向け PowerShell互換ターミナル UI の技術検証MVP。PowerShellコマンドは再実装しない。Electron main プロセスから `node-pty` 経由で `pwsh.exe`（無ければ `powershell.exe`）を起動し、bytes をそのまま xterm.js と PTY の間で渡す。PowerShell互換性が最優先。

ターゲットは Windows 11 のみ。クロスプラットフォーム対応は MVP のゴールではない。

## Commands

```powershell
npm install           # 依存導入
npm run dev           # electron-vite dev（main/preload/renderer の同時ビルド + Electron 起動）
npm run typecheck     # tsc --noEmit
npm test              # vitest run（全テスト）
npx vitest run tests/shellResolver.test.ts   # 単一テスト実行
npm run build         # electron-vite build（out/ に成果物）
npm run preview       # ビルド結果で起動確認
npm run dist          # build → electron-builder で Windows NSIS + portable インストーラー作成（dist/）
```

`out/main/main.js` がエントリ。`dist/` は electron-builder のインストーラー出力で `.gitignore` 対象。

## Architecture

3層構成。境界を越えるのは preload が公開する `contextBridge` の細い API のみ。

### Main process (`electron/`)
- `main.ts` — `BrowserWindow` 生成（`contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`）、`PtyManager` 所有、`ipcMain.handle` 登録、アプリメニュー（Appearance）から renderer への一方向コマンド送信。
- `terminal/ptyManager.ts` — `paneId → PaneProcess` の `Map` で複数 PTY を管理。`node-pty` は動的 import（`buildDependenciesFromSource: false` と `asarUnpack` 対応）。`EventEmitter` で `data` / `exit` / `cwdChange` を main → renderer ブロードキャスト。
- `terminal/shellResolver.ts` — `pwsh.exe` → `powershell.exe` の順で PATH を走査。**他のシェルを許可しない**こと。
- `terminal/cwdTracker.ts` — PowerShell の `prompt` 関数に OSC 7 (`ESC ]7;file:///… BEL`) を埋め込み、PTY 出力から正規表現で cwd を抽出して `Map` を更新。
- `appearance/`, `filePreview/`, `fileTree/`, `gitLog/` — 各機能は `types.ts`（IPC チャネル定数と TypeScript の Bridge API 型）+ 実装の2ファイル構成。`*_CHANNELS` 定数は preload と main で共有する単一の真実。
- `usage/` — Claude サブスクリプション利用枠バーのデータ源。`~/.claude/statusline.py` が書き出す `~/.claude/quarterdeck-usage.json`（固定パス・cwd 信頼境界の外）を `fs.watch` で監視し、`usage:onUsage` で renderer へ push。読み取り専用で、失敗時は静かに degrade（バー非表示）。

### Preload (`electron/preload.ts`)
`contextBridge.exposeInMainWorld` で API（`terminalApi`, `fileTreeApi`, `filePreviewApi`, `gitLogApi`, `appearanceApi`, `usageApi` など）を公開。**汎用のコマンド実行 API やファイルシステム API は絶対に追加しない**。`onData` 系は listener 登録時に teardown 関数を返す。

### Renderer (`src/`)
- `App.tsx` — トップレベル状態。ペイン配列 + バイナリツリー（`terminalLayout`）で再帰的にスプリットを描画。サイドパネル幅は localStorage 永続化（`sidePanelLayout.ts`）。
- `components/TerminalView.tsx` — xterm.js インスタンス1個 + `FitAddon`。PTY ↔ xterm のバイト透過、ResizeObserver で `terminal:resize` を発火、`paneId` で他の API を引く。
- `lib/*Bridge.ts` — `window.<api>` を取り出し型を付けるだけの薄いラッパー。各機能ごとに分離。
- `lib/gitGraphLayout.ts`, `lib/terminalLayout.ts`, `lib/sidePanelLayout.ts` — 純粋関数ロジック。**UI 状態と分離してテスト可能にする**のがこのプロジェクトの設計原則。
- `styles/` — CSS カスタムプロパティ（`--terminal-opacity`, `--custom-background-color`, `--terminal-background-color`, `--side-panel-width`）で外観を制御。透明度は背景レイヤーだけに当て、文字には適用しない。

### Build wiring
`electron.vite.config.ts` は `main` / `preload` / `renderer` の 3 entry。`main` の rollup `external: ['node-pty']` は必須（native module はバンドルしない）。renderer alias `@` → `src/`。`tsconfig.json` の `include` は `electron`, `src`, `tests` 全てを覆う単一プロジェクト構成。

## Test Strategy

`tests/` は `vitest run` で実行。**UI と PTY 挙動は手動検証**（`docs/verification-checklist.md`）に委ね、Vitest は純粋ロジック（shell 解決、IPC チャネル定数、レイアウト計算、cwd 抽出、ファイルツリーフィルタ、外観の正規化など）に集中させる。新規ロジックを追加するときは同じ方針で `tests/*.test.ts` を1ファイル追加する。

## Change Rules

- PTY ライフサイクル（spawn / write / resize / kill）は React コンポーネントに書かない。`PtyManager` に集約。
- renderer から Electron / Node にアクセスするには必ず preload 経由。`window.require` などは禁止。
- 新しい IPC を足すときは `electron/<feature>/types.ts` にチャネル定数と payload 型を定義し、main / preload / renderer の3点で同じ定数を import する。
- file preview と file tree は **現在の PTY pane の cwd 配下の相対パスのみ** 許可。絶対パスと `..` traversal は main 側で reject。
- HTML プレビュー iframe は `allow-scripts` のみ。`allow-same-origin` は付けない。
- 環境変数、トークン、機密情報をログ出力しない。
- 外部 URL を open する機能はこの MVP では追加しない。

## Manual Verification

PTY 挙動、日本語 IME 入力、コピー/ペースト、リサイズ、`Ctrl+C`、対話的 CLI（`git`, `npm`）、アプリ終了後のプロセス残存は **必ず Windows 11 上で目視確認**。`docs/verification-checklist.md` を参照しチェック項目を更新する。

## References

- `AGENTS.md` — 元となる開発憲法（変更ルールとセキュリティ方針の出典）
- `docs/architecture.md` — レイヤと IPC フローの詳細
- `docs/DESIGN.md` — Markdown / コードプレビュー UI の暖色エディトリアル仕様
- `docs/verification-checklist.md` — 手動検証のチェックリスト
