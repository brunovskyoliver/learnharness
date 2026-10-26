# UI v2: report

Plan: `.scratch/ui-v2/plan.md`. Branch `hosted-multiuser`, one commit per phase, deployed once to learn.brunovsky.online (1067030, built on the VM).

## What changed

| Phase | Commit | Change |
|---|---|---|
| 1 Rebrand | d6dd65c | "Brunovský's study" in page titles, sign-in, sidebar, settings copy. Internal ids (package name, `LH_*`, Electron app name/userData, headers) unchanged. |
| 2 Dictate | dde4577 | Component, STT route, PCM worklet, shortcut and Deepgram key removed. |
| 3 Chrome | 3775a3f | Source Sans 3 for all chrome, mono only for code and numbers; sentence case everywhere; 52rem column for text and composer. |
| 4 Sidebar | 2b5e8dd | T3 Code layout: 256px resizable rail, slim rows with short times, date shelves, filter menu (All / Lessons / Practice), icon footer. |
| 5 Header | 1d8e452 | 52px breadcrumb "Teaching / title" with hover rename pencil; plan and coverage as ghost icon buttons. |
| 6 Stats | fa2aec5 | Popover is a summary: context, turns, tokens used, plan/cost, "Manage usage". |
| 7 Markdown | b24055e | Inline code at 0.88em; dock teaser renders `code` instead of raw backticks; code blocks 14px with clearer line numbers; wide display math shrinks to fit (down to 70%) with room for brace labels. |
| 8 Diagrams | 55414d6 | `mermaid` and `@streamdown/mermaid` replaced by `pele` 1.10.1, themed through `--pele-*` variables mapped to the app tokens. The plan graph keeps its own dagre renderer. |
| 9 Quiz | 030e416, bf6e493 | Options at 16px in tighter rows, radio centred on the first line; confidence is four segments (Guessing 25 / Unsure 50 / Fairly sure 75 / Certain 95, old answers keep their exact %); flat "Your thinking" field with a primary Submit; keyboard hint removed (only "Compacting session…" shows there while compaction runs). |
| 10 Settings | a08f9c4 | One row pattern (sans label, muted description, right-aligned control); every tool row has a name and description; Connect buttons right-aligned; dialog headers 52px sans. |
| 11 Titles | 1067030 | After a new session is created, the cheap model writes a 3–6 word sentence-case title. The first session-list read per user (per server process) backfills sessions whose title is still the cut-off prompt or "Untitled session". Each write re-checks the title, so hand renames are never overwritten. Skips silently when the cheap slot is unset or its subscription doesn't allow background use. |

Also fixed on the way: the leftover uppercase "AGENT'S THINKING" label.

## Verification

- Every phase: `npx tsc --noEmit`, `npx eslint components app tests`, `npm test` (2374 pass, 0 fail at the end).
- Screenshots from a local dev server on a copy of the desktop data: `~/agent-runs/2026-10-26-ui-v2/shots/` (p3–p10). The pele check (`p8-pele.png`) injected a rendered flowchart, since no local chat contains a mermaid block.
- Titles: helpers covered by `tests/session-titles.test.ts`. The live model call could not run locally (the data copy has no ChatGPT login), so the first real run is on the server. Look for `[titles]` lines in the container logs.

## Deploy change (user, 2026-10-26)

Images are now built on the VM, not uploaded from the Mac (the upload was too slow). The VM disk was grown to 57 GB and the root partition and ext4 filesystem expanded online (`growpart /dev/sda 1`, `resize2fs`): 55 GB, 26 GB free after the build. Bare repo `~/learnharness.git` on the VM is the Mac's `vm` remote; `~/learnharness/src` is its checkout and `compose.yaml` builds from it (backup `compose.yaml.bak-20261026-vmbuild`).

Redeploy: `git push vm hosted-multiuser`, then on the VM `cd ~/learnharness && git -C src pull && docker compose up -d --build && docker image prune -f`.

## Left open

- Confirm the title backfill in the server logs after deploy.
- The answered quiz card still shows the old rail plus % for confidence; it does not show the segment label.
- Earlier offers still waiting on the user: remove the old `learnharness_lh-data` volume, cap the journal, grow the VM disk.
