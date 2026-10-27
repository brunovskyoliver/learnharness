/** Background-job activity lines in plain words, and the dispatch card's
 *  elapsed format (2026-10-27). */
import React from "react";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { activityText, formatElapsed } from "../components/activity-text.ts";
import { DemoCard } from "../components/artifacts/demo-card.tsx";
import { JobsContext } from "../components/jobs-context.ts";
import type { JobRecord } from "../src/core/contracts.ts";

describe("activity text", () => {
	it("translates builder and figure tool lines", () => {
		assert.equal(activityText("run_demo: clean"), "Test passed, checking the result");
		assert.equal(activityText("run_demo: 2 console errors"), "Test found problems, fixing");
		assert.equal(activityText("write_demo: 12.3 KB"), "Writing the demo");
		assert.equal(activityText("write_kit_demo: 3 panels"), "Drafted the demo (3 panels)");
		assert.equal(activityText("write_kit_demo: 1 problem"), "Fixing the demo spec");
		assert.equal(activityText("render_svg: inspecting final render"), "Checking the final figure");
		assert.equal(activityText("pdf_render: 42-44 @150dpi"), "Looking at 42-44");
		assert.equal(activityText("building demo"), "Starting");
	});

	it("passes unknown lines through and empties stay empty", () => {
		assert.equal(activityText("Reading three sources"), "Reading three sources");
		assert.equal(activityText(""), "");
		assert.equal(activityText(undefined), "");
	});
});

describe("dispatch card elapsed", () => {
	it("uses the sidebar's format and plain activity", () => {
		const job = {
			id: "j",
			kind: "demo",
			chatId: "c",
			toolCallId: "call-1",
			status: "running",
			activity: "run_demo: clean",
			createdAt: new Date(Date.now() - 351_000).toISOString(),
			updatedAt: new Date().toISOString(),
		} as JobRecord;
		const html = renderToStaticMarkup(
			<JobsContext.Provider value={[job]}>
				<DemoCard part={{ type: "tool-demo", state: "output-available", toolCallId: "call-1", input: {}, output: "ack" } as never} />
			</JobsContext.Provider>,
		);
		assert.match(html, /· 5m 5[01]s/);
		assert.match(html, /Test passed, checking the result/);
		assert.equal(formatElapsed(351_000), "5m 51s");
	});
});
