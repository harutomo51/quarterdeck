export const USAGE_CHANNELS = {
  onUsage: 'usage:onUsage'
} as const;

export interface UsageRateLimitWindow {
  used_percentage?: number;
  resets_at?: number;
}

export interface UsageRateLimits {
  five_hour?: UsageRateLimitWindow;
  seven_day?: UsageRateLimitWindow;
}

export interface UsagePayload {
  rate_limits: UsageRateLimits;
  /** statusline.py の書き出し時刻（epoch 秒）。renderer 側の鮮度判定に使う。 */
  ts: number;
}

export interface UsageBridgeApi {
  onUsage: (callback: (payload: UsagePayload) => void) => () => void;
}
