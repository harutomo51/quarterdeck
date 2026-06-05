import { describe, expect, it } from 'vitest';
import { TERMINAL_CHANNELS } from '../electron/terminal/types';

describe('TERMINAL_CHANNELS', () => {
  it('keeps terminal IPC channel names explicit and stable', () => {
    expect(TERMINAL_CHANNELS).toEqual({
      start: 'terminal:start',
      input: 'terminal:input',
      resize: 'terminal:resize',
      restart: 'terminal:restart',
      close: 'terminal:close',
      onData: 'terminal:onData',
      onExit: 'terminal:onExit',
      onCwdChange: 'terminal:onCwdChange',
      readClipboard: 'terminal:readClipboard'
    });
  });
});
