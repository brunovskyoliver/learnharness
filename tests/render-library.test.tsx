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
	it("opens PDF and images in a new tab through the content route", () => {
		for (const kind of ["pdf", "image"] as const) {
			const html = renderToStaticMarkup(<LibraryRow item={item({ kind, name: "a.bin" })} {...rowProps} />);
			assert.ok(html.includes('href="/api/library/items/lib_1/content"'));
			assert.ok(html.includes('target="_blank"'));
			assert.ok(html.includes('rel="noreferrer"'));
		}
	});
	it("text kinds open in place, collapsed until asked", () => {
		const html = renderToStaticMarkup(<LibraryRow item={item()} {...rowProps} />);
		assert.ok(html.includes('aria-expanded="false"'));
		assert.ok(!html.includes("This is your original"));
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
		assert.ok(html.includes("Delete week 3 notes.md?"));
		assert.ok(!html.includes("font-mono"));
		assert.ok(!html.includes("<code"));
		assert.ok(!html.includes("version history"));
	});
	it("warns about versions only for a page", () => {
		assert.ok(dialog({ item: item({ kind: "page", name: "Notes" }) }).includes("Its whole version history goes too."));
	});
	it("keeps a failure in view with Try again", () => {
		const html = dialog({ failure: "It could not be deleted." });
		assert.ok(html.includes('role="alert"'));
		assert.ok(html.includes("It could not be deleted."));
		assert.ok(html.includes("Try again"));
	});
});
