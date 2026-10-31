import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatIdOfPath, closeTab, folderTreeRows, itemTab, MAX_WORKSPACE_TABS, openTab, parseTabs, reconcileItemTabs, reconcileSessionTabs, selectedTabId, sessionTab, sessionTabId, tabRef, type LibraryFolder, type WorkspaceTab } from "../src/core/index.ts";

const lesson = (id: string, title = id) => sessionTab(id, title, "teach");
const page = (id: string, name = id) => itemTab({ id, name, kind: "page", size: 3 });
const folder = (id: string, parentId: string | null, extra: Partial<LibraryFolder> = {}): LibraryFolder => ({ id, name: id, parentId, createdAt: "", updatedAt: "", ...extra });

describe("workspace tabs", () => {
	it("names the session a path shows, and only a session", () => {
		assert.equal(chatIdOfPath("/chat/abc"), "abc");
		assert.equal(chatIdOfPath("/chat/a%20b"), "a b");
		for (const path of ["/", "/library", "/chat/new", "/chat/abc/more"]) assert.equal(chatIdOfPath(path), null, path);
		assert.equal(chatIdOfPath("/chat/%E0%A4%A"), null, "a malformed path is no session");
	});

	it("opens at the end and retitles in place", () => {
		const tabs = openTab(openTab([], lesson("a")), page("b"));
		assert.deepEqual(tabs.map((t) => t.id), ["chat:a", "item:b"]);
		const renamed = openTab(tabs, lesson("a", "New name"));
		assert.deepEqual(renamed.map((t) => t.title), ["New name", "b"]);
		assert.equal(openTab(renamed, lesson("a", "New name")), renamed, "no change keeps identity");
	});

	it("makes room from the oldest tab that isn't on screen", () => {
		let tabs: WorkspaceTab[] = [];
		for (let i = 0; i < MAX_WORKSPACE_TABS; i++) tabs = openTab(tabs, lesson(String(i)));
		const next = openTab(tabs, lesson("new"), ["chat:0"]);
		assert.equal(next.length, MAX_WORKSPACE_TABS);
		assert.ok(next.some((t) => t.id === "chat:0"), "on-screen tab kept");
		assert.ok(!next.some((t) => t.id === "chat:1"), "oldest off-screen tab went");
		assert.equal(next.at(-1)!.id, "chat:new");
	});

	it("closes to the nearest session, and reports where focus goes", () => {
		const tabs = [lesson("a"), page("p"), lesson("b"), lesson("c")];
		const closed = closeTab(tabs, "chat:b");
		assert.deepEqual(closed.tabs.map((t) => t.id), ["chat:a", "item:p", "chat:c"]);
		assert.equal(closed.neighbour?.id, "chat:c");
		assert.equal(closed.focus?.id, "chat:c");
		assert.equal(closeTab([lesson("a"), page("p")], "chat:a").neighbour, null, "an item is not a place to land a session");
		assert.equal(closeTab(tabs, "chat:c").neighbour?.id, "chat:b", "the left neighbour when the last closes");
		assert.equal(closeTab(tabs, "chat:missing").neighbour, null);
	});

	it("reads saved tabs defensively", () => {
		assert.deepEqual(parseTabs("nope"), []);
		assert.deepEqual(parseTabs(null), []);
		const tabs = parseTabs([lesson("a"), lesson("a"), page("p"), { id: "chat:b" }, { id: "x:1", kind: "lesson", title: "t" }, { id: "chat:", kind: "lesson", title: "empty" }, null, { id: "item:q", kind: "item", title: "no kind" }]);
		assert.deepEqual(tabs.map((t) => t.id), ["chat:a", "item:p"]);
		const many = Array.from({ length: MAX_WORKSPACE_TABS + 3 }, (_, i) => lesson(String(i)));
		assert.equal(parseTabs(many).length, MAX_WORKSPACE_TABS);
		assert.equal(tabRef(page("p:with:colons")), "p:with:colons");
	});

	it("follows the session list, keeping the session on screen", () => {
		const tabs = [lesson("a"), lesson("gone"), lesson("new"), page("p")];
		const next = reconcileSessionTabs(tabs, [{ id: "a", title: "Renamed", kind: "practice" }], "new");
		assert.deepEqual(next.map((t) => [t.id, t.title, t.kind]), [["chat:a", "Renamed", "practice"], ["chat:new", "new", "lesson"], ["item:p", "p", "item"]]);
		const same = [lesson("a", "A")];
		assert.equal(reconcileSessionTabs(same, [{ id: "a", title: "A" }], null), same, "no change keeps identity");
	});

	it("follows the catalog, keeping the item open in the pane", () => {
		const tabs = [page("a"), page("gone"), page("open"), lesson("s")];
		const next = reconcileItemTabs(tabs, [{ id: "a", name: "Renamed", kind: "page", size: 9 }], "open");
		assert.deepEqual(next.map((t) => [t.id, t.title]), [["item:a", "Renamed"], ["item:open", "open"], ["chat:s", "s"]]);
	});

	it("selects the most recent of what is on screen", () => {
		const tabs = [lesson("a"), page("p")];
		assert.equal(selectedTabId(tabs, [sessionTabId("a"), "item:p"], "item:p"), "item:p");
		assert.equal(selectedTabId(tabs, [sessionTabId("a"), "item:p"], "chat:other"), "chat:a");
		assert.equal(selectedTabId(tabs, [null, null], "chat:a"), null, "a tab not on screen is not selected");
		assert.equal(selectedTabId([], ["chat:a"], null), null);
	});
});

describe("the sidebar's folder tree", () => {
	const folders = [folder("b", null), folder("a", null), folder("a2", "a"), folder("a1", "a"), folder("deep", "a1")];

	it("lists by name, showing children only under an open parent", () => {
		assert.deepEqual(folderTreeRows(folders, new Set()).map((r) => r.folder.id), ["a", "b"]);
		const rows = folderTreeRows(folders, new Set(["a", "a1"]));
		assert.deepEqual(rows.map((r) => [r.folder.id, r.depth]), [["a", 1], ["a1", 2], ["deep", 3], ["a2", 2], ["b", 1]]);
		assert.equal(rows[0]!.hasChildren, true);
		assert.equal(rows[0]!.expanded, true);
		assert.equal(rows.at(-1)!.hasChildren, false);
	});

	it("leaves archived folders to the Archive view", () => {
		const rows = folderTreeRows([folder("a", null, { archivedAt: "x" }), folder("child", "a"), folder("b", null)], new Set());
		assert.deepEqual(rows.map((r) => r.folder.id), ["b", "child"], "a child of an archived folder reads as top level");
	});

	it("never spins on a damaged catalog", () => {
		assert.deepEqual(folderTreeRows([folder("x", "y"), folder("y", "x")], new Set(["x", "y"])), []);
	});
});
