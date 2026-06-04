import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  loadAppearance,
  normalizeAppearance,
  saveAppearance,
  type AppearanceState
} from '../src/lib/appearanceStorage';

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    }
  } satisfies Storage;
}

describe('normalizeAppearance', () => {
  it('returns defaults for a non-object value', () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance('nope')).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps valid values and normalizes hex colors', () => {
    const result = normalizeAppearance({
      backgroundMode: 'custom',
      customBackgroundColor: 'abc',
      terminalBackgroundColor: '#102030',
      terminalOpacity: 0.5
    });

    expect(result).toEqual({
      backgroundMode: 'custom',
      customBackgroundColor: '#aabbcc',
      terminalBackgroundColor: '#102030',
      terminalOpacity: 0.5
    });
  });

  it('falls back for an unknown background mode', () => {
    expect(normalizeAppearance({ backgroundMode: 'galaxy' }).backgroundMode).toBe(
      DEFAULT_APPEARANCE.backgroundMode
    );
  });

  it('clamps an out-of-range opacity', () => {
    expect(normalizeAppearance({ terminalOpacity: 5 }).terminalOpacity).toBe(1);
    expect(normalizeAppearance({ terminalOpacity: 0 }).terminalOpacity).toBe(0.35);
  });

  it('falls back when fields are missing or wrong types', () => {
    expect(normalizeAppearance({ terminalOpacity: 'bright' })).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('saveAppearance / loadAppearance', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: createLocalStorageStub() }
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns defaults when nothing is stored', () => {
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('round-trips a saved appearance state', () => {
    const state: AppearanceState = {
      backgroundMode: 'sunset',
      customBackgroundColor: '#123456',
      terminalBackgroundColor: '#abcdef',
      terminalOpacity: 0.6
    };

    saveAppearance(state);
    expect(loadAppearance()).toEqual(state);
  });

  it('returns defaults when stored data is corrupt', () => {
    window.localStorage.setItem('quarterdeck:appearance', '{ not json');
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE);
  });
});
