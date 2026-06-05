interface TerminalKeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey?: boolean;
}

export function shouldForwardTabToPty(event: TerminalKeyLike): boolean {
  return event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey;
}

/**
 * Ctrl+V を「クリップボードからの貼り付け」として扱うかどうか。
 *
 * xterm.js は既定で Ctrl+V を生のバイト 0x16 として PTY に送るだけで、
 * クリップボードのテキストを注入しない。PowerShell プロンプトでは PSReadLine が
 * 0x16 を貼り付けに割り当てているため偶然動作するが、Claude Code のような
 * raw モードの TUI では効かない。これを true にして自前で貼り付けを行う。
 */
export function shouldPasteFromClipboard(event: TerminalKeyLike): boolean {
  return (
    (event.key === 'v' || event.key === 'V') &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
