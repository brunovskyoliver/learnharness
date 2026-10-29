/** Demo kit: spec validation, the stored HTML, layout, and the builder's
 *  kit tool + screenshot result (2026-10-27). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kitDemoHtml, kitSpecOf, validateDemoKitSpec, type DemoKitSpec } from "../src/core/demo-kit.ts";
import { layeredLayout } from "../src/core/demo-kit-layout.ts";
import { createDemoBuilderTools } from "../src/agent/subagents/demo-builder.ts";
import type { DemoRunResult, HeadlessApi } from "../src/agent/subagents/headless.ts";
import { downloadableDemo } from "../components/artifacts/demo-card.tsx";

const GD: DemoKitSpec = {
	params: {
		w0: { type: "slider", label: "Initial weight", min: 0, max: 6, step: 0.1, value: 5 },
		eta: { type: "select", label: "Learning rate", options: [0.1, 0.75], value: 0.1 },
	},
	state: { w: "p.w0", trail: "[]" },
	step: "s.w -= p.eta * 2 * (s.w - 3); s.trail.push({t, w: s.w});",
	stopWhen: "abs(s.w - 3) < 1e-4",
	derived: { L: "(s.w - 3) ** 2" },
	panels: [
		{ type: "chart", data: { trail: "s.trail" }, spec: { data: { name: "trail" }, mark: "line", encoding: {} } },
		{ type: "plot3d", traces: "[]" },
		{ type: "flow", nodes: "[{id: 'a'}]", edges: "[]" },
		{ type: "readouts", items: [{ label: "w", value: "s.w" }] },
		{ type: "table", columns: ["t", "w"], rows: "s.trail.map(r => [r.t, r.w])" },
		{ type: "note", text: "Press **Run**." },
	],
};

describe("demo kit spec", () => {
	it("accepts every panel type", () => {
		assert.deepEqual(validateDemoKitSpec(GD), []);
	});

	it("reports schema problems with their path", () => {
		const problems = validateDemoKitSpec({ panels: [] });
		assert.ok(problems.length > 0);
		assert.ok(problems.some((p) => p.includes("/panels")), problems.join("\n"));
	});

	it("compiles every expression and the step body", () => {
		const bad = { ...GD, step: "s.w -= (", derived: { L: "s.w +* 2" } };
		const problems = validateDemoKitSpec(bad);
		assert.ok(problems.some((p) => p.startsWith("step:")));
		assert.ok(problems.some((p) => p.startsWith("derived.L:")));
	});

	it("checks control values and stopWhen without a step", () => {
		const bad: DemoKitSpec = {
			params: {
				a: { type: "slider", label: "a", min: 0, max: 1, step: 0.1, value: 2 },
				b: { type: "select", label: "b", options: [1, 2], value: 3 },
			},
			stopWhen: "true",
			panels: [{ type: "note", text: "x" }],
		};
		const problems = validateDemoKitSpec(bad);
		assert.ok(problems.some((p) => p.startsWith("params.a")));
		assert.ok(problems.some((p) => p.startsWith("params.b")));
		assert.ok(problems.some((p) => p.startsWith("stopWhen: needs a step")));
	});

	it("stores as HTML that embeds the spec safely and loads the runtime", () => {
		const spec: DemoKitSpec = { panels: [{ type: "note", text: "</script><script>alert(1)</script>" }] };
		const html = kitDemoHtml(spec);
		assert.equal((html.match(/<\/script>/g) ?? []).length, 2, "only the two real closing tags");
		assert.match(html, /<script src="\/demo-kit\/runtime\.js"><\/script>/);
		assert.deepEqual(kitSpecOf(html), spec);
		assert.equal(kitSpecOf("<html><body>hand-written</body></html>"), null);
	});
});

describe("flow layout", () => {
	it("ranks by longest path and centers shorter ranks", () => {
		const pos = layeredLayout(
			[{ id: "w" }, { id: "x" }, { id: "mul" }, { id: "y" }, { id: "sub" }],
			[{ from: "w", to: "mul" }, { from: "x", to: "mul" }, { from: "mul", to: "sub" }, { from: "y", to: "sub" }],
		);
		assert.equal(pos.get("w")!.x, 0);
		assert.equal(pos.get("mul")!.x, 220);
		assert.equal(pos.get("sub")!.x, 440);
		assert.equal(pos.get("y")!.x, 0, "a source sits in the first rank");
		assert.ok(pos.get("mul")!.y > pos.get("w")!.y, "the single node of a rank is centered");
	});

	it("survives cycles and top-to-bottom direction", () => {
		const pos = layeredLayout([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }, { from: "b", to: "a" }], { direction: "TB" });
		assert.equal(pos.size, 2);
		assert.notEqual(pos.get("a")!.y, pos.get("b")!.y);
	});
});

describe("builder kit tools", () => {
	const png = Buffer.from("89504e47", "hex");
	const fake = (result: Partial<DemoRunResult>): HeadlessApi =>
		({
			available: () => true,
			unavailableReason: () => null,
			runDemo: async () => ({ consoleErrors: [], pageErrors: [], failedRequests: [], ok: true, ...result }),
		}) as unknown as HeadlessApi;
	const text = (r: { content: { type: string; text?: string }[] }) => r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");

	it("write_kit_demo saves valid specs as kit HTML and lists problems otherwise", async () => {
		const state = { html: null as string | null, testedHtml: null, lastResult: null };
		const tools = createDemoBuilderTools(state, fake({}));
		const bad = await tools.write_kit_demo!.execute("c1", { spec: { panels: [] } }, undefined as never);
		assert.match(text(bad as never), /INVALID SPEC/);
		assert.equal(state.html, null);
		const good = await tools.write_kit_demo!.execute("c2", { spec: GD }, undefined as never);
		assert.match(text(good as never), /Saved/);
		assert.deepEqual(kitSpecOf(state.html!), GD);
	});

	it("write_kit_demo finalizes real token splits without evaluating kit expressions or accepting agent tokens", async () => {
		const state = { html: null as string | null, testedHtml: null, lastResult: null };
		const tools = createDemoBuilderTools(state, fake({}));
		const spec: DemoKitSpec = { panels: [
			{ type: "tokens", text: "hello", link: "words" },
			{ type: "heatmap", rows: '["hello"]', cols: '["hello"]', values: '(() => { throw new Error("server must not evaluate expressions"); })()', scale: "sequential", link: "words" },
			{ type: "tokens", text: "hello", encoding: "gpt2" },
		] };
		const written = await tools.write_kit_demo!.execute("ml", { spec }, undefined);
		assert.match(text(written), /Saved/);
		const saved = kitSpecOf(state.html!)!;
		for (const index of [0, 2]) assert.deepEqual((saved.panels[index] as any).tokenized, {
			o200k: [{ id: 24912, text: "hello" }], cl100k: [{ id: 15339, text: "hello" }], gpt2: [{ id: 31373, text: "hello" }],
		});
		assert.deepEqual(saved.panels[1], spec.panels[1]);
		assert.equal("tokenized" in spec.panels[0]!, false);
		const previous = state.html;
		const refused = await tools.write_kit_demo!.execute("forged", { spec: saved }, undefined);
		assert.match(text(refused), /INVALID SPEC.*nothing saved/s);
		assert.match(text(refused), /only the server may supply tokens/);
		assert.equal(state.html, previous);
	});

	it("run_demo returns the screenshot as an image and reports the kit self-test", async () => {
		const state = { html: kitDemoHtml(GD), testedHtml: null, lastResult: null };
		const tools = createDemoBuilderTools(state, fake({ screenshot: png, kitTest: { panels: 6, steps: 30 } }));
		const result = (await tools.run_demo!.execute("c3", {}, undefined as never)) as { content: { type: string; mimeType?: string }[] };
		assert.match(text(result as never), /PASSED.*6 panels, 30 steps/);
		assert.ok(result.content.some((c) => c.type === "image" && c.mimeType === "image/png"));
	});
});

describe("downloaded demos", () => {
	it("carry the theme and load kit scripts and the font from the app", () => {
		const out = downloadableDemo(kitDemoHtml(GD), "https://learn.example");
		assert.match(out, /src="https:\/\/learn\.example\/demo-kit\/runtime\.js"/);
		assert.match(out, /url\("https:\/\/learn\.example\/fonts\/source-sans-3-latin\.woff2"\)/);
		assert.match(out, /data-lh-theme/);
	});
});
