# Bug assessment: PDF DNS boundary

- Slug: pdf-dns-boundary (generated for the authorized automated review loop)
- Created: 2026-10-29
- Source: Sol round 1, finding S1
- Verdict: valid
- Severity: high

## Symptom and reproduction

A search-provided PDF URL whose DNS name resolves to loopback passes the public-host check. Sol resolved `127.0.0.1.nip.io` and confirmed paper_read reaches its HTTPS fetch using a stub, without accessing an internal service.

## Root cause

src/agent/tools/papers.ts checks hostname spelling, then fetch resolves the name independently. Redirects on arXiv PDFs also bypass that check.

## Proposed remediation

Use built-in node:https with DNS validation in the actual socket lookup. Reject nonpublic IPv4/IPv6 and mapped addresses, preserve TLS hostname verification, validate every redirect, and retain arXiv spacing, deadlines, streaming limits and cancellation. Keep arbitrary public OA publishers supported. Change papers.ts, arxiv.ts, a new papers/public-pdf.ts transport and relevant tests. Stub HTTPS/DNS in offline tool tests and exercise the socket lookup, public/private redirects, deadline, and abort behavior.

## Constitution check

I: technical execution of the approved review-and-fix loop; no product choices. II: page citation behavior unchanged. III: no persistence format changes. IV: invalid destinations fail explicitly. V: no automatic paid work. VI: no interface change. VII: enforce hosted network boundary. VIII: server-only transport, no client dependency or startup work.

## Risks and open questions

Transport must retain TLS verification and connect to the validated address, rather than validate then resolve again. No unresolved product decisions.
