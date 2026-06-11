import type { UsageBridgeApi } from '../../electron/usage/types';

export function getUsageBridge(): UsageBridgeApi {
  if (!window.usageApi) {
    throw new Error('Usage preload API is unavailable.');
  }

  return window.usageApi;
}
