import type { AgentTool } from "@earendil-works/pi-agent-core";
import { kitDemoHtml, plotInputProblems, plotKitSpec, PlotInputSchema, validateDemoKitSpec, type PlotInput } from "../../core/index.ts";
import { getHeadless, type HeadlessApi } from "../subagents/headless.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";

/**
 * Quick plots (feature 005): an explicit function drawn in the same reply,
 * no builder agent. The spec is built in code (core/plot.ts), rendered once
 * in the headless browser, and returned as a demo artifact the transcript
 * shows like a delivered demo. Nothing untested is shown; failures go back
 * to the model as error results (Principle IV).
 */

/** Owner-approved wording, 2026-10-28. */
const PLOT_DESCRIPTION =
	"Draw an interactive plot of an explicit function right now, in this reply: one variable (y = f(x)) or two (z = f(x, y)). " +
	"No background job. Write `expression` in JavaScript over x (and y), the parameters by name, and Math functions without " +
	"the `Math.` prefix (x**2, sin(x), exp(-a*x)). Choose axis ranges that show the interesting behaviour; each parameter " +
	"becomes a slider with the range and default you give. The plot is checked in a headless browser before it shows; if the " +
	"check fails you get the reason and can correct the call. For processes to step through, simulations or several linked " +
	"views, use `demo`.";

/** How long the check lets the plot settle before the kit's self-test. */
const SETTLE_MS = 1500;

export function plotTool(headless: () => HeadlessApi = getHeadless): AgentTool<typeof PlotInputSchema> {
	const check = serverExecute("plot", PlotInputSchema, async (input: PlotInput) => {
		const browser = headless();
		if (!browser.available()) throw new Error(`The plot could not be checked, so it was not shown: ${browser.unavailableReason() ?? "no headless browser"}.`);
		const html = kitDemoHtml(plotKitSpec(input));
		const run = await browser.runDemo(html, { settleMs: SETTLE_MS });
		const errors = [...run.pageErrors, ...run.consoleErrors, ...run.failedRequests, ...(run.lightBackground ? [`light page background ${run.lightBackground}`] : [])];
		if (!run.ok || errors.length > 0) throw new Error(`The plot failed its check and was not shown:\n${errors.slice(0, 5).map((e) => `- ${e}`).join("\n")}`);
		return { text: `Plot shown: ${input.title}.`, details: { kind: "demo", result: { title: input.title, html, tested: true } } };
	});
	return {
		name: "plot",
		label: "plot",
		description: PLOT_DESCRIPTION,
		parameters: PlotInputSchema,
		execute: async (toolCallId, input, signal) => {
			const problems = plotInputProblems(input);
			if (problems.length > 0) return invalidInputResult("plot", problems);
			const specProblems = validateDemoKitSpec(plotKitSpec(input));
			if (specProblems.length > 0) return invalidInputResult("plot", specProblems);
			return check(toolCallId, input, signal);
		},
	};
}
