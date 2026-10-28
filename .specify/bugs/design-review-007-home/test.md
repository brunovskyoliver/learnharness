# Verification: Math check row and Home edges

- **Slug**: design-review-007-home
- **Verified**: 2026-10-28
- **Result**: resolved

## Checks

- `npm run typecheck` and `npm run lint` pass. `npm run build` passes.
- `npm test`: 2677/2681. The four failures are in auth files this fix doesn't touch:
  - `chatgpt-connection-ui`, `subscription-auth` (main loader) and `subscription-connection-ui` (github-copilot) fail the same way on main without these changes.
  - `chatgpt-auth` #91 passes on its own (34/34) and only failed in the full parallel run.
- Browser, production build, seeded math check sessions:
  - At 1440 px, the math check and tool call rows start at x = 527, the same edge as prose and "Agent's thinking" (before: 432).
  - Home headings "Waiting for you", "Calibration" and "Knowledge graph" start at x = 448 with the title and cards (before: 452).
  - Expanded agreed rows show Checked, Reduced to and Took, with no raw reply. The failed row reads "Wolfram · check failed" and its reason is in sans.
  - At 390 px, a long title truncates ("UI review · Math check (active …") and the date stays visible.
  - Horizontal overflow is 0 at 1440 and 390 in all three math check sessions.
