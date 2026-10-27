/**
 * The dock shell's variant key — the WAAPI height-morph trigger. Pinned
 * after the practice-fold fix (owner, 2026-10-06): the expanded term
 * belongs to every docked variant, so a practice dock's fold/unfold
 * morphs exactly like a teaching question's. Before the fix the key
 * read `pending ? expanded : "-"` — pending is null in practice, the
 * key never changed on the fold, and the practice dock's height jumped
 * instantly between form and bar while teaching morphed.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dockStateKey, nextDockExpanded } from "../components/dock-state-key.ts";

describe("dockStateKey (the height-morph trigger)", () => {
	it("a docked variant carries its fold state — practice included", () => {
		assert.equal(dockStateKey("practice:call_p1", true, true), "practice:call_p1:true");
		assert.equal(dockStateKey("practice:call_p1", true, false), "practice:call_p1:false");
		assert.equal(dockStateKey("question:call_q1", true, true), "question:call_q1:true");
		assert.equal(dockStateKey("question:call_q1", true, false), "question:call_q1:false");
	});

	it("the fold toggling the key is what animates: same variant + same fold = same key (typing growth never morphs)", () => {
		assert.equal(
			dockStateKey("practice:call_p1", true, true),
			dockStateKey("practice:call_p1", true, true),
		);
		assert.notEqual(
			dockStateKey("practice:call_p1", true, true),
			dockStateKey("practice:call_p1", true, false),
		);
	});

	it("the persistent ordinary composer also morphs when folded", () => {
		assert.equal(dockStateKey("chat", false, true), "chat:true");
		assert.equal(dockStateKey("chat", false, false), "chat:false");
	});
});


describe("reading-history fold state", () => {
	const state = { expanded: true, distance: 150, direction: "up" as const, editing: false, composing: false };
	it("collapses beyond 96px and stays compact until the final 16px", () => {
		assert.equal(nextDockExpanded({ ...state, distance: 96 }), true);
		assert.equal(nextDockExpanded(state), false);
		assert.equal(nextDockExpanded({ ...state, expanded: false, direction: "down", distance: 17 }), false);
		assert.equal(nextDockExpanded({ ...state, expanded: false, direction: "down", distance: 16 }), true);
	});
	it("focus, composition, and an explicit expansion protect the editable surface", () => {
		for (const protection of [{ editing: true }, { composing: true }, { explicitExpansion: true }]) {
			assert.equal(nextDockExpanded({ ...state, ...protection }), true);
			assert.equal(nextDockExpanded({ ...state, expanded: false, ...protection }), true);
		}
	});
	it("layout-only movement and transcript growth do not fold the composer", () => {
		assert.equal(nextDockExpanded({ ...state, direction: "none" }), true);
		assert.equal(nextDockExpanded({ ...state, direction: "down" }), true);
	});
});
