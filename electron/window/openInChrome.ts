import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { shell } from 'electron';

/**
 * Locates `chrome.exe` from the well-known Windows install locations.
 * Returns `undefined` when Google Chrome is not installed.
 */
function resolveChromePath(): string | undefined {
  const candidates = [
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
    process.env.LOCALAPPDATA
  ]
    .filter((root): root is string => Boolean(root))
    .map((root) => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));

  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Opens the given URL in Google Chrome.
 * Falls back to the OS default browser when Chrome cannot be found.
 */
export async function openUrlInChrome(url: string): Promise<void> {
  const chromePath = resolveChromePath();

  if (chromePath) {
    const child = spawn(chromePath, [url], { detached: true, stdio: 'ignore' });
    child.unref();
    return;
  }

  // Chrome が無い環境では既定ブラウザで開いて静かに degrade する。
  await shell.openExternal(url);
}

/**
 * Opens the given local file in Google Chrome.
 * Falls back to the OS default browser when Chrome cannot be found.
 */
export function openInChrome(absolutePath: string): Promise<void> {
  return openUrlInChrome(pathToFileURL(absolutePath).href);
}
