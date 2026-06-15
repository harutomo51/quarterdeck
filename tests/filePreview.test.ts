import { describe, expect, it } from 'vitest';
import {
  createPreviewDataUrl,
  detectHighlightLanguage,
  detectPreviewKind,
  resolvePreviewPath
} from '../electron/filePreview/filePreview';

describe('detectPreviewKind', () => {
  it('detects markdown files', () => {
    expect(detectPreviewKind('README.md')).toBe('markdown');
    expect(detectPreviewKind('notes.markdown')).toBe('markdown');
  });

  it('detects html files', () => {
    expect(detectPreviewKind('index.html')).toBe('html');
    expect(detectPreviewKind('page.htm')).toBe('html');
  });

  it('treats source files as code', () => {
    expect(detectPreviewKind('src/App.tsx')).toBe('code');
    expect(detectPreviewKind('script.ps1')).toBe('code');
  });

  it('detects pdf files', () => {
    expect(detectPreviewKind('report.pdf')).toBe('pdf');
    expect(detectPreviewKind('docs/Spec.PDF')).toBe('pdf');
  });
});

describe('detectHighlightLanguage', () => {
  it('maps source file extensions to highlight.js languages', () => {
    expect(detectHighlightLanguage('src/App.tsx')).toBe('typescript');
    expect(detectHighlightLanguage('script.ps1')).toBe('powershell');
    expect(detectHighlightLanguage('package.json')).toBe('json');
  });

  it('leaves plain text files without a highlight language', () => {
    expect(detectHighlightLanguage('notes.txt')).toBeUndefined();
  });
});

describe('resolvePreviewPath', () => {
  it('resolves a relative path inside the root directory', () => {
    expect(resolvePreviewPath('C:\\repo', 'src\\App.tsx')).toBe('C:\\repo\\src\\App.tsx');
  });

  it('rejects traversal outside the root directory', () => {
    expect(() => resolvePreviewPath('C:\\repo', '..\\secret.txt')).toThrow('outside');
  });

  it('rejects absolute paths from the renderer', () => {
    expect(() => resolvePreviewPath('C:\\repo', 'C:\\Windows\\win.ini')).toThrow('relative');
  });
});

describe('createPreviewDataUrl', () => {
  it('allows scripts in sandboxed html previews so chart libraries can render', () => {
    const dataUrl = createPreviewDataUrl('report.html', '<script>window.rendered = true</script>', 'html');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('<iframe sandbox="allow-scripts"');
    expect(html).not.toContain('allow-same-origin');
  });

  it('uses the warm editorial preview design tokens from DESIGN.md', () => {
    const dataUrl = createPreviewDataUrl('README.md', '# Hello', 'markdown');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('--preview-canvas: #faf9f5;');
    expect(html).toContain('--preview-primary: #cc785c;');
    expect(html).toContain('--preview-dark: #181715;');
    expect(html).toContain('--font-standard: "Noto Sans JP", "Note Sans JP", system-ui, sans-serif;');
    expect(html).toContain('--font-serif: "Noto Sans JP", "Note Sans JP", serif;');
    expect(html).toContain('--font-mono: "BIZ UDGothic", "Cascadia Mono", Consolas, monospace;');
    expect(html).toContain('--font-number: "Cambria Math", "Noto Sans JP", serif;');
    expect(html).toContain('<article class="markdown preview-card">');
  });

  it('uses smaller markdown heading sizes', () => {
    const dataUrl = createPreviewDataUrl('README.md', '# H1\n\n## H2\n\n### H3', 'markdown');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('line-height: 1.32;');
    expect(html).toContain('.markdown h1 { margin: 0 0 22px; font-size: 32px; }');
    expect(html).toContain('.markdown h2 { margin: 32px 0 14px; font-size: 23px; }');
    expect(html).toContain('.markdown h3 { margin: 24px 0 12px; font-size: 17px; }');
  });

  it('keeps html previews unframed so the document owns its own layout', () => {
    const dataUrl = createPreviewDataUrl('report.html', '<h1>Report</h1>', 'html');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('<main class="html-main">');
    expect(html).toContain('<iframe sandbox="allow-scripts"');
    expect(html).not.toContain('<section class="html-preview">');
  });

  it('uses a wider canvas for non-html previews', () => {
    const dataUrl = createPreviewDataUrl('README.md', '# Wide document', 'markdown');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('width: min(100%, 1440px);');
    expect(html).toContain('max-width: 1180px;');
    expect(html).not.toContain('<main class="html-main">');
  });

  it('renders source files with highlight.js classes', () => {
    const dataUrl = createPreviewDataUrl('src/App.tsx', 'const answer = 42;', 'code');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('class="hljs language-typescript"');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('--font-number: "Cambria Math", "Noto Sans JP", serif;');
  });

  it('keeps unknown text previews escaped without language classes', () => {
    const dataUrl = createPreviewDataUrl('notes.txt', '<hello>', 'text');
    const html = decodeURIComponent(dataUrl.replace('data:text/html;charset=utf-8,', ''));

    expect(html).toContain('class="hljs"');
    expect(html).toContain('&lt;hello&gt;');
  });
});
