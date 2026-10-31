# Bug assessment: Late token bridge replies

- Slug: token-bridge-recovery (generated for the authorized automated review loop)
- Created: 2026-10-29
- Source: Sol round 1, finding S2
- Verdict: valid
- Severity: medium

## Symptom and reproduction

A matching valid reply delivered after 2,300 ms leaves the token textarea permanently read-only and the export hint visible. Sol reproduced this in Chromium.

## Root cause

src/demo-kit/runtime.ts sets closed and clears pending requests after two seconds, causing later valid replies to be rejected.

## Proposed remediation

Treat the standalone hint as provisional. Retain pending requests; a valid same-parent matching reply unlocks editing and hides the hint. Keep no-response exports read-only and keep all stale/foreign/malformed checks. Modify the existing runtime and tokens-headless test; add a delayed-reply regression and retain no-response coverage.

## Constitution check

I: approved technical review fix; existing strings and behavior contract retained. II: deterministic tokenization retained. III: preserve input and last good split. IV: recover honestly on successful response. V: no automatic model work. VI: existing controls, focus, hidden scrollbars and layout retained, checked using shadcn/Impeccable/Web Interface Guidelines. VII: parent/request validation retained. VIII: no new dependency or startup work.

## Risks and open questions

Do not allow foreign or previous-document replies to unlock editing. No unresolved product decisions.
