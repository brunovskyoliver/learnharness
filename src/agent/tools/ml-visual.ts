import type { AgentTool } from "@earendil-works/pi-agent-core";
import { kitDemoHtml, mlVisualInputProblems, mlVisualKitSpec, MlVisualInputSchema, validateDemoKitSpec, type MlVisualInput } from "../../core/index.ts";
import { withTokenizedPanels } from "../tokenizer.ts";
import { getHeadless, type HeadlessApi } from "../subagents/headless.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";

/** Owner-approved wording, contracts/ml-visual-tool.md. */
const DESCRIPTION = "Show one interactive ML panel right now, in this reply: `heatmap` (attention weights, weight matrices, confusion matrices), `tokens` (how a tokenizer splits text — you give the text, the server tokenizes it; never write tokens yourself), `next_token` (next-token probabilities with temperature, top-k and top-p controls), `scatter` (labelled embedding points in 2D or 3D, optionally one vector-arithmetic expression), `network` (a small network the panel computes forward and backward from your weights) or `shapes` (tensor shapes through a sequence of operations). Heatmap, next_token and scatter values you write are shown as \"Illustrative numbers\"; say so in words too. Never put a question's answer in a panel posed with that question. The panel is checked in a headless browser before it shows; if the check fails you get the reason. For several linked panels, use `demo`.";

/** How long the check lets the plot settle before the kit's self-test. */
const SETTLE_MS = 1500;

export function mlVisualTool(headless: () => HeadlessApi = getHeadless): AgentTool<typeof MlVisualInputSchema> {
	const check = serverExecute("ml_visual", MlVisualInputSchema, async (input: MlVisualInput) => {
		const browser = headless();
		if (!browser.available()) throw new Error(`The panel could not be checked, so it was not shown: ${browser.unavailableReason() ?? "no headless browser"}.`);
		const html = kitDemoHtml(await withTokenizedPanels(mlVisualKitSpec(input)));
		const run = await browser.runDemo(html, { settleMs: SETTLE_MS });
		const errors = [...run.pageErrors, ...run.consoleErrors, ...run.failedRequests, ...(run.lightBackground ? [`light page background ${run.lightBackground}`] : [])];
		if (!run.ok || errors.length > 0) throw new Error(`The panel failed its check and was not shown:\n${errors.slice(0, 5).map((e) => `- ${e}`).join("\n")}`);
		return { text: `Panel shown: ${input.title}.`, details: { kind: "demo", result: { title: input.title, html, tested: true } } };
	});
	return {
		name: "ml_visual",
		label: "ml_visual",
		description: DESCRIPTION,
		parameters: MlVisualInputSchema,
		execute: async (toolCallId, input, signal) => {
			const problems = mlVisualInputProblems(input);
			if (problems.length > 0) return invalidInputResult("ml_visual", problems);
			const specProblems = validateDemoKitSpec(mlVisualKitSpec(input));
			if (specProblems.length > 0) return invalidInputResult("ml_visual", specProblems);
			return check(toolCallId, input, signal);
		},
	};
}
