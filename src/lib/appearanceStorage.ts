import { normalizeHexColor } from './backgroundColor';
import { normalizeOpacity } from './opacity';

export type BackgroundMode = 'aurora' | 'sunset' | 'image' | 'custom';

export interface AppearanceState {
  backgroundMode: BackgroundMode;
  customBackgroundColor: string;
  terminalBackgroundColor: string;
  terminalOpacity: number;
}

export const DEFAULT_APPEARANCE: AppearanceState = {
  backgroundMode: 'aurora',
  customBackgroundColor: '#1f6feb',
  terminalBackgroundColor: '#05070d',
  terminalOpacity: 0.78
};

const STORAGE_KEY = 'quarterdeck:appearance';
const BACKGROUND_MODES: readonly BackgroundMode[] = ['aurora', 'sunset', 'image', 'custom'];

function isBackgroundMode(value: unknown): value is BackgroundMode {
  return typeof value === 'string' && (BACKGROUND_MODES as readonly string[]).includes(value);
}

export function normalizeAppearance(value: unknown): AppearanceState {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_APPEARANCE;
  }

  const candidate = value as Partial<Record<keyof AppearanceState, unknown>>;

  const backgroundMode = isBackgroundMode(candidate.backgroundMode)
    ? candidate.backgroundMode
    : DEFAULT_APPEARANCE.backgroundMode;

  const customBackgroundColor =
    typeof candidate.customBackgroundColor === 'string'
      ? normalizeHexColor(candidate.customBackgroundColor, DEFAULT_APPEARANCE.customBackgroundColor)
      : DEFAULT_APPEARANCE.customBackgroundColor;

  const terminalBackgroundColor =
    typeof candidate.terminalBackgroundColor === 'string'
      ? normalizeHexColor(candidate.terminalBackgroundColor, DEFAULT_APPEARANCE.terminalBackgroundColor)
      : DEFAULT_APPEARANCE.terminalBackgroundColor;

  const terminalOpacity =
    typeof candidate.terminalOpacity === 'number' && Number.isFinite(candidate.terminalOpacity)
      ? normalizeOpacity(candidate.terminalOpacity)
      : DEFAULT_APPEARANCE.terminalOpacity;

  return { backgroundMode, customBackgroundColor, terminalBackgroundColor, terminalOpacity };
}

export function loadAppearance(): AppearanceState {
  if (typeof window === 'undefined') {
    return DEFAULT_APPEARANCE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return DEFAULT_APPEARANCE;
    }

    return normalizeAppearance(JSON.parse(raw));
  } catch (error) {
    console.warn('Failed to read appearance settings from storage', error);
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(state: AppearanceState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeAppearance(state)));
  } catch (error) {
    console.warn('Failed to persist appearance settings', error);
  }
}
