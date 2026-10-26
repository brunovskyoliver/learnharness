# 06 — File jail and uploads

Status: **done** (2026-10-26)

## What changed
- `src/agent/tools/fs-shared.ts`: in hosted mode `resolveSourcePath` anchors every path in `users/<id>/files/` (`PATHS.files`, new in `config.ts`). An absolute path is read as relative to that folder, unless it already points into it (tool output prints full paths). The check runs on `realpath`, so `..` and symlinks can't escape; anything outside throws "Path is outside your files folder". All five readers (`ls`, `find`, `grep`, `read`, and the pdf_reader job) go through this one function. Desktop and dev keep the home-directory anchor.
- `src/server/files.ts` + `app/api/files/route.ts` (wrapped in `withTenant`; 404 outside hosted mode): GET lists, POST (multipart `files`) saves, DELETE `?name=` removes. It's one flat folder of plain names: no separators, no leading dot, no control characters, 200 chars max. Saving a name that already exists replaces the file, and a planted symlink is unlinked, never written through. The cap is 10 MB per request. That matches the proxy's default body buffer (`experimental.proxyClientMaxBodySize`), which truncates anything larger, so raise both together.
- Settings → **Files** (`components/settings/files-section.tsx`), hosted only, placed before General: file list with sizes, "Upload files…" (multi-select), and Delete per row. `hosted` goes from the layout → `AppShell` → `SettingsDialogProvider` → the dialog body.
- Notes import (`POST /api/graph/import`) needed no change: it already takes uploaded multipart text and never reads a server path.

## Verified
- `tests/tenant-files.test.ts`: jail anchoring; `/etc/passwd` maps inside; `..` is refused; a symlink out is refused; another tenant's full path lands inside your own folder. Upload save/list/delete stays per tenant; unsafe names get 400 and oversize gets 413; a planted symlink is replaced, not followed; the route is 404 outside hosted mode.
- Settings nav test: hosted adds Files before General; the local nav is unchanged.
- `npm test` 2368/2368, typecheck, lint and `next build` clean. `files.ts` adds two warnings of the "dynamic filesystem access" kind already printed for `headless.ts` and `pdf-read.ts`; the existing tracing excludes cover them.

## Left
- The ls/find/grep tool descriptions still say "default: the learner's home directory". Hosted mode maps that to the files folder anyway. Reword per mode if the model gets confused.
- Research-job PDFs still download to a per-job temp directory (already scoped by `pdf-read.ts`). No change needed.
