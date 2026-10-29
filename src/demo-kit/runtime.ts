/** Demo kit runtime: draws a demo-kit spec (src/core/demo-kit.ts) inside the
 *  demo's sandboxed iframe. Built by scripts/build-demo-kit.mjs into
 *  public/demo-kit/runtime.js; Vega, Plotly and React Flow load from the
 *  same folder only when a panel needs them. Colors and fonts come from the
 *  --lh-* variables injected ahead of the demo (src/core/demo-theme.ts). */

import { DEMO_THEME_VARS, DEMO_SCROLLBAR_CSS } from "../core/demo-theme.ts";
import { distribution, sample, type SamplingOptions, type SamplingToken, type SamplingRow } from "../core/ml-sampling.ts";
import { layeredLayout } from "../core/demo-kit-layout.ts";
import type { FinalizedDemoKitPanel as DemoKitPanel, FinalizedDemoKitSpec as DemoKitSpec, TokenizedPanel, Token, TokenEncoding } from "../core/demo-kit.ts";

type Values = Record<string, any>;
interface PanelView {
	focus?(focused: boolean): void;
	theme?(): Promise<void> | void;
	resize?(): Promise<void> | void;
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
function readTheme() {
	return {
		bg: cssVar("--lh-bg", DEMO_THEME_VARS["--lh-bg"]),
		surface: cssVar("--lh-surface", DEMO_THEME_VARS["--lh-surface"]),
		surface2: cssVar("--lh-surface-2", DEMO_THEME_VARS["--lh-surface-2"]),
		border: cssVar("--lh-border", DEMO_THEME_VARS["--lh-border"]),
		text: cssVar("--lh-text", DEMO_THEME_VARS["--lh-text"]),
		muted: cssVar("--lh-muted", DEMO_THEME_VARS["--lh-muted"]),
		series: ["--lh-blue", "--lh-teal", "--lh-amber", "--lh-red", "--lh-green"].map((v, i) =>
			cssVar(v, ["#7cacf8", "#5fd4c4", "#e5b55a", "#f28b82", "#7fd18b"][i]!),
		),
		font: cssVar("--lh-font", "system-ui, sans-serif"),
		mono: cssVar("--lh-mono", "ui-monospace, monospace"),
	};
}
const theme = readTheme();

const STYLE = `
${DEMO_SCROLLBAR_CSS}
#lh-kit{display:flex;flex-direction:column;gap:12px;padding:2px;font-size:var(--lh-demo-size,17px);line-height:1.5}
.k-controls{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end;padding:12px 0;border:0;border-radius:0;background:transparent;order:2}
.k-field{display:flex;flex-direction:column;gap:4px;min-width:min(180px,100%);max-width:100%;flex:1 1 200px}
.k-label{display:flex;justify-content:space-between;gap:8px;color:var(--lh-muted);font-size:.8em}
.k-label b{color:var(--lh-text);font-weight:600;font-variant-numeric:tabular-nums}
.k-field input[type=range]{width:100%;accent-color:var(--lh-text)}
.k-seg{display:flex;gap:2px;padding:2px;border-radius:6px;background:var(--lh-surface-2)}
.k-seg button,.k-btn{border:0;border-radius:5px;padding:4px 10px;background:transparent;color:var(--lh-muted);cursor:pointer;font-size:.9em}
.k-seg button[aria-pressed=true]{background:var(--lh-bg);color:var(--lh-text)}
.k-buttons{display:flex;gap:6px;flex:0 0 auto}
.k-btn{border:1px solid var(--lh-border);color:var(--lh-text);padding:5px 14px}
.k-btn:hover{background:var(--lh-surface-2)}
.k-btn.k-primary{background:var(--lh-text);border-color:var(--lh-text);color:var(--lh-bg)}
.k-toggle{display:flex;align-items:center;gap:8px;color:var(--lh-text);font-size:.9em;cursor:pointer}
.k-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.k-panel{grid-column:span 2;min-width:0;border:0;border-radius:0;background:transparent;padding:10px 0}
.k-panel.k-half{grid-column:span 1}
@media (max-width:560px){.k-panel.k-half{grid-column:span 2}}
.k-title{font-size:.8em;color:var(--lh-muted);margin:0 0 6px}
.k-readouts{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.k-readout{padding:6px 10px;border-radius:6px;background:var(--lh-surface-2)}
.k-readout span{display:block;font-size:.8em;color:var(--lh-muted)}
.k-readout b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums}
.k-note{border:0;background:transparent;padding:0 2px;color:var(--lh-text)}
.k-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.k-table th,.k-table td{padding:4px 8px;text-align:right}
.k-table th{color:var(--lh-muted);font-weight:500;font-size:.8em}
.k-table th:first-child,.k-table td:first-child{text-align:left}
.k-chart{width:100%;min-width:0}
.k-chart text{font-size:max(12px,calc(var(--lh-demo-size,17px)*.75))!important}
.k-flow .react-flow__node{font-size:max(13px,calc(var(--lh-demo-size,17px)*.85))}
.k-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}
.k-icon-button{display:inline-flex;width:32px;height:32px;flex-shrink:0;align-items:center;justify-content:center;border:0;border-radius:8px;padding:0;background:transparent;color:var(--lh-muted);cursor:pointer}
.k-icon-button:hover{background:var(--lh-surface-2);color:var(--lh-text)}
@media(pointer:coarse){.k-icon-button{width:44px;height:44px}.k-seg button,.k-btn,.k-toggle,.k-parameters-toggle{min-height:44px}.k-field input[type=range]{min-height:44px}}
.k-focus .k-panel-head .k-icon-button{display:none}
.k-panel-head h3{margin:0;font-size:1em;color:var(--lh-text);font-weight:600}
.k-focus .k-grid{display:block;min-width:0;min-height:0}
#lh-kit.k-focus{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,280px);gap:24px;height:100dvh;box-sizing:border-box;padding:16px}
.k-focus .k-controls{grid-column:2;grid-row:1;display:block;overflow:auto;padding:0 0 0 20px}
.k-focus .k-field{margin-bottom:24px;min-width:0}
.k-focus .k-grid{grid-column:1;grid-row:1}
.k-focus:not(:has(.k-controls)) .k-grid{grid-column:1/-1}
.k-focus .k-panel{height:100%;display:flex;flex-direction:column}
.k-focus .k-panel[hidden]{display:none}
.k-focus .k-chart,.k-focus .k-flow{flex:1;min-height:160px;height:100%!important}
.k-parameters-toggle{display:none}
button:focus-visible,input:focus-visible{outline:2px solid var(--lh-muted);outline-offset:3px}
@media(max-width:640px){#lh-kit.k-focus{grid-template-columns:1fr;grid-template-rows:minmax(180px,1fr) auto;gap:12px}.k-focus .k-controls{grid-column:1;grid-row:2;padding:12px 0 0;max-height:45dvh}.k-focus .k-parameters-toggle{display:block;width:100%;text-align:left;margin-bottom:12px}.k-controls.k-collapsed>:not(.k-parameters-toggle){display:none}}
@media(prefers-reduced-motion:reduce){.react-flow__edge-path{animation:none!important}}
.k-error{padding:8px 10px;border-radius:6px;background:rgba(242,139,130,.12);color:var(--lh-red);font:12px var(--lh-mono)}
.k-token-text{resize:none;box-sizing:border-box;width:100%;border:1px solid var(--lh-border);border-radius:6px;background:var(--lh-bg);color:var(--lh-text);padding:8px 10px;font:inherit;line-height:1.6}
.k-token-text:focus-visible{outline:2px solid var(--lh-muted);outline-offset:3px}
.k-token-controls{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:12px 0}
.k-token-controls .k-seg{max-width:100%;overflow-x:auto;flex-wrap:nowrap}.k-token-controls .k-seg button{flex-shrink:0;white-space:nowrap}
.k-token-count,.k-readout-line{font-size:.8em;color:var(--lh-muted);font-variant-numeric:tabular-nums}
.k-readout-line{min-height:1.4em;margin:12px 0 0}
.k-token-strip{display:flex;flex-wrap:wrap;gap:6px;max-width:100%;overflow:auto;padding:4px;transition:opacity 160ms}
.k-token-strip.k-updating{opacity:.6}
.k-token{display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;max-width:100%;overflow-wrap:anywhere;border:0;border-radius:6px;padding:8px 10px;background:color-mix(in srgb,var(--k-token-color) 20%,var(--lh-surface));color:var(--lh-text);font:inherit;white-space:pre-wrap;cursor:pointer}
.k-token:hover,.k-token:focus,.k-token.k-token-pinned{background:color-mix(in srgb,var(--k-token-color) 34%,var(--lh-surface));outline:1px solid var(--k-token-color);outline-offset:-1px}
.k-token:focus-visible{outline:2px solid var(--lh-muted);outline-offset:3px}
.k-token-id{font:12px var(--lh-mono);color:var(--lh-muted);font-variant-numeric:tabular-nums}
.k-token-error{background:transparent;font:inherit;font-size:.8em;padding:0}
@media(pointer:coarse){.k-token{min-width:44px;min-height:44px}}
@media(prefers-reduced-motion:reduce){.k-token-strip{transition:none}}

#lh-kit.k-focus:has(.k-tokens-focus) .k-grid{grid-column:1/-1}
.k-focus .k-panel.k-tokens-focus{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,280px);grid-template-rows:auto auto auto 1fr;gap:12px 24px;align-content:start;height:auto}
.k-tokens-focus .k-panel-head,.k-tokens-focus .k-token-strip,.k-tokens-focus>.k-readout-line,.k-tokens-focus>.k-error{grid-column:1}
.k-tokens-focus .k-token-fields{grid-column:2;grid-row:1/5}
.k-tokens-focus .k-token-controls{align-items:flex-start;flex-direction:column}
@media(max-width:640px){.k-focus .k-panel.k-tokens-focus{grid-template-columns:minmax(0,1fr)}.k-tokens-focus .k-token-fields{grid-column:1;grid-row:5}.k-tokens-focus .k-token-fields.k-controls{grid-row:5}}

.k-panel-head:has(.k-illustrative){display:grid;grid-template-columns:minmax(0,1fr) auto auto}
.k-panel-head:has(.k-illustrative) h3{overflow-wrap:anywhere}
.k-illustrative{font-size:.8em;font-weight:500;color:var(--lh-muted)}
@media(max-width:559px){.k-panel-head:has(.k-illustrative){grid-template-columns:minmax(0,1fr) auto;gap:2px 12px}.k-panel-head .k-illustrative{grid-column:1;grid-row:2}.k-panel-head:has(.k-illustrative) .k-icon-button{grid-column:2;grid-row:1/3}}
.k-sampling-context{margin:0 0 12px;overflow-wrap:anywhere}
.k-sampling-rows{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;font-variant-numeric:tabular-nums}
.k-sampling-row{display:grid;grid-template-columns:120px minmax(0,1fr) 132px;gap:12px;align-items:center;min-width:0}
.k-sampling-label{overflow-wrap:anywhere}
.k-sampling-track{height:18px;background:var(--lh-surface-2);border-radius:4px;min-width:0}
.k-sampling-bar{height:100%;background:var(--lh-blue);border-radius:4px}
.k-sampling-value{text-align:right;font-size:.9em}
.k-sampling-cut{color:var(--lh-muted)}
.k-sampling-cut .k-sampling-bar{background:transparent;outline:1px solid var(--lh-muted);outline-offset:-1px}
.k-sampling-picked .k-sampling-bar{outline:2px solid var(--lh-text);outline-offset:1px}
.k-sampling-fields{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-end;padding-top:12px}
.k-sampling-fields .k-field{flex:1 1 120px;min-width:0}
.k-sampling-fields .k-btn{border:0;background:var(--lh-surface-2)}
.k-sampling-fields .k-primary{background:var(--lh-text)}
@media(max-width:559px){.k-sampling-row{grid-template-columns:minmax(60px,1fr) minmax(32px,2fr) minmax(88px,1.3fr);gap:8px}.k-sampling-fields .k-field{flex-basis:100%}}
#lh-kit.k-focus:has(.k-sampling-focus) .k-grid{grid-column:1/-1}
.k-focus .k-panel.k-sampling-focus{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,280px);gap:12px 24px;align-content:start;height:auto}
.k-sampling-focus>.k-panel-head,.k-sampling-focus>.k-sampling-body,.k-sampling-focus>.k-readout-line{grid-column:1}
.k-sampling-focus .k-sampling-fields{grid-column:2;grid-row:1/5}
.k-sampling-focus .k-sampling-fields .k-buttons{display:flex}
@media(max-width:640px){.k-focus .k-panel.k-sampling-focus{grid-template-columns:minmax(0,1fr)}.k-sampling-focus .k-sampling-fields.k-controls{grid-column:1;grid-row:4}}
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
	private panelBoxes: HTMLElement[] = [];
	private focusIndex: number | null = null;
	private focusTrigger: HTMLElement | null = null;
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
		const toggle = el("button", "k-btn k-parameters-toggle", "Parameters");
		toggle.type = "button";
		toggle.setAttribute("aria-expanded", "true");
		toggle.onclick = () => { const collapsed = box.classList.toggle("k-collapsed"); toggle.setAttribute("aria-expanded", String(!collapsed)); };
		box.append(toggle);
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
			if (Object.values(this.spec.state ?? {}).some((e) => new RegExp(`\\bp\\.${key}\\b|\\bp\\[["']${key}["']\\]`).test(e))) {
				field.append(el("small", undefined, "Changing this restarts the simulation."));
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
				this.panelBoxes[i] = box;
				const heading = el("div", "k-panel-head");
				if ("title" in panel && panel.title) heading.append(el("h3", "k-title", escapeHtml(panel.title)));
				if (["heatmap", "next_token", "scatter"].includes(panel.type)) heading.append(el("span", "k-illustrative", "Illustrative numbers"));
				if (["chart", "plot3d", "flow", "tokens", "heatmap", "next_token", "scatter", "network", "shapes"].includes(panel.type)) {
					const expand = el("button", "k-icon-button", '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>');
					expand.type = "button";
					expand.title = "Focus graph";
					expand.setAttribute("aria-label", `Expand ${"title" in panel && panel.title || "graph"}`);
					expand.onclick = () => { const bounds = box.getBoundingClientRect().toJSON(); this.focus(i); parent.postMessage({ type: "demo-focus", panel: i, bounds }, "*"); };
					heading.append(expand);
				}
				if (heading.childNodes.length) box.append(heading);
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
		const applyTheme = async () => {
			Object.assign(theme, readTheme());
			await Promise.all(this.views.map((view) => view.theme?.()));
		};
		window.addEventListener("lh-demo-theme", () => { void applyTheme().catch((err) => this.report("theme", err)); });
		// The parent may have sent its appearance while renderer libraries loaded.
		await applyTheme();
		window.addEventListener("message", (e) => {
			if (e.source !== parent || !e.data) return;
			if (e.data.type === "lh-demo-select" && Number.isInteger(e.data.panel)) { this.panelBoxes[e.data.panel]?.scrollIntoView({ block: "start" }); return; }
			if (e.data.type !== "lh-demo-focus") return;
			if (e.data.panel === null || (Number.isInteger(e.data.panel) && e.data.panel >= 0 && e.data.panel < this.panelBoxes.length)) this.focus(e.data.panel);
		});
		const observer = new ResizeObserver(() => { void Promise.all(this.views.map((v, i) => !this.panelBoxes[i]?.hidden && v.resize?.())); });
		observer.observe(this.root);
		parent.postMessage({ type: "demo-ready" }, "*");
	}

	private focus(index: number | null) {
		if (index !== null) this.focusTrigger = document.activeElement as HTMLElement | null;
		this.focusIndex = index;
		this.root.classList.toggle("k-focus", index !== null);
		this.panelBoxes.forEach((box, i) => { box.hidden = index !== null && i !== index; this.views[i]?.focus?.(index === i); });
		requestAnimationFrame(() => { if (index === null && document.hasFocus()) this.focusTrigger?.focus({ preventScroll: true }); void Promise.all(this.views.map((v, i) => (index === null || index === i) && v.resize?.())); });
	}

	private tokens(panel: TokenizedPanel, box: HTMLElement): PanelView {
		if (!panel.tokenized) throw new Error("Token splits must be supplied by the server.");
		const field = el("label", "k-field");
		field.append(el("span", "k-label", "Text"));
		const input = el("textarea", "k-token-text");
		input.name = "text"; input.autocomplete = "off"; input.rows = 2; input.value = panel.text; input.readOnly = true;
		field.append(input);
		const controls = el("div", "k-token-controls");
		const seg = el("div", "k-seg");
		const count = el("span", "k-token-count"); count.setAttribute("aria-live", "polite");
		controls.append(seg, count);
		const strip = el("div", "k-token-strip");
		const readout = el("p", "k-readout-line", "Hover or focus a token to read it. Arrow keys move between tokens.");
		readout.setAttribute("aria-live", "polite");
		const error = el("p", "k-error k-token-error"); error.hidden = true; error.setAttribute("aria-live", "polite");
		const offline = el("p", "k-readout-line k-token-offline", "Editing works in the app"); offline.hidden = true;
		const fields = el("div", "k-token-fields");
		const toggle = el("button", "k-btn k-parameters-toggle", "Parameters"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "true");
		toggle.onclick = () => { const collapsed = fields.classList.toggle("k-collapsed"); toggle.setAttribute("aria-expanded", String(!collapsed)); };
		fields.append(toggle, field, controls);
		box.append(fields, strip, readout, error, offline);
		let encoding: TokenEncoding = panel.encoding ?? "o200k";
		let splitText = panel.text;
		let current = panel.tokenized[encoding];
		let cache: Partial<Record<TokenEncoding, Token[]>> = { ...panel.tokenized };
		let cacheText = panel.text;
		let revision = 0, serial = 0, active = 0;
		let pinned: number | null = null;
		let timer: number | undefined, answered = false, closed = false;
		// WindowProxy survives iframe navigation; a fresh nonce prevents a reply
		// from the previous document from matching this document's request.
		const nonce = Array.from(crypto.getRandomValues(new Uint32Array(2)), n => n.toString(16).padStart(8, "0")).join("");
		const prefix = `${nonce}-${this.panelBoxes.indexOf(box)}-`;
		const pending = new Map<string, { text: string; encoding: TokenEncoding; revision: number }>();
		const piece = (token: Token) => token.text ?? token.bytes!.map(byte => `<0x${byte.toString(16).toUpperCase().padStart(2, "0")}>`).join("");
		const label = (token: Token, index: number) => `Token ${index + 1} of ${current.length} · “${piece(token)}” · id ${token.id}`;
		const updating = (value: boolean) => {
			strip.classList.toggle("k-updating", value);
			count.textContent = value ? "Updating…" : `${current.length} tokens · ${splitText.length} characters`;
		};
		const render = () => {
			strip.replaceChildren(); pinned = null; active = Math.min(active, Math.max(0, current.length - 1));
			current.forEach((token, index) => {
				const chip = el("button", "k-token"); chip.type = "button";
				chip.style.setProperty("--k-token-color", `var(${["--lh-blue", "--lh-teal", "--lh-red", "--lh-green"][index % 4]})`);
				chip.tabIndex = index === active ? 0 : -1;
				chip.setAttribute("aria-label", label(token, index));
				const text = el("span"); text.textContent = piece(token).replace(/^ /, "␣").replace(/\n/g, "↵");
				const id = el("span", "k-token-id"); id.textContent = String(token.id); chip.append(text, id);
				const select = () => { active = index; strip.querySelectorAll<HTMLButtonElement>("button").forEach((button, i) => button.tabIndex = i === index ? 0 : -1); readout.textContent = label(token, index); };
				chip.onpointerenter = select; chip.onfocus = select;
				chip.onclick = () => { pinned = index; select(); strip.querySelectorAll("button").forEach((button, i) => button.classList.toggle("k-token-pinned", i === pinned)); };
				chip.onpointerleave = () => { if (pinned !== null) readout.textContent = label(current[pinned]!, pinned); };
				chip.onkeydown = event => {
					const next = event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % current.length : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + current.length - 1) % current.length : event.key === "Home" ? 0 : event.key === "End" ? current.length - 1 : null;
					if (next !== null) { event.preventDefault(); (strip.children[next] as HTMLElement).focus(); }
				};
				strip.append(chip);
			});
			readout.textContent = "Hover or focus a token to read it. Arrow keys move between tokens.";
			updating(false);
		};
		const request = () => {
			const requestId = prefix + (++serial);
			pending.set(requestId, { text: input.value, encoding, revision });
			parent.postMessage({ type: "demo-tokenize", requestId, text: input.value, encoding }, "*");
		};
		const change = (debounce: boolean) => {
			revision++; window.clearTimeout(timer); error.hidden = true;
			if (input.value.length > 2000) { updating(false); error.textContent = "2,000 characters at most. Shorten the text to split it."; error.hidden = false; return; }
			if (cacheText === input.value && cache[encoding]) { current = cache[encoding]!; splitText = input.value; render(); return; }
			if (closed) return;
			updating(true);
			if (debounce) timer = window.setTimeout(request, 300); else request();
		};
		for (const [value, title] of [["o200k", "o200k · GPT-4o"], ["cl100k", "cl100k · GPT-4"], ["gpt2", "GPT-2"]] as const) {
			const button = el("button", undefined, title); button.type = "button";
			button.dataset.encoding = value; button.setAttribute("aria-pressed", String(value === encoding));
			button.onclick = () => { encoding = value; seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === button))); change(false); };
			seg.append(button);
		}
		input.oninput = () => change(true);
		window.addEventListener("message", event => {
			if (closed || event.source !== parent || event.data?.type !== "lh-demo-tokens") return;
			const data = event.data;
			const job = pending.get(data.requestId);
			if (!job) return;
			const validTokens = data.encoding === job.encoding && Array.isArray(data.tokens) && data.tokens.every((token: Token) => token && Number.isInteger(token.id) && token.id >= 0 && (typeof token.text === "string" || (token.text === null && Array.isArray(token.bytes) && token.bytes.length > 0 && token.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255))));
			if (typeof data.error !== "string" && !validTokens) return;
			answered = true; input.readOnly = false; pending.delete(data.requestId);
			if (job.revision !== revision || job.text !== input.value || job.encoding !== encoding) return;
			if (typeof data.error === "string") { updating(false); error.textContent = `Couldn't tokenize this text: ${data.error}. The last split stays shown.`; error.hidden = false; return; }
			if (cacheText !== job.text) { cache = {}; cacheText = job.text; }
			cache[job.encoding] = data.tokens; current = data.tokens; splitText = job.text; error.hidden = true; render();
		});
		render(); request();
		window.setTimeout(() => {
			if (answered) return;
			closed = true; pending.clear(); window.clearTimeout(timer); input.readOnly = true; offline.hidden = false; updating(false);
		}, 2000);
		return { update() {}, focus: focused => { box.classList.toggle("k-tokens-focus", focused); fields.classList.toggle("k-controls", focused); } };
	}

	private nextToken(panel: Extract<DemoKitPanel, { type: "next_token" }>, box: HTMLElement): PanelView {
		const body = el("div", "k-sampling-body");
		const context = el("p", "k-sampling-context");
		if (panel.title) body.append(context);
		const list = el("ol", "k-sampling-rows"); body.append(list);
		const readout = el("p", "k-readout-line"); readout.setAttribute("aria-live", "polite");
		const fields = el("div", "k-sampling-fields");
		const toggle = el("button", "k-btn k-parameters-toggle", "Parameters"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "true");
		toggle.onclick = () => { const collapsed = fields.classList.toggle("k-collapsed"); toggle.setAttribute("aria-expanded", String(!collapsed)); };
		fields.append(toggle);
		let defaults: Required<SamplingOptions> = { temperature: 1, topK: 0, topP: 1 };
		let values = { ...defaults }, tokens: SamplingToken[] = [], rows: SamplingRow[] = [], fingerprint = "";
		let picked: number | null = null;
		const inputs = new Map<keyof SamplingOptions, { input: HTMLInputElement; value: HTMLElement }>();
		const render = () => {
			rows = distribution(tokens, values);
			list.replaceChildren();
			for (const row of rows) {
				const item = el("li", `k-sampling-row${row.cut ? " k-sampling-cut" : ""}${row.index === picked ? " k-sampling-picked" : ""}`);
				const label = el("span", "k-sampling-label"); label.textContent = row.text.replace(/^ /, "␣").replace(/\n/g, "↵");
				const track = el("div", "k-sampling-track"); track.setAttribute("aria-hidden", "true");
				const bar = el("div", "k-sampling-bar"); bar.style.width = `${100 * (row.cut ? row.base : row.p)}%`; track.append(bar);
				const value = el("span", "k-sampling-value"); value.textContent = row.cut ?? `${(row.p * 100).toFixed(1)}%`;
				item.append(label, track, value); list.append(item);
			}
			const kept = rows.filter(row => row.p > 0).length;
			readout.textContent = picked === null ? `${kept} of ${rows.length} tokens can be drawn. Press Sample to draw one.` : `Sampled “${tokens[picked]!.text.trim()}” · ${kept} tokens could be drawn`;
			for (const [key, control] of inputs) {
				control.input.value = String(values[key]);
				control.value.textContent = key === "topK" ? values[key] === 0 ? "off" : String(values[key]) : String(Number(values[key].toFixed(key === "temperature" ? 1 : 2))) === String(values[key]) ? values[key].toFixed(key === "temperature" ? 1 : 2) : String(values[key]);
				control.input.setAttribute("aria-valuetext", control.value.textContent);
			}
		};
		for (const [key, label, min, max, step] of [["temperature", "Temperature", .1, 2, .1], ["topK", "Top-k", 0, 30, 1], ["topP", "Top-p", .05, 1, .05]] as const) {
			const field = el("label", "k-field"), caption = el("span", "k-label", label), value = el("b"); caption.append(value);
			const input = el("input"); input.type = "range"; input.name = key; input.autocomplete = "off"; input.min = String(min); input.max = String(max); input.step = String(step); input.setAttribute("aria-label", label);
			input.oninput = () => { values[key] = Number(input.value); picked = null; render(); };
			field.append(caption, input); fields.append(field); inputs.set(key, { input, value });
		}
		const buttons = el("div", "k-buttons");
		const reset = el("button", "k-btn k-sampling-reset", "Reset"); reset.type = "button"; reset.onclick = () => { values = { ...defaults }; picked = null; render(); };
		const draw = el("button", "k-btn k-primary", "Sample"); draw.type = "button"; draw.onclick = () => { picked = sample(rows).index; render(); };
		buttons.append(reset, draw); fields.append(buttons); box.append(body, readout, fields);
		return {
			update: () => {
				const data = { context: this.eval(panel.context), tokens: this.eval(panel.tokens), temperature: panel.temperature ? this.eval(panel.temperature) : 1, topK: panel.topK ? this.eval(panel.topK) : 0, topP: panel.topP ? this.eval(panel.topP) : 1 };
				if (typeof data.context !== "string") throw new Error("context: use a string");
				distribution(data.tokens, data);
				const signature = JSON.stringify(data); if (signature === fingerprint) return; fingerprint = signature;
				tokens = data.tokens; defaults = { temperature: data.temperature, topK: data.topK, topP: data.topP }; values = { ...defaults }; picked = null;
				const text = `After “${data.context}”`;
				if (panel.title) context.textContent = text;
				else { let heading = box.querySelector("h3"); if (!heading) { heading = el("h3", "k-title"); box.querySelector(".k-panel-head")!.prepend(heading); } heading.textContent = text; box.querySelector(".k-icon-button")!.setAttribute("aria-label", `Expand ${text}`); }
				for (const [key, control] of inputs) {
					control.input.min = String(key === "temperature" ? Math.min(.1, values[key]) : key === "topP" ? Math.min(.05, values[key]) : 0);
					control.input.max = String(key === "temperature" ? Math.max(2, values[key]) : key === "topK" ? Math.max(tokens.length, values[key]) : 1);
					const step = key === "temperature" ? .1 : key === "topP" ? .05 : 1;
					// Range inputs otherwise silently round schema-valid supplied values.
					control.input.step = Math.abs((values[key] - Number(control.input.min)) / step - Math.round((values[key] - Number(control.input.min)) / step)) < 1e-9 ? String(step) : "any";
				}
				render();
			},
			focus: focused => { box.classList.toggle("k-sampling-focus", focused); fields.classList.toggle("k-controls", focused); },
		};
	}

	private async panel(panel: DemoKitPanel, box: HTMLElement): Promise<PanelView> {
		switch (panel.type) {
			case "tokens": return this.tokens(panel, box);
			case "next_token": return this.nextToken(panel, box);
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
		// Keep Vega's live view and data intact while neutral chrome changes.
		const roles = { text: theme.text, muted: theme.muted, border: theme.border, font: theme.font };
		const roleFor = (value: unknown) => Object.entries(roles).find(([, color]) => color === value)?.[0];
		const bind = (node: any, config = false): void => {
			if (!node || typeof node !== "object") return;
			for (const [key, value] of Object.entries(node)) {
				const role = roleFor(value);
				if (role && key === "value") { delete node.value; node.signal = `lhTheme_${role}`; }
				else if (role && config && /(?:color|fill|stroke|font)$/i.test(key)) node[key] = { signal: `lhTheme_${role}` };
				else bind(value, config);
			}
		};
		bind(compiled.marks);
		bind(compiled.axes);
		bind(compiled.legends);
		bind(compiled.config, true);
		compiled.signals = [...(compiled.signals ?? []), ...Object.entries(roles).map(([role, value]) => ({ name: `lhTheme_${role}`, value }))];
		const view = new vega.View(vega.parse(compiled), { renderer: "svg", container: target, hover: true });
		const names = Object.keys(panel.data);
		return {
			theme: async () => { for (const role of Object.keys(roles) as (keyof typeof roles)[]) view.signal(`lhTheme_${role}`, theme[role]); await view.runAsync(); },
			resize: async () => { view.width(target.clientWidth).height(this.focusIndex === null ? (panel.width === "half" ? 220 : 260) : Math.max(160, box.clientHeight - 50)); await view.resize().runAsync(); },
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
			uirevision: "learner-view",
		};
		const SCENE = new Set(["surface", "scatter3d", "mesh3d", "cone", "streamtube", "isosurface", "volume"]);
		return {
			theme: async () => {
				layout.font.family = theme.font;
				layout.font.color = theme.text;
				const patch: Values = { "font.family": theme.font, "font.color": theme.text };
				for (const prefix of ["xaxis", "yaxis", "scene.xaxis", "scene.yaxis", "scene.zaxis"]) {
					const overrides = prefix.startsWith("scene.") ? extra.scene?.[prefix.slice(6)] : extra[prefix];
					for (const [key, value] of Object.entries({ color: theme.muted, gridcolor: theme.border, zerolinecolor: theme.border, linecolor: theme.border })) {
						if (overrides?.[key] === undefined) {
							patch[`${prefix}.${key}`] = value;
							const axisLayout = prefix.startsWith("scene.") ? layout.scene[prefix.slice(6)] : (layout as Values)[prefix];
							axisLayout[key] = value;
						}
					}
				}
				await Plotly.relayout(target, patch);
			},
			resize: async () => { await Plotly.relayout(target, { width: target.clientWidth, height: this.focusIndex === null ? layout.height : Math.max(160, box.clientHeight - 50) }); },
			update: async () => {
				const traces = (this.eval(panel.traces) ?? []) as { type?: string }[];
				// 3D scenes fill the panel; 2D plots keep room for axis labels.
				const scene = traces.some((tr) => SCENE.has(tr.type ?? ""));
				const margin = scene ? { l: 0, r: 0, t: 0, b: 0, ...(extra.margin ?? {}) } : layout.margin;
				await Plotly.react(target, traces, { ...layout, margin, height: this.focusIndex === null ? layout.height : Math.max(160, box.clientHeight - 50) }, { displayModeBar: false, responsive: true, scrollZoom: false });
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
		return { update: () => handle.update(props()), theme: () => handle.update(props()) };
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
