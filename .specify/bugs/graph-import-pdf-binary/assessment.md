# Bug Assessment: Graph import reads a PDF's raw bytes as text

- **Slug**: graph-import-pdf-binary
- **Created**: 2026-11-11
- **Source**: owner report with screenshot (Graph pipeline costs: Extraction 10.33M in / 69.8k out) and "Lukas is stuck for a couple of hours"
- **Verdict**: valid (live logs)
- **Severity**: high (hours of blocked import and ~10M tokens of a user's ChatGPT plan spent on junk)

## Symptom

Importing `brandejs_vypocetni_systemy_beamer.pdf` through Home → Knowledge graph → Import notes started a 957-chunk notes pipeline (08:07 → still at chunk 781 at 11:42, ~16.5 s per chunk, extractor + auditor per chunk), almost every chunk 0 propositions; 8 nodes total.

## Root cause

`app/api/graph/import/route.ts` read every upload with `file.text()`. The picker's `accept=".md,.markdown,.txt"` is advisory, so a PDF got through and its compressed binary was decoded as UTF-8: ~15 MB of junk, chunked greedily to ≤4096 tokens.

## Remediation (owner choice, 2026-11-11: "Read PDFs properly")

Read PDFs through the Library's PDF reader (`pdfExtract`, pdfjs) and import that text; refuse a PDF with no text layer before any model call; recognise a PDF by extension or `%PDF-` header; picker accepts `.pdf`. Other options offered (refuse other binary files, confirm above a chunk count, skip empty audits) were not chosen.

## Live action

The running job was stopped at chunk 781 by restarting the app container (owner approved; no other work was running).
