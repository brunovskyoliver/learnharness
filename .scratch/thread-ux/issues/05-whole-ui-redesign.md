# Whole-UI redesign and persistent demo workspace

Requested and approved by Oliver on 2026-10-27. Implementation authorized with "okay go" after the design specification.

## Approved decisions

- One sans-serif family, quiet navigation and composer, advanced model controls in Options.
- Remove the entire Thinking while reading field; keep normal answers and practice input. Preserve historical records.
- A question referring to a demo opens it automatically until the learner closes or switches it.
- Keep one live demo instance. Its transcript location shows a preview with Open in workspace while the workspace is active.
- Each kit graph expands across the app window with editable parameters on the right. Preserve values, simulation/playback state, camera/zoom, focus, and reading position. Support mobile and reduced motion.
- Legacy arbitrary HTML gets whole-demo expansion, not promised universal graph/control extraction.

## Implementation

- Source Sans 3 remains the shared default; titles and interface follow the reading family. Removed the serif title toggle, preserving historical settings compatibility.
- Replaced the lesson's overlaid dock and 96px fade with a footer row. Removed the reading-thinking component, active draft wiring, and submission attachment. Normal answers, question reasoning, confidence, and practice remain.
- Moved model/thinking/usage controls behind Options. Demo inversion and download also live behind Options.
- A native dialog presents the existing iframe inline, over the workspace slot, or in the modal top layer. The iframe is never reparented or recreated when moving between these presentations.
- Kit runtime supports individual graph focus, parameter layout, renderer resize, Plotly interaction revision, keyboard dismissal, reduced motion, and reading-size propagation.
- Added optional question demoRef with exact messageId and optional panel index. Demo deliveries supply the reference to the teacher. Ambiguous legacy title matches require selection; missing exact revisions never silently resolve to another demo.
- Updated product/design documentation and regression expectations for the approved defaults.

## Verification

- Initial real-browser proof: dialog promotion and return preserve iframe identity and JavaScript state.
- Full isolated test suite: 2451 passed, 0 failed.
- Focused regression suite: 174 passed, 0 failed.
- Real browser regression: scripts/smoke-demo-workspace.mjs uses isolated session data and blocks model submission. Covers all three kit renderers, legacy iframe continuity, parameter/state retention, running playback, Escape, reading position, auto-open and manual close, mobile/short viewport, reduced motion, and Options.
- Typecheck, lint, diff whitespace check, and production build passed during implementation. Final checks are recorded below.
- Design detector: no findings.
- Screenshots and logs: /Users/oliver/agent-runs/2026-10-27-learning-ui-redesign/.

## Status and boundaries

Implementation is local. No commit, PR, merge, push, or deployment performed.

Legacy graph extraction requires an adapter or kit conversion. Live model-authored demo generation, physical touch/mobile keyboards, hosted authenticated production, and packaged Electron acceptance are not covered by the isolated browser checks. No native window configuration changed.

## Final verification

- Final production build: passed (kit build and Next production build).
- Full isolated suite: 2451 tests passed, 0 failed; final log is in the evidence directory.
- Typecheck, lint, and git diff --check: passed.
- Browser regression additionally verifies Plotly camera retention, running playback through expansion, answer draft retention, modal Tab containment, no Escape-to-abort leak, and footer visibility at 390×500.
- Fixed two interaction findings during verification: graph focus no longer invokes the older navigation handler that folded the answer area; delayed iframe focus restoration no longer steals focus from an answer the learner has started typing.
- Desktop, mobile, and expanded-graph screenshots use an isolated synthetic session. No model calls or production data changes were made.

## Local review session and message scrollbar, 2026-10-27

- Created local session `chat_mvqww055_0268ad6e`, titled "UI review · Gradient descent", using the existing chat store. Includes a live 3D quadratic loss surface with a descent path, a loss-history chart, an update-flow diagram, editable parameters, and a free-text question referencing the demo. No model generation or external service was used.
- Disabled horizontal scrolling on `.prompt-input` while retaining wrapping and vertical scrolling. The supplied scrollbar was not reproduced in headless Chrome before the change; the explicit horizontal-overflow rule prevents it across these input surfaces.
- Verified against the running local server: demo opens automatically, all five panels load, Step advances the simulation, graph expansion and Escape work, and long unbroken input wraps without horizontal overflow at 390px and 1440px while vertical scrolling remains available. No page errors. Whitespace check passed.
- Local review URL: http://127.0.0.1:3000/chat/chat_mvqww055_0268ad6e. Model setup is still required to submit an answer; the demo itself runs without it.

### Review correction: floating answer composer (2026-10-27)

Oliver approved moving the question into the lesson, leaving only the answer input floating. Question text, answer choices, confidence controls, demo reference, and model setup notice now scroll with the lesson. The composer overlays the bottom without a divider or opaque footer band; its measured height reserves enough tail space to reach the last content. Normal answer input and drafts remain.

Demo expand, brightness, and download actions are icons in the workspace title row. Model/usage uses a labeled sliders icon. Removed horizontal separators in the session header, lesson steps, question controls, and demo header; sidebar boundaries remain. Escape restores focus to the header opener even when its portal has been recreated.

Verification: typecheck and lint passed; diff whitespace check passed; 110 focused tests passed. Live desktop (1440) and mobile (390) checks confirmed question placement, floating composer, matching tail reservation, no horizontal overflow, and header focus return. Browser regression covers kit/legacy iframe continuity, all three graph renderer focus modes, parameter/simulation/camera state, Escape, draft retention, reference reopening, mobile/short viewport, and reduced motion. Removed a stale test wait for animation frames in an inactive hidden iframe.

Evidence: ~/agent-runs/2026-10-27-learning-ui-redesign/floating-1440.png, floating-390.png, floating-tests.log, floating-browser-final.log.
Implementation is local; no commit, merge, or deployment. Review session remains chat_mvqww055_0268ad6e. Sending answers still requires local model configuration.
