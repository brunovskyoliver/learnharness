/** Feature 024 mode switch: where each mode reopens, the toggle binding, the
 *  palette action, and the client switch that writes `general.interface`
 *  (and Notebook's `lastNoteId`) without clobbering the rest of a section. */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
	actionForBinding, bindingForAction, interfaceOfPath, isNotebookPath, KEYBOARD_ACTIONS, notebookHref, otherInterface, paletteActions,
	STUDY_LAST_PATH_KEY, studyReturnPath,
} from "../src/core/index.ts";
import { rememberStudyPath, switchInterface, writeSettingsKey } from "../components/interface-switch.ts";

describe("paths", () => {
	it("tells Notebook paths from Study ones", () => {
		assert.equal(isNotebookPath("/notebook"), true);
		assert.equal(isNotebookPath("/notebook/lib_1"), true);
		assert.equal(isNotebookPath("/notebooks"), false);
		assert.equal(isNotebookPath("/library/notebook"), false);
		assert.equal(interfaceOfPath("/chat/x"), "study");
		assert.equal(otherInterface("study"), "notebook");
		assert.equal(otherInterface("notebook"), "study");
	});

	it("Study reopens at its last same-origin, non-Notebook path; Home otherwise", () => {
		assert.equal(studyReturnPath("/chat/abc?x=1"), "/chat/abc?x=1");
		assert.equal(studyReturnPath(null), "/");
		assert.equal(studyReturnPath("//evil.example"), "/");
		assert.equal(studyReturnPath("https://evil.example"), "/");
		assert.equal(studyReturnPath("/notebook/lib_1"), "/");
		assert.equal(studyReturnPath(`/${"a".repeat(2001)}`), "/");
		assert.equal(notebookHref(), "/notebook");
		assert.equal(notebookHref("lib 1"), "/notebook/lib%201");
	});
});

describe("entry points", () => {
	it("Mod+Shift+O toggles, and nothing else claims it", () => {
		assert.equal(bindingForAction("toggle-interface"), "mod+shift+o");
		assert.equal(actionForBinding("mod+shift+o"), "toggle-interface");
		assert.equal(KEYBOARD_ACTIONS.filter((a) => a.binding === "mod+shift+o").length, 1);
	});

	it("the palette offers Switch to Notebook everywhere in Study", () => {
		for (const [inSession, inLesson] of [[false, false], [true, false], [true, true]] as const) {
			const entry = paletteActions(inSession, inLesson).find((e) => e.kind === "action" && e.action === "switch-to-notebook");
			assert.ok(entry, `present (session ${inSession}, lesson ${inLesson})`);
			assert.equal(entry.label, "Switch to Notebook");
		}
	});
});

describe("the client switch", () => {
	type Call = { url: string; method: string; body?: unknown };
	const storage = new Map<string, string>();
	let calls: Call[] = [];
	let record: Record<string, unknown> = {};
	let putOk = true;
	let open: Response | null = null;
	const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch };
	const realFetch = g.fetch;
	const install = () => {
		storage.clear();
		calls = [];
		putOk = true;
		open = null;
		g.window = { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) } };
		g.fetch = (async (url: string, init?: RequestInit) => {
			const method = init?.method ?? "GET";
			calls.push({ url, method, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
			if (method === "GET") return Response.json({ settings: record });
			if (url === "/api/notebook/open") return open ?? Response.json({ error: "no" }, { status: 500 });
			return putOk ? Response.json({ ok: true }) : Response.json({ error: "no" }, { status: 400 });
		}) as typeof fetch;
	};
	afterEach(() => { g.fetch = realFetch; delete g.window; });

	it("to Notebook: saves interface, keeps the rest of general, then goes to /notebook when the note is not known", async () => {
		install();
		record = { version: 1, general: { autoUpdate: false } };
		const went: string[] = [];
		assert.equal(await switchInterface("notebook", (href) => went.push(href)), true);
		assert.deepEqual(calls.find((c) => c.method === "PUT"), { url: "/api/settings/general", method: "PUT", body: { autoUpdate: false, interface: "notebook" } });
		assert.deepEqual(went, ["/notebook"]);
	});

	it("to Notebook: goes straight to the note bare /notebook opens (no redirect, feature 028)", async () => {
		install();
		record = { version: 1 };
		open = Response.json({ href: "/notebook/lib_last" });
		const went: string[] = [];
		assert.equal(await switchInterface("notebook", (href) => went.push(href)), true);
		assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), ["GET /api/settings", "PUT /api/settings/general", "POST /api/notebook/open"]);
		assert.deepEqual(went, ["/notebook/lib_last"]);
	});

	it("to Notebook: an answer that is not a note address falls back to /notebook", async () => {
		install();
		record = { version: 1 };
		open = Response.json({ href: "https://evil.example/notebook/x" });
		const went: string[] = [];
		await switchInterface("notebook", (href) => went.push(href));
		assert.deepEqual(went, ["/notebook"]);
	});

	it("to Study: returns to the remembered path", async () => {
		install();
		record = { version: 1 };
		rememberStudyPath("/library?view=recent");
		assert.equal(storage.get(STUDY_LAST_PATH_KEY), "/library?view=recent");
		const went: string[] = [];
		await switchInterface("study", (href) => went.push(href));
		assert.deepEqual(calls.at(-1)?.body, { interface: "study" });
		assert.deepEqual(went, ["/library?view=recent"]);
	});

	it("a failed save does not navigate", async () => {
		install();
		record = { version: 1 };
		putOk = false;
		const went: string[] = [];
		const errors = console.error;
		console.error = () => {};
		try {
			assert.equal(await switchInterface("notebook", (href) => went.push(href)), false);
		} finally {
			console.error = errors;
		}
		assert.deepEqual(went, []);
	});

	it("Notebook's lastNoteId write keeps the notebook section's other keys, reviewers included", async () => {
		install();
		const reviewers = [{ id: "plain", name: "Plain reader", instructions: "" }];
		record = { version: 1, notebook: { layout: "right", reviewers, lastNoteId: "lib_old" } };
		assert.equal(await writeSettingsKey("notebook", { lastNoteId: "lib_new" }), true);
		assert.deepEqual(calls.at(-1), { url: "/api/settings/notebook", method: "PUT", body: { layout: "right", reviewers, lastNoteId: "lib_new" } });
	});
});
