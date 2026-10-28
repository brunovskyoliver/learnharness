# Quickstart: verify feature 004

1. Seed isolated data (golden + review + a lesson with answers at several levels, including wrong at Certain). Production build, `next start` on the isolated `LH_DATA_DIR`.
2. Home shows "Calibration" between "Waiting for you" and the knowledge graph: one line per used level in order Guessing → Certain, "{Level} · {n} answers · {r} right ({p}%)", no percent under 5 answers.
3. "Wrong while Certain" lists the newest 5 with question line, session title, time; "Show all {n}" expands in place.
4. A miss opens its session scrolled to the teacher message before the check.
5. A data dir with no graded answers: no Calibration section.
6. 320/390/1440 px, keyboard, focus.
7. Hosted record (read-only over ssh): Certain 61 answers / 51 right; Unsure 1 / 0; 10 misses.
8. `npm test && npm run lint && npm run typecheck && npm run build`.
