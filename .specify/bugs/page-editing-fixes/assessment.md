# Bug assessment: Canvas page editing loses or hides text

- Slug: page-editing-fixes
- Created: 2026-10-31
- Source: owner-requested review of feat/009-library-canvas (af12eac), focused on editing a page
- Verdict: valid (items 1–9, 11–13); not reproducible (items 4 and 10, see below)
- Severity: high (1–3), medium (5–9), low (11–13)

## Symptoms and root causes

1. **Own typing reported as a conflict.** When the agent revises while the learner has a saved draft, the store makes that draft a version (`before-agent`). The tab's next draft PUT gets a 409, and a `library-changed` event follows. Both the `stale` and the `remote` reducer cases compared the new head to the tab's live text, not to the text the server already held (`acked`). The learner saw "This page changed elsewhere" about their own words, and drafts and save-on-close stopped. (components/library/page-draft.ts)
2. **Restore after a failed save erased unsaved text.** In `page-pane.tsx`, restore went ahead when the save before it failed, never checked its own response, and the reload cleared the backup.
3. **The agent could cut off a long page.** `library_read` returns at most 2,000 lines or 50 KB, but `page_revise` with whole `content` replaced the entire page. (src/agent/tools/pages.ts)
4. **Last keystrokes on unmount.** The editor's cleanup only cleared its 120 ms timer. Not reproducible in Chromium: clicking History blurs the editor first, and the blur hands the text over. Kept as a one-line guard.
5. **Close during a conflict saved nothing** to the server.
6. **Use latest restored the head the conflict first showed**, not the newest one.
7. **A failed load never recovered**: `loadFailed` was never reset.
8. **A page deleted while open** kept failing with 404s, and its unsaved text had no way out.
9. **History grew with duplicates.** Restoring the newest text added a copy, and the list loaded all at once.
10. **Rename Escape.** Not reproducible: React drops the blur when the input unmounts. Not changed; a browser guard was added.
11. **Multi-line formula source clipped** outside Chromium: `field-sizing: content` with `rows=1`.
12. **One failed version preview replaced the whole History list.**
13. **The divider's colour** was a hard-coded copy of the `input` token.

## Owner decisions (2026-10-31)

- Long pages: `page_revise` refuses whole content when the page is longer than one read. Refusal: "{name} is longer than one read. Revise it with edits, so text you did not read is not replaced." 47-pages.md gets one line.
- Deleted while open: "{name} was deleted." The editor turns read-only; a Copy text button (then "Copied") appears when there is unsaved text.
- History: no version whose text equals the newest; 50 at a time with "Show earlier versions". Nothing is deleted.
- Close during a conflict: saves the same way as Use latest.
- Restore strings: "Your text could not be saved, so version {n} was not restored." and "Version {n} could not be restored. Your text is kept."
- Preview failure: "Version {n} could not be loaded." with Try again.

## Constitution check

- I: every behavior and string above was approved by the owner through numbered questions.
- II: not touched.
- III: each fix removes a path that lost or stranded learner text; no version is ever deleted.
- IV: states say what happened (deleted, not restored, could not be loaded).
- V: no model work.
- VI: existing tokens, `prompt-secondary` buttons, hidden scrollbars; the divider now uses `var(--input)`.
- VII: routes stay tenant-scoped.
- VIII: no new dependency. History loads less per request.
