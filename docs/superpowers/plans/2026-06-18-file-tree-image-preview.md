# File Tree Image Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expandable folder rows to the Files panel and image support to the existing file preview window.

**Architecture:** Keep folder expansion local to the renderer `FilePanel` component. Extend the existing main-process preview module with a new `image` kind and render images through a generated HTML preview after path validation.

**Tech Stack:** Electron, TypeScript, React, Vitest, lucide-react.

---

### Task 1: Image Preview Detection and Rendering

**Files:**
- Modify: `electron/filePreview/types.ts`
- Modify: `electron/filePreview/filePreview.ts`
- Test: `tests/filePreview.test.ts`

- [ ] **Step 1: Write failing tests**
  - Add tests that `detectPreviewKind()` returns `image` for `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, and `.ico`.
  - Add a `createPreviewDataUrl()` test asserting image preview HTML contains an `<img>` and escaped file URL.

- [ ] **Step 2: Run tests and verify RED**
  - Run: `npm test -- tests/filePreview.test.ts`
  - Expected: image-kind assertions fail because current code returns `text`.

- [ ] **Step 3: Implement minimal image preview support**
  - Add `image` to `FilePreviewKind`.
  - Add image extension detection.
  - Add a file URL helper and image branch in preview rendering.
  - Avoid reading images as UTF-8.

- [ ] **Step 4: Run tests and verify GREEN**
  - Run: `npm test -- tests/filePreview.test.ts`
  - Expected: all file preview tests pass.

### Task 2: Expandable Folder Rows

**Files:**
- Modify: `src/components/FilePanel.tsx`
- Modify: `src/styles/app.css`
- Test: add focused pure helper tests if helper extraction is needed.

- [ ] **Step 1: Write failing test if a pure helper is extracted**
  - Prefer simple component state if no helper is needed.
  - If pruning expanded paths is extracted, test that missing paths are removed and visible directory paths remain.

- [ ] **Step 2: Implement folder toggles**
  - Add `expandedDirectoryPaths` state.
  - Directory row clicks toggle that path.
  - File row clicks keep opening preview.
  - Render children only when a directory is expanded.
  - Show chevrons for expandable directories.

- [ ] **Step 3: Style rows**
  - Update file tree grid columns for chevrons.
  - Add hover/focus styles and open-folder icon affordance.

- [ ] **Step 4: Verify**
  - Run: `npm test`
  - Run: `npm run typecheck`
  - Run: `npm run build`
