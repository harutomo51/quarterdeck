/**
 * Claude サブスクリプション利用枠バー（参考実装 quarterdeck2 の ADR-0004 移植）。
 * 下部フッターに 5h / 7d 利用枠を 2 本描画し、使用率に応じて
 * 緑 (<70%) → オレンジ (70–90%) → 赤 (≥90%) で配色する。
 * 配色はバーの fill だけに当て、文字色は不変（外観方針）。
 *
 * degrade: 値が stale / 未着 / rate_limits 欠落のときはフッター行ごと静かに
 * 非表示にフォールバックする。非表示にしてもターミナル本体（PTY）には影響しない。
 */
import { useEffect, useState } from 'react';
import type { UsagePayload } from '../../electron/usage/types';
import { fiveHourPercent, isFresh, sevenDayPercent, usageLevel } from '../lib/usage';
import { getUsageBridge } from '../lib/usageBridge';

/** 鮮度を時間経過で再判定する間隔（ms）。 */
const USAGE_TICK_MS = 5_000;

interface QuotaBarProps {
  label: string;
  pct: number | null;
}

function QuotaBar({ label, pct }: QuotaBarProps): JSX.Element | null {
  if (pct === null) {
    return null;
  }

  const rounded = Math.round(pct);
  const level = usageLevel(pct);
  return (
    <div className="usage-bar" role="status" aria-label={`${label} 利用枠 ${rounded}%`}>
      <span className="usage-bar-label">{label}</span>
      <div className="usage-bar-track">
        <div className={`usage-bar-fill usage-bar-fill--${level}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="usage-bar-value">{rounded}%</span>
    </div>
  );
}

export function UsageBar(): JSX.Element | null {
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const bridge = getUsageBridge();
      return bridge.onUsage(setUsage);
    } catch (error) {
      // 統合失敗は握り潰さずログに残す。UI は usage=null のまま非表示（degrade）。
      console.error('Failed to initialize usage bridge', error);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), USAGE_TICK_MS);
    return () => window.clearInterval(timerId);
  }, []);

  const five = fiveHourPercent(usage);
  const seven = sevenDayPercent(usage);

  // stale / 未着 / 両ウィンドウ欠落のいずれかなら、フッター行ごと非表示（degrade）。
  const show = isFresh(usage, now) && (five !== null || seven !== null);
  if (!show) {
    return null;
  }

  return (
    <footer className="usage-statusbar">
      <QuotaBar label="5h" pct={five} />
      <QuotaBar label="7d" pct={seven} />
    </footer>
  );
}
