# Contract: demo library bridge (frame ↔ app page)

Frame → parent: `{ type: "demo-lib-request", file }` where `file` ∈ `runtime.js | vega.js | plotly.js | plotly-light.js | flow.js | flow.css`.
Parent accepts it only when `event.source` is this card's iframe `contentWindow` and `file` is in the list; otherwise ignores it.

Parent → frame: `{ type: "lh-demo-lib", file, code }` (`code` string) or `{ type: "lh-demo-lib", file, error: string }` when the fetch failed. Sent with `postMessage(…, "*")` to that iframe's window only (opaque origin has no name to target).

The frame's `load(file)` resolves on `code` (injects `<script>`/`<style>` with textContent), rejects on `error` (existing "could not load" failure), and uses `<script src>` when it has no parent (`window.parent === window`) — downloaded demos and the headless checker.

Static references in demo HTML (`<script src="/demo-kit/F">`, `<link rel="stylesheet" href="/demo-kit/flow.css">`) are inlined by the parent before the srcdoc is set; the file list is the same.
