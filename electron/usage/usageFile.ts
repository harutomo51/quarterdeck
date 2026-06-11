import { join } from 'node:path';
import type { UsagePayload, UsageRateLimits } from './types';

/** statusline.py が書き出す利用枠ファイル名（~/.claude 直下の固定パス）。 */
export const USAGE_FILE_NAME = 'quarterdeck-usage.json';

/**
 * `~/.claude/quarterdeck-usage.json` の絶対パスを組み立てる。
 * `USERPROFILE` が取れない環境では null（watcher 側で degrade）。
 */
export function resolveUsageFilePath(userProfile: string | undefined): string | null {
  if (!userProfile) {
    return null;
  }

  return join(userProfile, '.claude', USAGE_FILE_NAME);
}

/**
 * 利用枠ファイルの中身を検証付きでパースする。
 * 壊れている・`rate_limits` / 有限数の `ts` を欠く場合は null（degrade）。
 */
export function parseUsagePayload(contents: string): UsagePayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const candidate = parsed as { rate_limits?: unknown; ts?: unknown };
  if (typeof candidate.rate_limits !== 'object' || candidate.rate_limits === null) {
    return null;
  }

  if (typeof candidate.ts !== 'number' || !Number.isFinite(candidate.ts)) {
    return null;
  }

  return {
    rate_limits: candidate.rate_limits as UsageRateLimits,
    ts: candidate.ts
  };
}
