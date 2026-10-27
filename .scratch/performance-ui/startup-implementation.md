# Startup and sidebar implementation report

Completed implementation within the assigned sub-agent scope on 2026-10-27. No subagents, worktrees, commits, pushes, deployment, Next build, browser benchmark, or full suite run.

## Changes

- `app/(app)/layout.tsx` reads cached `listChats()` once for the initial server seed, inside `runAsTenant` when hosted, and attaches current turn/compaction state. Signed-out hosted layouts never read tenant data. Read failures leave the existing client retry path available.
- `components/sidebar.tsx` initializes the root-lifetime snapshot from `initialChats`, retains it through navigation and failed reads, reconciles unchanged row objects and arrays, and uses memoized row adapters with stable handlers. Local-calendar shelves wait until hydration to avoid timezone-dependent structural mismatches. Relative time text/title suppress their expected clock-dependent hydration mismatch.
- `components/sidebar-refresh.ts` coalesces requests while retaining a trailing read for invalidations during an in-flight read, including invalidations during the trailing read. Existing debounce, resync, optimistic rename and turn events remain.
- Sidebar structural pane/header/footer/date-shelf/menu separator lines are removed. Input/menu boundaries and resize hover/focus behavior remain.
- `components/sidebar-frame.tsx` imports the small existing mobile dialog eagerly, removing the blank Suspense delay when opening it. `components/mobile-sidebar.tsx` documents this ownership; Radix focus, inertness, outside click and Escape semantics remain.
- `components/settings/subscription-client.ts` shares concurrent status reads per mounted notification hub. Both successful and failed settlements evict the promise. Different hubs stay isolated. No persistent result cache or TTL was introduced.
- `src/core/package.json` declares `type: module` and `sideEffects: false`. Core consists of pure modules; unused barrel exports no longer retain schema construction or KaTeX initialization. The ESM declaration is required for tsx and fixes the integration failure observed when only sideEffects was present.
- `src/core/question-schemas.ts` holds the existing schema construction and schema-derived types. `question-core.ts` keeps grading and normalization and reexports schema names for compatibility. `tool-parts.ts` still runs the same TypeBox Convert, Check and Clean functions, now imported by name. No replacement validator or validation relaxation was introduced.
- `src/core/demo-kit-document.ts` separates document helpers from schema construction and validation. `demo-kit.ts` retains its existing API and validation, with named TypeBox imports. `src/core/index.ts` preserves existing public exports while routing document helpers to the lightweight module. `contracts/probe.ts` also uses named TypeBox constructors.
- `components/home.tsx` splits graph/minimal-home renderers with Next dynamic imports. Graph mode still mounts its graph immediately, and minimal-home still mounts its existing content. This isolates graph dependencies from home controls; production transfer savings for home must be measured because rendered dynamic chunks can still be preloaded.
- Removed the eight confirmed-unused direct dependencies and their orphaned lock entries: @rive-app/react-webgl2, ansi-to-react, cmdk, embla-carousel-react, media-chrome, next-themes, react-jsx-parser, tokenlens. Repository search included app, server, demo, script, test and Electron sources. No browser transfer saving is attributed to installed-size removal alone.

## API and integration

- `AppShell` adds optional `initialChats?: ChatListItem[]`. Its sole layout caller now supplies the server seed.
- `listChats()` and the `/api/chats` response are unchanged. The main thread's per-record tenant-safe summary cache is used without edits to its files.
- Existing core barrel paths and exported schema/validation/helper names remain available. The shell import law and ESLint zones are unchanged.
- New internal helpers are `createSidebarRefresh` and exported test seam `reconcileChatSnapshot`.
- Files changed by other agents were preserved. In particular, the added question draft interfaces in question-core.ts remain intact.

## Verification

- Focused validation, question mechanics, argument healing, demo kit, sidebar, subscription, startup module graph, and main-thread summary-cache tests: 193 passed, zero failed. The count includes summary-cache tests present at execution time.
- Typecheck passed after adding the core ESM declaration; final typecheck repeated after integration edits.
- Targeted ESLint passed for all changed source/test files. `git diff --check` passed.
- Impeccable detector returned an empty findings array. Rendered UI verification remains with the main thread as requested.
- The new startup-module-graph tests bundle without writing files or invoking Next, follow static imports, and assert no emitted TypeBox or KaTeX code enters sidebar/home startup graphs. Dynamic rendering and settings chunks may still contain these required modules.
- Isolated esbuild attribution with React/Next externalized: sidebar static graph 210,407 bytes / 69,536 gzip; home static graph 234,612 bytes / 79,043 gzip. Both attribute zero initial bytes to TypeBox or KaTeX. These are diagnostic graph measurements, not production app transfer, startup timing, or proof of the 50% target.

Evidence is in `/Users/oliver/agent-runs/2026-10-27-learning-performance-ui/`: `startup-focused-tests.log`, `startup-static-module-attribution.json`, `startup-design-detector.json`.

## Remaining verification

Main thread must run the final production build, ten-run desktop/mobile browser comparisons with visible interactive sidebar/drawer criteria, full functional suite and Sol review. In particular verify Turbopack respects the pure-core sideEffects metadata, total initial gzip transfer and page-load timing, server-seed render/hydration behavior, mobile focus return, long-list responsiveness, tenant switches, reconnect freshness and retained lesson mechanics. Do not count hidden seeded rows as useful sidebar readiness. No target, merge or production deployment is claimed by this report.
