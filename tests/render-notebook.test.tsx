/** Notebook's note page and sidebar (feature 024, US1; contracts/ui-contract.md "Chrome", "Overlay sidebar"). */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CloseGlyph, MenuGlyph, Wordmark } from "../components/notebook/chrome.tsx";
import { isUntitledName, keyLabel, saveStateLine } from "../components/notebook/nb-shared.tsx";
import { bodyPlaceholder } from "../components/notebook/note-editor.tsx";
import { titleText, TitleField } from "../components/notebook/note-view.tsx";
import { ariaKeys, findNotes, notePages, SidebarBody, type SidebarBodyProps } from "../components/notebook/overlay-sidebar.tsx";
import { currentReviewer, MODE_DESCRIPTION, MODE_LABEL, ToolbarRow, type ToolbarRowProps } from "../components/notebook/toolbar-row.tsx";
import type { LibraryFolder, LibraryItem } from "../src/core/index.ts";

const noop = () => {};
const reviewers = [
	{ id: "plain", name: "Plain reader", instructions: "" },
	{ id: "examiner", name: "Examiner", instructions: "Reads like the person grading this.\nAnd more." },
];
const toolbar = (over: Partial<ToolbarRowProps> = {}) => renderToStaticMarkup(
	<ToolbarRow reviewers={reviewers} reviewerId={undefined} mode="thinks" hasInstruction={false} container={null} onReviewer={noop} onEditReviewers={noop} onMode={noop} onInstructions={noop} onExport={noop} onChat={noop} {...over} />,
);
const page = (over: Partial<LibraryItem> = {}): LibraryItem => ({
	id: "lib_a", name: "YouTube Ideas", kind: "page", size: 10,
	createdAt: "2026-11-06T10:00:00.000Z", updatedAt: "2026-11-06T10:00:00.000Z", origin: { type: "learner" }, ...over,
});
const folder = (over: Partial<LibraryFolder> = {}): LibraryFolder => ({ id: "fld_1", name: "Courses", parentId: null, createdAt: "2026-11-06T10:00:00.000Z", updatedAt: "2026-11-06T10:00:00.000Z", ...over });
const actions = { onCopy: noop, onExport: noop, onTogglePlain: noop, onSettings: noop, onReviewers: noop, onFlashcards: noop, onLinks: noop, onSwitchToStudy: noop };
const sidebar = (over: Partial<SidebarBodyProps> = {}) => renderToStaticMarkup(
	<SidebarBody
		items={[page(), page({ id: "lib_b", name: "Journal", updatedAt: "2026-11-06T12:00:00.000Z" }), page({ id: "lib_c", name: "syllabus.pdf", kind: "pdf" })]}
		folders={[]}
		failed={false}
		currentId="lib_a"
		query=""
		mac
		account={null}
		saveLine="All notes saved"
		error={null}
		onQuery={noop}
		onSubmitQuery={noop}
		onOpen={noop}
		onNewNote={noop}
		onNewFolder={noop}
		actions={actions}
		onClose={noop}
		{...over}
	/>,
);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Notebook chrome", () => {
	it("the wordmark is ours and links to the note", () => {
		const html = renderToStaticMarkup(<Wordmark noteId="lib_a" />);
		assert.ok(html.includes("Brunovský’s study"));
		assert.ok(html.includes('href="/notebook/lib_a"'));
		assert.ok(!/riddled/i.test(html));
	});
	it("the menu and close glyphs are hidden from readers", () => {
		for (const html of [renderToStaticMarkup(<MenuGlyph />), renderToStaticMarkup(<CloseGlyph />)]) assert.ok(html.includes('aria-hidden="true"'));
	});
	it("shortcut hints follow the platform", () => {
		assert.equal(keyLabel("mod+k", true), "⌘K");
		assert.equal(keyLabel("mod+k", false), "Ctrl+K");
		assert.equal(keyLabel("mod+shift+o", true), "⌘⇧O");
		assert.equal(keyLabel("mod+shift+o", false), "Ctrl+Shift+O");
	});
});

describe("the toolbar row", () => {
	it("holds reviewer, Instructions, mode, Export and the chat button in order", () => {
		const html = toolbar();
		const order = ["nb-reviewer-picker", "nb-instructions", "nb-mode-picker", "nb-export", "nb-chat"].map((id) => html.indexOf(`data-testid="${id}"`));
		assert.ok(order.every((i) => i >= 0), String(order));
		assert.deepEqual([...order].sort((a, b) => a - b), order);
		assert.ok(html.includes('role="toolbar"'));
		const words = text(html);
		for (const label of ["Plain reader", "Instructions", "Thinks with you", "Export"]) assert.ok(words.includes(label), label);
		assert.ok(html.includes('aria-label="Ask about this note"'));
	});
	it("shows the note's reviewer and falls back to Plain reader", () => {
		assert.ok(text(toolbar({ reviewerId: "examiner" })).includes("Examiner"));
		assert.equal(currentReviewer(reviewers, "gone")?.name, "Plain reader");
		assert.equal(currentReviewer([], undefined), null);
	});
	it("words both modes and hides Instructions once one is set", () => {
		assert.ok(text(toolbar({ mode: "ask" })).includes("When you ask"));
		assert.ok(toolbar({ mode: "ask" }).includes('data-mode="ask"'));
		assert.ok(!toolbar({ hasInstruction: true }).includes('data-testid="nb-instructions"'));
		assert.equal(MODE_LABEL.thinks, "Thinks with you");
		assert.equal(MODE_DESCRIPTION.thinks, "Reads along and speaks up when a line deserves a second look.");
		assert.equal(MODE_DESCRIPTION.ask, "Stays quiet until you select something or open the chat.");
	});
});

describe("the title and body", () => {
	it("the title is the page name, and a new note shows the placeholder", () => {
		const html = renderToStaticMarkup(<TitleField name="YouTube Ideas" />);
		assert.ok(html.includes('placeholder="Untitled"'));
		assert.ok(html.includes("YouTube Ideas"));
		assert.ok(html.includes('aria-label="Title"'));
		assert.equal(titleText("Untitled note"), "");
		assert.equal(titleText("Untitled note (3)"), "");
		assert.equal(titleText("Untitled notes"), "Untitled notes");
		assert.ok(isUntitledName("Untitled note (2)") && !isUntitledName("My note"));
	});
	it("the body placeholder follows the mode", () => {
		assert.equal(bodyPlaceholder("thinks"), "Start writing. Type / for blocks.\nNothing here is read until you pause.");
		assert.equal(bodyPlaceholder("ask"), "Start writing. Type / for blocks.\nNothing here is read unless you ask.");
	});
});

describe("the overlay sidebar", () => {
	it("lists pages only, newest first, with the current note marked", () => {
		const html = sidebar();
		const words = text(html);
		assert.ok(words.indexOf("Journal") < words.indexOf("YouTube Ideas"));
		assert.ok(!words.includes("syllabus.pdf"));
		assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
		assert.ok(/aria-current="page"[^>]*>.*?YouTube Ideas/.test(html));
	});
	it("has search with its hint, New note, New folder, save state and Switch to Study", () => {
		const html = sidebar();
		const words = text(html);
		assert.ok(html.includes('placeholder="Find or start a note"'));
		for (const label of ["⌘K", "New note", "New folder", "All notes saved", "Switch to Study", "⌘⇧O"]) assert.ok(words.includes(label), label);
		assert.ok(html.includes('aria-label="Close notes"'));
		assert.ok(!html.includes('data-testid="nb-side-account"'));
		assert.ok(sidebar({ account: "me@example.com" }).includes("me@example.com"));
		assert.ok(text(sidebar({ mac: false })).includes("Ctrl+Shift+O"));
	});
	it("folders are collapsible rows, open when they hold the current note", () => {
		const items = [page({ folderId: "fld_1" }), page({ id: "lib_b", name: "Journal" })];
		const html = sidebar({ items, folders: [folder(), folder({ id: "fld_2", name: "Archive" })] });
		assert.ok(html.includes('aria-expanded="true"'));
		assert.ok(html.includes('aria-expanded="false"'));
		assert.ok(text(html).includes("Courses") && text(html).includes("Archive"));
		const closed = sidebar({ items, folders: [folder()], currentId: "lib_b" });
		assert.ok(closed.includes('aria-expanded="false"') && !text(closed).includes("YouTube Ideas"));
	});
	it("a search shows matching pages, the exact name first", () => {
		const items = [page({ id: "1", name: "Physics notes" }), page({ id: "2", name: "Physics" })];
		assert.deepEqual(findNotes(items, "physics").map((i) => i.id), ["2", "1"]);
		assert.equal(findNotes(items, "chem").length, 0);
		assert.equal(notePages([page({ archivedAt: "2026-11-06T00:00:00.000Z" })]).length, 0);
		const html = sidebar({ items, query: "notes" });
		assert.ok(text(html).includes("Physics notes") && !/>\s*Physics\s*</.test(html));
	});
	it("the footer lists every action in the contract's order, shortcuts right-aligned for the platform", () => {
		const footer = (html: string) => text(html.slice(html.indexOf('aria-label="Notebook"')));
		const mac = footer(sidebar());
		const order = ["Copy this note", "Export this note", "Just my words", "Settings", "Reviewers", "Make flashcards", "Links", "Switch to Study"];
		let at = -1;
		for (const label of order) {
			const next = mac.indexOf(label);
			assert.ok(next > at, label);
			at = next;
		}
		for (const keys of ["⌘⇧C", "⌘⇧E", "⌘⇧H", "⌘,", "⌘⇧O"]) assert.ok(mac.includes(keys), keys);
		const other = footer(sidebar({ mac: false }));
		for (const keys of ["Ctrl+Shift+C", "Ctrl+Shift+E", "Ctrl+Shift+H", "Ctrl+,", "Ctrl+Shift+O"]) assert.ok(other.includes(keys), keys);
		const html = sidebar();
		assert.match(html, /aria-keyshortcuts="Meta\+Shift\+C"[^>]*>.*?Copy this note/);
		assert.match(sidebar({ mac: false }), /aria-keyshortcuts="Control\+,"/);
		assert.ok(html.includes('<kbd class="nb-side-kbd" aria-hidden="true">⌘⇧C</kbd>'));
		// Reviewers, Make flashcards and Links have no shortcut.
		assert.match(html, /data-testid="nb-side-reviewers"><span>Reviewers<\/span><\/button>/);
		assert.equal(ariaKeys("mod+shift+h", true), "Meta+Shift+H");
	});
	it("Just my words shows when it is on; Sign out only when hosted", () => {
		assert.match(sidebar(), /data-testid="nb-side-plain" aria-pressed="false"/);
		const on = sidebar({ plain: true });
		assert.match(on, /data-testid="nb-side-plain" aria-pressed="true"/);
		assert.ok(on.includes("nb-side-check"));
		const rows = (html: string) => (html.slice(html.indexOf('aria-label="Notebook"')).match(/<li>/g) ?? []).length;
		assert.equal(rows(sidebar()), 8);
		assert.equal(rows(sidebar({ hosted: true })), 9);
	});
	it("a note with open threads shows the dot, named for screen readers", () => {
		const html = sidebar({ openThreads: { lib_b: 2, lib_a: 1 } });
		assert.equal((html.match(/data-testid="nb-side-dot"/g) ?? []).length, 2);
		assert.ok(text(html).includes(", 2 open threads") && text(html).includes(", 1 open thread"));
		assert.ok(!sidebar().includes("nb-side-dot"));
	});
	it("words the save states as the contract does", () => {
		assert.equal(saveStateLine("saved"), "All notes saved");
		assert.equal(saveStateLine("draft-saved"), "All notes saved");
		assert.equal(saveStateLine("saving"), "Saving…");
		assert.equal(saveStateLine("failed"), "Not saved. Your text is kept in this browser.");
		assert.equal(saveStateLine(null), "All notes saved");
	});
});
