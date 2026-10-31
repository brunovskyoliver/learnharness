# Research: Library and canvas pages

## R1. Page editor technology: PENDING OWNER APPROVAL

This decision belongs to the owner. The plan and tasks assume (a), behind one component.

Sizes were measured on 2026-10-30 with esbuild (bundle, minify, ESM, React external) and `gzip -9`, in a throwaway folder outside the repo. Turbopack output will differ somewhat, so treat these as comparisons, not app transfer figures.

| Option | Added minified | Added gzip | New runtime packages | Notes |
|--------|---------------|-----------|----------------------|-------|
| (a) Textarea with live preview | 0 | 0 | none | Preview uses the existing Streamdown and math plugin: entry 82.4 KB gzip, 233.3 KB gzip across all split chunks. Chat already ships this code. On a Library-only visit it loads on demand. |
| (b) CodeMirror 6, core (view, state, commands, history) | 270.8 KB | 88.9 KB | 3+ (`@codemirror/view` 6.43.15) | No Markdown highlighting at this size. |
| (b) CodeMirror 6 with `@codemirror/lang-markdown` | 502.3 KB | 173.9 KB | adds Lezer plus the HTML, CSS and JS language packs it pulls in | Preview still uses Streamdown. |
| (c) TipTap 3.32.2 (react, starter-kit, pm, markdown) | 479.2 KB | 152.2 KB | about 4 direct, many ProseMirror transitive | Excludes React. |
| (c) TipTap with `@tiptap/extension-mathematics` | 484.6 KB | 153.6 KB | one more | KaTeX excluded, since the app has it. |

Comparison:

- **(a)** Markdown source is what the learner sees and what is stored, so math and agent edits survive byte for byte. Native undo, IME, mobile selection and focus rings work with no custom code, and the composer already uses the same `field-sizing-content` textarea pattern. It lacks syntax colors, line numbers and in-editor search, and undo is lost when the text is swapped programmatically. Typing in a page near 1 MiB may lag; the preview is debounced and uses deferred rendering, but this is untested.
- **(b)** Adds highlighting, search and long-document performance. Costs a dependency set that must be themed to Study ink and checked for hidden scrollbars and 44 px targets. Mobile selection is less native.
- **(c)** The closest to ChatGPT Canvas. Storage is Markdown but editing is rich text, so a round trip can rewrite the learner's source. Math round-trips and agent edits against stored Markdown need extra tests. Also the largest behavior surface for a file-backed Markdown document.

**Recommendation: (a).** It is the only option with no new dependency and no startup measurement burden, and it keeps stored text exact, which supports SC-002. `PageEditor` has a small interface (`value`, `onChange`, `onSaveShortcut`, `readOnly`, `ariaLabel`, `inputRef`), so (b) can replace it in one file if long pages hurt.

## R2. Existing hosted files and the jail

**Decision**: bytes stay in `PATHS.files` with their current names. `library/catalog.json` holds metadata. Listing reconciles:

- a regular file with no entry gets a new entry: `origin: "existing"`, `createdAt` from mtime, no byte access beyond type detection;
- a live entry whose file is gone becomes a tombstone;
- a file with a new name that matches a vanished entry's size and mtime is treated as that entry, which recovers a crash mid-rename;
- symlinks and folders are skipped, as `listFiles` does today.

An unreadable catalog returns an honest 500 and is never recreated, since recreating would lose ids. A file whose extension is outside the accepted list still appears, as kind `other`, can be deleted, and is labeled unreadable if referenced. That is what "without loss" requires.

**Rationale**: `src/agent/tools/fs-shared.ts` `jailedPath` assumes one flat folder with no symlinks, and `ls`, `find`, `grep`, `read` and the `pdf` job all go through it. Keeping the folder means no migration and no jail change. Production has no `files/` folder (audit), so the migration risk today is zero, but the code path is still tested.

**Name agreement**: rename moves the file too, so an agent using `ls` sees the Library's name. This is not an edit of the original; contents are untouched.

**Desktop**: `PATHS.files` resolves under `LH_DATA_DIR`. `resolveSourcePath` keeps its home-folder behavior, so desktop keeps its home access. macOS userData is under `~/Library`, which `walkFiles` skips, so `find` will not discover it there. `library_read` works in both modes, and doctrine points there first.

**Alternatives rejected**: moving bytes into `library/` (needs a real migration and a jail change); a display name separate from the disk name (agent tools and the Library would disagree).

## R3. Same-name uploads

**Decision**: the upload streams to `<data>/tmp`, then `fs.link(temp, target)`, which fails with `EEXIST` atomically, then the temp file is unlinked. On `EEXIST` the API returns 409 with `suggestedName`, for example `notes (2).pdf`. The client asks Keep both or Cancel and retries with the suggested name. Names compare case-insensitively after NFC against the whole catalog, including pages, because macOS volumes are case-insensitive and agents refer to items by name. Existing hosted duplicates differing only by case are kept as they are.

**This changes today's behavior**: `src/server/files.ts:59` does `rm` then `writeFile`. A pre-existing symlink at the target now produces a conflict; it is neither followed nor removed. `tests/tenant-files.test.ts` "link.md" changes accordingly and still proves the outside file is untouched.

**Alternatives rejected**: Replace (FR-002 says originals are never edited); silent auto-suffix (allowed by the spec, but the learner would not know two copies exist).

## R4. 50 MB uploads and the proxy

Read: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md` and `node_modules/next/dist/server/body-streams.js`.

Facts:
- Default limit 10 MB. Over the limit Next logs a warning, ends the stream, and the handler sees a partial body with no error.
- `next.config.ts` has an `experimental` block already; the key is valid in the 16.3.2 schema (`config-schema.js:280`).
- The proxy matcher includes all of `/api`, and hosted auth and the desktop capability check both live in `proxy.ts`, so uploads cannot skip it.
- The buffered copy stays in memory for that request.

**Decision**:
- `experimental.proxyClientMaxBodySize: "51mb"`. The cap stays 50 MiB. The extra 1 MiB means a declared-limit file is never cut.
- One file per request, raw body (`POST /api/library/upload?name=`). No multipart overhead, and a limit that reads the same to the learner as "per file", which also closes audit finding 13.
- Missing `Content-Length`: 411. Over the cap: 413 before reading.
- Count bytes while streaming. A count that differs from the declared length discards the temp file and returns 400.
- `Readable.fromWeb(request.body)` to a file, so the handler itself holds no second copy.
- XHR on the client, because `fetch` has no upload progress.

Caddy (`deploy/Caddyfile`) sets no body limit. Update `docs/hosting.md:90`.

**Risk**: see plan owner decision 9. The route must be tested with a real server for the truncation path; tests call the handler directly and cannot exercise the proxy, so T026's script covers it with a file above the limit.

## R5. Inline size limit

**Decision**: 32 KiB of UTF-8 text per item, 64 KiB per message, at most 8 references per message, and no item that would use more than half the room left before compaction. An item over any of these goes as an outline with the reason on its label.

**Reasoning**:
- `src/core/compaction.ts` estimates 4 characters per token, so 32 KiB is about 8,200 tokens, or roughly 5,000 to 6,000 English words: a typical set of lecture notes of about a dozen pages.
- It stays under `read`'s 50 KB output ceiling (`read.ts:32`), so one reference never holds more than one tool page would.
- 64 KiB is about 16,400 tokens, 11% of the default compaction threshold of 150,000 (`settings.ts:409`) and half of the 32,000 floor (`settings.ts:592`). That floor is why the "half the room left" rule also exists: with a small window, two large items must not trigger compaction immediately.
- Room is `effectiveThresholdTokens(...)` minus the estimate of the record plus system prompt, computed after `ensureCompacted`, which `chat-handler.ts` runs before computing appends.

Limits apply to extracted text for PDFs and to UTF-8 bytes for everything else. Constants live in `src/core/library.ts`.

**Alternatives rejected**: 50 KB per item (two items would be about 26,000 tokens, which is costly on every later turn until compaction); token counting with a model tokenizer (`js-tiktoken` is per-encoding and only an estimate across providers, and the existing estimate is what compaction acts on).

## R6. Outlines

Built by `src/server/library-text.ts`, no model, capped at 8 KiB. A truncated outline says so.

| Kind | Outline |
|------|---------|
| Markdown, page | Headings with line numbers, plus the line count |
| Text | Line count and the first 40 lines |
| Code | Language from the extension, line count and the first 40 lines |
| CSV | Header, row count, first 5 rows |
| PDF | Page count, bookmarks if any (new `pdfOutline` using `doc.getOutline()` in `pdf-ops.ts`), flagged pages from `pdfInfo`, and how to read pages |

PDF text and info are cached in `library/derived/<id>.json`, keyed by size and mtime, after upload and on first reference. Reference resolution waits at most 10 seconds; after that, the label says the outline was not ready and tool access remains. `pdfjs` runs on the main thread, so extraction yields between pages and runs one at a time per tenant.

A PDF with no extractable text (`mean_text_length` 0) records `textState: "none"`. The Library row and any reference label say no text could be read, and the agent is told so.

## R7. Where references live

**Decision**: an optional `references` field on the message carrying the learner's text:

- `text` input: `UserMessage`;
- `steer` input: `UserMessage` from `newUserSteer`, same object through `agent.steer`;
- `thinking` input: the `practice-thinking` marker;
- `answer` input: `details.references` on the `toolResult`.

`toLlmMessages` removes the field and adds the rendered material as text: an added text block on user and tool-result messages, appended content on the marker.

**Why not a new marker like `graph-context`**, the first idea from the audit:

1. `chat-handler.ts` documents the provider shape rule: a tool result must stay adjacent to its assistant call. A marker before an answer's result breaks it, and one after a partial parallel-question batch separates siblings.
2. `needsContinuation` and `endsInDismissal` read the last message. A trailing marker after an answer changes both.
3. `nativeInputCause` classifies unknown custom types as `unrecognizable`, making cause `ambiguous`, which affects subscription background gating.
4. A steer would become two queue entries with separate withdrawal.

`GraphContextCard` stays the pattern for the visible label, through a view part. FR-005 says "stored with the message", which this does literally.

**Snapshot**: inline material is stored in the record at send. That keeps replay and prompt caching stable and keeps old turns true after later edits. `clientMessages` in `src/server/chats.ts` strips `material`, as it does for signatures, so transcripts stay light. The field is additive, so `CURRENT_CHAT_VERSION` does not change and golden fixtures stay as they are.

**Why the server parses text**: `?prompt=` on Home (`components/home.tsx:134`), drafts in session state, `reload-recovery.ts`, queued steers and retries all carry plain text. One pure parser in core serves the server and the client's pre-send line. Client-supplied names and sizes are never trusted.

**Deleted or renamed items**: tombstones and `previousNames` in the catalog let `@old name` resolve to the item, or to an honest "missing" reference. See owner decision 14 for hand-typed names.

**Compaction**: `estimateMessageTokens` counts material. The summary serializer writes names and modes only, so summaries do not swallow documents. After a cut, doctrine tells the agent to reread through `library_read`.

## R8. Prompt injection

**Decision**: material is rendered as data, in the [wire format](contracts/references.md#wire-format): a fixed bracketed preamble (the convention in `newGraphContextMessage`), then `<library_item>` blocks. Any `</library_item` in content becomes `<\/library_item`; attributes are escaped. `library_read` output uses the same wrapper. Doctrine repeats the rule.

This reduces risk but cannot remove it, since the model reads the text. Blast radius is limited by what exists: fs tools are read-only by construction, page tools write versions that can be restored, and the Library is per tenant. An injected instruction could still try to use `research` to send text out in a query or to write a misleading page. Tests assert escaping and wrapping only; model behavior is not tested, in line with "tests run without model requests".

## R9. Answer secrecy and practice

- `compactAnswerForModel` output is unchanged; material is an added block at the wire. A test asserts its output equals the pre-feature output for the same answer.
- Client-built `QuestionAnswerData` gains nothing. The server parses `text`, `other` and `thinking` and writes `details.references` itself.
- Dismissals, "I don't know" with no text, and `next` carry no references: the dismiss route never resolves any, and `next` has no text.
- Quiz grading and confidence handling do not read references.
- `page_create` and `page_revise` check `danglingQuestionOf` and `activeProblemOf` and refuse. This stops a committed `modelSolution` reaching a page during nudges. A call in the same assistant batch as a new question is not yet in the record, so doctrine covers that case.
- Practice tool parts follow the existing rule of showing nothing live, and inputs are never shown while running.

## R10. Concurrent editing

**Decision**: one learner draft per page on the server, plus a tab-local backup.

- Every save names `baseVersion` and `draftRev`. A mismatch returns 409 with the current state and changes nothing.
- On conflict the tab keeps its text and shows two actions. **Keep mine**: the other side's draft, if any, is committed as its own version first, then this text becomes the newest version. **Use latest**: this tab's text is committed as its own version first, then the tab loads the newest. Either way both texts are in history.
- `page_revise`, under the page lock: commit a dirty draft as a learner version (FR-016), then compare the agent's `baseVersion` with head. If they differ, refuse and tell the agent which version to read. That puts the learner's text on head before the agent's edit, so the agent's edit never hides it.
- A `library-changed` event tells open tabs. A clean tab loads the new head and shows "Updated by the agent". A dirty one keeps its text and shows the conflict line.
- A tab's unsent text is also in `localStorage` (debounce 300 ms), keyed by account and page, so a failed PUT or crash loses nothing. Reopening compares it with the server draft and offers it if different.
- Restore commits a dirty draft, then appends a version with the old content and `restoredFrom`.

**Autosave cadence**: the draft is saved after 1 s idle; a version is made on Save (button or Cmd/Ctrl+S), on closing the pane or leaving the route, and before any agent revision. This keeps history readable.

**Locks**: an in-process async mutex per page through `tenantScoped`. `docs/hosting.md` says one process only, so this is sufficient.

**Alternatives rejected**: automatic three-way merge (a dependency or hand-written diff, and silent merges of math are risky); last write wins (violates the spec).

## R11. Images

**Decision**: a new job kind `image` and tool `image { item, question }`, role `pdfReader` in `KIND_ROLE` (`runner.ts:124`), which resolves to the vision slot through `ROLE_SLOT` (`settings.ts:228`), so no new settings. It appears in the activity dock with cost and abort, and the result arrives as a steer, like `pdf`. The tool is registered for prober, teacher and practice, all of which already take job tools.

No vision model, or no key for it: at send, the reference has `mode: "unreadable"`, `reason: "no-vision"`; the label links to Settings → Agent, and the tool refuses with the same sentence. No model is called and the turn proceeds.

**A gap this closes**: `read.ts:108` returns image bytes to the conversation model today, which would bypass the ruling. `read` now refuses image files inside `PATHS.files` and names the `image` tool. Images elsewhere on desktop behave as before. Existing `read` image tests use paths outside the folder or are updated.

Accepted image types match `read.ts`: jpg, jpeg, png, gif, webp, bmp, verified by magic bytes. SVG is refused since it is script-capable and not a raster.

## R12. Settings search and row links

**Index**: `components/settings/settings-index.ts`, a plain array of `{ section, row, label, hint?, hostedOnly?, desktopOnly? }`. No React imports, loaded with the dialog. Shared copy (`TOOL_COPY`, slot labels, `AUTH_PROVIDER_KEYS`) is imported rather than repeated, moving `TOOL_COPY` there. Ranking uses `src/core/fuzzy.ts`.

**Drift test**: render each section with `renderToStaticMarkup`, as existing render tests do, and require that every `data-settings-row` is in the index and every indexed row renders. A new row with no index entry fails the test.

**Results**: while the search field has text, the nav column lists matches under category headings. Choosing one sets the section and row. "Nothing matches {query}" otherwise.

**Deep links**: `SettingsRow` gains `rowId`, rendered as `data-settings-row`. Non-`SettingsRow` rows (providers, connections, graph display) get the attribute directly. `SettingsDialogBody` runs an effect on `initialRow` changes: find the row, `scrollIntoView` (respecting reduced motion), focus its first control, and show a raised-2 highlight for 160 ms. `KeysSection` keeps its unfold through `initialRow`. `open(section, row)` already exists in `settings-dialog.tsx`. The `Hint` and close behavior do not change.

## R13. Browser checks on this machine

**Facts found**:
- No browser is on PATH. `kernel.apparmor_restrict_unprivileged_userns` is 1, which blocks Chrome's sandbox.
- `@puppeteer/browsers` fails here: downloads from Google storage return 403.
- `@sparticuz/chromium` from npm (153.0.8010.0 HeadlessChrome), installed in a temp folder, ran through the repo's `puppeteer-core` with `--no-sandbox`, including a 320 px viewport and a screenshot. No missing shared libraries.
- `scripts/smoke-*.mjs` call `puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true })` with no args, so `CHROME_PATH` must point at a small wrapper script adding `--no-sandbox`. `scripts/measure-session-performance.mjs` connects to `LH_BROWSER_URL`.

**Decision**: T002 sets this up under `~/agent-runs/`, outside the repo; it is not a dependency. Regressions run isolated data on localhost, so the missing sandbox is acceptable there. Electron's binary (`node_modules/electron/dist/electron`) was not probed as a browser. No display exists for it here, and the bundled Chromium already works.

**Limits**: headless software rendering; not a substitute for the owner's real browser for look-and-feel. The audit's 12 browser-dependent test failures may pass with `CHROME_PATH` set, which T002 records.

## R14. Startup budget

- Sidebar: one `LibraryIcon` from `lucide-react` and one link.
- Composer: `use-library-mention.ts`, kept small and free of Radix, Streamdown and fetch at import. The menu is imported on the first `@` that passes the trigger rule. The list is fetched then, not at startup.
- `app/(app)/library/page.tsx`: its own route chunk. Editor, preview and history are `next/dynamic`, `ssr: false` where they use the browser.
- `PagePanePanel` in the chat is dynamic and renders nothing until a page is open.
- `tests/startup-module-graph.test.ts` gains assertions that sidebar, home and graph entries bundle no `components/library/page-*` code and no extra Streamdown path.
- `pdf-ops` stays server-only and lazy.
