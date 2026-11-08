import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MentionMenu, mentionStatusText } from "../components/library/mention-menu.tsx";
import { ReferenceRow, ReferencesCard } from "../components/library/references-card.tsx";
import type { LibraryItem, LibraryReference } from "../src/core/index.ts";

const row = (over: Partial<LibraryReference>, deleted = false) => {
	const reference: LibraryReference = { itemId: "lib_a", name: "a.md", kind: "markdown", size: 3, mode: "inline", ...over };
	return renderToStaticMarkup(<ReferenceRow reference={reference} deleted={deleted} />);
};
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&#x27;/g, "'");

describe("sent labels", () => {
	const table: Array<[Partial<LibraryReference>, string]> = [
		[{ mode: "inline" }, "Used a.md · in full"],
		[{ mode: "outline", reason: "too-long" }, "Used a.md · outline only, too long to send whole"],
		[{ mode: "outline", reason: "message-limit" }, "Used a.md · outline only, too much attached at once"],
		[{ mode: "outline", reason: "no-room" }, "Used a.md · outline only, not enough room in this session"],
		[{ mode: "outline", reason: "not-ready" }, "Used a.md · not read yet, the agent can open it"],
		[{ mode: "image", kind: "image" }, "Used a.md · image, the agent can ask the vision model about it"],
		[{ mode: "unreadable", reason: "no-text" }, "a.md · no text could be read"],
		[{ mode: "unreadable", reason: "unsupported" }, "a.md · this kind of file can't be read"],
		[{ mode: "missing", reason: "over-count" }, "a.md · not attached, limit is 8 per message"],
		[{ mode: "missing" }, "a.md · no longer in your Library"],
	];
	for (const [over, expected] of table) it(expected, () => assert.equal(text(row(over)), expected));
	it("no vision links to Settings → Agent", () => {
		assert.equal(text(row({ mode: "unreadable", reason: "no-vision", kind: "image" })), "a.md · no vision model set · Settings → Agent");
		assert.ok(row({ mode: "unreadable", reason: "no-vision" }).includes("<button"));
	});
	it("an item deleted since says so after its label and loses its link", () => {
		const html = row({ mode: "inline" }, true);
		assert.equal(text(html), "Used a.md · in full · no longer in your Library");
		assert.ok(!html.includes("<a "));
	});
	it("a live item's name opens it, named accessibly", () => {
		assert.ok(row({ mode: "inline" }).includes('aria-label="Open a.md"'));
	});
	it("a live item's name opens the Library's full view, keyed for focus return (feature 027, Q3)", () => {
		const html = renderToStaticMarkup(<ReferenceRow reference={{ itemId: "lib_a", name: "a.md", kind: "markdown", mode: "inline" }} status={{ state: "live" }} messageId="msg_1" />);
		assert.match(html, /<a href="\/library\?item=lib_a"/);
		assert.match(html, /data-ref-chip="msg_1:row-lib_a"/);
		assert.ok(!html.includes("target=\"_blank\""), "never a new tab");
		assert.equal(text(html), "Used a.md · in full");
	});
	it("an image's name opens the full view too, not a new tab", () => {
		const html = renderToStaticMarkup(<ReferenceRow reference={{ itemId: "lib_i", name: "f.png", kind: "image", mode: "image" }} />);
		assert.match(html, /href="\/library\?item=lib_i"/);
	});
	it("a trashed item's name opens its Trash entry; the wording is unchanged", () => {
		const html = renderToStaticMarkup(<ReferenceRow reference={{ itemId: "lib_t", name: "t.md", kind: "markdown", mode: "inline" }} status={{ state: "trashed", trashEntryId: "tr_1" }} messageId="m" />);
		assert.match(html, /href="\/library\?view=trash&amp;entry=tr_1"/);
		assert.equal(text(html), "Used t.md · in full · no longer in your Library");
	});
	it("deleted for good, or removed from its repo: ink text with its suffix", () => {
		const deleted = renderToStaticMarkup(<ReferenceRow reference={{ itemId: "lib_d", name: "d.md", kind: "markdown", mode: "inline" }} status={{ state: "deleted" }} />);
		assert.ok(!deleted.includes("<a "));
		assert.equal(text(deleted), "Used d.md · in full · no longer in your Library");
		const removed = renderToStaticMarkup(<ReferenceRow reference={{ itemId: "lib_r", name: "notes.md", kind: "markdown", mode: "inline", fromRepo: true }} status={{ state: "removed" }} />);
		assert.ok(!removed.includes("<a "));
		assert.equal(text(removed), "Used notes.md · in full · Removed from the repo");
	});
	it("a missing item has no link", () => {
		assert.ok(!row({ mode: "missing" }).includes("<a "));
	});
	it("renders nothing for no references", () => {
		assert.equal(renderToStaticMarkup(<ReferencesCard references={[]} />), "");
	});
	it("is always visible, with no disclosure", () => {
		const html = renderToStaticMarkup(<ReferencesCard references={[{ itemId: "a", name: "a.md", kind: "text", mode: "inline" }]} />);
		assert.ok(!html.includes("<details") && !html.includes("aria-expanded"));
	});
});

describe("the @ list", () => {
	const item = (name: string): LibraryItem => ({ id: name, name, kind: "pdf", size: 2048, createdAt: "", updatedAt: "", origin: { type: "upload" } });
	const noop = () => {};
	it("rows are listbox options with name and meta, 44px", () => {
		const html = renderToStaticMarkup(<MentionMenu listId="l" status="ready" hasItems options={[item("a.pdf"), item("b.pdf")]} activeIndex={1} onPick={noop} onNewPage={noop} />);
		assert.ok(html.includes('role="listbox"'));
		assert.equal(html.match(/role="option"/g)?.length, 3);
		assert.ok(html.includes('id="l-1"'));
		assert.ok(/id="l-1"[^>]*aria-selected="true"/.test(html));
		assert.ok(html.includes("PDF · 2.0 KB"));
		assert.ok(html.includes("min-h-11"));
	});
	it("says each state in the approved words", () => {
		const of = (status: "loading" | "ready" | "failed", hasItems: boolean) => mentionStatusText({ status, hasItems, options: [] });
		assert.equal(of("loading", false), "Loading your Library…");
		assert.equal(of("failed", false), "Your Library could not be loaded.");
		assert.equal(of("ready", false), "Your Library is empty.");
		assert.equal(of("ready", true), "Nothing matched");
	});
	it("shows a status row with no options", () => {
		const html = renderToStaticMarkup(<MentionMenu listId="l" status="ready" hasItems options={[]} activeIndex={-1} onPick={noop} onNewPage={noop} />);
		assert.ok(html.includes('role="status"') && html.includes("Nothing matched"));
	});
	describe("New page", () => {
		const newRow = (html: string) => /<div[^>]*data-testid="mention-new-page"[^>]*>/.exec(html)?.[0] ?? "";
		const firstOption = (html: string) => /<div[^>]*data-testid="mention-option"[^>]*>/.exec(html)?.[0] ?? "";
		const menu = (options: LibraryItem[], activeIndex: number, status: "loading" | "ready" | "failed" = "ready") => renderToStaticMarkup(<MentionMenu listId="l" status={status} hasItems options={options} activeIndex={activeIndex} onPick={noop} onNewPage={noop} />);
		it("is the last option, id following the matches", () => {
			const html = menu([item("a.pdf"), item("b.pdf")], 2);
			assert.ok(html.indexOf("mention-new-page") > html.lastIndexOf("mention-option"));
			assert.ok(/id="l-2"[^>]*aria-selected="true"[^>]*data-testid="mention-new-page"/.test(html));
			assert.ok(html.includes(">New page</span>"));
		});
		it("shows beside every status, with no match, while loading and on failure", () => {
			for (const [status, words] of [["ready", "Nothing matched"], ["loading", "Loading your Library…"], ["failed", "Your Library could not be loaded."]] as const) {
				const html = menu([], -1, status);
				assert.ok(html.includes(words) && html.includes('role="status"'), status);
				assert.ok(/id="l-0"[^>]*aria-selected="false"[^>]*data-testid="mention-new-page"/.test(html), status);
			}
		});
		it("is styled like the other rows, active and not, with no amber", () => {
			const classOf = (tag: string) => /class="([^"]*)"/.exec(tag)?.[1];
			assert.equal(classOf(newRow(menu([item("a.pdf")], 0))), classOf(firstOption(menu([item("a.pdf")], 1))));
			assert.equal(classOf(newRow(menu([item("a.pdf")], 1))), classOf(firstOption(menu([item("a.pdf")], 0))));
			assert.ok(!/amber|primary|accent/.test(classOf(newRow(menu([], 0)))!));
			assert.ok(classOf(newRow(menu([], -1)))!.includes("min-h-11"));
		});
	});
});
