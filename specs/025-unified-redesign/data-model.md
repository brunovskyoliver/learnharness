# Data model: Unified redesign

No new stored data. One read-time resolution.

## Shared Appearance (read model)

| Field | Values | Source (first present wins) |
| --- | --- | --- |
| theme | system, light, dark | `notebook.appearance` on disk → `appearance.mode` on disk (dark/light) → `system` |
| textSize | small, default, large | `notebook.textSize` → `default` |
| lettering | serif, plain | `notebook.lettering` → `serif` |
| ink | ink, gray, brown, red, orange, green, blue, purple | `notebook.ink` → `ink` |

"On disk" means the key is present in the stored settings record, not the factory default (`readSettingsRecord()`, not `effectiveSettings()`), so the legacy seed applies only until he picks a theme. Writes go through the existing `PUT /api/settings/notebook`.

## Retired from styling (kept on disk, never deleted or rewritten)

`appearance.mode` (except the seed above), `appearance.background`, `appearance.fontFamily`, `appearance.proseFontSize`, `appearance.sessionNameSerif`, `appearance.mdRendering.*`. The settings API still accepts and validates them, so an older build reading the same data dir keeps working (rollback-safe).

## Browser storage

`lh:sidebar-open` and `lh:sidebar-width` are no longer read (the sidebar is an overlay). Not removed.
