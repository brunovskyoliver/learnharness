/** The tab strip, folder tree, context pane and palette list, as SSR. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PaletteList } from "../components/command-palette-dialog.tsx";
import { TopBar } from "../components/top-bar.tsx";
import { LibraryContextBody, outlineLabel, SessionContextBody } from "../components/workspace/context-pane.tsx";
import { FolderTreeView } from "../components/workspace/sidebar-nav.tsx";
import { TabStripView } from "../components/workspace/tab-strip.tsx";
import { folderTreeRows, itemTab, paletteActions, sessionTab, type LibraryFolder, type LibraryItem } from "../src/core/index.ts";

const noop = () => {};
const tabs = [sessionTab("a", "Vectors", "teach"), sessionTab("b", "Drills", "practice"), itemTab({ id: "p", name: "Notes", kind: "page", size: 1 })];
const strip = (props: Partial<React.ComponentProps<typeof TabStripView>> = {}) => renderToStaticMarkup(<TabStripView tabs={tabs} selectedId="chat:b" shownIds={["chat:b"]} onActivate={noop} onClose={noop} {...props} />);
const folder = (id: string, parentId: string | null): LibraryFolder => ({ id, name: `Folder ${id}`, parentId, createdAt: "", updatedAt: "" });

describe("the tab strip", () => {
	it("is a roving tablist with one stop, on the selected tab", () => {
		const html = strip();
		assert.match(html, /role="tablist"/);
		assert.equal(html.match(/role="tab"/g)?.length, 3);
		assert.equal(html.match(/aria-selected="true"/g)?.length, 1);
		assert.equal(html.match(/tabindex="0"/g)?.length, 1);
		assert.match(html, /aria-selected="true"[^>]*tabindex="0"/);
	});
	it("moves the stop with focus, and falls back when there is no selection", () => {
		assert.match(strip({ focusId: "item:p" }), /tabindex="0"[^>]*data-tab-id="item:p"/);
		assert.match(strip({ selectedId: null }), /tabindex="0"[^>]*data-tab-id="chat:a"/);
	});
	it("names each close button for its tab, outside the walk", () => {
		const html = strip();
		for (const name of ["Vectors", "Drills", "Notes"]) assert.ok(html.includes(`aria-label="Close ${name}"`), name);
		assert.equal(html.match(/tabindex="-1"[^>]*aria-label="Close/g)?.length, 3);
	});
	it("says a tab is loading", () => {
		assert.match(strip({ pendingId: "chat:a" }), /aria-busy="true"/);
		assert.doesNotMatch(strip(), /aria-busy/);
	});
	it("keeps 44px targets on coarse pointers and never takes amber", () => {
		const html = strip();
		assert.ok(html.includes("pointer-coarse:size-11"));
		assert.ok(html.includes("pointer-coarse:h-12"));
		assert.ok(!html.includes("bg-primary") && !html.includes("text-primary"));
	});
	it("sits under the top bar's drag band, not in it", () => {
		const html = renderToStaticMarkup(<TopBar tabs />);
		assert.match(html, /<header[^>]*lh-drag/);
		assert.ok(!html.includes('role="tablist"'), "no workspace outside the shell, so no strip");
	});
});

describe("the folder tree", () => {
	const rows = folderTreeRows([folder("a", null), folder("b", "a"), folder("c", null)], new Set(["a"]));
	const html = renderToStaticMarkup(<FolderTreeView rows={rows} currentId="b" onToggle={noop} />);
	it("is a tree of links with levels and expansion", () => {
		assert.match(html, /role="tree"/);
		assert.equal(html.match(/role="treeitem"/g)?.length, 3);
		assert.match(html, /aria-level="2"/);
		assert.match(html, /aria-expanded="true"/);
		assert.ok(html.includes('href="/library?folder=b"'));
	});
	it("has one stop, on the current folder", () => {
		assert.equal(html.match(/tabindex="0"/g)?.length, 1);
		assert.match(html, /aria-current="page"/);
	});
});

describe("the context pane", () => {
	it("prefers the learner's words in the outline", () => {
		assert.equal(outlineLabel({ prompt: " Why? ", answer: "Because" }), "Why?");
		assert.equal(outlineLabel({ prompt: "", answer: "Because" }), "Because");
	});
	it("states an empty session outline, and lists demos", () => {
		const empty = renderToStaticMarkup(<SessionContextBody entries={[]} demos={[]} onJump={noop} onOpenDemo={noop} />);
		assert.ok(empty.includes("The outline fills in as the session goes."));
		assert.ok(!empty.includes("Demos"));
		const full = renderToStaticMarkup(<SessionContextBody entries={[{ id: "t", partId: "p", prompt: "Why?", answer: "" }]} demos={[{ id: "d", title: "Live demo" }]} onJump={noop} onOpenDemo={noop} />);
		assert.ok(full.includes("Why?") && full.includes("Live demo") && full.includes("Session outline"));
		assert.ok(!full.includes("iframe"), "the pane never carries a second iframe");
	});
	it("keeps loading, failed and loaded distinct for a Library place", () => {
		const body = (items: LibraryItem[] | null, failed = false) => renderToStaticMarkup(<LibraryContextBody items={items} folders={[]} folderId={null} recentIds={[]} failed={failed} onOpenItem={noop} />);
		assert.ok(body(null).includes('aria-label="Loading context"'));
		assert.ok(body(null, true).includes("Your Library could not be loaded."));
		const loaded = body([]);
		assert.ok(loaded.includes("0 folders · 0 items") && loaded.includes("Nothing opened yet."));
	});
});

describe("the palette list", () => {
	it("is a listbox of options, the active one selected", () => {
		const entries = paletteActions(false).slice(0, 2);
		const html = renderToStaticMarkup(<PaletteList groups={[{ label: "Actions", entries }]} activeId={entries[1]!.id} listId="list" optionId={(entry) => entry.id} onHover={noop} onPick={noop} />);
		assert.match(html, /id="list"[^>]*role="listbox"/);
		assert.equal(html.match(/role="option"/g)?.length, 2);
		assert.equal(html.match(/aria-selected="true"/g)?.length, 1);
		assert.ok(html.includes("pointer-coarse:min-h-11"));
	});
});
