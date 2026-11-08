# Reviews: Reference chips (T050)

2026-11-08. `impeccable` (audit, Operate mode, DESIGN.md governs; its detector found nothing in `reference-chip.tsx`, `tutor-chips.tsx`, `reference-field.tsx`, `library/back-pill.tsx`, `library/library-full-view.tsx`) and `web-design-guidelines` (Vercel Web Interface Guidelines, fetched fresh) on every chip surface: the composer mirror, sent-message chips and reference rows, tutor-reply chips, the Library full view, the Trash landing and the Back pill.

Visual pass: the whole `tests/e2e/study/reference-chips.spec.ts` with `LH_SHOTS_DIR` and `reducedMotion: "reduce"` on both projects (a scratch config, not committed), at 320, 390 and 1440 in light and dark; every per-width journey also asserts no horizontal overflow. Screenshots: `~/agent-runs/2026-11-08-reference-chips/phase6/` (and `phase5/` for the tutor replies). Under reduced motion the chip's underline transition is off (`paper.css`), nothing else of 027 moves, and tutor history never inks in (asserted).

## Fixed

| # | Source | Finding | Fix |
| --- | --- | --- | --- |
| 1 | impeccable (seen at 390 and 320) | A quote chip read "Untitled no… · Second paragraph, t…": the name ended in an ellipsis while the hint still had room to give, against the owner's phase 3 rule (the hint gives way first). Flex shrinks by weight × width, so the name's share was 0.16px, enough to trigger its ellipsis. | `.lh-ref-chip-hint` and `.lh-ref-chip-folder` weights raised so the name's and folder's shares stay under a layout unit until the hint is gone; the sent journey now asserts the name is whole whenever the hint shows, at every width. |
| 2 | WIG Content handling | The Back pill's label truncates on narrow columns with no way to read the whole title by pointer. | `title` on the label (the accessible name was already whole). |
| 3 | WIG i18n | Item names in chips (file names, paths) could be machine-translated. | `translate="no"` on `.lh-ref-chip-name`. |
| 4 | impeccable (performance, startup budget) | The composer's startup chunk carried the nine kind icons, and /library's carried the Back pill, though both are needed only after something happens. | The mirror loads its icons with its first chip (each sits over its transparent `@`, so a late icon moves nothing; unit test for the no-icon draw); the pill loads only when a return point exists (the column padding is set before it arrives). |

## Checked, no change

- Chips that open something are `<a href>`, so Ctrl/Cmd-click and middle-click are the browser's; deleted and removed chips are plain text, not focusable. Every chip has an accessible name stating kind, name and place, and the passage in `aria-description`. Icons are `aria-hidden`.
- Focus: `:focus-visible` 2px `--nb-focus` ring on chips; the returned chip uses `[data-focus-return]:focus` on purpose so the ring shows after a pointer click too (phase 3 decision). The pill is a `<button>`, first stop after the band, announced once in a polite live region.
- Coarse pointers: an invisible 44px `::before` hit box on link chips; the pill is 44px tall there.
- Long names: one-line chips with an ellipsis and `title`; no overflow at 320 in either theme.
- Theming: paper tokens only (`tests/token-hygiene.test.ts` passes; the tutor's non-Library links use `text-ink`, not Streamdown's `text-primary`). Dark mode checked at all three widths.
- Line boxes: a tutor reference turning into a chip leaves its paragraph's height and position unchanged (asserted in the tutor journey).
- Hidden tracks: the full view and the mirror scroll under the global hidden-scrollbar rule.

## Not applied

- WIG "`<img>` needs width and height": the full view's image is the Library's own file and the catalog stores no dimensions; it is fit to the column (`h-auto max-w-full`) inside its own scroller, so nothing below it moves. Adding dimensions needs new stored data, out of scope.
- WIG "Title Case": DESIGN.md and every approved string use sentence case.

## Open for the owner

- **Fixed 2026-11-08 (bug, owner):** the chip and the punctuation after it now form one unbreakable group, the chip shrinking to keep ":" beside it. Was: at 320 and 390 a quote chip takes the whole line, so its tail ":" wraps onto a line of its own under the chip (`phase6/sent-light-320.png`, `returned-dark-390.png`). Leaving one character of room (`max-width: calc(100% - 1ch)`) would keep ":" beside it but not a longer tail; which one you want is a design call, so nothing was changed.
- **Owner-approved 2026-11-08, done:** a faint "{name} is no longer in your Library" / "{name} was removed from the repo" line with the Attaching line; never blocks sending. Was: the composer never says "no longer in your Library" before send for a trashed or deleted item (it is drawn faint; the sent message carries the words). Flagged in phase 4, unchanged.
- **Owner-approved 2026-11-08, done:** at ≤360px the compact composer's model/usage controls move below the field. Was: not 027: at 320 with no models set up, the composer's "Message" placeholder is squeezed to "M e" beside "Set up your models" (`phase6/sent-light-320.png`); the same in `phase3/`, before the composer overlay existed.
