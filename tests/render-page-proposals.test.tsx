/** Held page edits' words (feature 023): why Accept isn't offered, and the transcript row. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { pageRowHeadline } from "../src/core/lookups.ts";
const { proposalBlockedText } = await import("../components/library/page-proposal-dialog.tsx");
const { ChangeRows } = await import("../components/library/page-history.tsx");

const proposal = { id: "pgp_x", pageId: "p", name: "Week 3", baseVersion: 1, baseText: "a", text: "b", status: "pending", createdAt: "" } as const;
const current = { text: "a", name: "Week 3", expected: { head: 1, rev: 0 }, merged: "b", moved: false };

describe("a held edit's review", () => {
	it("offers Accept when it applies", () => assert.equal(proposalBlockedText({ proposal, current }), null));
	it("names each way it can't, and says both are kept", () => {
		assert.match(proposalBlockedText({ proposal, current: { ...current, moved: true, merged: null } })!, /newer version.*both kept/);
		assert.match(proposalBlockedText({ proposal, current: { ...current, merged: null } })!, /same text.*both kept/);
		assert.match(proposalBlockedText({ proposal, current: null })!, /no longer in your Library/);
		assert.match(proposalBlockedText({ proposal: { ...proposal, status: "accepted" }, current })!, /already accepted/);
		assert.match(proposalBlockedText({ proposal: { ...proposal, status: "rejected" }, current })!, /already rejected/);
	});
	it("says added and removed in words, so colour doesn't carry it", () => {
		const html = renderToStaticMarkup(<ChangeRows rows={[{ kind: "same", markdown: "x" }, { kind: "removed", markdown: "old" }, { kind: "added", markdown: "new" }]} />);
		assert.match(html, /1 unchanged block/);
		assert.match(html, />removed</);
		assert.match(html, />added</);
	});
	it("the transcript row says it is waiting", () => {
		assert.equal(pageRowHeadline("page_revise", { outcome: "proposed", proposalId: "x", itemId: "p", name: "Week 3", target: "page" }), "Page · proposed a change to Week 3, waiting for your review");
		assert.match(pageRowHeadline("diagram_propose", { outcome: "proposed", proposalId: "x", itemId: null, name: "Map" }), /^Diagram/);
	});
});
