/** Quick plots in the transcript (feature 005): a checked plot's tool part
 *  carries its toolResult id, renders as the demo artifact, and joins the
 *  session's demos (side panel, title links) beside delivered demos; a
 *  failed plot is the quiet tool card with no frame. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSubagentSteer } from "../src/core/contracts.ts";
import { projectView } from "../src/core/view.ts";
import { kitDemoHtml, plotKitSpec, type LhMessage, type PlotInput } from "../src/core/index.ts";
import { PlotCard } from "../components/artifacts/plot-card.tsx";
import { sessionDemos } from "../components/artifacts/demo-panel-context.ts";

const input: PlotInput = { title: "Saddle-ish", variables: ["x", "y"], expression: "x**2 + 3*x*y**2", x: { min: -2, max: 2 }, y: { min: -2, max: 2 } };
const html = kitDemoHtml(plotKitSpec(input));

function plotTurn(ok: boolean): LhMessage[] {
	return [
		{ id: "u1", role: "user", content: "please plot f(x,y)=x^2+3y^2x", timestamp: 1 } as never,
		{ id: "a1", role: "assistant", content: [{ type: "text", text: "Here it is." }, { type: "toolCall", id: "call-plot", name: "plot", arguments: input }], timestamp: 2 } as never,
		(ok
			? { id: "r1", role: "toolResult", toolCallId: "call-plot", toolName: "plot", content: [{ type: "text", text: "Plot shown: Saddle-ish." }], details: { kind: "demo", result: { title: "Saddle-ish", html, tested: true } }, isError: false, timestamp: 3 }
			: { id: "r1", role: "toolResult", toolCallId: "call-plot", toolName: "plot", content: [{ type: "text", text: "The plot failed its check and was not shown:\n- foo is not defined" }], details: null, isError: true, timestamp: 3 }) as never,
	];
}

const plotPart = (messages: LhMessage[]) => projectView(messages).flatMap((m) => m.parts).find((p) => p.type === "tool-plot")!;

describe("plot parts", () => {
	it("a checked plot carries its result id and renders the demo frame", () => {
		const part = plotPart(plotTurn(true));
		assert.equal(part.state, "output-available");
		assert.equal(part.resultMessageId, "r1");
		const markup = renderToStaticMarkup(<PlotCard part={part as never} />);
		assert.match(markup, /<iframe/);
		assert.match(markup, /sandbox="allow-scripts"/);
		assert.match(markup, /Saddle-ish/);
	});

	it("a failed plot is the quiet tool card, never a frame", () => {
		const part = plotPart(plotTurn(false));
		assert.equal(part.state, "output-error");
		assert.equal(part.resultMessageId, undefined);
		assert.doesNotMatch(renderToStaticMarkup(<PlotCard part={part as never} />), /<iframe/);
	});

	it("joins the session's demos beside delivered demos, in transcript order", () => {
		const steer = buildSubagentSteer({ id: "j1", kind: "demo", toolCallId: "c-j1" }, { title: "Builder demo", html: "<div>d</div>", tested: true });
		const demos = sessionDemos(projectView([steer as never, ...plotTurn(true)]));
		assert.deepEqual(demos.map((d) => [d.id, d.title]), [["steer_j1", "Builder demo"], ["r1", "Saddle-ish"]]);
		assert.deepEqual(sessionDemos(projectView(plotTurn(false))), []);
	});
});
