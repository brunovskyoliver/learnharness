import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionForBinding, bindingForAction, buildPaletteEntries, commandPaletteDefers, KEYBOARD_ACTIONS, paletteActions, rankPalette, type LibraryFolder, type LibraryItem } from "../src/core/index.ts";

const item = (id: string, name: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({ id, name, kind: "page", size: 1, createdAt: "", updatedAt: "", origin: { type: "learner" }, ...extra }) as LibraryItem;
const folder = (id: string, name: string, parentId: string | null = null, extra: Partial<LibraryFolder> = {}): LibraryFolder => ({ id, name, parentId, createdAt: "", updatedAt: "", ...extra });

const entries = buildPaletteEntries({
	inSession: false,
	chats: [{ id: "c1", title: "Fourier transforms", kind: "teach" }, { id: "c2", title: "Fourier drills", kind: "practice" }],
	items: [item("i1", "Wave notes", { folderId: "f2", tags: ["exam"] }), item("i2", "Old notes", { archivedAt: "x" })],
	folders: [folder("f1", "Physics"), folder("f2", "Waves", "f1"), folder("f3", "Attic", null, { archivedAt: "x" })],
});
const ids = (query: string) => rankPalette(entries, query).flatMap((group) => group.entries.map((entry) => entry.id));

describe("the palette's entries", () => {
	it("offers every approved action", () => {
		const labels = paletteActions(false).map((entry) => entry.label);
		for (const label of ["New lesson", "New practice", "New page", "Open settings", "Open Library", "Open Library favorites", "Open Library recent", "Open Library archive", "Open Library trash"]) assert.ok(labels.includes(label), label);
	});
	it("offers the model selector only where a composer answers it", () => {
		assert.ok(!paletteActions(false).some((entry) => entry.label === "Choose a model"));
		assert.ok(paletteActions(true).some((entry) => entry.label === "Choose a model"));
	});
	it("leaves archived entries to the Archive view", () => {
		assert.ok(!entries.some((entry) => entry.id === "item:i2" || entry.id === "folder:f3"));
	});
	it("says what and where in the meta line", () => {
		const note = entries.find((entry) => entry.id === "item:i1")!;
		assert.equal(note.meta, "Page · Physics / Waves");
		assert.equal(entries.find((entry) => entry.id === "folder:f2")!.meta, "Folder · Physics");
		assert.equal(entries.find((entry) => entry.id === "chat:c2")!.meta, "Practice");
	});
});

describe("ranking", () => {
	it("groups with no query, each list short", () => {
		const many = buildPaletteEntries({ inSession: false, chats: Array.from({ length: 20 }, (_, i) => ({ id: String(i), title: `s${i}` })), items: [], folders: [] });
		const groups = rankPalette(many, "  ");
		assert.deepEqual(groups.map((group) => group.label), ["Actions", "Sessions"]);
		assert.equal(groups[1]!.entries.length, 6);
	});
	it("ranks one list across types, by fuzzyScore", () => {
		assert.equal(rankPalette(entries, "wave").length, 1);
		assert.equal(ids("waves")[0], "folder:f2", "exact name first");
		assert.deepEqual(ids("fourier").sort(), ["chat:c1", "chat:c2"]);
	});
	it("needs every token to match some field", () => {
		assert.deepEqual(ids("fourier practice"), ["chat:c2"]);
		assert.deepEqual(ids("notes exam"), ["item:i1"], "tags are searched");
		assert.deepEqual(ids("nothing here"), []);
	});
	it("finds actions by word", () => {
		assert.equal(ids("new lesson")[0], "action:new-lesson");
		assert.ok(ids("deleted").includes("action:library-trash"));
	});
});

describe("Mod+K", () => {
	it("is the palette, and the model selector moved", () => {
		assert.equal(actionForBinding("mod+k"), "command-palette");
		assert.equal(bindingForAction("open-model-picker"), "mod+shift+k");
		assert.equal(actionForBinding("mod+shift+k"), "open-model-picker");
	});
	it("no two actions share a default binding", () => {
		const bindings = KEYBOARD_ACTIONS.filter((action) => !action.displayOnly).map((action) => action.binding);
		assert.equal(new Set(bindings).size, bindings.length);
	});
	it("a saved override still on mod+k doesn't take the palette's key", () => {
		const storage = globalThis as { window?: unknown };
		const previous = storage.window;
		storage.window = { localStorage: { getItem: () => JSON.stringify({ "open-model-picker": "mod+k" }) } };
		try {
			assert.equal(actionForBinding("mod+k"), "command-palette");
		} finally {
			storage.window = previous;
		}
	});
	it("defers to the page editor, dialogs and menus", () => {
		const within = (...match: string[]) => ({ closest: (selector: string) => (match.some((m) => selector.includes(m)) ? {} : null) });
		for (const marker of ["[data-page-editor]", '[role="dialog"]', "dialog:modal", "[data-lh-menu]"]) assert.equal(commandPaletteDefers(within(marker)), true, marker);
		assert.equal(commandPaletteDefers(within()), false);
		assert.equal(commandPaletteDefers(null), false);
		assert.equal(commandPaletteDefers({}), false, "window as the target");
	});
});
