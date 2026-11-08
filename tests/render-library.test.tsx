/** The Library view's states and names (feature 009, contracts/ui-contract.md). */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryBody, type LibraryBodyProps } from "../components/library/library-view.tsx";
import { LibraryRow } from "../components/library/library-row.tsx";
import { DeleteItemBody } from "../components/library/delete-item-dialog.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import type { LibraryItem } from "../src/core/index.ts";

const item = (over: Partial<LibraryItem> = {}): LibraryItem => ({
	id: "lib_1", name: "week 3 notes.md", kind: "markdown", size: 2048,
	createdAt: "2026-10-30T10:00:00.000Z", updatedAt: "2026-10-30T10:00:00.000Z", origin: { type: "upload" }, ...over,
});
const noop = () => {};
const rowProps = { onRenamed: noop, onDelete: noop };
const body = (over: Partial<LibraryBodyProps>) => renderToStaticMarkup(
	<LibraryBody items={null} loadFailed={false} refreshFailed={false} query="" onRetry={noop} onChanged={noop} onDelete={noop} {...over} />,
);
const textOf = (html: string) => html.replace(/<[^>]+>/g, "");

describe("LibraryBody states", () => {
	it("loading shows row skeletons and no copy claiming emptiness", () => {
		const html = body({});
		assert.ok(html.includes('aria-label="Loading your Library"'));
		assert.ok(html.includes('data-slot="skeleton"'));
		assert.ok(!html.includes("Nothing here yet"));
	});
	it("empty uses the approved sentence", () => {
		assert.ok(body({ items: [] }).includes("Nothing here yet. Upload a document or start a page."));
	});
	it("failed says so with Try again", () => {
		const html = body({ loadFailed: true });
		assert.ok(html.includes("Your Library could not be loaded."));
		assert.ok(html.includes("Try again"));
		assert.ok(!html.includes("Nothing here yet"));
	});
	it("a failed refresh keeps the list and offers Try again", () => {
		const html = body({ items: [item()], refreshFailed: true });
		assert.ok(html.includes("week 3 notes.md"));
		assert.ok(html.includes("Your Library could not be loaded."));
		assert.ok(html.includes("Try again"));
	});
	it("search filters names and says when nothing matched", () => {
		const items = [item(), item({ id: "lib_2", name: "syllabus.pdf", kind: "pdf" })];
		const html = body({ items, query: "SYLL" });
		assert.ok(html.includes("syllabus.pdf"));
		assert.ok(!html.includes("week 3 notes.md"));
		assert.ok(body({ items, query: "zzz" }).includes("Nothing matched"));
	});
});

describe("LibraryRow", () => {
	it("names the item in every action", () => {
		const html = renderToStaticMarkup(<LibraryRow item={item()} {...rowProps} />);
		for (const label of ["Open week 3 notes.md", "Rename week 3 notes.md", "Delete week 3 notes.md"]) {
			assert.ok(html.includes(`aria-label="${label}"`), label);
		}
	});
	it("shows kind, size and date, and the true extras only", () => {
		const plain = textOf(renderToStaticMarkup(<LibraryRow item={item()} {...rowProps} />));
		assert.match(plain, /Markdown · 2\.0 KB · /);
		assert.ok(!plain.includes("Made by the agent"));
		assert.ok(!plain.includes("No text could be read"));
		const extras = textOf(renderToStaticMarkup(<LibraryRow item={item({ kind: "pdf", textState: "none", origin: { type: "agent" } })} {...rowProps} />));
		assert.ok(extras.includes("Made by the agent"));
		assert.ok(extras.includes("No text could be read"));
		const failed = textOf(renderToStaticMarkup(<LibraryRow item={item({ kind: "pdf", textState: "failed" })} {...rowProps} />));
		assert.ok(failed.includes("No text could be read"));
		const pending = textOf(renderToStaticMarkup(<LibraryRow item={item({ kind: "pdf", textState: "pending" })} {...rowProps} />));
		assert.ok(!pending.includes("No text could be read"));
	});
	it("opens images in a new tab through the content route", () => {
		const html = renderToStaticMarkup(<LibraryRow item={item({ kind: "image", name: "a.bin" })} {...rowProps} />);
		assert.ok(html.includes('href="/api/library/items/lib_1/content"'));
		assert.ok(html.includes('target="_blank"'));
		assert.ok(html.includes('rel="noreferrer"'));
	});
	it("opens a PDF in the pane (feature 020)", () => {
		const html = renderToStaticMarkup(<LibraryRow item={item({ kind: "pdf", name: "a.pdf" })} {...rowProps} />);
		assert.ok(!html.includes('target="_blank"'));
		assert.match(html, /<button[^>]*aria-label="Open a\.pdf"/);
	});
	it("text kinds and pages open through a button, for the pane", () => {
		for (const kind of ["markdown", "page"] as const) {
			const html = renderToStaticMarkup(<LibraryRow item={item({ kind })} {...rowProps} />);
			assert.match(html, /<button[^>]*aria-label="Open week 3 notes\.md"/);
			assert.ok(!html.includes("This is your original"));
		}
	});
	it("kinds with no reader download instead", () => {
		const html = renderToStaticMarkup(<LibraryRow item={item({ kind: "other", name: "a.exe" })} {...rowProps} />);
		assert.ok(html.includes('href="/api/library/items/lib_1/content?download=1"'));
	});
});

describe("DeleteItemBody", () => {
	const dialog = (over = {}) => renderToStaticMarkup(<Dialog open><DeleteItemBody item={item()} busy={false} failure={null} onClose={noop} onConfirm={noop} {...over} /></Dialog>);
	it("names the item, in the interface font", () => {
		const html = dialog();
		assert.ok(html.includes("Move week 3 notes.md to the trash?"));
		assert.ok(!html.includes("font-mono"));
		assert.ok(!html.includes("<code"));
		assert.ok(html.includes("You can restore it from Trash."));
	});
	it("says a page keeps its versions", () => {
		assert.ok(dialog({ item: item({ kind: "page", name: "Notes" }) }).includes("with its whole version history"));
	});
	it("keeps a failure in view with Try again", () => {
		const html = dialog({ failure: "It could not be deleted." });
		assert.ok(html.includes('role="alert"'));
		assert.ok(html.includes("It could not be deleted."));
		assert.ok(html.includes("Try again"));
	});
});

describe("Library folders (feature 011)", () => {
	const folder = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId, createdAt: "2026-10-30T10:00:00.000Z", updatedAt: "2026-10-30T10:00:00.000Z" });
	const folders = [folder("fld_a", "Physics"), folder("fld_b", "Waves", "fld_a")];
	const items = [item({ id: "lib_top", name: "top.md" }), item({ id: "lib_in", name: "inside.md", folderId: "fld_a" })];

	it("shows one level, folders and items together", () => {
		const html = body({ items, folders });
		assert.ok(html.includes("Open folder Physics") && html.includes("Folder · 2 items"));
		assert.ok(html.includes("Open top.md") && !html.includes("Open inside.md") && !html.includes("Waves"));
		const inside = body({ items, folders, folderId: "fld_a" });
		assert.ok(inside.includes("Open inside.md") && inside.includes("Open folder Waves") && !inside.includes("Open top.md"));
	});
	it("an item in a folder that no longer exists stays visible at the top", () => {
		assert.ok(body({ items: [item({ folderId: "fld_gone" })], folders }).includes("Open week 3 notes.md"));
	});
	it("a search reaches every level and says where", () => {
		const html = body({ items, folders, query: "inside" });
		assert.ok(textOf(html).includes("Physics") && html.includes("Open inside.md"));
	});
	it("an empty folder says so", () => {
		assert.ok(body({ items: [], folders: [folder("fld_c", "Empty")], folderId: "fld_c" }).includes("This folder is empty."));
	});
});

describe("feature 026: rows inside a mirror (T036, ui-contract.md Menus)", () => {
	const mirror = (path: string) => ({ linkId: "rpl_a", repoKey: "github.com/o/n#main", path });
	const linked = { id: "fld_l", name: "Lecture notes", parentId: null, createdAt: "", updatedAt: "", mirror: mirror("") };
	const week1 = { id: "fld_w", name: "week1", parentId: "fld_l", createdAt: "", updatedAt: "", mirror: mirror("week1") };
	const synced = item({ id: "lib_m", name: "README.md", folderId: "fld_l", origin: { type: "repo", linkId: "rpl_a" }, mirror: { ...mirror("README.md"), oid: "o", snapshot: "s" } });
	const marks = [{ label: "Add to favorites", onSelect: noop }];
	it("a synced file and a mirror folder have no Rename or Delete buttons and can't be dragged", () => {
		const html = body({ items: [synced], folders: [linked, week1], folderId: "fld_l", itemActions: () => marks, folderActions: () => marks, onDragStartEntry: noop, onDropOnFolder: noop });
		assert.ok(html.includes("Open README.md") && html.includes("Open folder week1"));
		assert.ok(!html.includes("Rename README.md") && !html.includes("Delete README.md"));
		assert.ok(!html.includes("Rename folder week1") && !html.includes("Delete folder week1"));
		assert.ok(!html.includes('draggable="true"'), "nothing in a mirror is draggable");
	});
	it("the linked folder keeps its Rename and Delete buttons and stays draggable", () => {
		const html = body({ items: [synced], folders: [linked, week1], folderActions: () => marks, onDragStartEntry: noop });
		assert.ok(html.includes("Rename folder Lecture notes") && html.includes("Delete folder Lecture notes"));
		assert.ok(html.includes('draggable="true"'));
	});
});

describe("feature 026: Repo details and the unlink confirm (T046, T047)", async () => {
	const { RepoDetailsBody, UnlinkBody } = await import("../components/library/repo-details-dialog.tsx");
	const link = {
		id: "rpl_a", folderId: "fld_l", display: "github.com/oliver/notes", url: "https://github.com/oliver/notes", branch: "main", branchGiven: false, tokenMask: "…a1b2",
		sync: { state: "synced" as const, lastSuccessAt: "2026-11-08T10:00:00.000Z", lastAttemptAt: "2026-11-08T10:00:00.000Z", commit: "0123456789abcdef0123456789abcdef01234567" },
	};
	const details = (over = {}) => textOf(renderToStaticMarkup(<Dialog open><RepoDetailsBody link={{ ...link, ...over }} folderName="Lecture notes" now={new Date("2026-11-08T10:05:00.000Z")} onSyncNow={noop} onToken={async () => ({ ok: true, link })} onUnlink={noop} onClose={noop} /></Dialog>));
	it("names the folder, the address without credentials, the branch, the last sync, the commit and only the token's mask", () => {
		const text = details();
		for (const part of ["Lecture notes", "Addressgithub.com/oliver/notes", "Branchmain (default)", "Last syncSynced 5 min ago", "Commit0123456", "Token…a1b2", "Replace token", "Remove token", "Sync now", "Unlink…", "Close"]) assert.ok(text.includes(part), part);
		assert.ok(!text.includes("Add token"));
	});
	it("a named branch and no token", () => {
		const text = details({ branchGiven: true, branch: "dev", tokenMask: null });
		assert.ok(text.includes("Branchdev") && !text.includes("(default)"));
		assert.ok(text.includes("No token") && text.includes("Add token") && !text.includes("Remove token"));
	});
	it("the unlink confirm says what goes and what stays, with Cancel before the red Unlink", () => {
		const html = renderToStaticMarkup(<Dialog open><UnlinkBody folderName="Lecture notes" files={4} busy={false} failure={null} onCancel={noop} onConfirm={noop} /></Dialog>);
		const text = textOf(html).replace(/&#x27;/g, "'");
		assert.ok(text.includes("Unlink Lecture notes?"));
		assert.ok(text.includes("The folder and its 4 files leave your Library. Your highlights, notes and flashcards stay, and come back if you link this repo again. The repo isn't changed."));
		assert.ok(html.indexOf("repo-unlink-cancel") < html.indexOf("repo-unlink-confirm"));
		assert.ok(html.includes("lh-pill-danger"));
	});
});
