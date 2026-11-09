# Feature Specification: Instant loads

**Feature Branch**: `main` (no branch created; the owner decides branching)

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "also loading stuff like this [PDF in the Library pane, blank for a long time] or the graphs it made in the convo takes sooo long... can we make it really snappy and instant? that goes for everything and everypage load..." Scope approved by the owner (2026-11-09, one question, all four options): PDF ranges + caching, cached plot libraries, lighter plotly build, trim page-load JS.

## Baseline (measured 2026-11-09)

Same production image, throwaway container, headless Chromium, emulated remote link (60 ms round trip, 20 Mbps down). Driver and raw data: `~/agent-runs/2026-11-09-instant-loads/perf/`.

| Scenario | Remote cold | Remote warm |
|---|---|---|
| Library PDF (17.3 MB, 75 scanned pages): click → page 1 drawn | 9.0 s (whole file downloaded first) | 7.2 s (downloaded again) |
| Chat with 2 vega charts: charts shown | 1.6 s | 0.9 s |
| Chat with 2 3D plots: plots shown | 3.9 s | 2.6 s (2.9 MB re-downloaded) |
| Real 1-plot chat: plot shown | 2.6 s | 1.4 s |
| Return to a plot chat from the sidebar | 2.8 s | — |
| Home: usable | 0.48 s | 0.12 s |
| Chat page: text visible | 0.26 s | 0.21 s |
| Chat first-load JS | 673 KB transferred / 2.16 MB decoded | from cache |
| Plot library start-up on the main thread | 0.75 s task + ~0.2 s per 3D plot | same |

## Clarifications

### Session 2026-11-09

- Q: How should the browser keep a PDF it already downloaded? → A: Kept privately in this browser; every open revalidates with the server ("still the same file?") and reuses the copy if so (private, always revalidated, version-tag validator).
- Q: What should the lighter 3D plotting build cover? → A: Light build with the 3D trace types plus contour, heatmap and scatter; a plot using any other trace type loads the full build for that plot only. The custom build may use the plotly.js source package as a build-time dependency only (owner approval, 2026-11-09).
- Q: While the math or code renderer is still downloading, what does a message show? → A: Messages containing math or code wait for the renderer before appearing; other messages show at once. The renderer download starts in parallel with the page.
- Q (after measurement): PDF cold target with versioned chunks measured ~3.1 s; accept, compact copy, or stop? → A: Accept with small tweaks (start the first chunk while the reader code loads); targets set to measured values, no new dependency.
- Q: How should the reader decide to show its "no selectable text" note? → A: Check pages 1–3 only; if none has text, show the note.
- Q: Should plotting code be fetched ahead of time? → A: No. Only when a plot is on screen; repeat views are instant through caching.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A PDF opens at once (Priority: P1)

He opens a large PDF from the Library. The first page appears within about a second, before the rest of the file has arrived. The page count shows promptly. Reopening the same PDF, or reloading the page with it open, shows page 1 without downloading the file again.

**Why this priority**: the largest measured wait (9 s per open, repeated on every reload).

**Independent Test**: open the 17 MB baseline PDF on the remote profile; time click → page 1 and count bytes downloaded before page 1; reload and repeat.

**Acceptance Scenarios**:

1. **Given** a 17 MB PDF in the Library, **When** he opens it on a remote link, **Then** page 1 is drawn within 2.5 s and far less than the whole file has been downloaded by then.
2. **Given** he opened that PDF before, **When** he reopens it or reloads with it open, **Then** page 1 is drawn within 0.8 s and the file's bytes are not downloaded again.
3. **Given** he jumps to page 60, **When** that page has not been fetched yet, **Then** it is fetched and drawn without waiting for pages in between.
4. **Given** the file was replaced or deleted since it was cached, **When** he opens it, **Then** he sees the current file or the existing "no longer in your Library" state, never the stale one.
5. **Given** "Download", **When** he clicks it, **Then** the whole file downloads as today.

---

### User Story 2 - Plots appear at once on every visit after the first (Priority: P1)

A chat with charts or 3D plots shows them quickly. After any plot has been seen once, the plotting code is not downloaded again: not on a second plot in the same chat, not on returning to the chat, not after a reload.

**Why this priority**: 1.4–3.9 s per chat visit today, paid again on every return.

**Independent Test**: on the remote profile, load the 4-plot test chat cold, then warm, then via sidebar return; time each plot shown and count plotting-library bytes.

**Acceptance Scenarios**:

1. **Given** a chat with two charts and two 3D plots, **When** he opens it a second time (or reloads), **Then** all plots are shown within 0.8 s and no plotting library is downloaded again.
2. **Given** a chat with several plots of the same kind, **When** it loads cold, **Then** each plotting library is downloaded once, not once per plot.
3. **Given** plots load cold, **When** the page settles, **Then** no plot frame is torn down and started again (no repeated "ready" per plot).
4. **Given** demos keep their sandbox, **When** plotting code reaches a plot, **Then** the plot frame still has no access to the app's origin, cookies or storage.
5. **Given** the plotting library fails to arrive, **When** a plot needs it, **Then** the plot shows the existing failure state, not an endless skeleton.

---

### User Story 3 - 3D plots start without freezing the app (Priority: P2)

Opening a chat with a 3D plot no longer freezes the app for most of a second while the 3D plotting code starts, and the first visit downloads far less.

**Why this priority**: the 4.8 MB library is the largest single download and the longest main-thread task.

**Independent Test**: load the 4-plot chat cold on the remote profile; measure plotting bytes and the longest task while 3D plots start.

**Acceptance Scenarios**:

1. **Given** a chat whose 3D plots use common trace types (surface, scatter3d, mesh3d, contour and the rest the built-in quick plots use), **When** it loads cold, **Then** the 3D plotting download is at most half of today's and the longest start-up task at most half of today's 0.75 s.
2. **Given** a stored or new plot uses a trace type outside the light build, **When** it renders, **Then** it still renders correctly, loading the full build for that plot only.
3. **Given** a hand-written demo that references the full 3D plotting library directly, **When** it loads, **Then** it gets the caching of User Story 2 but keeps the full build (the light build applies to the kit's 3D panel).
4. **Given** existing 3D plot interactions (camera, invert, resize, focus, theme), **When** he uses them, **Then** they behave as today.

---

### User Story 4 - Pages load with less code (Priority: P3)

Home and chats without math or code blocks don't download the math and code-highlighting renderers. Chats that need them get them without a visible jump in the text.

**Why this priority**: smaller win (estimated 100–300 ms cold); page shells are already fairly fast.

**Independent Test**: measure first-load JS on Home and on a chat without math/code before and after; check a chat with math shows no raw-LaTeX flash.

**Acceptance Scenarios**:

1. **Given** Home, **When** it loads cold, **Then** first-load JS is smaller than the baseline and the math and syntax-highlighting renderers are not downloaded.
2. **Given** a chat with math and code, **When** it loads, **Then** math and code render as today, and a message with math or code appears only once its renderer is ready, with no raw-source flash.
3. **Given** a reply streams math for the first time in a session, **When** the renderer is not loaded yet, **Then** the reply still streams and the math renders once the renderer arrives.

### Edge Cases

- A PDF server that is asked for an invalid or unsatisfiable byte range answers honestly (416) and the reader falls back to a full download.
- A PDF whose file changes between two range requests while it is open (only possible by deleting and re-uploading a same-named file during reading): the reader cannot detect it mid-read; known limit. The changed version tag prevents any stale copy on the next open.
- Hosted mode: cached PDF bytes and plotting code are never shared between tenants or served to a signed-out visitor. PDF caching is private to the browser.
- The desktop (Electron) app and local mode behave the same or better; nothing depends on Caddy.
- Several plots start at once while the library is still downloading: one download, all plots wait for it.
- Theme change or invert on a plot never reloads its frame (constitution VII).
- Reduced bandwidth / offline after first load: plotting code already fetched is reused from cache.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Library document route MUST answer byte-range requests for PDFs (single ranges), advertising range support, with a validator that changes whenever the stored file changes.
- **FR-002**: The PDF reader MUST draw page 1 from the ranges it needs, without first downloading the whole file, for linearized and non-linearized PDFs.
- **FR-003**: The browser MUST be able to reuse a previously downloaded PDF without downloading its bytes again, kept privately in the browser and revalidated with the server on every open; a changed or deleted file MUST never be shown stale.
- **FR-004**: The PDF reader's worker and its other text assets MUST be sent compressed when the browser accepts compression.
- **FR-005**: Plotting libraries MUST be downloaded at most once per browser cache lifetime per library version, and shared by every plot frame on the page.
- **FR-006**: Plot frames MUST keep their current sandbox (scripts only, no same-origin) and bridge validation; plotting code reaches them without widening it.
- **FR-007**: Plot frames MUST NOT be torn down and recreated during a page's initial load.
- **FR-008**: 3D plots MUST use a lighter plotting build by default, covering the 3D trace types plus contour, heatmap and scatter; a plot using any other trace type MUST load the full build for that plot only, so every currently supported trace type still renders.
- **FR-009**: The math and syntax-highlighting renderers MUST NOT be part of Home's first-load code, and MUST load only when content needs them, starting in parallel with the page; a message containing math or code waits for its renderer before appearing (no raw-source flash), other messages show at once.
- **FR-010**: Plotting libraries MUST be fetched only when a plot needs them; no idle prefetch.
- **FR-011**: A failure to load any of these resources MUST show the existing honest failure states, never an endless loading state.
- **FR-012**: Nothing in this feature changes stored data formats, learner files, or what any route returns other than headers, ranges and compression.

### Key Entities

- **Plotting library version**: identifies the exact plotting code; changing the code changes the version so cached copies are never stale.
- **Document version tag**: identifies the exact stored bytes of a Library file; used to validate cached copies and keep range requests consistent.

## Success Criteria *(mandatory)*

Measured with the baseline's driver on the same remote profile, reported next to the baseline table.

- **SC-001**: Opening the 17 MB PDF shows page 1 within 2.5 s cold (from 9.0 s; owner accepted the measured target, 2026-11-09) and within 0.8 s on reopen or reload (from 7.2 s), with no full-file download before page 1.
- **SC-002**: On a warm visit or sidebar return, a chat with two charts and two 3D plots shows all of them within 0.8 s (from 2.6–2.8 s), with zero plotting-library bytes downloaded.
- **SC-003**: On a cold load, each plotting library is downloaded once per page regardless of plot count, and each plot reports ready exactly once.
- **SC-004**: Cold 3D plotting download at most half of today's (≤ 730 KB transferred, from 1.46 MB) and the longest start-up task at most 0.4 s (from 0.75 s).
- **SC-005**: Home first-load JS is smaller than baseline (298 KB transferred) and contains no math or syntax-highlighting renderer; constitution VIII budgets do not regress anywhere.
- **SC-006**: Every existing test, lint, typecheck, build and the demo/plot/PDF browser regressions pass.

## Assumptions

- The learner reaches the app over a remote link (Tailscale → Caddy); the emulated 60 ms / 20 Mbps profile stands in for it. Local and desktop use only get faster.
- Plot frames' opaque origin is why their downloads are never cached (Chrome does not reuse cache for opaque-origin frames); the fix moves fetching to the app page.
- No new runtime dependency is shipped to the app page; building a lighter plotting bundle may need a build-time package, approved by the owner as build-time only (Clarifications).
- Out of scope: the subscriptions request loop (separate bug), the large-chat page size, Caddy configuration, the 25 s delay before the live-update stream's headers.
