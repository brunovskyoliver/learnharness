/**
 * Notebook settings (feature 024, T004): `general.interface` and the
 * `notebook` section — factory defaults, the lenient read side, the
 * strict PUT parser, resolution and the seeded reviewers.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_REVIEWER_ID,
	FACTORY_SETTINGS,
	SEEDED_REVIEWERS,
	resolveReviewer,
	sanitizeUserSettings,
} from "../src/core/settings.ts";
import { resolveSettings } from "../src/core/settings-resolution.ts";
import { parseGeneralSettingsBody, parseNotebookSettingsBody } from "../src/server/settings-body.ts";

const SEED_IDS = ["plain", "examiner", "editor", "sceptic", "professor"];

describe("seeded reviewers", () => {
	it("ship in order with the exact ids, names and instructions", () => {
		assert.deepEqual(
			SEEDED_REVIEWERS.map((r) => ({ ...r })),
			[
				{ id: "plain", name: "Plain reader", instructions: "", seeded: true },
				{
					id: "examiner",
					name: "Examiner",
					instructions: "Reads like the person grading this. Asks what you'd be asked, never gives the answer.",
					seeded: true,
				},
				{
					id: "editor",
					name: "Editor",
					instructions: "Cares about clarity and structure. Points at the sentence that loses the reader.",
					seeded: true,
				},
				{ id: "sceptic", name: "Sceptic", instructions: "Disagrees with your premise and makes you defend it.", seeded: true },
				{
					id: "professor",
					name: "Professor",
					instructions: "Checks the reasoning step by step and asks for the missing one.",
					seeded: true,
				},
			],
		);
		assert.equal(DEFAULT_REVIEWER_ID, "plain");
	});

	it("are frozen so no caller can edit the factory list", () => {
		assert.ok(Object.isFrozen(SEEDED_REVIEWERS));
		assert.ok(SEEDED_REVIEWERS.every((r) => Object.isFrozen(r)));
	});

	it("resolveReviewer: known id, else Plain reader, else the first, else null", () => {
		const list = SEEDED_REVIEWERS.map((r) => ({ ...r }));
		assert.equal(resolveReviewer(list, "sceptic")?.id, "sceptic");
		assert.equal(resolveReviewer(list, undefined)?.id, "plain");
		assert.equal(resolveReviewer(list, "gone")?.id, "plain");
		const noPlain = list.filter((r) => r.id !== "plain");
		assert.equal(resolveReviewer(noPlain, "gone")?.id, "examiner");
		assert.equal(resolveReviewer([], "plain"), null);
	});
});

describe("factory and resolution", () => {
	it("factory: Study interface and the data-model notebook defaults", () => {
		assert.equal(FACTORY_SETTINGS.general.interface, "study");
		const { reviewers, ...rest } = FACTORY_SETTINGS.notebook;
		assert.deepEqual(rest, {
			startMode: "thinks",
			pointerInk: false,
			pace: "regular",
			layout: "both",
			appearance: "system",
			textSize: "default",
			lettering: "serif",
			ink: "ink",
		});
		assert.deepEqual(reviewers.map((r) => r.id), SEED_IDS);
	});

	it("null record resolves every notebook knob and the seeded reviewers", () => {
		const eff = resolveSettings(null);
		assert.equal(eff.general.interface, "study");
		assert.deepEqual(eff.notebook, {
			startMode: "thinks",
			pointerInk: false,
			pace: "regular",
			layout: "both",
			appearance: "system",
			textSize: "default",
			lettering: "serif",
			ink: "ink",
			reviewers: SEEDED_REVIEWERS.map((r) => ({ ...r })),
			lastNoteId: null,
		});
	});

	it("resolved reviewers are a fresh copy (mutation never reaches the factory)", () => {
		const eff = resolveSettings(null);
		eff.notebook.reviewers[0]!.name = "Changed";
		eff.notebook.reviewers.pop();
		assert.equal(SEEDED_REVIEWERS[0]!.name, "Plain reader");
		assert.equal(resolveSettings(null).notebook.reviewers.length, 5);
	});

	it("explicit values win; an empty stored list stays empty (deleting seeded ones sticks)", () => {
		const eff = resolveSettings({
			version: 1,
			general: { interface: "notebook" },
			notebook: {
				startMode: "ask",
				pointerInk: true,
				pace: "slow",
				layout: "marks",
				appearance: "dark",
				textSize: "large",
				lettering: "plain",
				ink: "blue",
				reviewers: [],
				lastNoteId: "page_1",
			},
		});
		assert.equal(eff.general.interface, "notebook");
		assert.equal(eff.general.autoUpdate, true, "other general keys keep their defaults");
		assert.deepEqual(eff.notebook, {
			startMode: "ask",
			pointerInk: true,
			pace: "slow",
			layout: "marks",
			appearance: "dark",
			textSize: "large",
			lettering: "plain",
			ink: "blue",
			reviewers: [],
			lastNoteId: "page_1",
		});
	});

	it("a stored list without one seeded reviewer keeps it deleted", () => {
		const kept = SEEDED_REVIEWERS.filter((r) => r.id !== "sceptic").map((r) => ({ ...r }));
		const eff = resolveSettings({ version: 1, notebook: { reviewers: kept } });
		assert.deepEqual(eff.notebook.reviewers.map((r) => r.id), ["plain", "examiner", "editor", "professor"]);
	});
});

describe("sanitizeUserSettings (read side, lenient)", () => {
	it("keeps valid notebook fields and the interface", () => {
		const out = sanitizeUserSettings({
			version: 1,
			general: { autoUpdate: false, interface: "notebook" },
			notebook: { layout: "right", ink: "green", lastNoteId: "p" },
		});
		assert.deepEqual(out?.general, { autoUpdate: false, interface: "notebook" });
		assert.deepEqual(out?.notebook, { layout: "right", ink: "green", lastNoteId: "p" });
	});

	it("drops bad values field by field; they resolve to the factory", () => {
		const out = sanitizeUserSettings({
			version: 1,
			general: { interface: "classic" },
			notebook: {
				startMode: "always",
				pointerInk: "yes",
				pace: 3,
				layout: "left",
				appearance: "sepia",
				textSize: "huge",
				lettering: "script",
				ink: "gray",
				lastNoteId: "",
				reviewers: "all",
			},
		});
		assert.deepEqual(out?.general, {});
		assert.deepEqual(out?.notebook, {});
		const eff = resolveSettings(out);
		assert.equal(eff.general.interface, "study");
		assert.equal(eff.notebook.ink, "ink");
		assert.deepEqual(eff.notebook.reviewers.map((r) => r.id), SEED_IDS, "non-array reviewers → seeded list");
	});

	it("drops bad reviewers one by one and keeps the first of a repeated id", () => {
		const out = sanitizeUserSettings({
			version: 1,
			notebook: {
				reviewers: [
					{ id: "a", name: "Ada", instructions: "Be brief." },
					{ id: "a", name: "Dupe", instructions: "" },
					{ id: "bad id!", name: "X", instructions: "" },
					{ id: "b", name: "   ", instructions: "" },
					{ id: "c", name: "x".repeat(61), instructions: "" },
					{ id: "d", name: "Dee", instructions: "x".repeat(2001) },
					{ id: "e", name: "Eve", instructions: "", seeded: false },
					{ id: "f", name: "Fay", instructions: "", seeded: true, extra: 1 },
					null,
				],
			},
		});
		assert.deepEqual(out?.notebook?.reviewers, [
			{ id: "a", name: "Ada", instructions: "Be brief." },
			{ id: "f", name: "Fay", instructions: "", seeded: true },
		]);
	});

	it("preserves unknown top-level keys and keeps version 1", () => {
		const out = sanitizeUserSettings({ version: 1, notebook: { ink: "red" }, futureThing: { a: 1 } });
		assert.equal(out?.version, 1);
		assert.deepEqual(out?.futureThing, { a: 1 });
	});
});

describe("PUT parsers (write side, strict)", () => {
	it("general.interface: study or notebook, anything else is a 400", () => {
		assert.deepEqual(parseGeneralSettingsBody({ interface: "notebook" }), { ok: true, settings: { interface: "notebook" } });
		assert.deepEqual(parseGeneralSettingsBody({ autoUpdate: true, interface: "study" }), {
			ok: true,
			settings: { autoUpdate: true, interface: "study" },
		});
		const bad = parseGeneralSettingsBody({ interface: "classic" });
		assert.equal(bad.ok, false);
		if (!bad.ok) assert.match(bad.error, /interface must be one of study, notebook/);
	});

	it("notebook: the full section parses; unknown body keys drop", () => {
		const r = parseNotebookSettingsBody({
			startMode: "ask",
			pointerInk: true,
			pace: "slow",
			layout: "right",
			appearance: "light",
			textSize: "small",
			lettering: "plain",
			ink: "purple",
			lastNoteId: "page_9",
			reviewers: [{ id: "plain", name: "Plain reader", instructions: "", seeded: true }],
			junk: 1,
		});
		assert.deepEqual(r, {
			ok: true,
			settings: {
				startMode: "ask",
				pointerInk: true,
				pace: "slow",
				layout: "right",
				appearance: "light",
				textSize: "small",
				lettering: "plain",
				ink: "purple",
				lastNoteId: "page_9",
				reviewers: [{ id: "plain", name: "Plain reader", instructions: "", seeded: true }],
			},
		});
		assert.deepEqual(parseNotebookSettingsBody({}), { ok: true, settings: {} });
	});

	it("notebook: every bad field is a 400 that names the problem", () => {
		const cases: [unknown, RegExp][] = [
			[null, /Invalid JSON body/],
			[[], /Invalid JSON body/],
			[{ startMode: "always" }, /startMode must be one of thinks, ask/],
			[{ pace: "fast" }, /pace must be one of regular, slow/],
			[{ layout: "left" }, /layout must be one of both, right, marks/],
			[{ appearance: "sepia" }, /appearance must be one of system, light, dark/],
			[{ textSize: "huge" }, /textSize must be one of small, default, large/],
			[{ lettering: "script" }, /lettering must be one of serif, plain/],
			[{ ink: "gray" }, /ink must be one of ink, blue, green, red, purple, brown, orange/],
			[{ pointerInk: "on" }, /pointerInk must be a boolean/],
			[{ lastNoteId: "" }, /lastNoteId must be a non-empty string/],
			[{ reviewers: {} }, /reviewers must be an array/],
			[{ reviewers: [{ id: "", name: "A", instructions: "" }] }, /reviewers\[0\]: id must be/],
			[{ reviewers: [{ id: "a", name: " ", instructions: "" }] }, /reviewers\[0\]: name must be 1-60 characters/],
			[{ reviewers: [{ id: "a", name: "A", instructions: "x".repeat(2001) }] }, /reviewers\[0\]: instructions must be/],
			[{ reviewers: [{ id: "a", name: "A", instructions: "", seeded: false }] }, /reviewers\[0\]: seeded must be true/],
			[
				{ reviewers: [{ id: "a", name: "A", instructions: "" }, { id: "a", name: "B", instructions: "" }] },
				/reviewers\[1\]: duplicate id "a"/,
			],
		];
		for (const [body, pattern] of cases) {
			const r = parseNotebookSettingsBody(body);
			assert.equal(r.ok, false, JSON.stringify(body));
			if (!r.ok) assert.match(r.error, pattern);
		}
	});

	it("notebook: boundary lengths pass (name 60, instructions 2000, empty list)", () => {
		const r = parseNotebookSettingsBody({
			reviewers: [{ id: "V1StGXR8_Z5jdHi6B-myT", name: "n".repeat(60), instructions: "i".repeat(2000) }],
		});
		assert.equal(r.ok, true);
		assert.deepEqual(parseNotebookSettingsBody({ reviewers: [] }), { ok: true, settings: { reviewers: [] } });
	});
});
