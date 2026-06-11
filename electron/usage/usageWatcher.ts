import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { UsagePayload } from './types';
import { parseUsagePayload, resolveUsageFilePath, USAGE_FILE_NAME } from './usageFile';

/** アトミック replace（temp→rename）の通知バーストを 1 回に畳むデバウンス窓。 */
const DEBOUNCE_MS = 200;

/**
 * `~/.claude/quarterdeck-usage.json` の監視（参考実装 quarterdeck2 の ADR-0004 移植）。
 * statusline.py が Claude Code の statusline 実行毎に書き出すファイルを親ディレクトリ
 * 非再帰で watch し、更新をパースして `usage` イベントで通知する。
 *
 * このファイルは file tree / file preview の cwd 信頼境界の外にある固定パス 1 つで、
 * 汎用のファイルシステム API は一切公開しない（renderer へは push のみ）。
 *
 * degrade: 監視生成・読み取り・パース失敗はログのみで握りつぶし、
 * ターミナル本体の動作には影響させない。
 */
export class UsageWatcher {
  private readonly emitter = new EventEmitter();
  private readonly filePath: string | null;
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private latestPayload: UsagePayload | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? resolveUsageFilePath(process.env.USERPROFILE);
  }

  /** 直近に emit したペイロード。renderer ロード完了時の初期表示に使う。 */
  get latest(): UsagePayload | null {
    return this.latestPayload;
  }

  start(): void {
    if (!this.filePath) {
      console.error('Usage watcher: USERPROFILE unavailable, skip');
      return;
    }

    // 起動時に既存ファイルがあれば一度読み込む（前回の statusline 実行値）。
    void this.readAndEmit();

    try {
      this.watcher = watch(dirname(this.filePath), { recursive: false }, (_eventType, fileName) => {
        // アトミック replace は最終ファイル名で通知されるため temp ファイルは弾かれる。
        // Windows では fileName が null になりうるため、その場合は念のため読みにいく
        // （固定パス 1 つの debounce 読みなので無害）。
        if (fileName !== null && fileName !== USAGE_FILE_NAME) {
          return;
        }

        this.scheduleRead();
      });
      this.watcher.on('error', (error) => {
        console.error('Usage watcher: watch error', error);
      });
    } catch (error) {
      console.error('Usage watcher: failed to start watching', error);
      this.watcher = null;
    }
  }

  onUsage(listener: (payload: UsagePayload) => void): () => void {
    this.emitter.on('usage', listener);
    return () => this.emitter.off('usage', listener);
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.watcher?.close();
    this.watcher = null;
    this.emitter.removeAllListeners();
  }

  private scheduleRead(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.readAndEmit();
    }, DEBOUNCE_MS);
  }

  private async readAndEmit(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      // 未作成（ENOENT）は正常系として静かに無視する（degrade）。
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error('Usage watcher: failed to read usage file', error);
      }
      return;
    }

    const payload = parseUsagePayload(contents);
    if (!payload) {
      console.error('Usage watcher: usage file unparsable, skip emit');
      return;
    }

    this.latestPayload = payload;
    this.emitter.emit('usage', payload);
  }
}
