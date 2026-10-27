/** Demo kit runtime: draws a demo-kit spec (src/core/demo-kit.ts) inside the
 *  demo's sandboxed iframe. Built by scripts/build-demo-kit.mjs into
 *  public/demo-kit/runtime.js; Vega, Plotly and React Flow load from the
 *  same folder only when a panel needs them. Colors and fonts come from the
 *  --lh-* variables injected ahead of the demo (src/core/demo-theme.ts). */

import { layeredLayout } from "../core/demo-kit-layout.ts";
import type { DemoKitPanel, DemoKitSpec } from "../core/demo-kit.ts";

type Values = Record<string, any>;
interface PanelView {
	update(): Promise<void> | void;
}
interface FlowApi {
	render(el: HTMLElement, props: unknown): { update(props: unknown): void };
}
declare global {
	interface Window {
		vega?: any;
		vegaLite?: any;
		Plotly?: any;
		LHFlow?: FlowApi;
		__lhKit?: KitApi;
	}
}
interface KitApi {
	ready: Promise<void>;
	errors: string[];
	selfTest(): Promise<{ errors: string[]; panels: number; steps: number }>;
}

const script = document.currentScript as HTMLScriptElement | null;
const BASE = script?.src ? script.src.replace(/runtime\.js(?:\?.*)?$/, "") : "/demo-kit/";

const loaded = new Map<string, Promise<void>>();
function load(file: string): Promise<void> {
	let p = loaded.get(file);
	if (!p) {
		p = new Promise<void>((resolve, reject) => {
			const css = file.endsWith(".css");
			const el = css ? document.createElement("link") : document.createElement("script");
			if (css) {
				(el as HTMLLinkElement).rel = "stylesheet";
				(el as HTMLLinkElement).href = BASE + file;
			} else (el as HTMLScriptElement).src = BASE + file;
			el.onload = () => resolve();
			el.onerror = () => reject(new Error(`could not load ${file}`));
			document.head.appendChild(el);
		});
		loaded.set(file, p);
	}
	return p;
}

function cssVar(name: string, fallback: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
const theme = {
	bg: cssVar("--lh-bg", "#1c1c1c"),
	surface: cssVar("--lh-surface", "#232323"),
	surface2: cssVar("--lh-surface-2", "#2a2a2a"),
	border: cssVar("--lh-border", "#434343"),
	text: cssVar("--lh-text", "#e6e6e6"),
	muted: cssVar("--lh-muted", "#8d8d8d"),
	series: ["--lh-blue", "--lh-teal", "--lh-amber", "--lh-red", "--lh-green"].map((v, i) =>
		cssVar(v, ["#7cacf8", "#5fd4c4", "#e5b55a", "#f28b82", "#7fd18b"][i]!),
	),
	font: cssVar("--lh-font", "system-ui, sans-serif"),
	mono: cssVar("--lh-mono", "ui-monospace, monospace"),
};

const STYLE = `
#lh-kit{display:flex;flex-direction:column;gap:12px;padding:2px;font-size:14px;line-height:1.45}
.k-controls{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end;padding:12px 14px;border:1px solid var(--lh-border);border-radius:8px;background:var(--lh-surface)}
.k-field{display:flex;flex-direction:column;gap:4px;min-width:180px;flex:1 1 200px}
.k-label{display:flex;justify-content:space-between;gap:8px;color:var(--lh-muted);font-size:12px}
.k-label b{color:var(--lh-text);font-weight:600;font-variant-numeric:tabular-nums}
.k-field input[type=range]{width:100%;accent-color:var(--lh-blue)}
.k-seg{display:flex;gap:2px;padding:2px;border-radius:6px;background:var(--lh-surface-2)}
.k-seg button,.k-btn{border:0;border-radius:5px;padding:4px 10px;background:transparent;color:var(--lh-muted);cursor:pointer;font-size:13px}
.k-seg button[aria-pressed=true]{background:var(--lh-bg);color:var(--lh-text)}
.k-buttons{display:flex;gap:6px;flex:0 0 auto}
.k-btn{border:1px solid var(--lh-border);color:var(--lh-text);padding:5px 14px}
.k-btn:hover{background:var(--lh-surface-2)}
.k-btn.k-primary{background:var(--lh-blue);border-color:var(--lh-blue);color:#10141c}
.k-toggle{display:flex;align-items:center;gap:8px;color:var(--lh-text);font-size:13px;cursor:pointer}
.k-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.k-panel{grid-column:span 2;min-width:0;border:1px solid var(--lh-border);border-radius:8px;background:var(--lh-surface);padding:10px 12px}
.k-panel.k-half{grid-column:span 1}
@media (max-width:560px){.k-panel.k-half{grid-column:span 2}}
.k-title{font-size:12px;color:var(--lh-muted);margin:0 0 6px}
.k-readouts{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.k-readout{padding:6px 10px;border-radius:6px;background:var(--lh-surface-2)}
.k-readout span{display:block;font-size:12px;color:var(--lh-muted)}
.k-readout b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.k-note{border:0;background:transparent;padding:0 2px;color:var(--lh-text)}
.k-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.k-table th,.k-table td{padding:4px 8px;border-bottom:1px solid var(--lh-border);text-align:right}
.k-table th{color:var(--lh-muted);font-weight:500;font-size:12px}
.k-table th:first-child,.k-table td:first-child{text-align:left}
.k-chart{width:100%}
.k-error{padding:8px 10px;border-radius:6px;background:rgba(242,139,130,.12);color:var(--lh-red);font:12px var(--lh-mono)}
`;

const MATH = Object.getOwnPropertyNames(Math);
const MATH_VALUES = MATH.map((k) => (Math as any)[k]);
const SCOPE = ["p", "s", "d", "t", "range", ...MATH];

function range(start: number, stop: number, step = 1): number[] {
	const out: number[] = [];
	if (step <= 0) return out;
	for (let x = start; x <= stop + step * 1e-9 && out.length < 100_000; x += step) out.push(+x.toFixed(12));
	return out;
}

function fmt(v: unknown, digits = 3): string {
	if (typeof v === "number") {
		if (!Number.isFinite(v)) return String(v);
		if (Number.isInteger(v)) return String(v);
		return String(+v.toFixed(digits));
	}
	if (Array.isArray(v)) return `[${v.map((x) => fmt(x, digits)).join(", ")}]`;
	return String(v);
}

function escapeHtml(text: string): string {
	return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (html !== undefined) node.innerHTML = html;
	return node;
}

class Kit {
	p: Values = {};
	s: Values = {};
	d: Values = {};
	t = 0;
	errors: string[] = [];
	private compiled = new Map<string, (...args: unknown[]) => unknown>();
	private views: PanelView[] = [];
	private timer: number | null = null;
	private runButton: HTMLButtonElement | null = null;
	private errorBox: HTMLElement;
	private resets: ((key: string) => boolean) = () => false;

	constructor(private spec: DemoKitSpec, private root: HTMLElement) {
		this.errorBox = el("div", "k-error");
		this.errorBox.hidden = true;
	}

	private fn(body: string): (...args: unknown[]) => unknown {
		let f = this.compiled.get(body);
		if (!f) {
			f = new Function(...SCOPE, body) as (...args: unknown[]) => unknown;
			this.compiled.set(body, f);
		}
		return f;
	}
	private call(body: string): unknown {
		return this.fn(body)(this.p, this.s, this.d, this.t, range, ...MATH_VALUES);
	}
	eval(expr: string): any {
		return this.call(`return (${expr});`);
	}

	report(where: string, err: unknown) {
		const message = `${where}: ${err instanceof Error ? err.message : String(err)}`;
		if (!this.errors.includes(message)) {
			this.errors.push(message);
			console.error(`[demo kit] ${message}`);
		}
		this.errorBox.textContent = message;
		this.errorBox.hidden = false;
	}

	resetState() {
		this.s = {};
		this.t = 0;
		for (const [k, e] of Object.entries(this.spec.state ?? {})) {
			try {
				this.s[k] = this.eval(e);
			} catch (err) {
				this.report(`state.${k}`, err);
			}
		}
	}

	derive() {
		this.d = {};
		for (const [k, e] of Object.entries(this.spec.derived ?? {})) {
			try {
				this.d[k] = this.eval(e);
			} catch (err) {
				this.report(`derived.${k}`, err);
			}
		}
	}

	async refresh() {
		this.derive();
		await Promise.all(this.views.map(async (v, i) => {
			try {
				await v.update();
			} catch (err) {
				this.report(`panels[${i}]`, err);
			}
		}));
	}

	setParam(key: string, value: unknown) {
		this.p[key] = value;
		if (this.resets(key)) {
			this.pause();
			this.resetState();
		}
		void this.refresh();
	}

	stepOnce(): boolean {
		if (!this.spec.step) return false;
		try {
			this.call(this.spec.step);
			this.t += 1;
		} catch (err) {
			this.report("step", err);
			this.pause();
			return false;
		}
		return true;
	}

	stopped(): boolean {
		const max = this.spec.run?.maxSteps ?? 200;
		if (this.t >= max) return true;
		if (!this.spec.stopWhen) return false;
		try {
			this.derive();
			return Boolean(this.eval(this.spec.stopWhen));
		} catch (err) {
			this.report("stopWhen", err);
			return true;
		}
	}

	play() {
		if (this.timer !== null) return;
		if (this.stopped()) return;
		this.timer = window.setInterval(() => {
			if (!this.stepOnce() || this.stopped()) this.pause();
			void this.refresh();
		}, this.spec.run?.intervalMs ?? 120);
		if (this.runButton) this.runButton.textContent = "Pause";
	}

	pause() {
		if (this.timer !== null) window.clearInterval(this.timer);
		this.timer = null;
		if (this.runButton) this.runButton.textContent = "Run";
	}

	private controls(): HTMLElement | null {
		const params = Object.entries(this.spec.params ?? {});
		if (params.length === 0 && !this.spec.step) return null;
		const box = el("div", "k-controls");
		for (const [key, param] of params) {
			this.p[key] = param.value;
			const field = el("div", "k-field");
			if (param.type === "slider") {
				const label = el("div", "k-label", `${escapeHtml(param.label)}<b>${fmt(param.value)}</b>`);
				const input = el("input");
				Object.assign(input, { type: "range", min: String(param.min), max: String(param.max), step: String(param.step), value: String(param.value) });
				input.setAttribute("aria-label", param.label);
				input.addEventListener("input", () => {
					const v = Number(input.value);
					label.querySelector("b")!.textContent = fmt(v);
					this.setParam(key, v);
				});
				field.append(label, input);
			} else if (param.type === "select") {
				field.append(el("div", "k-label", escapeHtml(param.label)));
				const seg = el("div", "k-seg");
				for (const option of param.options) {
					const b = el("button", undefined, escapeHtml(fmt(option)));
					b.type = "button";
					b.setAttribute("aria-pressed", String(option === param.value));
					b.addEventListener("click", () => {
						seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
						this.setParam(key, option);
					});
					seg.append(b);
				}
				field.append(seg);
			} else {
				const label = el("label", "k-toggle");
				const input = el("input");
				input.type = "checkbox";
				input.checked = param.value;
				input.addEventListener("change", () => this.setParam(key, input.checked));
				label.append(input, document.createTextNode(param.label));
				field.append(label);
			}
			box.append(field);
		}
		if (this.spec.step) {
			const buttons = el("div", "k-buttons");
			const button = (text: string, onClick: () => void, primary = false) => {
				const b = el("button", primary ? "k-btn k-primary" : "k-btn", text);
				b.type = "button";
				b.addEventListener("click", onClick);
				buttons.append(b);
				return b;
			};
			button("Step", () => {
				this.pause();
				if (!this.stopped()) this.stepOnce();
				void this.refresh();
			});
			this.runButton = button("Run", () => (this.timer === null ? this.play() : this.pause()), true);
			button("Reset", () => {
				this.pause();
				this.resetState();
				void this.refresh();
			});
			box.append(buttons);
		}
		return box;
	}

	async mount() {
		const style = el("style");
		style.textContent = STYLE;
		document.head.append(style);
		const controls = this.controls();
		// A param resets the state when a state expression reads it.
		const reads = (key: string) =>
			Object.values(this.spec.state ?? {}).some((e) => new RegExp(`\\bp\\.${key}\\b|\\bp\\[["']${key}["']\\]`).test(e));
		this.resets = reads;
		this.resetState();
		this.derive();
		if (controls) this.root.append(controls);
		this.root.append(this.errorBox);
		const grid = el("div", "k-grid");
		this.root.append(grid);
		this.views = await Promise.all(
			this.spec.panels.map(async (panel, i) => {
				const box = el("section", `k-panel${panel.width === "half" ? " k-half" : ""}${panel.type === "note" ? " k-note" : ""}`);
				if ("title" in panel && panel.title) box.append(el("h3", "k-title", escapeHtml(panel.title)));
				grid.append(box);
				try {
					return await this.panel(panel, box);
				} catch (err) {
					this.report(`panels[${i}]`, err);
					return { update() {} };
				}
			}),
		);
		await this.refresh();
	}

	private async panel(panel: DemoKitPanel, box: HTMLElement): Promise<PanelView> {
		switch (panel.type) {
			case "note": {
				box.append(el("div", undefined, escapeHtml(panel.text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")));
				return { update() {} };
			}
			case "readouts": {
				const grid = el("div", "k-readouts");
				const cells = panel.items.map((item) => {
					const cell = el("div", "k-readout", `<span>${escapeHtml(item.label)}</span><b></b>`);
					grid.append(cell);
					return cell.querySelector("b")!;
				});
				box.append(grid);
				return {
					update: () => panel.items.forEach((item, i) => (cells[i]!.textContent = fmt(this.eval(item.value), item.digits))),
				};
			}
			case "table": {
				const table = el("table", "k-table");
				table.innerHTML = `<thead><tr>${panel.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody></tbody>`;
				box.append(table);
				const body = table.querySelector("tbody")!;
				return {
					update: () => {
						const rows = this.eval(panel.rows) as unknown[][];
						body.innerHTML = (rows ?? [])
							.slice(0, 200)
							.map((r) => `<tr>${(r ?? []).map((v) => `<td>${escapeHtml(fmt(v, panel.digits))}</td>`).join("")}</tr>`)
							.join("");
					},
				};
			}
			case "chart":
				return this.chart(panel, box);
			case "plot3d":
				return this.plot3d(panel, box);
			case "flow":
				return this.flow(panel, box);
		}
	}

	private async chart(panel: Extract<DemoKitPanel, { type: "chart" }>, box: HTMLElement): Promise<PanelView> {
		await load("vega.js");
		const { vega, vegaLite } = window;
		const target = el("div", "k-chart");
		box.append(target);
		const config = {
			background: null,
			font: theme.font,
			numberFormat: "~g",
			view: { stroke: null },
			axis: {
				labelColor: theme.muted,
				titleColor: theme.muted,
				gridColor: theme.border,
				gridOpacity: 0.5,
				domainColor: theme.border,
				tickColor: theme.border,
				labelFontSize: 11,
				titleFontSize: 12,
				titleFontWeight: 500,
			},
			legend: { labelColor: theme.text, titleColor: theme.muted, labelFontSize: 12 },
			range: { category: theme.series },
			mark: { color: theme.series[0] },
			line: { strokeWidth: 2 },
			point: { filled: true, size: 50 },
			text: { color: theme.text },
			rule: { color: theme.muted },
		};
		const vl = { ...panel.spec, width: "container", height: panel.width === "half" ? 220 : 260, autosize: { type: "fit", contains: "padding" }, config };
		const compiled = vegaLite.compile(vl).spec;
		const view = new vega.View(vega.parse(compiled), { renderer: "svg", container: target, hover: true });
		const names = Object.keys(panel.data);
		return {
			update: async () => {
				for (const name of names) view.data(name, this.eval(panel.data[name]!) ?? []);
				await view.runAsync();
			},
		};
	}

	private async plot3d(panel: Extract<DemoKitPanel, { type: "plot3d" }>, box: HTMLElement): Promise<PanelView> {
		await load("plotly.js");
		const Plotly = window.Plotly;
		const target = el("div", "k-chart");
		box.append(target);
		const axis = { color: theme.muted, gridcolor: theme.border, zerolinecolor: theme.border, linecolor: theme.border };
		const extra = (panel.layout ?? {}) as Values;
		const layout = {
			...extra,
			paper_bgcolor: "rgba(0,0,0,0)",
			plot_bgcolor: "rgba(0,0,0,0)",
			font: { family: theme.font, color: theme.text, size: 12 },
			colorway: theme.series,
			margin: { l: 40, r: 10, t: 10, b: 40, ...(extra.margin ?? {}) },
			height: extra.height ?? (panel.width === "half" ? 280 : 360),
			xaxis: { ...axis, ...(extra.xaxis ?? {}) },
			yaxis: { ...axis, ...(extra.yaxis ?? {}) },
			scene: {
				...(extra.scene ?? {}),
				xaxis: { ...axis, backgroundcolor: "rgba(0,0,0,0)", ...(extra.scene?.xaxis ?? {}) },
				yaxis: { ...axis, backgroundcolor: "rgba(0,0,0,0)", ...(extra.scene?.yaxis ?? {}) },
				zaxis: { ...axis, backgroundcolor: "rgba(0,0,0,0)", ...(extra.scene?.zaxis ?? {}) },
			},
			showlegend: extra.showlegend ?? false,
		};
		const SCENE = new Set(["surface", "scatter3d", "mesh3d", "cone", "streamtube", "isosurface", "volume"]);
		return {
			update: async () => {
				const traces = (this.eval(panel.traces) ?? []) as { type?: string }[];
				// 3D scenes fill the panel; 2D plots keep room for axis labels.
				const scene = traces.some((tr) => SCENE.has(tr.type ?? ""));
				const margin = scene ? { l: 0, r: 0, t: 0, b: 0, ...(extra.margin ?? {}) } : layout.margin;
				await Plotly.react(target, traces, { ...layout, margin }, { displayModeBar: false, responsive: true, scrollZoom: false });
			},
		};
	}

	private async flow(panel: Extract<DemoKitPanel, { type: "flow" }>, box: HTMLElement): Promise<PanelView> {
		await Promise.all([load("flow.css"), load("flow.js")]);
		const target = el("div", "k-flow");
		target.style.height = panel.width === "half" ? "240px" : "300px";
		box.append(target);
		const props = () => {
			const nodes = (this.eval(panel.nodes) ?? []) as { id: string; label?: string; value?: unknown; highlight?: boolean }[];
			const edges = (this.eval(panel.edges) ?? []) as { from: string; to: string; label?: string; highlight?: boolean }[];
			const pos = layeredLayout(nodes, edges, { direction: panel.direction ?? "LR" });
			return {
				direction: panel.direction ?? "LR",
				theme,
				nodes: nodes.map((n) => ({
					id: String(n.id),
					label: n.label ?? String(n.id),
					value: n.value === undefined ? undefined : fmt(n.value),
					highlight: Boolean(n.highlight),
					position: pos.get(n.id) ?? { x: 0, y: 0 },
				})),
				edges: edges.map((e) => ({ from: String(e.from), to: String(e.to), label: e.label, highlight: Boolean(e.highlight) })),
			};
		};
		const handle = window.LHFlow!.render(target, props());
		return { update: () => handle.update(props()) };
	}

	async selfTest() {
		const before = this.errors.length;
		const steps = Math.min(this.spec.run?.maxSteps ?? 200, 30);
		let ran = 0;
		if (this.spec.step) {
			for (; ran < steps && !this.stopped(); ran++) this.stepOnce();
			await this.refresh();
			this.resetState();
		}
		for (const [key, param] of Object.entries(this.spec.params ?? {})) {
			const original = this.p[key];
			const values = param.type === "slider" ? [param.min, param.max] : param.type === "select" ? param.options : [!param.value];
			for (const v of values) {
				this.p[key] = v;
				if (this.resets(key)) this.resetState();
				await this.refresh();
			}
			this.p[key] = original;
			if (this.resets(key)) this.resetState();
		}
		await this.refresh();
		return { errors: this.errors.slice(before), panels: this.views.length, steps: ran };
	}
}

function start() {
	const root = document.getElementById("lh-kit");
	const source = document.getElementById("lh-kit-spec");
	let resolveReady!: () => void;
	const api: KitApi = {
		ready: new Promise<void>((r) => (resolveReady = r)),
		errors: [],
		selfTest: async () => ({ errors: ["the kit did not start"], panels: 0, steps: 0 }),
	};
	window.__lhKit = api;
	if (!root || !source) {
		console.error("[demo kit] missing #lh-kit or its spec");
		resolveReady();
		return;
	}
	let spec: DemoKitSpec;
	try {
		spec = JSON.parse(source.textContent ?? "") as DemoKitSpec;
	} catch (err) {
		console.error(`[demo kit] bad spec: ${err instanceof Error ? err.message : String(err)}`);
		resolveReady();
		return;
	}
	const kit = new Kit(spec, root);
	api.errors = kit.errors;
	api.selfTest = () => kit.selfTest();
	kit.mount().then(resolveReady, (err) => {
		kit.report("mount", err);
		resolveReady();
	});
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
