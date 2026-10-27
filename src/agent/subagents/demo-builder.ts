import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import { serverExecute } from "../tool-execute.ts";
import type { PiEngine } from "../models.ts";
import { runSubagent } from "./pi-run.ts";
import type { DemoResult } from "../../core/contracts.ts";
import { getHeadless, type DemoRunResult, type HeadlessApi } from "./headless.ts";
import { healToolRecord } from "../tools/heal.ts";
import { kitDemoHtml, validateDemoKitSpec, type DemoKitSpec } from "../../core/demo-kit.ts";

/**
 * The demo-builder sub-agent (vision §2 interactive demos + §2.5 "sub-agents
 * verify; they never one-shot"): given a brief it writes a self-contained
 * single-file HTML/JS demo, TESTS IT HEADLESSLY (run_demo), and iterates
 * fix → re-run until clean — before anything reaches the lesson.
 *
 * Shape: a ToolLoopAgent with two executable tools (write_demo / run_demo) —
 * the engine is injectable (tests use a scripted faux engine) and the headless
 * API is injectable (tests use a fake; production uses the app's own
 * Chromium browser service, system Chrome as fallback).
 *
 * Failure semantics (decided in the W6 brief): `tested: true` means "the
 * verify loop ran"; on failure the result is { title, html: "", tested: true,
 * notes: "FAILED: <reason>" } — the card renders the failure note, no iframe.
 * The job wrapper treats html === "" as failure and marks the job error.
 */

export interface DemoBuilderInput {
	title: string;
	brief: string;
}

export interface DemoBuilderOptions {
	/** Test seam: scripted engine; production uses the demoBuilder role. */
	engine?: PiEngine;
	headless?: HeadlessApi;
	/** Max agent steps (each write/run/fix is one step). Default 24 ≈ 6 cycles. */
	maxSteps?: number;
	/** Live activity-line callback (updates the job record). */
	onActivity?: (line: string) => void;
	/** Kills the run mid-model-call (2026-09 real-kill abort semantics). */
	abortSignal?: AbortSignal;
	/** Money channel: one call per agent step, folded into JobRecord.usage. */
	onUsage?: (usage: Usage) => void;
	/** Debug: raw provider-event recording key (LH_PROVIDER_EVENTS=1). */
	chatId?: string;
}

const INSTRUCTIONS = `You are a demo builder — a specialist sub-agent inside a learning application. You
receive a brief for ONE interactive teaching instrument and deliver it, tested. You never see the lesson;
the brief is everything you know.

PREFER THE DEMO KIT: write_kit_demo({ spec }). You describe the demo as JSON; the app draws it with its own
controls, colors and fonts, using Vega-Lite (2D charts), Plotly (3D surfaces, contours) and React Flow
(computation graphs, pipelines). Fall back to write_demo (full HTML) only when the kit cannot show the core
idea. Briefs sometimes prescribe an implementation ("single-file HTML", "zero dependencies", "canvas", "custom 3D
projection"): those are not requirements — ignore them. If the kit covers the concept and its main controls, use
it and leave out interaction details it lacks (drag-to-pick, custom orbit controls) instead of falling back.
Build only what the brief needs; a small spec ships in a minute, a hand-written page takes many.

Kit spec:
- params: controls keyed by name, read as p.name.
  {"type":"slider","label","min","max","step","value"} | {"type":"select","label","options":[…],"value"} |
  {"type":"toggle","label","value":bool}
- state: initial values keyed by name, read as s.name — each a JS expression. Re-evaluated on Reset and when a
  param it reads (p.name) changes.
- step: JS statements run on Step/Run; mutate s. Adds Step, Run and Reset buttons. t is the step count.
  stopWhen: expression that pauses Run. run: {"intervalMs", "maxSteps"} (defaults 120 ms, 200 steps).
- derived: computed values in order, read as d.name.
- panels (in order; "width":"half" puts two side by side, default full):
  {"type":"chart","title","data":{"name":"<expr → array of row objects>"},"spec":<Vega-Lite spec>}
     The spec refers to datasets with "data":{"name":"…"} (layers may each name one). No inline values, title,
     width, height or config — the kit sets them.
  {"type":"plot3d","title","traces":"<expr → Plotly traces array>","layout":{axis titles, camera}}
  {"type":"flow","title","nodes":"<expr → [{id,label,value?,highlight?}]>","edges":"<expr → [{from,to,label?,highlight?}]>","direction":"LR"|"TB"}
     Positions are automatic. Use highlight to show what the current step is doing.
  {"type":"readouts","items":[{"label","value":"<expr>","digits"?}]}
  {"type":"table","title","columns":[…],"rows":"<expr → array of row arrays>"}
  {"type":"note","text":"One sentence on what to try. **bold** allowed."}
- Expressions are JavaScript with p, s, d, t, range(start, stop, step) and Math's functions in scope
  (sin, exp, abs, …). Keep them short; put shared computation in derived.

Example (gradient descent on one weight):
{"params":{"w0":{"type":"slider","label":"Initial weight","min":0,"max":6,"step":0.1,"value":5},
 "eta":{"type":"select","label":"Learning rate","options":[0.1,0.75,1,1.1],"value":0.1}},
 "state":{"w":"p.w0","trail":"[{t:0,w:p.w0,L:(p.w0-3)**2}]"},
 "step":"s.w -= p.eta*2*(s.w-3); s.trail.push({t:t+1,w:s.w,L:(s.w-3)**2});",
 "stopWhen":"abs(s.w-3)<1e-4 || abs(s.w)>50","derived":{"L":"(s.w-3)**2"},
 "panels":[{"type":"chart","title":"Loss curve","width":"half",
   "data":{"curve":"range(-1,7,0.05).map(w=>({w,L:(w-3)**2}))","trail":"s.trail"},
   "spec":{"layer":[{"data":{"name":"curve"},"mark":"line","encoding":{"x":{"field":"w","type":"quantitative"},"y":{"field":"L","type":"quantitative"}}},
     {"data":{"name":"trail"},"mark":{"type":"line","point":true},"encoding":{"x":{"field":"w","type":"quantitative"},"y":{"field":"L","type":"quantitative"},"order":{"field":"t"}}}]}},
  {"type":"readouts","width":"half","items":[{"label":"step","value":"t"},{"label":"w","value":"s.w"},{"label":"L(w)","value":"d.L"}]}]}

Full HTML fallback (write_demo): one self-contained document in a sandboxed iframe (allow-scripts, opaque
origin; no localStorage or cookies). The parent sizes the iframe to the content height. The page receives
these CSS variables: --lh-bg, --lh-surface, --lh-surface-2, --lh-border, --lh-text, --lh-muted, series colors
--lh-blue, --lh-teal, --lh-amber, --lh-red, --lh-green, and --lh-font, --lh-mono. Use them; no light page.
Libraries load from the app, not a CDN: <script src="/demo-kit/vega.js"> (window.vega, window.vegaLite),
<script src="/demo-kit/plotly.js"> (window.Plotly).

Either way:
- Every control the brief names exists and does its job; values show next to their controls.
- No page title (the card shows it). Plain style: no gradients, shadows or decorative emoji.

THE HOUSE RULE — never deliver untested:
1. write_kit_demo (or write_demo).
2. run_demo. It loads the demo headlessly, steps kit demos and sweeps every control, then reports console
   errors, uncaught errors, failed requests and a light background, and returns a SCREENSHOT. Look at it:
   empty or flat charts, clipped labels, overlapping panels, unreadable text and values that don't match the
   brief are failures too. Optionally pass a probe expression to check page state.
3. Fix and re-run until run_demo PASSES and the screenshot looks right.
4. Finish with 1-3 sentences of NOTES for the teacher (what the demo shows, its controls by name, what to
   try) — never the spec or HTML itself.

Never claim success you did not see.`;

interface BuilderState {
	html: string | null;
	/** The html that the last run_demo tested (null = never tested). */
	testedHtml: string | null;
	lastResult: DemoRunResult | null;
}

const writeDemoInput = Type.Object({
	html: Type.String({ description: "The complete HTML document: <!doctype html>…</html>, all JS inline." }),
});

const writeKitDemoInput = Type.Object({
	spec: Type.Record(Type.String(), Type.Unknown(), { description: "The demo-kit spec (see the system prompt)." }),
});

const runDemoInput = Type.Object({
	probe: Type.Optional(
		Type.String({
			description:
				"Optional JS expression evaluated in the page after settling, e.g. \"document.querySelectorAll('input').length\".",

		}),
	),
});

export function createDemoBuilderTools(
	state: BuilderState,
	headless: HeadlessApi,
	onActivity?: (line: string) => void,
): Record<string, AgentTool<any>> {
	return healToolRecord({
		write_demo: {
			name: "write_demo",
			label: "write_demo",
			description:
				"Write the complete self-contained HTML document for the demo (overwrites any previous version). " +
				"Always follow with run_demo to test it headlessly.",
			parameters: writeDemoInput,
			execute: serverExecute("write_demo", writeDemoInput, async ({ html }) => {
				if (!html || html.trim().length === 0) return "ERROR: empty document — write the full HTML.";
				state.html = html;
				onActivity?.(`write_demo: ${(html.length / 1024).toFixed(1)} KB`);
				return `Saved (${html.length} bytes). Now call run_demo to test it — never deliver untested.`;
			}),
		},
		write_kit_demo: {
			name: "write_kit_demo",
			label: "write_kit_demo",
			description:
				"Write the demo as a demo-kit spec (overwrites any previous version). The spec is validated and every " +
				"expression compiled; problems come back as a list. Always follow with run_demo.",
			parameters: writeKitDemoInput,
			execute: serverExecute("write_kit_demo", writeKitDemoInput, async ({ spec }) => {
				const problems = validateDemoKitSpec(spec);
				if (problems.length > 0) {
					onActivity?.(`write_kit_demo: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
					return `INVALID SPEC — nothing saved:\n${problems.map((p) => `- ${p}`).join("\n")}`;
				}
				state.html = kitDemoHtml(spec as DemoKitSpec);
				onActivity?.(`write_kit_demo: ${(spec as DemoKitSpec).panels.length} panels`);
				return "Saved. Now call run_demo to test it and look at the screenshot.";
			}),
		},
		run_demo: {
			name: "run_demo",
			label: "run_demo",
			description:
				"Headlessly execute the current demo in a browser and report console errors, uncaught errors, and failed requests. " +
				"Optionally pass a probe expression to assert on page state.",
			parameters: runDemoInput,
			execute: serverExecute("run_demo", runDemoInput, async ({ probe }) => {
				if (!state.html) return "ERROR: nothing to run — call write_demo first.";
				const reason = headless.unavailableReason();
				if (reason) return `HEADLESS UNAVAILABLE: ${reason}`;
				let result: DemoRunResult;
				try {
					result = await headless.runDemo(state.html, { screenshot: true, ...(probe ? { probe } : {}) });
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					onActivity?.("run_demo: browser error");
					return `HEADLESS ERROR (retrying may help): ${msg}`;
				}
				state.testedHtml = state.html;
				state.lastResult = result;
				onActivity?.(
					result.ok ? "run_demo: clean" : `run_demo: ${summarizeCounts(result)}`,
				);
				const text = formatRunResult(result);
				return result.screenshot
					? { text: `${text}\nScreenshot of the demo attached.`, images: [{ data: result.screenshot.toString("base64"), mimeType: "image/png" }] }
					: text;
			}),
		},
	});
}

function summarizeCounts(result: DemoRunResult): string {
	const counts = [
		result.consoleErrors.length > 0 ? `${result.consoleErrors.length} console error${result.consoleErrors.length === 1 ? "" : "s"}` : null,
		result.pageErrors.length > 0 ? `${result.pageErrors.length} page error${result.pageErrors.length === 1 ? "" : "s"}` : null,
		result.failedRequests.length > 0 ? `${result.failedRequests.length} failed request${result.failedRequests.length === 1 ? "" : "s"}` : null,
		result.lightBackground ? "light background" : null,
	].filter(Boolean);
	return counts.length > 0 ? counts.join(", ") : "ok";
}

function formatRunResult(result: DemoRunResult): string {
	if (result.ok) {
		const probe =
			result.probeResult !== undefined
				? ` Probe result: ${JSON.stringify(result.probeResult) ?? "undefined"}.`
				: "";
		const kit = result.kitTest ? ` Kit self-test: ${result.kitTest.panels} panels, ${result.kitTest.steps} steps run, every control swept.` : "";
		return `PASSED: no console errors, no uncaught errors, no failed requests.${kit}${probe} Check the screenshot; if it looks right, finish with your notes, otherwise fix and re-test.`;
	}
	const sections: string[] = [`FAILED: ${summarizeCounts(result)}.`];
	if (result.consoleErrors.length > 0)
		sections.push(`Console errors:\n${result.consoleErrors.slice(0, 10).map((e) => `- ${e}`).join("\n")}`);
	if (result.pageErrors.length > 0)
		sections.push(`Uncaught errors:\n${result.pageErrors.slice(0, 10).map((e) => `- ${e}`).join("\n")}`);
	if (result.failedRequests.length > 0)
		sections.push(`Failed requests:\n${result.failedRequests.slice(0, 10).map((r) => `- ${r}`).join("\n")}`);
	if (result.lightBackground)
		sections.push(`Light page background (${result.lightBackground}): use background: var(--lh-bg) and the other --lh-* colors.`);
	sections.push("Fix the document (write_demo) and re-test (run_demo).");
	return sections.join("\n");
}

/** Short summary of a run for failure notes. */
function failureSummary(result: DemoRunResult | null): string {
	if (!result) return "never tested";
	const details = [
		...result.consoleErrors,
		...result.pageErrors,
		...result.failedRequests,
		...(result.lightBackground ? [`light background ${result.lightBackground}`] : []),
	].slice(0, 5);
	return details.length > 0 ? `${summarizeCounts(result)} — ${details.join(" | ")}` : summarizeCounts(result);
}

export async function runDemoBuilder(input: DemoBuilderInput, opts: DemoBuilderOptions = {}): Promise<DemoResult> {
	const headless = opts.headless ?? getHeadless();
	const title = input.title.trim() || "Interactive demo";
	const brief = input.brief.trim() || "(no brief)";
	const notes = (text: string) => (text.trim() ? text.trim() : undefined);

	const reason = headless.unavailableReason();
	if (reason) {
		return { title, html: "", tested: true, notes: `FAILED: ${reason}` };
	}

	const state: BuilderState = { html: null, testedHtml: null, lastResult: null };

	const prompt = [
		`Demo title: ${title}`,
		`Brief (all you know about the lesson — this comes from the teacher, verbatim):`,
		brief,
		"",
		"Build the demo, test it with run_demo, iterate until PASSED, then finish with your notes.",
	].join("\n");

	let finalText = "";
	try {
		const result = await runSubagent(Object.values(createDemoBuilderTools(state, headless, opts.onActivity)), {
			role: "demoBuilder",
			engine: opts.engine,
			systemPrompt: INSTRUCTIONS,
			prompt,
			maxTurns: opts.maxSteps ?? 24,
			abortSignal: opts.abortSignal,
			onUsage: (usage) => opts.onUsage?.(usage),
			onToolStart: (toolName) => opts.onActivity?.(toolName),
			chatId: opts.chatId,
		});
		finalText = result.text;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return { title, html: "", tested: true, notes: `FAILED: the builder crashed — ${msg}` };
	}

	// The model produced nothing.
	if (!state.html) {
		return {
			title,
			html: "",
			tested: true,
			notes: `FAILED: the builder never wrote a demo.${finalText ? ` (${finalText.slice(0, 300)})` : ""}`,
		};
	}

	// The verify gate: the delivered html must have a clean headless run —
	// even when the model claims success or forgets the final run_demo.
	if (state.testedHtml !== state.html || !state.lastResult?.ok) {
		opts.onActivity?.("final verification");
		let verify: DemoRunResult;
		try {
			verify = await headless.runDemo(state.html);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return { title, html: "", tested: true, notes: `FAILED: final verification crashed — ${msg}` };
		}
		state.lastResult = verify;
		if (!verify.ok) {
			return {
				title,
				html: "",
				tested: true,
				notes: `FAILED: the demo never passed headless verification (${failureSummary(verify)}).`,
			};
		}
	}

	return { title, html: state.html, tested: true, notes: notes(finalText) };
}
