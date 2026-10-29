# Bug verification: pdf-dns-boundary

- Slug: pdf-dns-boundary (from assessment)
- Tested: 2026-10-29
- Assessment: ./assessment.md
- Fix: ./fix.md
- Result: verified

## Checks performed

- Full offline suite in disposable production-image container, Chromium enabled and isolated test data: 2,853 passed, zero failed, two opt-in live checks skipped (2,855 total).
- npm run lint and npm run typecheck: pass.
- Production Next.js build: pass. Final Docker payload build and deployment evidence are retained separately.
- Targeted PDF/DNS/redirect/deadline regressions: 26 passed.
- Four token Chromium regressions cover late reply, edit/debounce recovery, no-response export, stale/foreign reply rejection, keyboard focus and 320/390/1440 layouts.
- Live guarded HTTPS fetch of the arXiv attention paper: HTTP 200, application/pdf.
- Sol round 3: APPROVE, both original findings and the recovery race resolved; independent eight-test targeted suite passed.

## Residual risks and recommendation

No real model requests were made. DNS fixtures exercise the actual socket lookup; the live arXiv request additionally verifies the real TLS transport. Close the bug. Evidence and all three review reports are under /home/brunovsky/agent-runs/2026-10-29-pr-review-deploy/.
