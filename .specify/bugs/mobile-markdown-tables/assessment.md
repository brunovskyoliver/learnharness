# Bug Assessment: Mobile Markdown tables

- **Slug**: mobile-markdown-tables (confirmed by Oliver)
- **Created**: 2026-10-28
- **Source**: pasted text and mobile screenshot
- **Verdict**: valid
- **Severity**: medium
- **Stage**: sizing behavior approved; implementation plan and review exception await owner approval

## Report

> fix displaying md tables on mobile devices to skale it down

The screenshot shows an expanded practice problem with a Markdown table. The
Example and Prediction columns are visible, while the Target column extends
beyond the right edge and is faded.

## Symptom

Markdown tables retain their intrinsic width and reading text size on phones.
Columns outside the available width require horizontal scrolling. The owner
requests smaller tables on mobile so more of the table is visible at once.

## Reproduction

An isolated container from deployed revision `55c0a4f` used a copy of the practice
golden fixture with a synthetic three-column table (Example, Prediction, Target)
and inline math. No production data, credentials, or model requests were used.

1. Open the synthetic practice session at a mobile viewport.
2. Select Solve to expand the problem.
3. Compare the table's width with its horizontal scroller's available width.

| Viewport | Available width | Table width | Table text |
| --- | ---: | ---: | ---: |
| 320px | 256px | 323.45px | 17px |
| 390px | 323px | 323.45px | 17px |
| 1440px | 323px | 323.45px | 17px |

The assertion that the mobile table fits without hiding the final column fails
at 320px. The default-size example fits at 390px; the screenshot's exact reading
preferences have not been established. Larger reading settings need coverage.

Evidence: `/home/brunovsky/agent-runs/2026-10-28-mobile-markdown-tables/` contains
`fixture.json`, `reproduce.mjs`, and `before-320.png`, `before-390.png`, and
`before-1440.png`. Command run:

```sh
node /home/brunovsky/agent-runs/2026-10-28-mobile-markdown-tables/reproduce.mjs
```

Result: `AssertionError: Mobile table should fit without hiding the Target column`.
The script connects to a disposable app/browser container; that container was
removed after measurement and must be recreated to rerun the script.

## Suspected Code Paths

- `components/md-blocks.tsx`, `MarkdownTable`: shared table renderer; retains
  horizontal scrolling and observes overflow to show edge fades.
- `app/globals.css`, `[data-streamdown="table"]`: explicitly sets
  `width: max-content` and `font-size: var(--lh-prose-size)` without mobile scaling.
- `components/practice-dock.tsx`: displays the Markdown inside the narrower
  padded, vertically scrolling prompt body.
- `tests/render-md-blocks.test.tsx`: existing structural tests do not measure
  browser layout or mobile overflow.

## Root Cause

High confidence: the current implementation deliberately preserves full reading
size and scrolls wide tables. The measured width exceeds the mobile container.
This is a requested change to that existing behavior, not loss of table data.
The exact screenshot font preference remains unverified.

## Proposed Remediation

**Sizing policy approved by Oliver**: on mobile, reduce only oversized Markdown tables
to fit their available width, with a 13px effective text-size floor. Preserve
horizontal scrolling for tables too wide to fit at that floor. Keep inline math
proportional, all cells available, and Copy outside the scaled table so its touch
target is preserved. Tables that already fit retain their current reading size.
Apply this through the shared renderer to transcript, question, and practice
tables. Desktop behavior and saved reading settings remain intact.

Use the existing overflow measurement where possible. Recalculate when the
container, content, fonts, or reading size changes, without resize loops or new
runtime dependencies. Use the existing phone threshold (below 640px), as specified
in the proposed implementation plan. Update DESIGN.md to document the approved exception to
full reading-size table text.

**Alternative**: always shrink until every column fits, even below 13px. This
requires explicit owner approval to override DESIGN.md's text-size floor and
can make wide tables difficult to read.

**Files likely to change**:

- `components/md-blocks.tsx`
- `app/globals.css`
- `DESIGN.md`
- `tests/render-md-blocks.test.tsx` if table structure changes
- A focused browser regression under `scripts/`

**Verification**:

- Reproduce the three-column math example at 320px and 390px; verify the final
  column is visible when fitting is possible within the approved floor.
- Test a wider table, long headers, inline math, changed reading size, container
  resizing, and newly streamed content.
- Verify horizontal overflow remains reachable at the floor, scrollbar tracks
  remain hidden, focus stays visible, and Copy still returns all source cells.
- Confirm tables that already fit and desktop layout at 1440px retain their size.
- Run tests, lint, typecheck, production build, and relevant browser checks.
- Check shadcn composition and Web Interface Guidelines; resolve the missing
  impeccable review requirement before calling the fix complete.

## Constitution Check (I–VIII)

1. **Owner decides**: pending final plan approval. Slug and the 13px shrink limit
   with horizontal scrolling fallback are approved.
2. **Teaching theory first**: pass in proposed scope; presentation only, no
   answer disclosure or teaching behavior changes.
3. **Learner data is never lost**: pass in proposed scope; no data writes,
   remounting of the composer, or draft changes.
4. **Honest states**: pass in proposed scope; all table content remains accessible
   and overflow indicators reflect actual overflow.
5. **Consent before cost**: pass; synthetic fixtures and no model requests.
6. **Interface follows DESIGN.md**: conditional. Preserve the 13px floor,
   hidden scrollbars, touch targets, and focus. The impeccable skill was not
   found in local skill catalogs or searched skill directories. An owner-approved
   alternative review or installation is required. shadcn and web-design-guidelines
   are available.
7. **Boundaries, tenancy and sandboxing**: pass in proposed scope; client
   presentation only, no server or tenancy changes.
8. **Performance does not regress**: pending verification; reuse measurement,
   avoid new dependencies, and check for resize feedback loops and bundle growth.

## Risks & Considerations

- Unbounded shrinking can make a table unreadable, particularly with math.
- Scaling must affect layout height, not just appearance, to avoid blank space
  in the height-limited prompt body.
- Measurement must handle fonts, streaming, reading preferences, and resize
  without repeatedly shrinking its own already-scaled width.
- Copy controls and any interactive table content must remain usable.

## Open Questions

- Approve `plan.md`, using the existing below-640px phone threshold.
- Approve a manual UI review plus Web Interface Guidelines in place of the
  unavailable impeccable skill, or provide the required skill.

## Decisions and Log

- 2026-10-28: Oliver approved `mobile-markdown-tables` as the bug slug.
- 2026-10-28: Oliver selected "Shrink to fit, stopping at 13px; swipe wider tables".
- 2026-10-28: Read the project constitution, DESIGN.md, bug assessment/fix
  commands, existing renderer, and Next.js local CSS guide.
- 2026-10-28: Reproduced overflow using the deployed image and synthetic data;
  removed the disposable container afterward. No application source changes,
  commit, push, or deployment performed.
