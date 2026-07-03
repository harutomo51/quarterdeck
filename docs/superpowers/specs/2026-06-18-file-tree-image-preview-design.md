# File Tree Image Preview Design

## Goal

Allow users to expand and collapse folders in the Files side panel and preview common image files from the existing preview flow.

## Approved Direction

Use inline folder row toggles in the existing file tree. A directory row click toggles that directory open or closed. File rows continue to open previews. The tree keeps open state by `relativePath` while the panel is mounted and prunes stale paths when the tree reloads.

## Architecture

- `src/components/FilePanel.tsx` owns expanded directory state and passes it through the recursive `FileTree`.
- `electron/filePreview/filePreview.ts` detects image extensions and opens a sandboxed preview `BrowserWindow` using a validated `file://` URL.
- `electron/filePreview/types.ts` adds an `image` preview kind.
- Tests cover pure image detection, preview HTML generation, and expandable tree behavior where practical.

## Data Flow

Renderer file rows call `filePreview.open(relativePath, paneId)` as before. Main process resolves the relative path against the current pane CWD and rejects absolute paths or traversal. Image previews skip UTF-8 text reading and load an HTML data URL containing an escaped local file URL in an `<img>`.

## Error Handling

Directories do not attempt previews. Large-image limits should be higher than text files but still bounded. Unsupported files keep existing text fallback behavior.

## Testing

- Add preview-kind tests for `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, and `.ico`.
- Add preview HTML test proving image previews render an `<img>` with escaped source and alt text.
- Add a focused renderer test for directory open/close state if the current test setup supports it; otherwise keep logic simple and verify with typecheck/build.
