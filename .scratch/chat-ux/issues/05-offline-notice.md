# Offline notice and draft safety

## Findings

- No code reads `navigator.onLine` or listens for `online`/`offline`.
- Drafts already survive navigation and reload (session-state store). A send while offline fails into the generic error box.

## Proposed change

- Listen to `online`/`offline`. While offline, show a small notice above the composer: "You're offline. Your draft is kept." Disable Send with that reason as its accessible description. Do not auto-send on reconnect, since a send starts a paid model call.
- On reconnect, hide the notice; the existing reattach/sync paths refresh the session.

## Decisions (Oliver, 2026-10-27)

- Send disabled while offline with notice "You're offline. Your draft is kept." Nothing auto-sends on reconnect.

## Verification

- Unit test of the hook; browser with DevTools offline: notice appears, draft kept, Send disabled, back online restores; mobile layout with the compact composer.
