import { describe, expect, it } from 'vitest';
import { shouldForwardTabToPty, shouldPasteFromClipboard } from '../src/lib/terminalKeys';

describe('shouldForwardTabToPty', () => {
  it('forwards plain Tab to the PTY', () => {
    expect(shouldForwardTabToPty({ key: 'Tab', altKey: false, ctrlKey: false, metaKey: false })).toBe(true);
  });

  it('does not override modified Tab shortcuts', () => {
    expect(shouldForwardTabToPty({ key: 'Tab', altKey: false, ctrlKey: true, metaKey: false })).toBe(false);
    expect(shouldForwardTabToPty({ key: 'Tab', altKey: true, ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('ignores other keys', () => {
    expect(shouldForwardTabToPty({ key: 'Enter', altKey: false, ctrlKey: false, metaKey: false })).toBe(false);
  });
});

describe('shouldPasteFromClipboard', () => {
  it('pastes on Ctrl+V', () => {
    expect(shouldPasteFromClipboard({ key: 'v', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true);
  });

  it('pastes on Ctrl+V with capitalized key value', () => {
    expect(shouldPasteFromClipboard({ key: 'V', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true);
  });

  it('does not paste without the Ctrl modifier', () => {
    expect(shouldPasteFromClipboard({ key: 'v', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBe(false);
  });

  it('does not hijack Ctrl+Shift+V or Alt/Meta combinations', () => {
    expect(shouldPasteFromClipboard({ key: 'v', altKey: false, ctrlKey: true, metaKey: false, shiftKey: true })).toBe(false);
    expect(shouldPasteFromClipboard({ key: 'v', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);
    expect(shouldPasteFromClipboard({ key: 'v', altKey: false, ctrlKey: true, metaKey: true, shiftKey: false })).toBe(false);
  });

  it('ignores other keys', () => {
    expect(shouldPasteFromClipboard({ key: 'c', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);
  });
});
