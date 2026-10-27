# Architecture

Current structure and runtime boundaries, updated 2026-10-27. [Development](development.md) covers commands and storage configuration. [DESIGN.md](../DESIGN.md) covers the implemented interface. [Vision](vision.md), [plan](plan.md), and archived architecture documents retain historical decisions; references there to `UIMessage`, separate practice sets or old renderer layouts are not the current implementation.

## Layers and dependency boundaries

| Layer | Location | Responsibility |
| --- | --- | --- |
| Shell | `app/`, `components/` | HTTP transport and browser presentation |
| Server | `src/server/` | Service composition, request handling, running turns, jobs and providers |
| Agent | `src/agent/` | Agent loops, tools, provider adapters and background work |
| Core | `src/core/` | Contracts, pure derivations, grading, graph logic and ports |
| Store | `src/store/` | File-backed adapters implementing storage operations |

Core has no dependency on server or store. Agents receive effects through dependencies rather than importing server/store modules. Components import domain types and functions through the browser-safe core barrel. App routes can use the core and server barrels. `eslint.config.mjs` enforces these import boundaries.

`src/server/stores.ts` composes storage adapters. Request and background-work services pass these dependencies to core and agent functions. Settings, auth and render settings also have dedicated adapters. Filesystem writes belong in those adapters, not components or route markup.

## Persistent records

`config.ts` defines the mutable-data path boundary. Local mode uses `data/` or `LH_DATA_DIR`. Hosted mode resolves mutable paths within `users/<userId>/` using the active tenant context and refuses access without a tenant.

| Data | Current representation |
| --- | --- |
| Lessons and practice | `chats/<id>.json`, `ChatRecord`, native `LhMessage[]` |
| Knowledge graph | JSONL evidence ledgers, sources and coverage under `graph/` |
| Background jobs | Job records under `jobs/` |
| Product preferences | Versioned settings JSON |
| Credentials | Dedicated auth/subscription storage through local or hosted boundaries |
| Device view state | Local browser state for reading position, drafts and pane preferences, plus relevant graph position/render records |

Chat writes stamp the current schema version. Legacy absence reads as v1. A future-version record is refused rather than rewritten. Graph records share a format sidecar; rebuildable positions are separate. Practice is a chat kind and has no separate `PracticeStore` or problem-set directory.

## Native sessions and turn ownership

A session's canonical history is the persisted native message list. Assistant tool calls, tool results and custom markers carry question, phase, job and practice state. Core folds such as `danglingQuestionOf`, `activeProblemOf` and phase/plan derivations project that history for rendering and continuation.

`handleChatRequest` validates input, handles liveness and queued work, persists accepted input and builds an agent from the record. Model resolution uses configured slots and per-session choices. Missing model/auth configuration is surfaced through the existing setup/error paths.

The server owns a running turn independently of its subscribers. `src/server/pi/ui-stream.ts` streams native agent events as SSE. `components/session-core.ts` applies those events to the client model; `components/session.tsx` exposes the session hook. POST and reattachment use the same event vocabulary. Streaming message updates replace the partial message snapshot. The stream retains settled events and current in-flight state rather than every historical chunk.

Disconnecting or navigating away detaches a view. It does not abort the turn. Explicit cancellation controls own stopping work. Persisted pending questions allow a session to reopen at the same interaction. Accepted answers and thinking inputs flow through the native input protocol; the former `useChat`/`addToolOutput`/`UIMessage` protocol is retired.

## Lessons and practice

Lessons derive probe, plan and teach phases from their transcript. Plan tools persist a schema-validated dependency tree. Progress derives from question calls and results rather than a separate mutable progress record. Core question logic parses and grades structured answers; the UI preserves the existing choice, confidence and reasoning mechanics.

Practice sessions use `kind: "practice"` and the same chat store, turn service and session client. A `problem` call establishes the active problem. Thinking and answer inputs accumulate in the record; `conclude` ends the problem with feedback or dismissal. The next problem waits for explicit learner input. Graph selection can provide context at creation. Practice does not write mastery ratings into the knowledge graph.

## Background work and knowledge graph

Research, demo, visual and other background tools create jobs and acknowledge them to the conversation. Completed results arrive through custom steer markers. The serialized wake path coordinates delivery with running turns and pending questions. Job liveness, recovery, cancellation and activity reporting remain server-owned.

The extraction pipeline owns normal graph ingestion. It reads source material and coverage, runs extraction/audit stages, and commits accepted propositions, chains and provenance through deterministic graph logic and storage adapters. Coverage is checkpointed after successful work. Explicit deletion and import paths use their existing coordinated services; UI rendering does not mutate evidence ledgers directly.

Graph snapshots, chains and birth-source grouping derive from stored evidence. Home can show the graph canvas or the minimal view according to graph settings. The chain table shares graph selection and management behavior. Rendering preferences and camera/layout state are separate from the underlying evidence.

## Interface ownership

The persistent composer owns its form, textarea ref and input mechanics. Options contains model, reasoning and usage controls. Sidebar and demo widths retain their established resize and persistence owners. Session reading state and drafts remain per session; the redesign did not introduce a second conversation scroll owner.

Shared semantic tokens map sidebar, lesson, composer, menus, settings, authentication and app-owned demo chrome to the same graphite palette. User appearance settings resolve through the existing appearance provider. Settings writes immediately through section APIs; navigation and layout do not introduce a separate Save transaction.

Radix dialogs contain focus for Settings, setup and connection overlays. Menus portal into the active modal boundary. Options uses an anchored popover; its nested menus retain their placement and dismissal behavior. Global lesson shortcuts defer inside modal/menu controls. Closing resolves the live opening control even when a tooltip wrapper has replaced its DOM node.

A demo keeps one live sandboxed iframe while its inline, workspace and focused presentations change. Parameter, simulation, path and camera state belong to that live document. Parent messages validate the source and allowed payload. Theme messages update app-owned neutral styles and renderer colors without replacing the document; authored demo styles may override injected defaults. Individual graph focus uses demo-kit panels; arbitrary legacy HTML expands as a whole.

## Host and provider boundaries

Electron owns native windows and desktop services. Development Electron points at Next dev; packaged Electron launches its packaged server. Native window gutters, drag regions, overlays and tiling require live desktop verification.

API-key and subscription services resolve authentication through their established stores and provider adapters. Web/dev subscription credentials live beside the selected auth file. Packaged desktop has its native bridge. Hosted mode adds Clerk authentication, tenant context and upload restrictions; it does not make ordinary local dev a multi-user service. See [hosting](hosting.md) and [desktop releases](desktop-release.md).

## Review data and verification

`scripts/seed-review.mjs` is an opt-in local development utility. It creates missing stable review chat IDs using exclusive writes and never changes existing records, graph data, settings or credentials. It refuses hosted mode. Golden fixtures remain unchanged; generated review examples live in ignored local data. [The UI review guide](ui-review.md) describes the examples and commands.

Tests cover core derivations, real store reads, server flows with scripted engines, rendering and interactions. Browser regressions use isolated data to verify iframe continuity, focus, reading geometry, resize persistence and mobile behavior. Typecheck, lint and the production build remain separate checks. A successful build does not establish a successful merge or deployment.
