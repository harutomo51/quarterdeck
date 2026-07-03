import { BrowserWindow } from 'electron';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, resolve, sep } from 'node:path';
import hljs from 'highlight.js/lib/common';
import MarkdownIt from 'markdown-it';
import { closeWindowOnEscape } from '../window/closeOnEscape';
import { openInChrome, openUrlInChrome } from '../window/openInChrome';
import type { FilePreviewKind, FilePreviewOpenResult } from './types';

const OPEN_IN_BROWSER_REQUEST = 'quarterdeck:open-in-browser';

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight(value, language) {
    return highlightCode(value, language);
  }
});

const CODE_EXTENSIONS = new Set([
  '.bat',
  '.c',
  '.cmd',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.mdx',
  '.ps1',
  '.py',
  '.rs',
  '.sh',
  '.ts',
  '.tsx',
  '.xml',
  '.yaml',
  '.yml'
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);

const MAX_PREVIEW_BYTES = 1_000_000;
const MAX_IMAGE_PREVIEW_BYTES = 25_000_000;
const MAX_PDF_PREVIEW_BYTES = 50_000_000;

const HIGHLIGHT_LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ['.bat', 'dos'],
  ['.c', 'c'],
  ['.cmd', 'dos'],
  ['.cpp', 'cpp'],
  ['.cs', 'csharp'],
  ['.css', 'css'],
  ['.go', 'go'],
  ['.java', 'java'],
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.json', 'json'],
  ['.mdx', 'markdown'],
  ['.ps1', 'powershell'],
  ['.py', 'python'],
  ['.rs', 'rust'],
  ['.sh', 'bash'],
  ['.ts', 'typescript'],
  ['.tsx', 'typescript'],
  ['.xml', 'xml'],
  ['.yaml', 'yaml'],
  ['.yml', 'yaml']
]);

export function detectPreviewKind(filePath: string): FilePreviewKind {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.md' || extension === '.markdown') {
    return 'markdown';
  }
  if (extension === '.html' || extension === '.htm') {
    return 'html';
  }
  if (extension === '.pdf') {
    return 'pdf';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'image';
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return 'code';
  }
  return 'text';
}

export function detectHighlightLanguage(filePath: string): string | undefined {
  return HIGHLIGHT_LANGUAGE_BY_EXTENSION.get(extname(filePath).toLowerCase());
}

export function shouldUseDirectFilePreview(kind: FilePreviewKind): boolean {
  return kind === 'pdf' || kind === 'image';
}

export function resolvePreviewPath(rootPath: string, relativePath: string): string {
  if (isAbsolute(relativePath)) {
    throw new Error('Preview path must be relative.');
  }

  const root = resolve(rootPath);
  const target = resolve(root, relativePath);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error('Preview path is outside the current directory.');
  }

  return target;
}

export async function openFilePreview(rootPath: string, relativePath: string): Promise<FilePreviewOpenResult> {
  try {
    const absolutePath = resolvePreviewPath(rootPath, relativePath);
    const fileStat = await stat(absolutePath);

    if (!fileStat.isFile()) {
      return { ok: false, error: 'Only files can be previewed.' };
    }

    const kind = detectPreviewKind(absolutePath);
    const isPdf = kind === 'pdf';
    const isImage = kind === 'image';
    const maxBytes = isPdf ? MAX_PDF_PREVIEW_BYTES : isImage ? MAX_IMAGE_PREVIEW_BYTES : MAX_PREVIEW_BYTES;

    if (fileStat.size > maxBytes) {
      return { ok: false, error: getPreviewSizeError(kind) };
    }

    const previewWindow = new BrowserWindow({
      width: 920,
      height: 720,
      minWidth: 520,
      minHeight: 420,
      title: `Preview - ${basename(absolutePath)}`,
      backgroundColor: '#10131a',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        plugins: isPdf
      }
    });

    previewWindow.removeMenu();
    closeWindowOnEscape(previewWindow);

    previewWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (kind === 'html' && url === OPEN_IN_BROWSER_REQUEST) {
        void openInChrome(absolutePath);
      }
      return { action: 'deny' };
    });

    let previewLoaded = false;
    previewWindow.webContents.once('did-finish-load', () => {
      previewLoaded = true;
    });
    previewWindow.webContents.on('will-frame-navigate', (event) => {
      if (!previewLoaded) {
        return;
      }
      event.preventDefault();
      if (kind === 'html' && /^https?:\/\//i.test(event.url)) {
        void openUrlInChrome(event.url);
      }
    });

    if (shouldUseDirectFilePreview(kind)) {
      await previewWindow.loadFile(absolutePath);
      return { ok: true };
    }

    const content = await readFile(absolutePath, 'utf8');
    await previewWindow.loadURL(createPreviewDataUrl(absolutePath, content, kind));
    return { ok: true };
  } catch (error) {
    console.error('Failed to open file preview', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'File preview could not be opened.'
    };
  }
}

export function createPreviewDataUrl(filePath: string, content: string, kind: FilePreviewKind): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(createPreviewHtml(filePath, content, kind))}`;
}

function createPreviewHtml(filePath: string, content: string, kind: FilePreviewKind): string {
  const title = escapeHtml(filePath);
  const body = renderPreviewBody(filePath, content, kind);

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --preview-canvas: #faf9f5;
        --preview-soft: #f5f0e8;
        --preview-card: #efe9de;
        --preview-hairline: #e6dfd8;
        --preview-ink: #141413;
        --preview-body: #3d3d3a;
        --preview-muted: #6c6a64;
        --preview-primary: #cc785c;
        --preview-primary-active: #a9583e;
        --preview-dark: #181715;
        --preview-dark-soft: #1f1e1b;
        --preview-on-dark: #faf9f5;
        --font-standard: "Noto Sans JP", "Note Sans JP", system-ui, sans-serif;
        --font-serif: "Noto Sans JP", "Note Sans JP", serif;
        --font-sans: "Noto Sans JP", "Note Sans JP", system-ui, sans-serif;
        --font-mono: "BIZ UDGothic", "Cascadia Mono", Consolas, monospace;
        --font-number: "Cambria Math", "Noto Sans JP", serif;
        font-family: var(--font-standard);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--preview-canvas);
        color: var(--preview-body);
        font-size: 16px;
        line-height: 1.65;
      }
      main {
        width: min(100%, 1440px);
        margin: 0 auto;
        padding: 48px 28px 72px;
      }
      .html-main {
        width: 100%;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      .html-toolbar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        padding: 10px 14px;
        background: var(--preview-soft);
        border-bottom: 1px solid var(--preview-hairline);
      }
      .open-browser-button {
        appearance: none;
        border: 1px solid var(--preview-primary);
        border-radius: 8px;
        background: var(--preview-primary);
        color: var(--preview-on-dark);
        font-family: var(--font-standard);
        font-size: 13px;
        font-weight: 500;
        padding: 7px 14px;
        cursor: pointer;
        transition: background 120ms ease, border-color 120ms ease;
      }
      .open-browser-button:hover {
        background: var(--preview-primary-active);
        border-color: var(--preview-primary-active);
      }
      .open-browser-button:active {
        transform: translateY(1px);
      }
      a { color: var(--preview-primary); text-decoration-thickness: 1px; text-underline-offset: 3px; }
      .preview-card {
        border: 1px solid var(--preview-hairline);
        border-radius: 12px;
        background: var(--preview-card);
        padding: 32px;
      }
      .markdown {
        max-width: 1180px;
        color: var(--preview-body);
      }
      .markdown h1,
      .markdown h2,
      .markdown h3 {
        color: var(--preview-ink);
        font-family: var(--font-serif);
        font-weight: 500;
        letter-spacing: 0;
        line-height: 1.32;
      }
      .markdown h1 { margin: 0 0 22px; font-size: 32px; }
      .markdown h2 { margin: 32px 0 14px; font-size: 23px; }
      .markdown h3 { margin: 24px 0 12px; font-size: 17px; }
      .markdown p,
      .markdown li { margin-bottom: 12px; }
      .markdown ul,
      .markdown ol { padding-left: 24px; }
      .markdown blockquote {
        margin: 24px 0;
        border-left: 4px solid var(--preview-primary);
        padding: 10px 0 10px 18px;
        color: var(--preview-muted);
        background: var(--preview-soft);
      }
      pre {
        margin: 0;
        overflow: auto;
        border-radius: 12px;
        padding: 20px;
        background: var(--preview-dark);
        color: var(--preview-on-dark);
        line-height: 1.6;
      }
      .markdown pre { margin: 18px 0; }
      code {
        font-family: var(--font-mono);
        font-size: 14px;
      }
      :not(pre) > code {
        border-radius: 6px;
        padding: 2px 6px;
        color: var(--preview-primary-active);
        background: var(--preview-soft);
      }
      .code-preview {
        border-radius: 12px;
        background: var(--preview-dark);
        padding: 24px;
      }
      .hljs {
        background: transparent;
        color: var(--preview-on-dark);
      }
      .hljs-keyword,
      .hljs-built_in,
      .hljs-type,
      .hljs-selector-tag {
        color: #f7a88a;
      }
      .hljs-string,
      .hljs-attr,
      .hljs-symbol {
        color: #c7e88b;
      }
      .hljs-number,
      .hljs-literal {
        color: #f0cf74;
        font-family: var(--font-number);
      }
      .hljs-title,
      .hljs-name,
      .hljs-section {
        color: #8fc7ff;
      }
      .hljs-comment,
      .hljs-quote {
        color: #8d9287;
        font-style: italic;
      }
      .hljs-variable,
      .hljs-template-variable {
        color: #ffd2a6;
      }
      .hljs-meta,
      .hljs-operator,
      .hljs-punctuation {
        color: #d8d4c8;
      }
      iframe {
        display: block;
        width: 100%;
        flex: 1;
        min-height: 0;
        border: 0;
        border-radius: 0;
        background: white;
      }
    </style>
  </head>
  <body>
    <main${kind === 'html' ? ' class="html-main"' : ''}>${body}</main>
  </body>
</html>`;
}

function renderPreviewBody(filePath: string, content: string, kind: FilePreviewKind): string {
  if (kind === 'markdown') {
    return `<article class="markdown preview-card">${markdown.render(content)}</article>`;
  }

  if (kind === 'html') {
    return `<div class="html-toolbar">
      <button type="button" class="open-browser-button" id="open-in-browser">ブラウザで開く</button>
    </div>
    <iframe sandbox="allow-scripts" srcdoc="${escapeAttribute(content)}"></iframe>
    <script>
      document.getElementById('open-in-browser')?.addEventListener('click', () => {
        window.open(${JSON.stringify(OPEN_IN_BROWSER_REQUEST)}, '_blank');
      });
    </script>`;
  }

  const language = detectHighlightLanguage(filePath);
  const highlighted = highlightCode(content, language);
  const languageClass = language ? ` language-${escapeHtml(language)}` : '';
  return `<section class="code-preview"><pre><code class="hljs${languageClass}">${highlighted}</code></pre></section>`;
}

function highlightCode(value: string, language?: string): string {
  if (language && hljs.getLanguage(language)) {
    return hljs.highlight(value, { language, ignoreIllegals: true }).value;
  }

  return escapeHtml(value);
}

function getPreviewSizeError(kind: FilePreviewKind): string {
  if (kind === 'pdf') {
    return 'PDF previews are limited to 50MB.';
  }
  if (kind === 'image') {
    return 'Image previews are limited to 25MB.';
  }
  return 'Text previews are limited to 1MB.';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, '&#10;');
}
