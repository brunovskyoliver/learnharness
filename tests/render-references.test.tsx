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
		const html = renderToStaticMarkup(<MentionMenu listId="l" status="ready" hasItems options={[item("a.pdf"), item("b.pdf")]} activeIndex={1} onPick={noop} />);
		assert.ok(html.includes('role="listbox"'));
		assert.equal(html.match(/role="option"/g)?.length, 2);
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
		const html = renderToStaticMarkup(<MentionMenu listId="l" status="ready" hasItems options={[]} activeIndex={0} onPick={noop} />);
		assert.ok(html.includes('role="status"') && html.includes("Nothing matched"));
	});
});
