import { describe, expect, test } from 'vitest';
import { parseUsagePayload, resolveUsageFilePath, USAGE_FILE_NAME } from '../electron/usage/usageFile';
import { USAGE_CHANNELS } from '../electron/usage/types';

describe('USAGE_CHANNELS', () => {
  test('keeps the broadcast channel name stable across main/preload/renderer', () => {
    expect(USAGE_CHANNELS.onUsage).toBe('usage:onUsage');
  });
});

describe('resolveUsageFilePath', () => {
  test('builds the usage path under ~/.claude', () => {
    const path = resolveUsageFilePath('C:\\Users\\someone');
    expect(path).not.toBeNull();
    expect(path).toContain('.claude');
    expect(path?.endsWith(USAGE_FILE_NAME)).toBe(true);
  });

  test('returns null when the user profile is unavailable', () => {
    expect(resolveUsageFilePath(undefined)).toBeNull();
    expect(resolveUsageFilePath('')).toBeNull();
  });
});

describe('parseUsagePayload', () => {
  test('parses a valid payload written by statusline.py', () => {
    const json = '{"rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1781177400}},"ts":1700000000.5}';
    const payload = parseUsagePayload(json);
    expect(payload).not.toBeNull();
    expect(payload?.ts).toBe(1700000000.5);
    expect(payload?.rate_limits.five_hour?.used_percentage).toBe(42);
  });

  test('rejects non-JSON garbage', () => {
    expect(parseUsagePayload('not json')).toBeNull();
  });

  test('rejects a payload missing ts', () => {
    expect(parseUsagePayload('{"rate_limits":{}}')).toBeNull();
  });

  test('rejects a payload missing rate_limits', () => {
    expect(parseUsagePayload('{"ts":1700000000}')).toBeNull();
  });

  test('rejects non-finite ts', () => {
    expect(parseUsagePayload('{"rate_limits":{},"ts":"soon"}')).toBeNull();
  });

  test('rejects non-object roots', () => {
    expect(parseUsagePayload('[1,2,3]')).toBeNull();
    expect(parseUsagePayload('null')).toBeNull();
  });
});
