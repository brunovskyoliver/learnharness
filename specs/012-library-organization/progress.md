# Features 012-013: Library organization and views
Stage: done
Updated: 2026-10-31

## Log
- Store, API, UI. `tests/library-organization.test.ts`, `tests/library-filter.test.ts`; `scripts/check-library-folders-ui.mjs` extended (menus, tags, archive, drag, bulk, grid, trash, restore) at 1440, 390, 320: pass.
- `?view=__proto__` bug found by the new test and fixed with `Object.hasOwn`.
- Full suite: 3435 pass, 0 fail, 27 skipped. tsc and eslint clean. `tests/chatgpt-auth.test.ts` failed once under load earlier and passed on all 4 reruns: recorded as a flake, not caused by this work.
