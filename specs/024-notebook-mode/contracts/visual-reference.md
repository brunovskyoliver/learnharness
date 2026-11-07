# Visual and motion reference: Riddled notebook UI (feature 024)

This is a reference for reproducing Riddled's notebook look and motion. It is not a design decision. Where our DESIGN.md or the constitution disagree, the owner decides.

## Sources and how to read this file

| Tag | Source |
|---|---|
| `CSS l.N` | Pretty-printed Riddled CSS bundle `0ifbcagspr-o8.css` (identical to `~/agent-runs/2026-11-06-riddled-research/riddled-styles.css`), pretty copy at `/tmp/claude-1000/-home-brunovsky--t3-worktrees-learning-notebook-mode/3eebf710-e84d-47ef-9a41-b6ca54379ce5/scratchpad/riddled.pretty.css`. Line numbers refer to that file. |
| `FONTS` | Second bundle `2dauq_c8cn7ve.css` (next/font `@font-face` rules), fetched from riddled.ai on 2026-11-06. |
| `HTML` | riddled.ai landing markup, fetched 2026-11-06. |
| `JS` | Landing JS chunks (`05k0vyfpq_xs1.js`, `11fdl8g8hueuv.js`, `1b1fxyzykp4pa.js`). These hold the shared components (InkDot, InkText, drawing player, sketches, pencil underline, ink cursor, settings keys). The `/write` app bundle is behind login and was **not** read. |
| `frame` | Video stills in `~/agent-runs/2026-11-06-riddled-research/frames/`. Named stills are 1440x1026; `sheet-NN.jpg` are 3x3 contact sheets. |
| **measured ≈** | Estimated from frames. Not a CSS value. |

**Frame scale.** The stills are 1:1 CSS px at browser zoom 100%. Two checks agree: list items wrap at about 28-29px, near 16px x 1.8 (`--note-size` 16px, line-height 1.8), and the title cap height is about 28px, matching 16 x 2.45 = 39.2px. (Re-measured 2026-11-07, frames margin-notes and margin-thread, the list numerals: item tops 308, 340, 368, 400, 432 in the still, so 28px a wrapped line and 32px an item, where 1.8 gives 28.8 and 32.8; we keep Riddled's CSS 1.8, so from item 2 down our lines drift ≈0.8px per line, ≈+3-4px by item 4.) The browser viewport starts at x=127 in the stills (content y starts at about 64). The contact sheets show the whole viewport, which is about **1665px wide** (measured ≈). One contact-sheet display pixel is about 2.88 still px.

Colour values are hex with alpha; percentages are given as alpha/255.

---

## 1. Tokens

### 1.1 Colour tokens (`:root` CSS l.3224-3249; dark CSS l.3250-3277 under `prefers-color-scheme:dark` + `:root:not([data-theme=light])`, repeated for `:root[data-theme=dark]` CSS l.3278-3306)

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--paper` | `#f8f7f4` | `#1a1a19` | page ground; `body{background:var(--paper)}` (CSS l.322-325); `<meta theme-color>` uses the same values (HTML) |
| `--shelf` | `#f1f0ec` | `#151514` | hover fills, selected tab, mention face |
| `--code` | `#ebe9e3` | `#151514` | AI code blocks (`.riddled-code`) |
| `--ink` | `#1d1c1a` | `#e9e7e2` | user text, caret, solid pills |
| `--graphite` | `#5c5953` | `#a9a69e` | secondary text, pencil underline |
| `--faint` | `#8e8a83` | `#7a776f` | chrome, hints, placeholders |
| `--rule` | `#dedbd4` | `#33322f` | hairlines, card rings |
| `--riddle` | `#2a2824` | `#ebe8e2` | the AI's ink; overridden by `[data-riddled-color]` |
| `--riddle-ink` | `#2a2824` | `#ebe8e2` | the "Ink" choice |
| `--riddle-wash` | `#1d1c1a0e` (ink 5.5%) | `#e9e7e214` (ink 7.8%) | passage wash |
| `--riddle-line` | `#1d1c1a52` (ink 32%) | `#e9e7e257` (ink 34%) | anchors, focus outline |
| `--bulb` | `#d99a1e` | `#f2b84b` | the only accent: "Thinks with you" bulb |
| `--lift` | `0 0 0 1px #1d1c1a12, 0 1px 1px #1d1c1a0a, 0 6px 16px -8px #1d1c1a29` (7% ring, 4% contact, 16% drop) | `0 0 0 1px #ffffff12, 0 8px 20px -8px #0009` (7% white ring, 60% black drop) | floating surfaces only |
| `--grain-opacity` | `.16` | `.4` | |
| `--texture-blend` | `multiply` | `soft-light` | |
| `--background` / `--foreground` | `var(--paper)` / `var(--ink)` | same | shadcn bridge |

**Deliberate deviation (owner, 2026-11-07, "Raise to pass").** The values above are Riddled's. Notebook darkens (light) or lightens (dark) a few of them along lightness only, hue and warmth kept, just enough to pass WCAG AA on `--paper` and on `--shelf`; `tests/notebook-contrast.test.ts` holds the thresholds against notebook.css.

| Token | Riddled light → Notebook | Riddled dark → Notebook | Ratio now (paper / shelf), light; dark |
|---|---|---|---|
| `--faint` | `#8e8a83` (3.21 / 3.01) → `#716d67` | `#7a776f` (3.89 / 4.09) → `#858279` | 4.80 / 4.51; 4.53 / 4.76 |
| `--text-gray` | `#858179` (3.62 / 3.40) → `#716d66` | `#9a968e` unchanged | 4.80 / 4.51; 5.91 / 6.20 |
| `--nb-focus` (new, focus ring) | Riddled used `--riddle-line` (2.0:1) → `#8c8a88` | `--riddle-line` (2.77:1) → `#676661` | 3.21 / 3.02; 3.03 / 3.18 |
| `--text-orange` (an AI ink and a text colour) | `#b5621f` (4.14 / 3.89) → `#a9580e` | `#e59b5b` unchanged | 4.79 / 4.50; 7.61 / 7.98 |
| `--nb-faded` (new, the other notes while a thread is open, §8.1) | Riddled ≈.38 (ink 2.21:1, orange 1.63:1 on paper) → .97 → **.38** (reverted, see reviews.md) | ≈.38 (ink 3.14:1, red 1.94:1) → .82 → **.38** | the smallest two-decimal opacity at which every AI ink (ink, blue, green, red, purple, brown, orange) blended over paper reaches 4.5:1. Light: ink 12.61, blue 5.12, green 4.70, red 5.23, purple 5.43, brown 5.11, orange 4.55 (worst; .96 gives 4.47). Dark: ink 9.89, blue 5.56, green 6.05, red 4.53 (worst; .81 gives 4.46), purple 5.30, brown 4.89, orange 5.52 |

`--riddle-line` itself is unchanged and stays on marks, link underlines and tethers.

Data-theme switching: `:root[data-theme=light]` sets `color-scheme:light`; dark sets `color-scheme:dark` (CSS l.3305-3311). JS (`riddled:theme` = `system|light|dark`, default `system`) removes the attribute for system. `::view-transition-old/new(root){animation-duration:.35s}` (CSS l.5275-5280) suggests the theme switch uses a View Transition (cross-fade 350ms).

### 1.2 Text and AI ink colours (CSS l.3240-3246, dark l.3267-3273)

| Name | Light | Dark |
|---|---|---|
| gray `--text-gray` | `#858179` | `#9a968e` |
| brown `--text-brown` | `#8a5a3b` | `#c4976f` |
| red `--text-red` | `#b23b33` | `#e8796e` |
| orange `--text-orange` | `#b5621f` | `#e59b5b` |
| green `--text-green` | `#47763d` | `#8fc183` |
| blue `--text-blue` | `#33689c` | `#84afe3` |
| purple `--text-purple` | `#774f9c` | `#bc98e4` |

- User text colour: `.text-color[data-color=X]{color:var(--text-X)}` (CSS l.5378-5398).
- AI ink: `[data-riddled-color=ink|blue|green|red|purple|brown|orange]{--riddle:…}` (CSS l.5399-5419). There is no gray AI ink. JS key `riddled:color`, default `ink`.

### 1.3 Paper grain (CSS l.3320-3335)

| Property | Value |
|---|---|
| `.paper` | `position:fixed; inset:0; z-index:0; pointer-events:none; background-color:var(--paper)` |
| `.paper:before` | `content:""; position:absolute; inset:0; opacity:var(--grain-opacity); mix-blend-mode:var(--texture-blend); background-size:180px 180px` |
| SVG tile (180x180) | `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' seed='11' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.32  0 0 0 0 0.27  0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(#g)'/>` |
| Placement | `<div class="paper" aria-hidden="true">` is the first child of the root `relative min-h-dvh bg-paper text-ink` wrapper; header is `z-20`, main `z-10` (HTML) |

### 1.4 Selection, focus, cursor, scroll

| Item | Value | Source |
|---|---|---|
| `::selection` | `background:color-mix(in srgb, var(--ink) 13%, transparent)` (fallback `var(--ink)`) | CSS l.3312-3319 |
| `:focus-visible` | `outline:2px solid var(--riddle-line); outline-offset:2px` (Notebook: `var(--nb-focus)`, owner deviation, §1.1) | CSS l.344-347 |
| Slash / `[[` menu active row | Riddled: `--shelf` fill only (1.06:1). Notebook adds `outline:2px solid var(--nb-focus); outline-offset:-2px` (owner deviation, §1.1) | notebook.css |
| Cursor | `cursor:pointer` on buttons, `[role=button]`, `[role=option]`, `summary`, `.riddle-anchor`, `.riddle-mark`; `not-allowed` on disabled | CSS l.335-343 |
| `.thin-scroll` | `scrollbar-width:thin; scrollbar-color:var(--rule) transparent` | CSS l.3849-3852 (our AGENTS.md hides scrollbars instead) |
| Overscroll | `html:has(.page-sheet), body{overscroll-behavior:none}` | CSS l.326-331 |
| Scroll anchoring | `.note-page{overflow-anchor:none}`; `.note-page[data-anchoring] *{transition:none!important}` (JS-driven manual anchoring) | CSS l.5455-5460 |

### 1.5 Radii and misc theme values (Tailwind v4 theme, CSS ≈l.96-127 and utilities)

| Token | Value |
|---|---|
| `--radius` | `.625rem` (10px) (CSS l.3111) |
| `--radius-md` | `calc(var(--radius)*.8)` = 8px |
| Used radii | `rounded-[14px]` (l.1480), `rounded-[min(var(--radius-md),10px)]`, `rounded-[min(var(--radius-md),12px)]`, `rounded-2xl` / `rounded-xl` / `rounded-lg` / `rounded-md` / `rounded-full` (l.1477-1501, Tailwind v4 defaults) |
| `--ease-out` | `cubic-bezier(0,0,.2,1)`; `--ease-in-out` `cubic-bezier(.4,0,.2,1)` |
| default transition | `.15s cubic-bezier(.4,0,.2,1)` |
| `--spacing` | `.25rem` |
| Ring-style borders | `shadow-[0_0_0_1px_var(--rule)]` (l.2190), `shadow-[0_0_0_1.5px_var(--ink)]` (l.2182, selected card), `hover:shadow-[0_0_0_1px_var(--faint)]` (l.2564), `focus:shadow-[0_0_0_1.5px_var(--ink)]` (l.2576), `shadow-[var(--lift),0_0_0_1px_var(--rule)]` (l.2194), `shadow-[-1px_0_0_var(--rule)]` (l.2178, left hairline on a side panel) |
| z-index utilities | `z-[5]` (ink-cursor canvas, reading mark), `z-20` header, `z-40` floating CTA, `z-50`, `z-[60]`, `z-[80]` (enlarged drawing dialog) |
| Dialog blur | `backdrop:backdrop-blur-[10px]` exists (l.2435); which dialog uses it is unknown (the settings frame does not look blurred) |

---

## 2. Fonts and weights

| Role | Family | Settings | Source |
|---|---|---|---|
| UI and user text | Instrument Sans (`--font-instrument-sans`, class `rhExFW_variable`), fallback "Instrument Sans Fallback" (ascent 94.42%, descent 24.33%, size-adjust 102.74%) | variable weight 400-700, normal + italic, `font-display:swap` | FONTS; `html{font-family:var(--font-instrument-sans),ui-sans-serif,system-ui,sans-serif}` CSS l.332-334 |
| AI voice | Newsreader (`--font-newsreader`, class `oeiSea_variable`), fallback "Newsreader Fallback" (ascent 69.68%, descent 25.12%, size-adjust 105.48%) | variable weight 200-800, **normal only (no italic loaded)** | FONTS |
| `.voice` | `font-family:var(--font-voice); font-variation-settings:"opsz" 14; font-weight:420; letter-spacing:.004em; color:var(--riddle); white-space:pre-line; font-style:normal` | | CSS l.350-358 |
| `[data-riddled-font=plain] .voice` | `font-family:var(--font-sans); font-variation-settings:normal; letter-spacing:-.004em; font-weight:400` | JS key `riddled:font` = `voice|plain`, default `voice` | CSS l.359-364 |
| `.font-voice` | Newsreader without the opsz/weight settings (used for the wordmark at `font-semibold`) | | CSS l.1874-1876 |
| Mono | `ui-monospace, SF Mono, Menlo, monospace` | | CSS l.3429 |
| Sketch SVG text | `--font-voice` and `--font-sans` re-declared on `.riddled-drawing` | | CSS l.5311-5314 |

User text weights: body 400, `strong` **620**, title 500, H1/H2 **550**, H3/H4 600 (§3). Antialiasing: `<html class="… antialiased">`.

---

## 3. Note page

### 3.1 Size scale (`--note-size`, CSS l.3336-3355)

| `data-text-size` | <640px | ≥640px |
|---|---|---|
| small | 14.5px | 15px |
| default | 15.5px | **16px** |
| large | 17px | 18px |

`.shared-note{--note-size:16.5px}`; its ProseMirror has `min-height:0; padding-bottom:0` (CSS l.3371-3377). JS key `riddled:text-size` = `small|default|large`.

### 3.2 Body and blocks (`.note-body .ProseMirror …`)

| Element | Rule | Source |
|---|---|---|
| Body | `font-size:var(--note-size); line-height:1.8; letter-spacing:-.004em; color:var(--ink); caret-color:var(--ink); text-rendering:optimizeLegibility; font-kerning:normal; min-height:40vh; padding-bottom:30vh; outline:none` | CSS l.3356-3367 |
| Block gap | `>*+*{margin-top:1.05em}` | CSS l.3368-3370 |
| Title `h1.note-title` | `font-size:calc(var(--note-size)*2.45)` (39.2px at 16); `font-weight:500; line-height:1.12; letter-spacing:-.032em; margin-bottom:.7em` | CSS l.3378-3384 |
| H1 (not title) | `1.65em / 1.25`, weight 550, `-.022em`, `margin-top:2.1em` | CSS l.3385-3391 |
| H2 | `1.3em / 1.35`, weight 550, `-.015em`, `margin-top:2em` | CSS l.3392-3398 |
| H3 | `1.05em`, weight 600, `margin-top:1.7em` | CSS l.3399-3403 |
| H4 | weight 600, `color:var(--graphite)`, `margin-top:1.5em` | CSS l.3404-3408 |
| Blockquote | `border-left:2px solid var(--ink); padding-left:1.1em; color:var(--graphite)` | CSS l.3409-3413 |
| `strong` | `font-weight:620` | CSS l.3414-3416 |
| Placeholder (`.is-empty:before`) | `content:attr(data-placeholder); float:left; height:0; pointer-events:none; color:var(--faint); font-weight:inherit` | CSS l.3417-3424 |
| Inline code | `background:color-mix(in srgb, var(--ink) 6%, transparent); border-radius:4px; padding:.1em .32em; font-size:.88em` mono | CSS l.3425-3436 |
| `pre` | `background: ink 5%; border-radius:8px; margin:.5em 0; padding:.85em 1em; font-size:.86em; line-height:1.55; tab-size:2; white-space:pre; overflow-x:auto`; inner `code` reset | CSS l.3437-3461 |
| Lists | `ul, ol{padding-left:1.3em}`; `ul{list-style:outside}` (disc), `ol{list-style:decimal}`; `li::marker{color:var(--ink)}`; `li+li{margin-top:.25em}` | CSS l.3462-3476 |
| Images | `max-width:100%; border-radius:6px; margin:1.6em 0; box-shadow:0 0 0 1px var(--rule), 0 1px 2px #1d1c1a0d; transition:box-shadow .16s`; selected adds `0 0 0 4px var(--riddle-wash)`; uploading `opacity:.6`; dragging selected `opacity:.35` | CSS l.3477-3491, l.4776-4781 |
| "Riddled can see this" line under an image (`.image-seen`) | sans 13px/1.3, `color:var(--faint)`, flex gap 6px, `margin:0 0 1.4em`, 11px icon; the image above gets `margin-bottom:6px`; hidden under `[data-plain]` | CSS l.5346-5372 |

### 3.3 Placeholders seen (frame sheet-05)

| Where | Text |
|---|---|
| Empty body under title | "Just start writing." (sheet-04 tile 9) |
| Empty line below content | "Write, talk to Riddled, or type / for commands…" |

### 3.4 Column geometry (measured ≈, frames margin-notes / margin-thread / inline-sketch)

| Measure | Value |
|---|---|
| Column left edge | x=625 in still = **498px** from viewport left at a ~1665px viewport (roughly centred: column centre ≈ 818-832px from viewport left). The viewport is 1665: the chat panel's hairline (fixed, 466px from the right edge) sits at x 1199 in both frame and ours. Ours centres at 502.5, so the frames' page (column, margin notes, dots) sits ≈4.5px left of centre, as if a ≈9px scrollbar gutter were reserved on the right (Riddled's CSS has `scrollbar-gutter:stable` and `.thin-scroll` utilities); ours hides scrollbars (AGENTS.md). Re-measured 2026-11-07 (glyph-edge cross-correlation and the selection's hard edge): the offset is **5.5px** (the selected line's highlight starts at x 497 in the frame, ours 503 centred; title and "Video Ideas:" glyphs agree within 0.5px), as if an ≈11px gutter were reserved. Ours reproduces it: at ≥768px `.nb-column { left: -5.5px }`, so the column runs 497-1157 at 1665 (384.5 at 1440), with the toolbar row, instruction, title, notes, tethers and sketch in it; scrollbars stay hidden. Edges after, frame | ours: title 498.7 | 497.3, instruction 497.8 | 497.4, selection 497 | 497, left notes' right edge 437.2 | 437.8, left dots 457.4 | 456.4, right dot 1204.2 | 1203.4. The selection menu's card stays at x 1228.5 in both (`MENU_GAP` 66 → 71.5). |
| Column width | **≈640-680px** (wrap of "…replaced and" ends at x=1259; the next word did not fit). The CSS has a `max-w-[660px]` utility; the landing uses 620px (`.landing-scene` ≥1120px) and 660px max-width below. Ours: **660px**, Riddled's `max-w-[660px]`; the frames' column edges match 660 (left x=497 at 1665, 5.5px left of centre). Line breaks are not a width measure here: the same Instrument Sans and Newsreader files render ≈3% wider in Linux Chromium than in the macOS frames (§3.5). |
| Toolbar row baseline | y≈176 (112px below the viewport top) |
| Tell-Riddled line | y≈215 (≈39px below toolbar) |
| Title cap top | y≈255; title to first body line ≈ 62px. Glyph tops (viewport, frame | ours after 2026-11-07): instruction text 145 | 145, title 192 | 192, "Video Ideas:" 263 | 263, first list item 308 | 309 (margin-notes); title 147 | 147, first line 218 | 218 (inline-sketch). Ours: the instruction 17px under the row, the title's Riddled .7em less 3px (every frame sets the first line ≈3px nearer the title than the CSS alone gives) |
| When the toolbar has no instruction line | title sits at y≈225, about 49px below the toolbar (inline-sketch frame) |
| Notes stay in the column when scrolled | the toolbar row stays pinned at top y≈50 (sheet-08), see §5 |

### 3.5 Text width: Linux vs the macOS frames (measured 2026-11-07)

The frames were recorded on macOS. Their text is uniformly ≈3% narrower than ours (sans body 0.964-0.976, margin serif 0.974) while every vertical pitch matches. Measured in one browser (chrome-headless-shell 156, Linux), the same strings at the same size, weight, tracking and variation settings are identical to 0.01px on riddled.ai (its own fonts and CSS), in our Notebook (`--nb-font-sans`, `--nb-font-voice`) and in our page with Riddled's woff2 files loaded:

| String, setting | riddled.ai | ours | ours, Riddled's files |
|---|---|---|---|
| "Users never read the onboarding emails, so we can drop them." sans 16px −.004em | 451.17 | 451.17 | 451.17 |
| same, 19.5px (the landing element itself: 552.33) | 552.33 | 552.33 | 552.33 |
| "fib(3) calls fib(2) and fib(1), then waits" voice 14.5px 420 opsz 14 .004em (landing `.voice` element: 250.44) | 250.44 | 250.44 | 250.44 |
| "The old flow was replaced and nobody noticed…" voice 16px | 596.06 | 596.06 | 596.06 |

So the fonts match; the frames' narrower text is macOS rasterisation (Core Text advances), not a different build, axis or tracking. Riddled loads Instrument Sans at `font-stretch:100%` only (no `wdth` range) and Newsreader 200-800 normal; ours adds the `wdth` range, which does not change widths at 100%. Geometry (column, margins, gaps) follows the frames; line breaks on Linux differ where a line is within ≈3% of its measure.

---

## 4. Top-left menu and wordmark

| Item | Value | Source |
|---|---|---|
| Menu button | "=" two-bar glyph at x≈166, y≈99 (≈39px from viewport left, ≈35px from top), ≈14px wide, `--graphite` | measured ≈ (frame margin-notes) |
| Open state | glyph becomes "✕" in the same spot (frame sidebar-and-settings) | measured ≈ |
| Wordmark | blot glyph + "riddled." in Newsreader **semibold**, `tracking-[-0.02em]`, `leading-none`, `color:var(--ink)` | HTML (landing header: blot `size-[22px]`, text `text-[21px]`, `gap-2.5`; footer: 15px blot and text, `gap-2`) |
| App wordmark size | text ≈17px, blot ≈8px, gap ≈7px, blot at x≈196, text x≈211 | measured ≈ |
| Blot glyph | `viewBox="-13 -13 26 26"`, `fill="currentColor"`, `overflow-visible`: 64-segment quadratic blob (radius ≈7.5) plus three droplets `circle(5.76,7.56,r1.22)`, `(1.17,11.6,r.65)`, `(-3.99,-9.65,r.5)`; the exact path `d` is in HTML | HTML |

---

## 5. Toolbar row (above the title)

Landing equivalent: `.landing-setup` (CSS l.3930-3984) and markup (HTML).

| Item | Value | Source |
|---|---|---|
| Items (left to right) | Riddler picker "● Riddled ⌄"; "✎ Tell Riddled" (shown here only when no instruction is set; otherwise it starts the second line); mode "💡 Thinks with you ⌄" or "◯ When you ask ⌄"; "⇪ Share" | frames, HTML |
| Font | sans, ≈13px, `--faint`; the mode label is `--graphite` when "When you ask" is shown | measured ≈ (landing: `.landing-setup` 14.5px/1.4, riddler 15px graphite, mode `--faint`) |
| Icons | lucide, 13px, stroke 1.6 (lightbulb, message-circle, pen-line); chevron-down 12px stroke 1.7; riddler blot 12px in `--ink` | HTML |
| Gaps | icon-to-label 6px (`.landing-setup-mode{gap:6px}`), riddler 8px; between items `gap:4px 18px` (`.landing-setup-row`) | CSS l.3935-3977 |
| Measured gaps in app | ≈22-24px between item groups | measured ≈ |
| Bulb lit | `.bulb-lit{color:var(--bulb); fill:color-mix(in srgb,var(--bulb) 30%,transparent); filter:drop-shadow(0 0 3px color-mix(in srgb,var(--bulb) 55%,transparent))}` | CSS l.5194-5210 |
| Sticky | on scroll the row pins near the top (y≈50, level with the menu button) over the scrolled body; the instruction line and title scroll away | measured ≈ (sheet-04 tiles 5-8, sheet-08) |
| Sticky background | none visible; text scrolls under it (frame sheet-08 tile 2 shows body text above and under the row). Treatment unknown | measured ≈ |
| Riddler dropdown | popover under "Riddled": list "Riddled" (with check, description "Thinks alongside you and speaks up when it has something worth saying"), "Riddlers" section ("Staff engineer"), footer "+ New Riddler … Manage" | measured ≈ (sheet-03 tile 1) |
| Faded under chat | the whole page sheet fades to `.5` (§16) | CSS l.4752-4758 |

## 6. Instruction line ("Tell Riddled")

| Item | Value | Source |
|---|---|---|
| Layout | `.landing-setup-brief{display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 12px; margin-top:8px}` | CSS l.3941-3947 |
| Label | "✎ Tell Riddled": sans ≈13px `--faint`, 13px pen-line icon | HTML, measured ≈ |
| Instruction text | `.voice` (Newsreader 420 opsz 14) in **`--graphite`** (`.landing-setup-goal{color:var(--graphite); font-size:18.5px}` on landing) | CSS l.3981-3984 |
| App size | ≈16.5px | measured ≈ (margin-notes frame) |
| Wrap | long instructions wrap under themselves ("Prep me on LeetCode … unless I explicitly ask." wraps to 2 lines) | measured ≈ (sheet-04) |

## 7. Corner hint

| Item | Value |
|---|---|
| Text | "Hold ⌥ to speak" |
| Position | bottom-right of the viewport, ≈16px from the bottom and ≈24px from the right (measured ≈). The CSS has `bottom-[max(16px,env(safe-area-inset-bottom))]` (l.519), probably this element |
| Type | sans ≈11px, `--faint` (measured ≈) |
| Voice state | `.landing-listening` (13px faint, 22px tall, gap 8px, `transition:opacity .3s`) with `.voice-bars` (§19) and the label "Listening" (CSS l.4074-4121) |

---

## 8. Margin notes

Landing reference CSS: `.landing-margin{padding-left:22px}` (l.4137), `.landing-margin-note{color:var(--riddle); font-size:19px; line-height:1.5; margin-top:.9rem}` (l.4141-4151; ≥1120px `margin-top:.15em`), landing grid `620px / 56px gap / ≤300px` (l.3860-3883, l.4009-4012). App values are measured.

| Measure | Value |
|---|---|
| Typeface | `.voice`, `--riddle` ink |
| App size | **≈16px, line pitch ≈23.5px (≈1.47)** (measured ≈) |
| Left notes | **right-aligned (ragged left)**; text right edge x≈566, i.e. ≈59px left of the column; width ≈376px |
| Left dot | at x≈589 (between note and column), first-line height; ≈36px from the column's left edge |
| Right notes | left-aligned; dot at x≈1336, text from x≈1356 (≈20px after the dot); right note text width cut off in stills; ≈300-330px in sheets (measured ≈) |
| Vertical alignment | note top aligns with the first line of the passage it is about; the next note starts below the previous one when they collide (left stack: 287, 466, 598) |
| Gap between stacked notes | ≈34px (from reply count to next note's first line) (measured ≈) |
| Reply count | "2 replies": sans ≈12px `--faint`, right-aligned under a left note, ≈12px below the last line (measured ≈) |
| Overflow menu | "…" faint at the far outer edge of the first line (x≈169 for left notes) on hover (measured ≈) |
| Dot marker | `.ink-dot` (§10.1). Landing places it at `-left-[22px] top-[0.42em]` for left-aligned text (HTML/JS) |

### 8.1 Expanded thread (frame margin-thread)

| Item | Value |
|---|---|
| Layout | expands in place in the same margin; switches to **left-aligned** text with a wider measure (≈395px, x 156-551) |
| Top | the open thread, pushed up by the notes under it, starts its first line at y 101 (viewport), its line box 6px above the toolbar row's top (103): ours lets the margin stack rise to 6px above the column (`MARGIN_TOP`). Message tops frame | ours: 101 | 101 … 218 | 219, his 255 | 255, answer 334 | 334, field 536 | 537, Resolve 556 | 557 |
| AI message | `.voice` ≈16px, pitch ≈23.5px, `--riddle` |
| User reply | sans ≈14.5px, line pitch **22.5px** (frame tops 255, 278, 300; 14.5 × 1.55 = 22.475), `--graphite` (landing JS: `mt-3 text-[14.5px] leading-[1.55] text-graphite`). Ours 15px on 22.5px, the AI answer after it 12.5px under |
| Gap message → reply | ≈12px (`mt-3`); reply → next AI message ≈12px (`mt-2` in landing JS for the answer, `text-[18px] leading-[1.5] text-ink`) |
| Write-back field | placeholder "Write back…" sans ≈14px `--faint`; underline only (1px `--rule`, full width ≈395px); send arrow (lucide send, ≈13px, faint) at right end |
| Focus underline | `.reply-line:after`: `height:1.5px; border-radius:1px; background:linear-gradient(to right, var(--riddle) 0%, color-mix(in oklab,var(--riddle) 55%,transparent) 62%, transparent 100%)`; hidden `opacity:0; transform:scaleX(0); transform-origin:0`; on `:focus-within` `opacity:1; scaleX(1)`; `transition:transform .46s cubic-bezier(.2,.7,.2,1), opacity .18s ease-out`. Reduced motion: `transition:opacity .12s; transform:none` (CSS l.5420-5454) |
| Actions | "Resolve" "Dismiss" text buttons, sans ≈12px `--faint`, gap ≈16px, ≈24px below the field; "…" at far right (measured ≈). Frame tops: field line 536, Resolve 556, the next (faded) note's first line 595: ours 13px under the field and 8px of the open thread's own under the actions, then the 14px stack gap |
| Other notes | fade to **≈.35-.4 opacity** while one thread is open (measured ≈; no CSS rule found, likely inline/utility). Notebook: `--nb-faded` .38 (Riddled), full strength under pointer/focus |
| Passage | the anchored passage is `data-active=true` (wash, §9) |
| Open animation | probably `.unfold` (§12) (not confirmed) |

---

## 9. Passage anchor underline and washes

| State | Rule | Source |
|---|---|---|
| Base `.riddle-anchor` | `text-decoration:underline transparent; text-decoration-thickness:1px; text-underline-offset:4px; border-radius:2px; transition:background-color .18s, text-decoration-color .18s` | CSS l.3492-3499 |
| `data-state=open` | dotted underline in `--riddle-line` | CSS l.3500-3506 |
| `data-active=true` | `background:var(--riddle-wash); box-shadow:-3px 0 0 var(--riddle-wash), 3px 0 0 var(--riddle-wash); box-decoration-break:clone`; underline **solid** `--riddle-line` | CSS l.3507-3517 |
| `data-state=resolved` | dotted, colour `--riddle-line` at 50% | CSS l.3518-3532 |
| Active + resolved | background ink 5%, same ±3px side shadows | CSS l.3533-3548 |
| `data-kind=reply` | no background, no underline | CSS l.3549-3552 |
| `.is-asking` (selection sent to Ask/Riddle) | `background:var(--riddle-wash); box-shadow:0 0 0 2px var(--riddle-wash); border-radius:2px` | CSS l.5373-5377 |
| Landing selected text | `.landing-selected{background:color-mix(in srgb,var(--ink) 11%,transparent); border-radius:2px; transition:background-color .15s}` | CSS l.4485-4496 |
| Landing dotted | `underline dotted var(--riddle-line); offset 4px; thickness 1px` | CSS l.4517-4524 |
| Reduced motion | `.riddle-anchor{transition:none}` | CSS l.3834-3836 |
| Measured | in the video, each annotated list item has a thin underline running to the end of its text (margin-notes frame) | frame |

### 9.1 Reading underline (pencil), from landing JS component `N`

Riddled draws a pencil line under the passage while it reads. In the video "it underlines and you see the ink blot pulsing" (transcript).

| Item | Value |
|---|---|
| Stroke | `.pencil-stroke{fill:none; stroke:var(--graphite); stroke-opacity:.5; stroke-linecap:round; stroke-dasharray:1; stroke-dashoffset:1px; animation:pencil-draw var(--draw,.8s) var(--delay,0s) cubic-bezier(.4,.1,.5,1) forwards}`, path uses `pathLength=1` (CSS l.3785-3801) |
| Grain twin | second path `.pencil-stroke.pencil-grain` (`stroke-opacity:.28`), `stroke-width .7`, offset `translate(0.4 0.7)` |
| Per line (1-3 lines) | main width 1.3; one path per visual line from `x1` to `x2` at `y = rect.bottom + 1`; segments = `max(2, round(w/34))`, quadratic wobble `0.75*sin(12.9898*line + 78.233*i)`, last point lifted 0.9px |
| Timing | `n = max(650, totalWidth/1.6)` px/s; line i gets `--draw = w_i/n s`, `--delay = sum of previous`; total ≈ `min(totalWidth/650, 1.6)` s |
| 4+ lines | one **side bracket** instead: vertical stroke at `minX - 14px` from `firstY - .85*linePitch` to `lastY - 2`, width 1.4, `--draw:.9s`, segments = `max(2, round(h/40))`, wobble `0.7*sin(78.233*i+4.1)` (`data-pencil="side"`) |
| Removal | svg `transition-opacity duration-500 ease-out`, `opacity-0` when fading; removed after 520ms (×1.5 in demo) |
| Reduced motion | `stroke-dashoffset:0; animation:none` (CSS l.3826-3829) |

---

## 10. Reading and thinking blot

### 10.1 `.ink-dot` (margin and inline note marker) (CSS l.3593-3683; JS `InkDot`)

| Property | Value |
|---|---|
| Box | `position:absolute; width:14px; height:14px; color:var(--riddle); opacity:.45; pointer-events:none` |
| Glyph | `.ink-dot-blot` = the blot SVG (§4), `fill:currentColor; overflow:visible` |
| Faint | `.is-faint{opacity:.18}` |
| Fresh | `.is-fresh{animation:3.4s ease-in both ink-dry}`; JS keeps `is-fresh` for 3600ms |
| `ink-dry` | `0%,45%{opacity:.9} to{opacity:.45}` |
| Splat | `.is-fresh .ink-dot-blot{animation:.46s cubic-bezier(.2,.9,.25,1.12) backwards blot-splat}`; `blot-splat: 0%{transform:scale(.12)} to{transform:scale(1)}` (CSS l.4596-4603) |
| Sheen (fresh only) | `.ink-sheen`: white ellipse `30%×20%`, `top:22%; left:26%; rotate:-30deg; border-radius:50%`, `animation:2.6s ease-out .2s both ink-sheen` = `0%{opacity:.55} to{opacity:0}` |
| Drip (fresh only) | `.ink-drip`: `3px × 3.5px`, `border-radius:50%/40% 40% 60% 60%`, `background:currentColor`, `top:72%; left:52%; margin-left:-1.5px; transform-origin:50% 0`, `animation:1.5s cubic-bezier(.5,0,.8,.6) .65s both ink-drip` |
| `ink-drip` | `0%{opacity:1; translateY(-2px) scale(.3)} 30%{opacity:1; translateY(0) scale(1)} 55%{opacity:1; translateY(2px) scale(.85,1.9)} to{opacity:0; translateY(16px) scale(.7,1.2)}` |
| Placement | left/right margin note: `-left-[22px] top-[0.42em]`; inline reply: `left-[3px] top-[0.42em]`; desk sketch `!size-[10px]`; `.desk-riddle .ink-dot{top:calc(.7rem + .42em)}` |
| Reduced motion | no animations; sheen and drip `display:none` |

### 10.2 Reading mark (while reading) (CSS l.5185-5193, l.5211-5220; JS)

| Property | Value |
|---|---|
| Element | `.reading-mark` holding the blot glyph at `size-[11px]` |
| Position | `position:absolute; z-index:5; translate:0 -50%`; `left = lastLine.x2 + 10px`, `top = lastLine.mid` (right after the end of the passage's last line) |
| Colour | `--riddle`, `line-height:0; pointer-events:none` |
| Animation | `1.4s ease-in-out infinite reading-breathe`: `0%,to{opacity:.25; scale:.85} 50%{opacity:.85; scale:1.05}` |
| Duration on screen (demo) | `min(totalWidth/650*1000, 1600) + 1300` ms (×1.5) |
| Reduced motion | `opacity:.7; animation:none` |

### 10.3 Writing-back wait (`.ink-wait`) (CSS l.3802-3821)

| Property | Value |
|---|---|
| Element | `<span role="status" aria-label="Riddled is writing back" class="ink-wait">` with the blot at `size-[15px]` |
| Box | `display:flex; align-items:center; height:1lh; color:var(--riddle)`; svg `translate:0 -.12em` |
| Animation | `1.8s ease-in-out infinite ink-wait`: `0%,to{opacity:.45; transform:scale(.82)} 50%{opacity:.95; transform:scale(1)}` |
| Reduced motion | `opacity:.7; animation:none` |
| "Sketching it…" | `voice settle` 15px, `text-riddle/75`, `flex gap-2.5`, followed by `.ink-wait` (JS); app: "Sketching it… ●" ≈12.5px under the reply (sheet-05) |

### 10.4 Decorative splash blots (`.ink-blot`) (CSS l.4580-4603; JS `D`)

| Property | Value |
|---|---|
| Base | `position:absolute; translate:-50% -50%; fill:var(--ink); opacity:0; pointer-events:none; transition:opacity .2s ease-out` |
| `.is-splashed` | `opacity:.85; animation:.46s cubic-bezier(.2,.9,.25,1.12) backwards blot-splat` (staggered `animation-delay` 0/160/300ms) |
| `.is-soaked` | `opacity:.14; transition:opacity 3s ease-in-out` |
| Edge | `<filter><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>` |
| Shape generator `D(seed, r)` | 14 points, radius `r*(1+.16 sin(3a+seed)+.09 sin(7a+2.3 seed))`, joined by midpoint quadratics; 5 drops at angle `1.7 seed + 1.33 i`, distance `r(1.35+.5|sin(seed+i)|)`, radius `r(.06+.07|cos(3 seed+i)|)`; svg box `5r` |
| Smooth generator `U(seed,r)` | 48-point blob with 5 harmonics plus 3 drops (dist 1.32/1.62/1.45, size .17/.09/.065), used for the logo-style blot |
| Reduced motion | no splat animation |

---

## 11. Tether (passage ↔ margin note) (CSS l.4240-4292)

| Part | Value |
|---|---|
| SVG | `.thread-tether{position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none}` |
| Paths | `fill:none; stroke:var(--riddle); stroke-linecap:round` |
| Tie (short curve into the note) | `stroke-width:1.8px; stroke-opacity:.42` |
| Spine (long run along the gutter) | `stroke-width:1.5px; stroke-opacity:.32` |
| Faint variant (`.thread-tether-faint`) | tie `stroke-opacity:.26; stroke-width:1.5px`; reveal `.32s`, delay `60ms`. Frame margin-notes (pointer on the first note): a faint spine runs down the gutter (x≈486-496, y≈247-302, still drawing toward the passage) and there is **no tie** out of the dot; ours draws a hovered note's faint tether as the spine alone (a faint tether with no spine keeps its tie) |
| Reveal | a mask path `.thread-tether-reveal{stroke:#fff; stroke-opacity:1; stroke-width:10px; stroke-dasharray:1; stroke-dashoffset:1px}` (pathLength 1) |
| Tie draw | `.56s cubic-bezier(.3,.7,.3,1) .14s forwards tether-draw` |
| Spine draw | `.7s cubic-bezier(.3,.7,.3,1) .64s forwards tether-draw` (starts after the tie) |
| `tether-draw` | `to{stroke-dashoffset:0}` |
| Reduced motion | reveal `stroke-dashoffset:0; animation:none` |
| Shape (measured ≈, margin-thread frame) | the note's dot (x≈589, y≈171) curves out a few px, then runs down the gutter at x≈590-615 as a long gentle S-curve and turns right into the passage's line (y≈500). The spine stays in the ≈36px gap between left notes and the column. It is drawn only for the open thread. |
| Path recipe (landing `ThoughtTrail`, closest code found) | points joined by cubic `C prev.x midY, cur.x midY, cur.x cur.y` with `midY=(prev.y+cur.y)/2`; stroked 2.2px `--riddle` at .5 with a 1px .3 grain twin; hand-drawn wobble via `feTurbulence baseFrequency .9 numOctaves 2 seed 3` + `feDisplacementMap scale 2.4`; knots `fill:var(--paper); stroke:var(--riddle) .55; 1.3px` (CSS l.4224-4239, l.4293-4302) |

---

## 12. AI text appearance

| Animation | Keyframes | Timing | Reduced motion | Source |
|---|---|---|---|---|
| `ink-word` (per word) | `0%{opacity:0; color:color-mix(in srgb,var(--riddle) 55%,#b08a5a)} 35%{opacity:.55} to{opacity:1; color:var(--riddle)}` (wet-sepia to dry ink) | `.64s cubic-bezier(.25,.6,.3,1) both` | `animation:none` | CSS l.3700-3715, l.3823 |
| Word stagger | each word `<span class="ink-word" style="animation-delay:Xms">`; step = `min(70, 1800 / wordCount)` ms, so a reply takes at most ≈1.8s + .64s; code blocks count as one word | JS `InkText` | | JS, HTML |
| `ink-in` (block) | `0%{opacity:0; transform:translateY(2px)} to{opacity:1; transform:none}` | `.52s cubic-bezier(.2,.7,.2,1) both` | none | CSS l.3687-3699 |
| `unfold` | `0%{clip-path:inset(0 0 100%); opacity:.4} to{clip-path:inset(0); opacity:1}` | `.34s cubic-bezier(.22,1,.36,1) backwards` | none | CSS l.3759-3771 |
| `settle` | `0%{opacity:0; transform:translateY(-2px)} to{opacity:1; transform:none}` | `.2s ease-out both` | none | CSS l.3772-3784 |
| `code-in` | `0%{opacity:0; translate:0 3px} to{opacity:1; translate:0}` | `.42s ease-out both` (on `.riddled-code[style]`, delayed in the word sequence) | none | CSS l.3741-3758 |

Paragraphs inside a reply: `.riddled-words{display:block}`, `+ .riddled-words` and code `+ .riddled-words` get `margin-top:.5em` (CSS l.3716-3721).

AI code block `.riddled-code`: `background:var(--code); box-shadow:0 0 0 1px var(--rule); color:var(--ink); border-radius:8px; margin:.55em 0; padding:.6em .8em; font-size:.74em; line-height:1.55; white-space:pre; tab-size:2; overflow-x:auto`, last child `margin-bottom:0` (CSS l.3722-3740).

## 13. Inline AI reply under a paragraph

| Item | Value | Source |
|---|---|---|
| Indent | `.riddle-inline{padding-left:22px}` | CSS l.3553-3555 |
| Dot | `.ink-dot` at `left-[3px] top-[0.42em]` | JS |
| Size | `text-[length:calc(var(--note-size)*1.06)]` exists (16.96px at 16) | CSS l.1957 |
| Measured | text starts x≈646 (21px in), dot at x≈629; ≈17px serif, line pitch ≈25.5px (≈1.5); gap above ≈24px (measured ≈) |
| Landing | `.landing-inline{color:var(--riddle); margin-top:.55rem; padding-left:22px; font-size:19px; line-height:1.6}` | CSS l.4152-4158 |
| Reply "…" | faint "…" at the right end of the first line on hover (measured ≈, sheet-05) |
| User reply to inline | user text in sans at body size, then AI answer with a new dot; a "Write back…" field and Resolve/Dismiss appear under it when opened (sheet-08 tile 9, measured ≈) |
| Spacer | `.riddle-spacer{pointer-events:none}` (vertical space reserved for inline content) | CSS l.3684-3686 |

## 14. Marks-only "?" and narrow-screen marks

| Item | Value | Source |
|---|---|---|
| Setting | "Marks only: A small ? after the passage. Open it when you're ready." JS key `riddled:layout` = `margins|right|marks`, default `margins` | frame, JS |
| `.riddle-mark` | `display:none` by default | CSS l.3556-3558 |
| `.is-narrow .riddle-mark` | inline-block 15×15, `vertical-align:-.12em; margin:0 3px 0 5px; border-radius:999px; color:var(--riddle); opacity:.55; transition:transform .15s, opacity .15s`; hit area `:before{inset:-14px}`; resolved `opacity:.25`; hover or after an active anchor `transform:scale(1.15)`; svg `fill:currentColor` | CSS l.3559-3592 |
| `.quiet-mark` (transient "?") | `position:absolute; z-index:5; white-space:nowrap; color:var(--faint); font-size:14px; pointer-events:none; animation:2.4s forwards quiet-mark` | CSS l.5221-5229 |
| `quiet-mark` | `0%{opacity:0; translate:-4px} 15%{opacity:1; translate:0} 70%{opacity:1} to{opacity:0}` | CSS l.5230-5245 |
| Reduced motion | `.quiet-mark{animation:none}` | CSS l.5251-5253 |
| Thumbnail | small circle "○" after a passage line (settings thumbnail) | frame |

---

## 15. Selection menu

All values measured ≈ (frames inline-sketch-and-selection, sheet-06 tile 9, sheet-07 tiles 1-3). No CSS class was found.

| Item | Value |
|---|---|
| Position | in the right margin, top aligned with the selection's line (x≈1356 for a column ending ≈1265) |
| Size | ≈236 × 233px |
| Measured 2026-11-07 (frame inline-sketch-and-selection, viewport px) | card left x 1228.5 (ours 1228.5); row tops: the filled Text button 212 (spanning x 1237-1264, y 213-242, so ≈27.5 × 29.5, the eight styles sharing the width), B 266, the inks 300, actions 341, 377, 412 (pitch ≈35.5). Ours lands each within 1px (MENU_RISE 8 above the selection's text box, styles 29.5px tall, actions 35.5px) |
| Surface | `--paper`, `--lift` shadow plus 1px `--rule` ring (likely `shadow-[var(--lift),0_0_0_1px_var(--rule)]`), radius ≈12px |
| Row 1 (blocks) | T, H1, H2, H3, quote, code, bullet list, numbered list. Active "T" is a filled `--ink` rounded square (≈26px in the contact sheet; ≈27.5 × 29.5px in the named still, radius ≈6px) with `--paper` glyph |
| Row 2 (marks) | B, I, U, S, `<>`, ≈16px glyphs `--graphite` |
| Row 3 (colours) | 8 "A" glyphs: default ink, then gray, brown, red, orange, green, blue, purple (text colours §1.2) |
| Actions | "Riddle this" (shortcut hint at right, e.g. "⌘↵"), "Ask Riddled" (hint "Your own question"), "Visualize" (hint "See it drawn out"); labels ≈14px `--ink`, hints ≈10.5px `--faint`, row pitch ≈35px, hover row fill `--shelf` |
| Selection while menu is open | `.is-asking` wash (§9) |
| Ask Riddled field | menu is replaced in place by a single-line field "Ask Riddled about this…" with a round send button, and hint "Enter to ask. Esc to cancel." ≈10.5px faint (sheet-07 tile 2) |
| Landing pill | `.landing-riddle-pill{background:var(--paper); box-shadow:var(--lift), 0 0 0 1px var(--rule); border-radius:10px; padding:9px 14px; font-size:16px; line-height:1; transition:opacity .2s, transform .12s, background-color .12s}`; pressed `background:var(--shelf); transform:scale(.96)` (CSS l.4497-4516). `.landing-ask-box` max-width 300px, 15px/1.45 (l.5304-5310) |

---

## 16. Sketches (drawings)

### 16.1 Container and type

| Item | Value | Source |
|---|---|---|
| Markup | `<span class="riddled-drawing block"><span role="img" aria-label="caption1. caption2…" class="drawing-picture block [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-h-[440px]">SVG</span> stepper row, "See it larger"</span>` | JS, HTML |
| SVG text halo | `.drawing-picture text{paint-order:stroke; stroke:var(--paper)!important; stroke-width:4px!important; stroke-linejoin:round}` | CSS l.5315-5320 |
| SVG allow-list | elements `svg g path line polyline polygon rect circle ellipse text tspan title desc defs marker use`; style props `fill stroke stroke-width stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-opacity fill-opacity opacity font-family font-size font-style font-weight letter-spacing paint-order`; colours only `var(--ink|--graphite|--faint|--rule|--paper|--riddle|--riddle-wash)` and fonts `var(--font-voice|--font-sans)`; `data-step` 1-10, `data-caption`, `data-dim`, `data-hide` | JS (sanitiser) |
| viewBox | authored 320 wide (320×440, 320×360); after mount the viewBox is grown to the content bbox + 10px padding | JS `a()` |
| Title | Newsreader 17 (SVG units) `fill:var(--ink)`; app: "How many ways to each cell?" ≈19px | HTML, measured ≈ |
| Subtitle | sans 11 `fill:var(--faint)`; app ≈13px | HTML, measured ≈ |
| Node labels | voice 16-17 `--ink`; secondary voice 16 `--graphite`; notes sans 11-12 `--faint`/`--graphite` | HTML |
| Lines | `stroke:var(--rule)` or `--graphite`, `stroke-width:1.2`, round caps; arrow markers `M1 1L9 5L1 9` stroke 1.5 graphite, 6×6 | HTML |
| Highlight | `rect rx=6 fill:var(--riddle-wash)` | HTML |
| Measured layout | the drawing is centred under the inline reply (title centre ≈ column centre); grid 256px wide with 1px `--rule` cell lines and a 1px `--rule` outer box | measured ≈ |

### 16.2 Steps

| Item | Value | Source |
|---|---|---|
| Visibility | step groups with `data-step > current` get `opacity:0`; groups listed in a shown step's `data-hide` get 0; in `data-dim` get `.25`; others 1 | JS `h()` |
| Transition | `.riddled-drawing [data-step]{transition:opacity .45s cubic-bezier(.22,1,.36,1)}`; reduced motion none | CSS l.5321-5328 |
| Autoplay pace | `note`: 1150ms + 22ms × caption chars per step; `brisk`: 800ms + 18ms/char. Plays once per drawing (hash remembered); reduced motion jumps to the last step | JS |
| Caption | `voice block text-graphite text-[14.5px] leading-[1.45]` (large view `text-[17px] leading-[1.5]`), `aria-live=polite`, left; row `mt-1.5 flex min-h-[3em] items-start justify-between gap-3` | JS |
| Stepper | `flex shrink-0 items-center gap-0.5`: back (chevron-left 14, stroke 1.7), counter `min-w-[2.6em] text-center font-sans text-[11.5px] tabular-nums text-faint` "N/M", forward (chevron-right 14), replay (rotate-ccw 13) | JS |
| `.drawing-control` | `24×24; border-radius:6px; color:var(--faint); flex centred; transition:color .15s, background-color .15s`; hover `color:var(--ink); background:var(--shelf)`; disabled `opacity:.35` | CSS l.5329-5345 |
| "See it larger" | `mt-1 block font-sans text-[12.5px] text-faint hover:text-ink`, `invisible` until the last step has played | JS |
| Larger dialog | portal `fixed inset-0 z-[80] grid place-items-center bg-black/30 p-4`; card `relative max-h-[92vh] w-[min(92vw,760px)] overflow-auto rounded-2xl bg-paper p-6 pt-11 text-ink shadow-[var(--lift),0_0_0_1px_var(--rule)]`; close `absolute right-3 top-3 size-8 rounded-full text-faint hover:bg-shelf hover:text-ink` (x 16, stroke 1.6); svg `max-h-[72vh]`; Esc or backdrop click closes | JS |
| Failure text | "Riddled couldn't draw this one." `text-[13.5px] text-faint` | JS |

### 16.3 Chart-type sketches (JS module `Z`; types `flow|compare|stack|drawing|diagram|pie|bars|dots|line`)

| Part | Rule | Source |
|---|---|---|
| `.sketch-bar` | `transform-origin:0; opacity:.85; animation:.7s cubic-bezier(.3,.7,.2,1) both sketch-grow` (`scaleX 0→1`), bar `h-[7px] rounded-full bg-riddle`, width `max(v/max*78%, 1.5%)`, stagger 90ms; label voice 14.5px graphite; value voice 13.5px ink | CSS l.4636-4648, JS |
| `.sketch-thread` | `transform-origin:top; .7s cubic-bezier(.4,.1,.4,1) both sketch-thread` (`scaleY 0→1`); flow line `left-[3.5px] w-px bg-riddle/40` | CSS l.4649-4660 |
| `.sketch-dot-static` | `.32s cubic-bezier(.2,.9,.25,1.2) both sketch-pop` (`scale 0→1`); flow dots `size-2 mt-[0.5em] bg-riddle`, stagger 140ms, step text voice 15px/1.45 ink, `space-y-3.5` | CSS l.4661-4671 |
| `.sketch-leader` | `.6s cubic-bezier(.3,.7,.2,1) both sketch-grow`, dotted `border-faint`, stagger 90ms | CSS l.4672-4675 |
| `.sketch-dot` | `.32s cubic-bezier(.2,.9,.25,1.2) both sketch-dot` (`translate(-50%,-50%) scale 0→1`), `size-[7px] bg-riddle`, delay 90n+380ms | CSS l.4676-4686 |
| `.sketch-line` | `stroke:var(--riddle); 1.6px; round; dasharray 1; offset 1px; .9s cubic-bezier(.4,.1,.4,1) forwards pencil-draw`; line chart box `h-[104px]`, points `size-[5px]`, labels 13px voice / 12px faint | CSS l.4687-4696 |
| `.sketch-sweep` | pie sweep `.8s cubic-bezier(.4,.1,.4,1) forwards pencil-draw` | CSS l.4697-4701 |
| `.sketch-pop-in` | `.38s cubic-bezier(.3,1.4,.5,1) both`: `0%{opacity:0; translateY(5px) scale(.92)} to{opacity:1; none}` | CSS l.5281-5299 |
| Stack frames | rows `rounded-md px-3 py-1.5 shadow-[0_0_0_1px_var(--rule)]`, indent 10px per depth, active row `bg-[var(--riddle-wash)]`, mono 13px call / 12.5px faint; rows expand via `grid-rows-[0fr→1fr]` `duration-500 ease-out`; timing 400ms then +620ms per push, +1000ms per return | JS |
| Compare | `grid-cols-2 gap-4`, second column `border-l border-rule pl-4`; heading voice 15.5px medium; items 13.5px/1.45 graphite; empty "Nothing said yet" 13px faint | JS |
| Mermaid diagram | rendered as a `.riddled-code` block of the mermaid source (no renderer on landing) | JS |
| Reduced motion | all `animation:none`; lines `stroke-dashoffset:0` | CSS l.4702-4710 |

---

## 17. Note chat panel (frames note-chat-panel, sheet-07, sheet-08)

| Item | Value | Source |
|---|---|---|
| Panel side | right edge, full viewport height | frame |
| Width | **≈466px** (x 1326 → viewport right ≈1792). Candidate utilities: `w-[min(460px,calc(100vw-32px))]` (l.1090), `md:w-[480px]` (l.2824) | measured ≈ |
| Panel surface | `--paper`, 1px `--rule` hairline on its left edge (likely `shadow-[-1px_0_0_var(--rule)]`, l.2178) | measured ≈ |
| Page behind | `.page-sheet.is-aside-left{transform:translate(-210px)}` at ≥768px, `opacity:.5` (column moved 625→420 in frame) | CSS l.4747-4758 |
| Dim overlay | `.conversation-dialog::backdrop{background:#14120f29}` (16%); dark `#00000073` (45%). The frame shows the page at half opacity and no visible extra tint | CSS l.4736-4746 |
| Header | blot + "Riddled" Newsreader ≈17px ink at top-left (x≈1350, y≈95); sub-line "On "2D Dynamic Programming"" sans ≈11.5px faint | measured ≈ |
| Opening line | "I've read the whole note. Ask anything about it." `.voice` ≈17px, line pitch ≈27px, ≈48px under the header | measured ≈ |
| Starter chips | "What am I still misunderstanding?", "What have we figured out so far?", "What should I work on next?"; stacked, left-aligned, sans ≈13px graphite, 1px `--rule` ring, radius ≈8px, height ≈32px, pitch ≈39px, padding ≈14px | measured ≈ |
| User message | right-aligned block, `--shelf` fill, radius ≈8px, sans ≈12.5px ink | measured ≈ (sheet-07 tile 9) |
| AI answer | `.voice` ≈14px in panel, left-aligned, no bubble; numbered list items as plain lines | measured ≈ (sheet-08) |
| Input | bottom, "Ask about this note…" sans ≈14px faint, round send button (≈20px, `--faint`, filled `--ink` when text present) at the right; no box | measured ≈ |
| Open/close motion | unknown | gap |

## 18. Overlay sidebar (frame sidebar-and-settings, sheet-04 tile 1, sheet-10)

| Item | Value | Source |
|---|---|---|
| Width | `w-[288px]` / `left-[min(288px,78vw)]`; frame ≈280px | CSS l.1069, l.558 |
| Page behind | `.page-sheet.is-aside{opacity:.5; transform:translate(min(288px,78vw))}` (toolbar moved 625→908 in frame) | CSS l.4752-4755 |
| Background | same `--paper` as the page (the page is faded rather than the sidebar tinted) | measured ≈ |
| Close | "✕" replaces "=" at top-left; wordmark stays | measured ≈ |
| Search row | search icon 13px + "Find or start a note" sans ≈13.5px graphite, "⌘K" ≈10.5px faint at right; y≈157 | measured ≈ |
| New note | "+ New note" ≈13.5px graphite; y≈194 | measured ≈ |
| Note rows | file-text icon ≈12px faint, title ≈13.5px graphite, truncated with ellipsis, status dot (small ink blot ≈5px, `--faint`) right after the title; row pitch ≈31px, first row at y≈250; current note row `--shelf` fill, radius ≈6px, full width | measured ≈ |
| New folder | folder icon + "New folder" ≈13px faint, ≈50px below the list | measured ≈ |
| Footer | account email ≈12.5px graphite; "All notes saved" ≈11.5px faint below it | measured ≈ |
| Actions | Copy this note ⌘⇧C, Export this note ⌘⇧E, Just my words ⌘⇧(key unreadable), Customize Riddled ⌘,, Riddlers, Profile, Billing, Sign out; ≈13.5px graphite; shortcuts ≈10.5px faint right-aligned; pitch ≈31px | measured ≈ |
| Open trigger | ☰ click (video); hover-to-open not observed | report |

## 19. Settings modal ("Customize Riddled")

| Item | Value | Source |
|---|---|---|
| Size | ≈840 × 704px (frame). Candidates: `w-[min(860px,calc(100vw-32px))]` (l.1102) and `h-[min(720px,calc(100dvh-32px))]` (l.979) | measured ≈ |
| Surface | `--paper`, radius ≈16px (`rounded-2xl`?), `--lift` | measured ≈ |
| Backdrop | `.settings-dialog::backdrop{background:#1d1c1a57}` (ink 34%); dark `#0009` (black 60%) | CSS l.3838-3848 |
| Nav column | ≈216px wide (`sm:w-[220px]`, l.2745), divider 1px `--rule`; items "Customize Riddled, Riddlers, About you, Profile, Billing, Help & support" sans ≈14px graphite, pitch ≈39px; selected item `--shelf`/white fill, radius ≈8px, ink text | measured ≈ |
| Close | x icon ≈14px faint, top-right ≈32px in | measured ≈ |
| Heading | "Customize Riddled" sans ≈19px ink, weight ≈500 | measured ≈ |
| Section label | "New notes start in", "Reading pace", "Where questions appear", "Appearance", "Text size", "Riddled's lettering", "Riddled's colour": ≈14px ink weight ≈500; ≈52px between sections | measured ≈ |
| Option card | 2 per row (gap ≈10px), ≈272 × 82px, radius ≈10-12px, padding ≈12px; title ≈13.5px ink, description ≈12px graphite, 2 lines | measured ≈ |
| Card states | unselected 1px `--rule` ring (`shadow-[0_0_0_1px_var(--rule)]`); **selected 1.5px `--ink` ring** (`shadow-[0_0_0_1.5px_var(--ink)]`, l.2182); no fill, no check; hover `0 0 0 1px var(--faint)` | CSS utilities, report |
| Helper text | "Change any note on its own, from the row above its title." ≈12px faint, ≈8px under the cards | measured ≈ |
| Toggle card | "Ink from the pointer / Now and then a drop of ink falls as you move the pointer, then dries and fades." full-width card, toggle at right ≈36×20, off = `--rule` track with white knob | measured ≈ |
| Layout thumbnails | 3 cards (Both margins / Right margin / Marks only), ≈178 × 150+; greyscale mini page on `--shelf`: grey text bars, black note bars, tiny tether ticks; captions "Your words in the middle, questions branch to either side." / "Every question in one column beside your writing." / "A small ? after the passage. Open it when you're ready." | measured ≈ |
| Appearance | 3 cards System (half dark, half light thumb), Light, Dark; thumbs are mini toolbars | measured ≈ (sheet-10) |
| Text size | 3 cards, "A thought." at small/default/large, labels Small/Default/Large faint | measured ≈ |
| Lettering | 2 cards "Does this still hold?" in Newsreader ("Riddled's own") and Instrument Sans ("Like your notes") | measured ≈ |
| Colour swatches | 7 round swatches Ink, Blue, Green, Red, Purple, Brown, Orange with labels under; landing: button `size-8 rounded-full`, dot `size-3.5 bg-riddle` under `data-riddled-color`, selected `box-shadow:0 0 0 1px var(--riddle)`, `transition-[box-shadow] duration-300` | HTML, sheet-10 |
| Settings keys (localStorage) | `riddled:layout` margins/right/marks (margins); `riddled:voice` plain/warm/blunt/riddle (plain); `riddled:text-size`; `riddled:read-along` on/off (on); `riddled:read-pace` regular/slow (regular); `riddled:font` voice/plain; `riddled:color`; `riddled:ink-cursor` on/off (**off**); `riddled:theme`; `riddled:export-format` pdf/docx/md (pdf); `riddled:export-riddles` with/without (with); `riddled:plain-view` on/off (off) | JS |

## 20. Export dialog (sheet-10 tiles 2-3)

| Item | Value |
|---|---|
| Size | ≈504 × 325px, centred, radius ≈12px, `--lift`; page behind dimmed (measured ≈). Candidate `w-[min(520px,calc(100vw-32px))]` (l.1093) |
| Title | "Export "Journal"" sans ≈14.5px ink, weight ≈500 |
| Format cards | 3 in a row: PDF "To read, print or send." / Word "To keep editing, in Word, Pages or Google Docs." / Markdown "Plain text for anywhere, another AI included."; same card rules as §19 (selected 1.5px ink) |
| Toggle row | "Include the riddles" + "The riddle sits under the paragraph it's about, drawings and all."; toggle on = `--ink` track, `--paper` knob |
| Buttons | "Cancel" text button ≈12.5px faint; "Export PDF" **solid pill**: `rounded-full bg-ink text-paper`, ≈12.5px, ≈28px tall (landing pill: `rounded-full bg-ink px-4 py-2 text-paper`, hover `opacity-85`, `transition-opacity duration-150`) |

## 21. Pointer ink drop ("Ink from the pointer") (JS `InkCursor`)

| Item | Value |
|---|---|
| Canvas | `<canvas class="pointer-events-none fixed inset-0 z-[5] h-dvh w-screen">`, DPR capped at 2 |
| Enabled | only with `riddled:ink-cursor=on` (default off), `(pointer: fine)`, and not `prefers-reduced-motion` |
| Spawn | mouse/pen only; one drop after the pointer travels 260px, then every `200 + 300*rand` px; position `pointer + (rand-.5)*6` x, `+8px` y, stored in page coordinates (moves with scroll) |
| Drop kinds | 30% big: `r = 3.4+1.8 rand`, life `3600+1600 rand` ms, drip length `14+34 rand` px over `1200+1400 rand` ms; 70% small: `r = 1.4+2.4 rand`, life `1900+1200 rand` ms, no drip |
| Shape | blot generator `D(seed, r)`; drops shown only when `r > 2.4` (first 2) |
| Alpha | `min(1, age/90) × (1 - max(0,(age - .55 life)/(.45 life))) × .42` (90ms fade-in, hold, fade over last 45%) |
| Drip | eased `1-(1-t)^3`; stroke width `.7r` quadratic from `(0,.4r)` to `(0,len)`, bead radius `r(.42+.12t)` |
| Colour | `--ink` read from `<html>`, refreshed on `riddled:theme` and colour-scheme change |
| Cap | max 36 drops |
| Related CSS | `.ink-drop{background:var(--riddle); opacity:.75; border-radius:2px}` with a 7px teardrop `:before` at `left:-9px` rotated -45deg (CSS l.4759-4775); probably a drag/drop insertion marker, not the cursor ink. `.desk-catch-blot` 26px `desk-catch-in` `.42s cubic-bezier(.2,1.4,.4,1)` (`opacity 0→1, scale .2→1`), words voice 18px; container `transition:opacity .9s`, `.is-letting{opacity:0}` (CSS l.5059-5090) |

## 22. Other motion and components found

| Name | Rule | Reduced motion | Source |
|---|---|---|---|
| `caret-blink` (`.type-caret`) | `1.5px × 1.05em`, `background:var(--ink)`, `vertical-align:-.16em; margin-left:1px`; `1s step-end infinite`: `0%,70%,to{opacity:1} 20%,50%{opacity:0}` | none | CSS l.4558-4579 |
| `whisper-caret` | `1px × 1em`, `currentColor`, `margin-left:2px; vertical-align:-.12em`; `1.1s step-end infinite`: `50%{opacity:0}` | none defined | CSS l.5099-5112 |
| Whisper behaviour | landing types `data-whisper` lines character by character: 26-86ms per char, 180ms after `.,?`, 650ms at `|`; clears after 4800ms; idle "Still there?| Take your time." after 22s; skim detection "Skimming.| I do that too." | | JS |
| `voice-bar` (`.voice-bars span`) | 4 bars `2.5px` wide, gap 2.5px, 14px tall, `background:var(--ink); opacity:.55; border-radius:2px`; `.9s ease-in-out infinite`, delays 0/.15/.3/.45s: `0%,to{scaleY(.3)} 50%{scaleY(1)}` | `animation:none; scaleY(.6)` | CSS l.4084-4121 |
| `pencil-draw` | `to{stroke-dashoffset:0}` (with `stroke-dasharray:1`, `pathLength=1`) | offset 0 | CSS l.3797-3801 |
| Try-me arrow | `.try-me-arrow` 1.6px `--riddle` round; `.is-drawn` `.52s ease-out forwards pencil-draw` | offset 0 | CSS l.4604-4635 |
| Landing pointer | `15×21`, `transition:transform .72s cubic-bezier(.45,0,.2,1), opacity .3s`; path `fill:var(--ink); stroke:var(--paper) 1.1px`; `.is-down` `scale(.86)` over .12s | | CSS l.4711-4735 |
| Trail steps | `.trail-step{opacity:0; translate:0 6px; transition:opacity .5s, translate .6s cubic-bezier(.2,.8,.2,1)}` → `.is-shown`; `.trail-note` `transition:opacity .6s .4s` | opacity 1, no transition | CSS l.4311-4368 |
| Expert cards | `rotate:var(--r); box-shadow:var(--lift); border-radius:12px; padding:18px 20px 22px 42px; transition:opacity .5s ease i*.14s, translate .6s cubic-bezier(.2,.8,.2,1) i*.14s, rotate .2s`; hover `rotate:0`; name 13.5px 500 ink; question voice 18.5px/1.45 | static | CSS l.4401-4436 |
| Tabs | `.hero-tab` pill `padding:6px 14px; 14px; ring 1px rule`; selected `bg-ink text-paper`; `.tune-tabs` segmented (`padding:3px; gap:2px`, tab 32px tall, selected `--shelf` + rule ring) | | CSS l.4437-4459, l.5021-5058 |
| Radio pills (landing "Tell Riddled") | `h-8 rounded-full px-3.5 text-[13.5px] shadow-[0_0_0_1px_var(--rule)]`, selected `text-paper` on a sliding `bg-ink` pill (`transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,0.7,0.2,1)]`) | `motion-reduce:transition-none` | HTML, JS |
| Mentions (Teams) | `.mention-thread` left rule 1px, gap 20px; `.mention-face` 28px `--shelf` ring; `.mention-chip` `--riddle-wash` radius 5px; `.mention-answer` 21px/1.4 | | CSS l.5132-5184 |
| Desk demo | cards `232px`, radius 5px, `--lift`, dealt with `.76s cubic-bezier(.2,.8,.2,1)` staggered 70ms; held `scale(1.03)` + deeper shadow | `transition:none` | CSS l.4832-5020 |
| `.landing-sheet` | `border-radius:18px; box-shadow:var(--lift), 0 30px 60px -40px #00000059` | | CSS l.4181-4197 |

### 22.1 "Just my words" (`data-plain`)

| Item | Value | Source |
|---|---|---|
| Attribute | `[data-plain]` on an ancestor; JS key `riddled:plain-view` on/off (off) | CSS, JS |
| Rules found | `[data-plain] .image-seen{display:none}`; image after it gets back `margin-bottom:1.6em` | CSS l.5349-5372 |
| Other AI marks | hiding of notes, tethers, dots and anchors is not in CSS; it must be done in markup/JS | gap |

---

## 23. Reduced-motion summary

| Thing | Fallback |
|---|---|
| ink-in, unfold, ink-word, settle, code-in | `animation:none` (content shown at once) |
| pencil strokes, sketch lines, sweeps, try-me arrow, tether reveal | `stroke-dashoffset:0; animation:none` (fully drawn) |
| ink-wait | static at `.7` |
| reading-mark | static at `.7` |
| quiet-mark | `animation:none` (stays visible, since base opacity is 1) |
| ink-dot fresh | no dry/splat; sheen and drip hidden |
| ink-blot splash | no splat |
| sketch bars, dots, threads, pops | `animation:none` |
| drawing step transitions | `transition:none`; autoplay jumps to the last step |
| riddle-anchor, image transitions | `transition:none` |
| reply-line | opacity-only `.12s`, no scale |
| voice bars | static at `scaleY(.6)` |
| caret-blink | `animation:none` |
| ink cursor | not started |
| whisper-caret | none defined |

---

## Gaps

Neither the CSS nor the frames settle these:

1. **Exact column width** of the app page: 660px adopted (CSS `max-w-[660px]`, frame edges at 660, 5.5px left of centre, §3.4); the app bundle that would confirm it was not read. Left and right note widths and gutters are measured only (≈376px collapsed, ≈410px open, 59px left text gap, ≈36px left dot). Frame line breaks cannot settle widths: Linux renders the same fonts ≈3% wider than the macOS frames (§3.5).
2. **Margin-note type size and line-height** in the app (≈16px / ≈23.5px measured; landing uses 19px/1.5).
3. **Margin-note container classes, collision and stacking logic**, and the faded-others opacity (≈.35-.4) have no CSS rule.
4. **Tether path geometry**: stroke styles and timings are exact, but the path builder (how spine and tie are routed) lives in the unread `/write` bundle.
5. **Sticky toolbar** offset, background or fade, and z-index.
6. **Selection menu** markup, exact size, radius, icons, shortcut strings and the hint text (partly unreadable at frame resolution).
7. **Chat panel** width (≈466px, between the 460/480px utilities), header and chip metrics, open and close animation, and whether the dim is the `.conversation-dialog::backdrop` or only the `.page-sheet` opacity.
8. **Sidebar** row metrics, status-dot meaning and colours, selected-row fill, open and close animation, and the "Just my words" shortcut key.
9. **Settings and export dialogs**: exact sizes and radii, toggle component metrics, thumbnail drawings, and open and close motion.
10. **Corner hint** exact type and position, and the ⌥-to-speak recording UI beyond `.voice-bars`.
11. **Dark-mode specifics** beyond tokens (frames show dark briefly, but no component overrides exist except backdrops).
12. **"Just my words"**: only the image-seen rule is CSS; the rest is JS.
13. **Riddler picker** menu and **Share** UI were not inspected closely.
14. Which dialog uses `backdrop-blur-[10px]`.

Everything above that is marked measured ≈ comes from a compressed screen recording at about 1:1. Expect ±2px on positions and ±0.5px on type sizes.
