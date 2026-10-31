/** The transcript rows (T065). The opening path runs in the browser check. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageRow } from "../components/library/page-row.tsx";
import { toolActivityLabel } from "../src/core/pending.ts";
import { pageRowHeadline } from "../src/core/lookups.ts";

const part = (tool: string, output: unknown, state = "output-available") => ({ type: `tool-${tool}`, state, toolCallId: "t1", input: { content: "SECRET INPUT" }, output }) as never;

describe("headlines", () => {
	const cases: [string, Parameters<typeof pageRowHeadline>[1], string][] = [
		["page_create", { outcome: "created", itemId: "a", name: "Week 3", version: 1 }, "Page · created Week 3"],
		["page_revise", { outcome: "revised", itemId: "a", name: "Week 3", version: 4 }, "Page · revised Week 3 · version 4"],
		["page_revise", { outcome: "stale", reason: "r" }, "Page · couldn't revise, it changed"],
		["page_create", { outcome: "failed", reason: "r" }, "Page · failed"],
		["page_revise", null, "Page · failed"],
		["library_read", { outcome: "read", itemId: "a", name: "n.md", kind: "markdown", size: 1 }, "Library · read n.md"],
		["library_read", { outcome: "failed", reason: "r" }, "Library · failed"],
	];
	for (const [tool, details, text] of cases) {
		it(text, () => {
			assert.equal(pageRowHeadline(tool, details), text);
			if (details) assert.ok(renderToStaticMarkup(<PageRow part={part(tool, details)} {...({} as object)} />).includes(text.replace("'", "&#x27;")));
		});
	}
});

describe("the row", () => {
	it("says when his edits were saved first, and reasons read in destructive ink", () => {
		const saved = renderToStaticMarkup(<PageRow part={part("page_revise", { outcome: "revised", itemId: "a", name: "W", version: 5, savedLearnerVersion: 4 })} {...({} as object)} />);
		assert.ok(saved.includes("Saved your edits first as version 4"));
		const failed = renderToStaticMarkup(<PageRow part={part("page_revise", { outcome: "stale", reason: "The page is at version 2." })} {...({} as object)} />);
		assert.ok(failed.includes("text-destructive"));
		assert.ok(failed.includes("The page is at version 2."));
		assert.ok(!/amber|accent-amber/.test(failed));
	});
	it("while running shows the activity label and never the input", () => {
		for (const [tool, label] of [["page_create", "Writing a page…"], ["page_revise", "Revising a page…"]] as const) {
			assert.equal(toolActivityLabel(tool), label);
			const html = renderToStaticMarkup(<PageRow part={part(tool, undefined, "input-streaming")} {...({} as object)} />);
			assert.ok(!html.includes("SECRET INPUT"), html);
		}
	});
	it("never shows page text from the input once done", () => {
		const html = renderToStaticMarkup(<PageRow part={part("page_create", { outcome: "created", itemId: "a", name: "W", version: 1 })} {...({} as object)} />);
		assert.ok(!html.includes("SECRET INPUT"));
	});
});
