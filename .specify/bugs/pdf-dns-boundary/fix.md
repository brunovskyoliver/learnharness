# Bug fix: PDF DNS boundary

- Slug: pdf-dns-boundary (from assessment)
- Fixed: 2026-10-29
- Assessment: ./assessment.md
- Status: applied

## Changes

The new src/agent/papers/public-pdf.ts uses node:https with a socket lookup that resolves once, rejects private/reserved or mixed answers and returns the validated addresses. It retains the URL hostname for TLS and uses a fresh connection per request. Every redirect receives the same validation. arxivFetch accepts the guarded transport so arXiv requests retain spacing and retry behavior without automatic PDF redirects.

The existing streamed 25 MB limit, cancellation, ten-page budget and tenant-scoped temporary files remain in papers.ts. No dependency was added. Credentials in PDF URLs are explicitly refused.

## Verification

26 targeted paper, DNS, redirect and deadline tests pass. The offline HTTPS fixture invokes the actual connection lookup before returning fetch-stub responses. Tests cover private/reserved IPv4/IPv6, mapped addresses, mixed answers, public address pinning, public-to-private redirects, DNS failure, URL credentials and cancellation. Full gates and Sol re-review are recorded in test.md.

## Deviations and follow-ups

No deviation from the assessment. No data migration or persistence change.
