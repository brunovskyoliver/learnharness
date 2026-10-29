/** Demo kit runtime: draws a demo-kit spec (src/core/demo-kit.ts) inside the
 *  demo's sandboxed iframe. Built by scripts/build-demo-kit.mjs into
 *  public/demo-kit/runtime.js; Vega, Plotly and React Flow load from the
 *  same folder only when a panel needs them. Colors and fonts come from the
 *  --lh-* variables injected ahead of the demo (src/core/demo-theme.ts). */

import { DEMO_THEME_VARS, DEMO_SCROLLBAR_CSS } from "../core/demo-theme.ts";
import { distribution, sample, type SamplingOptions, type SamplingToken, type SamplingRow } from "../core/ml-sampling.ts";
import { forward, backward, steps, type NetworkSpec, type ForwardPass, type BackwardPass } from "../core/ml-net.ts";
import { arithmetic, nearest, coordinates, validatePoints, type Point, type Arithmetic } from "../core/ml-vectors.ts";
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
.k-heatmap-scroll{max-width:100%;max-height:600px;overflow:auto;padding:4px;box-sizing:border-box}
.k-heatmap-body{display:flex;gap:24px;align-items:flex-start;min-width:0}
.k-heatmap-grid{flex:0 0 auto;width:min(var(--k-heatmap-width),calc(100% - 96px));min-width:calc(72px + var(--k-heatmap-columns)*24px);font-variant-numeric:tabular-nums}
.k-heatmap-grid.k-large{width:var(--k-heatmap-width);min-width:var(--k-heatmap-width)}
.k-heatmap-row{display:grid;grid-template-columns:72px repeat(var(--k-heatmap-columns),minmax(0,1fr));gap:2px;margin-bottom:2px;align-items:center}
.k-heatmap-label{font-size:.8em;font-weight:400;color:var(--lh-muted);text-align:center;overflow-wrap:anywhere}
.k-heatmap-row>[role=rowheader]{text-align:right;padding-right:8px}
.k-heatmap-label.k-active{font-weight:600;color:var(--lh-text)}
.k-heatmap-cell{min-width:0;height:44px;border:0;border-radius:3px;padding:0;font:inherit;font-size:13px;font-variant-numeric:tabular-nums;cursor:default}
.k-heatmap-cell.k-active{outline:2px solid var(--lh-text);outline-offset:-2px}
.k-heatmap-cell:focus-visible{outline:2px solid var(--lh-muted);outline-offset:2px}
.k-heatmap-legend{flex:0 0 72px;font-size:.8em;color:var(--lh-muted);font-variant-numeric:tabular-nums}
.k-heatmap-legend-scale{display:flex;gap:8px;margin-top:8px;height:180px}
.k-heatmap-ramp{width:14px;flex-shrink:0;display:flex;flex-direction:column;border-radius:4px;overflow:hidden}
.k-heatmap-ramp>span{flex:1}
.k-heatmap-legend-values{display:flex;flex-direction:column;justify-content:space-between}
@media(pointer:coarse){.k-heatmap-grid{min-width:calc(72px + var(--k-heatmap-columns)*46px)}.k-heatmap-cell{min-width:44px}}
.k-network-phase{margin:0 0 8px;color:var(--lh-muted);font-size:.8em}
.k-network-scroll{max-width:100%;overflow:auto;padding:4px;box-sizing:border-box}
.k-network-diagram{position:relative;width:100%;min-width:var(--k-network-width);height:var(--k-network-height)}
.k-network-edges{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.k-network-layer{position:absolute;top:4px;transform:translateX(-50%);font-size:.8em;color:var(--lh-muted)}
.k-neuron{position:absolute;transform:translate(-50%,-50%);width:88px;height:60px;border:0;border-radius:30px;background:var(--lh-surface-2);color:var(--lh-text);font:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-variant-numeric:tabular-nums}
.k-neuron-value{font-size:15px;font-weight:600}.k-neuron-gradient{font:12px var(--lh-mono)}
.k-neuron.k-active{outline:2px solid var(--lh-text);outline-offset:-2px}.k-neuron:focus-visible{outline:2px solid var(--lh-muted);outline-offset:3px}
.k-network-meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-top:8px}
.k-network-legend{display:flex;flex-wrap:wrap;gap:16px;color:var(--lh-muted);font-size:.8em}
.k-network-legend span{display:flex;align-items:center;gap:6px}.k-network-legend i{width:18px;height:3px;background:var(--k-weight-color)}
.k-network-loss{font-variant-numeric:tabular-nums;font-size:.9em}
.k-network-fields{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:12px}
.k-network-fields .k-btn{border:0;background:var(--lh-surface-2)}.k-network-fields .k-primary{background:var(--lh-text)}.k-network-fields .k-btn:disabled{opacity:.5;cursor:default}
.k-network-step{color:var(--lh-muted);font-size:.8em;font-variant-numeric:tabular-nums;margin-left:8px}
#lh-kit.k-focus:has(.k-network-focus) .k-grid{grid-column:1/-1}
.k-focus .k-panel.k-network-focus{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,280px);gap:12px 24px;align-content:start;height:auto}
.k-network-focus>.k-panel-head,.k-network-focus>.k-network-body,.k-network-focus>.k-readout-line{grid-column:1}
.k-network-focus .k-network-fields{grid-column:2;grid-row:1/4}.k-network-focus .k-network-fields .k-btn{margin-bottom:6px}
@media(max-width:640px){.k-focus .k-panel.k-network-focus{grid-template-columns:minmax(0,1fr)}.k-network-focus .k-network-fields.k-controls{grid-column:1;grid-row:4}}
.k-scatter-scroll{max-width:100%;overflow:auto;padding:4px;box-sizing:border-box}
.k-scatter-plot{position:relative;min-width:360px;height:360px}
.k-scatter-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.k-scatter-point{position:absolute;transform:translate(-50%,-50%);width:44px;height:44px;padding:0;border:0;background:transparent;color:var(--lh-muted);font:inherit;font-size:15px;cursor:pointer}
.k-scatter-dot{position:absolute;left:17px;top:17px;width:10px;height:10px;border-radius:50%;background:var(--k-point-color)}
.k-scatter-point.k-active .k-scatter-dot,.k-scatter-point.k-nearest .k-scatter-dot{outline:2px solid var(--lh-text);outline-offset:3px}
.k-scatter-label{position:absolute;left:30px;top:10px;white-space:nowrap}.k-scatter-point.k-overlap .k-scatter-label{visibility:hidden}
.k-scatter-point.k-active{color:var(--lh-text);z-index:1}.k-scatter-point.k-active .k-scatter-label{visibility:visible;background:var(--lh-bg)}
.k-scatter-meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}
.k-scatter-legend{display:flex;flex-wrap:wrap;gap:16px;color:var(--lh-muted);font-size:.8em}
.k-scatter-legend span{display:flex;align-items:center;gap:6px}.k-scatter-legend i{width:10px;height:10px;border-radius:50%;background:var(--k-point-color)}
.k-scatter-fields{display:flex;flex-wrap:wrap;gap:12px}.k-scatter-fields input{accent-color:var(--lh-text)}.k-scatter-fields .k-btn{border:0;background:var(--lh-surface-2)}
.k-scatter-fields[hidden]{display:none}
.k-scatter-3d{position:relative;min-width:0;height:360px}.k-scatter-3d:focus-within{outline:2px solid var(--lh-muted);outline-offset:2px}
.k-focus .k-scatter-3d{height:max(410px,calc(100dvh - 240px))}
.k-scatter-3d .k-scatter-point{width:1px;height:1px;clip-path:inset(50%);overflow:hidden;left:8px;bottom:8px;transform:none}
.k-scatter-3d .k-scatter-point:focus{width:auto;max-width:calc(100% - 16px);height:44px;clip-path:none;overflow:auto;background:var(--lh-bg);padding:0 10px;display:flex;align-items:center;gap:8px;z-index:1}
.k-scatter-3d .k-scatter-point:focus .k-scatter-dot,.k-scatter-3d .k-scatter-point:focus .k-scatter-label{position:static;visibility:visible}
#lh-kit.k-focus:has(.k-scatter-focus) .k-grid{grid-column:1/-1}
.k-focus .k-panel.k-scatter-focus{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,280px);gap:12px 24px;align-content:start;height:auto}
.k-scatter-focus>.k-panel-head,.k-scatter-focus>.k-scatter-body,.k-scatter-focus>.k-readout-line{grid-column:1}.k-scatter-focus .k-scatter-fields{grid-column:2;grid-row:1/4}
@media(max-width:640px){.k-focus .k-panel.k-scatter-focus{grid-template-columns:minmax(0,1fr)}.k-scatter-focus .k-scatter-fields.k-controls{grid-column:1;grid-row:4}}
.k-shape-legend{font-size:.8em;color:var(--lh-muted);margin:0 0 16px;overflow-wrap:anywhere}
.k-shape-list{display:flex;flex-direction:column;gap:4px;list-style:none;padding:0;margin:0}
.k-shape-step{display:grid;grid-template-columns:20px minmax(0,1fr) minmax(0,auto) minmax(100px,1fr);gap:12px;align-items:center;width:100%;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:var(--lh-text);font:inherit;cursor:pointer;text-align:left}
.k-shape-step:hover,.k-shape-step[aria-current=step]{background:var(--lh-surface-2)}
.k-shape-number{color:var(--lh-muted);font-size:.8em;font-variant-numeric:tabular-nums}
.k-shape-op{font-size:.9em;overflow-wrap:anywhere}
.k-shape-dims{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font:12px var(--lh-mono);color:var(--lh-muted);min-width:0}
.k-shape-dim{padding:2px 6px;border-radius:4px;max-width:100%;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.k-shape-changed{background:var(--lh-surface-2);color:var(--lh-text);outline:1px solid var(--lh-text);outline-offset:-1px}
.k-shape-change{font-size:.8em;color:var(--lh-muted);text-align:right;overflow-wrap:anywhere}
@media(pointer:coarse){.k-shape-step{min-height:44px}}
@media(max-width:559px){.k-shape-step{grid-template-columns:20px minmax(0,1fr);gap:6px 12px}.k-shape-dims{grid-column:2;grid-row:2}.k-shape-change{grid-column:2;grid-row:3;text-align:left}}
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
					const onStep = (value: number) => Math.abs((value - Number(control.input.min)) / step - Math.round((value - Number(control.input.min)) / step)) < 1e-9;
					control.input.step = onStep(values[key]) && onStep(Number(control.input.max)) ? String(step) : "any";
				}
				render();
			},
			focus: focused => { box.classList.toggle("k-sampling-focus", focused); fields.classList.toggle("k-controls", focused); },
		};
	}

	private heatmap(panel: Extract<DemoKitPanel, { type: "heatmap" }>, box: HTMLElement): PanelView {
		const scroll = el("div", "k-heatmap-scroll"), body = el("div", "k-heatmap-body"), grid = el("div", "k-heatmap-grid"); grid.setAttribute("role", "grid");
		grid.setAttribute("aria-label", panel.title || "Query ↓ · Key →");
		const legend = el("div", "k-heatmap-legend"), readout = el("p", "k-readout-line"); readout.setAttribute("aria-live", "polite");
		body.append(grid, legend); scroll.append(body); box.append(scroll, readout);
		let rows: string[] = [], cols: string[] = [], matrix: number[][] = [], cells: HTMLButtonElement[] = [], rowLabels: HTMLElement[] = [], colLabels: HTMLElement[] = [];
		let active = 0, pinned: number | null = null, fingerprint = "", digits = 2, rowAxis = "Query", colAxis = "Key";
		const label = (index: number) => { const r = Math.floor(index / cols.length), c = index % cols.length; return `${rowAxis} “${rows[r]!.trim()}” → ${colAxis.toLowerCase()} “${cols[c]!.trim()}” · ${matrix[r]![c]!.toFixed(digits)}`; };
		const select = (index: number) => {
			active = index;
			cells.forEach((cell, i) => { cell.tabIndex = i === index ? 0 : -1; cell.classList.toggle("k-active", i === index); cell.setAttribute("aria-selected", String(i === index)); });
			rowLabels.forEach((item, i) => item.classList.toggle("k-active", i === Math.floor(index / cols.length)));
			colLabels.forEach((item, i) => item.classList.toggle("k-active", i === index % cols.length));
			readout.textContent = label(index);
		};
		const resize = () => {
			const showValues = cells.length > 0 && cells[0]!.getBoundingClientRect().width >= 44;
			for (const cell of cells) (cell.firstElementChild as HTMLElement).hidden = !showValues;
		};
		return {
			resize,
			update: () => {
				const data = { rows: this.eval(panel.rows), cols: this.eval(panel.cols), values: this.eval(panel.values), min: panel.min === undefined ? undefined : this.eval(panel.min), max: panel.max === undefined ? undefined : this.eval(panel.max), digits: panel.digits === undefined ? 2 : this.eval(panel.digits), rowAxis: panel.rowAxis === undefined ? "Query" : this.eval(panel.rowAxis), colAxis: panel.colAxis === undefined ? "Key" : this.eval(panel.colAxis) };
				if (![data.rows, data.cols].every(labels => Array.isArray(labels) && labels.length > 0 && labels.length <= 64 && labels.every(label => typeof label === "string"))) throw new Error("rows and cols: provide 1–64 labels each");
				if (!Array.isArray(data.values) || data.values.length !== data.rows.length || data.values.some(row => !Array.isArray(row) || row.length !== data.cols.length || row.some(value => typeof value !== "number" || !Number.isFinite(value)))) throw new Error("values: provide a finite number for every row and column, at most 64×64");
				if (!Number.isInteger(data.digits) || data.digits < 0 || data.digits > 8 || typeof data.rowAxis !== "string" || typeof data.colAxis !== "string") throw new Error("digits and axes: use 0–8 digits and string axis labels");
				const flat: number[] = data.values.flat();
				const min = panel.min === undefined ? Math.min(...flat, ...(panel.scale === "diverging" ? [0] : [])) : data.min;
				const max = panel.max === undefined ? Math.max(...flat, ...(panel.scale === "diverging" ? [0] : [])) : data.max;
				if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) throw new Error("min and max: use a finite range with min at most max");
				const signature = JSON.stringify(data); if (signature === fingerprint) return; fingerprint = signature;
				const hadFocus = grid.contains(document.activeElement);
				rows = data.rows; cols = data.cols; matrix = data.values; digits = data.digits; rowAxis = data.rowAxis; colAxis = data.colAxis;
				active = Math.min(active, rows.length * cols.length - 1); pinned = null;
				grid.setAttribute("aria-label", panel.title || `${rowAxis} ↓ · ${colAxis} →`);
				const color = (value: number) => {
					const amount = panel.scale === "sequential" ? max === min ? 0 : (value - min) / (max - min) : value < 0 ? min === 0 ? 0 : value / min : max === 0 ? 0 : value / max;
					const strength = Math.max(0, Math.min(1, amount));
					return { background: `color-mix(in srgb,var(${panel.scale === "diverging" && value > 0 ? "--lh-red" : "--lh-blue"}) ${strength * 100}%,var(--lh-bg))`, ink: strength > .55 ? "var(--lh-bg)" : "var(--lh-text)" };
				};
				grid.style.setProperty("--k-heatmap-columns", String(cols.length)); grid.style.setProperty("--k-heatmap-width", `${72 + cols.length * 58}px`); grid.classList.toggle("k-large", rows.length > 12 || cols.length > 12);
				grid.replaceChildren(); cells = []; rowLabels = []; colLabels = [];
				const header = el("div", "k-heatmap-row"); header.setAttribute("role", "row");
				const axes = el("div", "k-heatmap-label"); axes.setAttribute("role", "columnheader"); axes.textContent = `${rowAxis} ↓ · ${colAxis} →`; header.append(axes);
				cols.forEach(text => { const item = el("div", "k-heatmap-label"); item.setAttribute("role", "columnheader"); item.textContent = text; colLabels.push(item); header.append(item); }); grid.append(header);
				rows.forEach((text, r) => {
					const row = el("div", "k-heatmap-row"); row.setAttribute("role", "row");
					const heading = el("div", "k-heatmap-label"); heading.setAttribute("role", "rowheader"); heading.textContent = text; rowLabels.push(heading); row.append(heading);
					cols.forEach((_, c) => {
						const index = r * cols.length + c, cell = el("button", "k-heatmap-cell"), value = matrix[r]![c]!, paint = color(value);
						cell.type = "button"; cell.setAttribute("role", "gridcell"); cell.setAttribute("aria-label", label(index)); cell.dataset.row = String(r); cell.dataset.col = String(c); cell.style.background = paint.background; cell.style.color = paint.ink;
						const printed = el("span"); printed.textContent = value.toFixed(digits); cell.append(printed);
						cell.onpointerenter = () => select(index); cell.onfocus = () => select(index); cell.onclick = () => { pinned = index; select(index); };
						cell.onpointerleave = () => { if (pinned !== null) select(pinned); };
						cell.onkeydown = event => {
							const next = event.key === "ArrowRight" ? r * cols.length + Math.min(cols.length - 1, c + 1) : event.key === "ArrowLeft" ? r * cols.length + Math.max(0, c - 1) : event.key === "ArrowDown" ? Math.min(rows.length - 1, r + 1) * cols.length + c : event.key === "ArrowUp" ? Math.max(0, r - 1) * cols.length + c : null;
							if (next !== null) { event.preventDefault(); cells[next]!.focus(); }
						}; cells.push(cell); row.append(cell);
					}); grid.append(row);
				});
				legend.replaceChildren(); legend.append(document.createTextNode(panel.scale === "sequential" ? "Attention" : "Weight"));
				const scale = el("div", "k-heatmap-legend-scale"), ramp = el("div", "k-heatmap-ramp"), numbers = el("div", "k-heatmap-legend-values"); ramp.setAttribute("aria-hidden", "true");
				const mid = panel.scale === "diverging" ? 0 : min / 2 + max / 2;
				for (let i = 0; i < 100; i++) { const swatch = el("span"); const fraction = i / 99; const value = fraction <= .5 ? max * (1 - 2 * fraction) + mid * 2 * fraction : mid * (2 - 2 * fraction) + min * (2 * fraction - 1); swatch.style.background = color(value).background; ramp.append(swatch); }
				for (const value of [max, mid, min]) { const text = el("span", "k-heatmap-legend-value"); text.textContent = value.toFixed(digits); numbers.append(text); }
				scale.append(ramp, numbers); legend.append(scale); select(active); resize(); if (hadFocus) cells[active]!.focus();
			},
		};
	}

	private network(panel: Extract<DemoKitPanel, { type: "network" }>, box: HTMLElement): PanelView {
		const body = el("div", "k-network-body"), phase = el("p", "k-network-phase"), scroll = el("div", "k-network-scroll"), diagram = el("div", "k-network-diagram");
		const edges = document.createElementNS("http://www.w3.org/2000/svg", "svg"); edges.classList.add("k-network-edges");
		diagram.append(edges); scroll.append(diagram);
		const meta = el("div", "k-network-meta"), legend = el("div", "k-network-legend"), loss = el("span", "k-network-loss");
		for (const [text, color] of [["positive weight", "--lh-red"], ["negative weight", "--lh-blue"]]) { const item = el("span"), swatch = el("i"); swatch.style.setProperty("--k-weight-color", `var(${color})`); swatch.setAttribute("aria-hidden", "true"); item.append(swatch, document.createTextNode(text!)); legend.append(item); }
		legend.append(el("span", undefined, "Thicker edge, larger |w|")); meta.append(legend, loss); body.append(phase, scroll, meta);
		const readout = el("p", "k-readout-line"); readout.setAttribute("aria-live", "polite");
		const fields = el("div", "k-network-fields"), toggle = el("button", "k-btn k-parameters-toggle", "Parameters"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "true");
		toggle.onclick = () => { const collapsed = fields.classList.toggle("k-collapsed"); toggle.setAttribute("aria-expanded", String(!collapsed)); };
		const reset = el("button", "k-btn k-network-reset", "Reset"), back = el("button", "k-btn k-network-back", "Back a step"), next = el("button", "k-btn k-primary k-network-next", "Step forward"), count = el("span", "k-network-step");
		for (const button of [reset, back, next]) button.type = "button";
		fields.append(toggle, reset, back, next, count); box.append(body, readout, fields);
		let spec: NetworkSpec, pass: ForwardPass, gradients: BackwardPass, sequence: ReturnType<typeof steps> = [], fingerprint = "", step = 0, active = 0, selected: number | null = null, pinned: number | null = null;
		let nodes: { button: HTMLButtonElement; value: HTMLElement; gradient: HTMLElement; layer: number; neuron: number; label: string }[] = [];
		let lines: { line: Element; title: SVGTitleElement; layer: number; from: number; to: number; weight: number }[] = [];
		const resize = () => {
			for (const edge of lines) {
				const from = nodes.find(node => node.layer === edge.layer && node.neuron === edge.from)!.button, to = nodes.find(node => node.layer === edge.layer + 1 && node.neuron === edge.to)!.button;
				const dx = to.offsetLeft - from.offsetLeft, dy = to.offsetTop - from.offsetTop, fraction = 1 / Math.hypot(dx / 44, dy / 30);
				for (const [key, value] of Object.entries({ x1: from.offsetLeft + dx * fraction, y1: from.offsetTop + dy * fraction, x2: to.offsetLeft - dx * fraction, y2: to.offsetTop - dy * fraction })) edge.line.setAttribute(key, String(value));
			}
		};
		const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(4)}`;
		const select = (index: number) => { active = index; selected = index; nodes.forEach((node, i) => { node.button.tabIndex = i === active ? 0 : -1; node.button.classList.toggle("k-active", i === selected); }); readout.textContent = nodes[index]!.button.getAttribute("aria-label"); };
		const render = () => {
			const current = sequence[step]!, last = spec.layers.length - 1;
			phase.textContent = current.kind === "inputs" ? "Forward · inputs set" : current.kind === "forward" ? `Forward · layer ${current.layer + 1} of ${spec.layers.length}: ${current.layer === last ? "output and loss" : "hidden activations"}` : current.kind === "weights" ? "Backward · weight gradients" : current.layer === last ? "Backward · output gradient" : `Backward · ${spec.layers.length > 3 ? `layer ${current.layer + 1} of ${spec.layers.length}: ` : ""}hidden gradients`;
			for (const node of nodes) {
				const reached = node.layer <= Math.min(step, last), deltaReady = node.layer > 0 && (current.kind === "weights" || current.kind === "backward" && node.layer >= current.layer);
				const value = reached ? pass.activations[node.layer]![node.neuron]! : null, delta = deltaReady ? gradients.deltas[node.layer - 1]![node.neuron]! : null;
				node.value.textContent = value === null ? "–" : value.toFixed(3); node.gradient.textContent = delta === null ? "" : `δ ${signed(delta)}`;
				node.gradient.style.color = `var(${delta === null ? "--lh-muted" : delta >= 0 ? "--lh-red" : "--lh-blue"})`;
				node.button.setAttribute("aria-label", `${node.label} · value ${value === null ? "not computed yet" : value.toFixed(4)}${delta === null ? "" : ` · gradient ${signed(delta)}`}`);
			}
			for (const line of lines) line.title.textContent = `Weight ${line.weight}${current.kind === "weights" ? ` · gradient ${signed(gradients.weightGradients[line.layer]![line.to]![line.from]!)}` : ""}`;
			loss.textContent = `Target ${spec.target.join(", ")} · Loss ${step >= last ? pass.loss.toFixed(4) : "–"}`;
			count.textContent = `Step ${step} of ${sequence.length - 1}`; back.disabled = step === 0; next.disabled = step === sequence.length - 1;
			next.textContent = step < last ? "Step forward" : step === last ? "Start backward" : "Step backward";
			if (selected !== null) select(selected); else readout.textContent = current.kind === "weights" ? "Weight gradients are ready; focus a neuron to read its values." : "Focus or hover a neuron to read its values.";
		};
		reset.onclick = () => { step = 0; pinned = null; selected = null; nodes.forEach(node => node.button.classList.remove("k-active")); render(); };
		back.onclick = () => { step = Math.max(0, step - 1); render(); }; next.onclick = () => { step = Math.min(sequence.length - 1, step + 1); render(); };
		return {
			focus: focused => { box.classList.toggle("k-network-focus", focused); fields.classList.toggle("k-controls", focused); },
			resize,
			update: () => {
				const data: NetworkSpec = { layers: this.eval(panel.layers), weights: this.eval(panel.weights), biases: this.eval(panel.biases), input: this.eval(panel.input), target: this.eval(panel.target), activation: panel.activation, loss: panel.loss };
				const computed = forward(data), calculated = backward(data), signature = JSON.stringify(data); if (signature === fingerprint) return;
				fingerprint = signature; spec = data; pass = computed; gradients = calculated; sequence = steps(spec); step = 0; selected = null; pinned = null; active = 0;
				const hadFocus = diagram.contains(document.activeElement); diagram.replaceChildren(edges); edges.replaceChildren(); nodes = []; lines = [];
				const height = Math.max(320, Math.max(...spec.layers) * 80 + 40); diagram.style.setProperty("--k-network-height", `${height}px`); diagram.style.setProperty("--k-network-width", `${spec.layers.length * 120}px`);
				const x = (layer: number) => 100 * (layer + .5) / spec.layers.length, y = (layer: number, neuron: number) => 40 + (neuron + .5) * (height - 40) / spec.layers[layer]!;
				spec.weights.forEach((matrix, l) => matrix.forEach((row, j) => row.forEach((weight, i) => {
					const line = document.createElementNS(edges.namespaceURI, "line"), title = document.createElementNS(edges.namespaceURI, "title") as SVGTitleElement;
					for (const [key, value] of Object.entries({ x1: `${x(l)}%`, y1: y(l, i), x2: `${x(l + 1)}%`, y2: y(l + 1, j), stroke: `var(${weight >= 0 ? "--lh-red" : "--lh-blue"})`, "stroke-width": 1 + 4 * Math.abs(weight) })) line.setAttribute(key, String(value));
					line.append(title); edges.append(line); lines.push({ line, title, layer: l, from: i, to: j, weight });
				})));
				spec.layers.forEach((size, layer) => {
					const last = spec.layers.length - 1, layerName = layer === 0 ? "Input" : layer === last ? "Output" : `Hidden${spec.layers.length > 3 ? ` ${layer}` : ""}`, heading = el("span", "k-network-layer"); heading.textContent = layerName; heading.style.left = `${x(layer)}%`; diagram.append(heading);
					for (let neuron = 0; neuron < size; neuron++) {
						const index = nodes.length, button = el("button", "k-neuron"), value = el("span", "k-neuron-value"), gradient = el("span", "k-neuron-gradient"); button.type = "button"; button.dataset.layer = String(layer); button.dataset.neuron = String(neuron); button.tabIndex = index === active ? 0 : -1;
						button.style.left = `${x(layer)}%`; button.style.top = `${y(layer, neuron)}px`; button.append(value, gradient); diagram.append(button);
						const label = `${layerName} ${layer === 0 ? `x${neuron + 1}` : layer === last ? `y${size === 1 ? "" : neuron + 1}` : `h${neuron + 1}`}`;
						nodes.push({ button, value, gradient, layer, neuron, label });
						button.onpointerenter = () => select(index); button.onfocus = () => select(index); button.onclick = () => { pinned = index; select(index); }; button.onpointerleave = () => { if (pinned !== null) select(pinned); };
						button.onkeydown = event => {
							const nextLayer = event.key === "ArrowRight" ? Math.min(last, layer + 1) : event.key === "ArrowLeft" ? Math.max(0, layer - 1) : layer;
							const nextNeuron = event.key === "ArrowDown" ? Math.min(size - 1, neuron + 1) : event.key === "ArrowUp" ? Math.max(0, neuron - 1) : Math.min(neuron, spec.layers[nextLayer]! - 1);
							if (event.key.startsWith("Arrow")) { event.preventDefault(); nodes.find(node => node.layer === nextLayer && node.neuron === nextNeuron)!.button.focus(); }
						};
					}
				}); render(); resize(); if (hadFocus) nodes[active]!.button.focus();
			},
		};
	}

	private scatter(panel: Extract<DemoKitPanel, { type: "scatter" }>, box: HTMLElement): PanelView {
		const body = el("div", "k-scatter-body"), scroll = el("div", "k-scatter-scroll"), plot = el("div", "k-scatter-plot"), three = el("div", "k-scatter-3d"), legend = el("div", "k-scatter-legend"), meta = el("div", "k-scatter-meta");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.classList.add("k-scatter-svg"); svg.setAttribute("aria-hidden", "true"); plot.append(svg); scroll.append(plot); meta.append(legend); body.append(scroll, three, meta);
		const readout = el("p", "k-readout-line"); readout.setAttribute("aria-live", "polite");
		const fields = el("div", "k-scatter-fields"), toggle = el("button", "k-btn k-parameters-toggle", "Parameters"); toggle.type = "button"; toggle.setAttribute("aria-expanded", "true");
		toggle.onclick = () => { const collapsed = fields.classList.toggle("k-collapsed"); toggle.setAttribute("aria-expanded", String(!collapsed)); };
		const choice = el("label", "k-toggle"), checkbox = el("input"), choiceText = el("span"); checkbox.type = "checkbox"; checkbox.name = "arithmetic"; checkbox.autocomplete = "off"; checkbox.checked = true; choice.append(checkbox, choiceText); fields.append(toggle, choice); meta.append(fields); box.append(body, readout);
		let points: Point[] = [], groups: string[] = [], expression: Arithmetic | undefined, result: number[] | undefined, closest: ReturnType<typeof nearest> | undefined, expressionText = "", path: number[][] = [], fingerprint = "";
		let active = 0, selected: number | null = null, pinned: number | null = null, is3d = false, buttons: HTMLButtonElement[] = [], view3d: PanelView | undefined;
		let renderQueue = Promise.resolve();
		const palette = ["--lh-blue", "--lh-teal", "--lh-red", "--lh-green"];
		const color = (point: Point) => palette[Math.max(0, groups.indexOf(point.group ?? "")) % palette.length]!;
		const pointLabel = (index: number) => `${points[index]!.label} · (${coordinates(points[index]!).map(n => n.toFixed(2)).join(", ")})`;
		const read = () => { readout.textContent = selected !== null ? pointLabel(selected) : result && closest && checkbox.checked ? `${expressionText} lands nearest “${closest.point.label}” · ${panel.metric === "cosine" ? "Cosine" : "Euclidean"} distance ${closest.distance.toFixed(2)}` : "Focus or hover a point to read it. Arrow keys move between points."; };
		const traces = () => {
			const traces: Values[] = [];
			for (const group of [...new Set(points.map(point => point.group))]) {
				const members = points.map((point, index) => ({ point, index })).filter(p => p.point.group === group);
				traces.push({ type: "scatter3d", mode: "markers", x: members.map(p => p.point.x), y: members.map(p => p.point.y), z: members.map(p => p.point.z), text: members.map(p => p.point.label), customdata: members.map(p => p.index), hoverinfo: "text", marker: { size: 5, color: cssVar(color(members[0]!.point), theme.text) } });
			}
			if (result && checkbox.checked) {
				traces.push({ type: "scatter3d", mode: "lines", x: path.map(p => p[0]), y: path.map(p => p[1]), z: path.map(p => p[2]), line: { width: 2, color: theme.muted }, hoverinfo: "skip" });
				for (let i = 1; i < path.length; i++) {
					const a = path[i - 1]!, b = path[i]!, delta = b.map((v, j) => v - a[j]!), length = Math.hypot(...delta);
					if (length) traces.push({ type: "cone", x: [b[0]], y: [b[1]], z: [b[2]], u: [delta[0]! / length], v: [delta[1]! / length], w: [delta[2]! / length], anchor: "tip", sizemode: "absolute", sizeref: Math.max(...points.flatMap(p => coordinates(p).map(Math.abs)), 1) * .04, colorscale: [[0, theme.muted], [1, theme.muted]], showscale: false, hoverinfo: "skip" });
				}
				traces.push({ type: "scatter3d", mode: "markers+text", x: [result[0]], y: [result[1]], z: [result[2]], text: [expressionText], textposition: "top center", textfont: { color: theme.text, size: 13 }, marker: { symbol: "circle-open", size: 9, color: theme.text, line: { width: 2 } }, hoverinfo: "skip" });
			}
			if (selected !== null) { const p = points[selected]!; traces.push({ name: p.label, type: "scatter3d", mode: "markers+text", x: [p.x], y: [p.y], z: [p.z], text: [p.label], textposition: "top center", textfont: { color: theme.text, size: 15 }, marker: { symbol: "circle-open", size: 9, color: theme.text, line: { width: 2 } }, hoverinfo: "skip" }); }
			return traces;
		};
		const redraw3d = () => { renderQueue = renderQueue.then(async () => { if (is3d) await view3d?.update(); }).catch(error => this.report("scatter", error)); return renderQueue; };
		const select = (index: number | null) => {
			selected = index; if (index !== null) active = index;
			buttons.forEach((button, i) => { button.tabIndex = i === active ? 0 : -1; button.classList.toggle("k-active", i === selected); }); read();
			if (is3d) void redraw3d();
		};
		const resize2d = () => {
			if (!points.length || is3d) return;
			const all = [...points.map(coordinates), ...(checkbox.checked ? path : [])];
			const minX = Math.min(...all.map(p => p[0]!)), maxX = Math.max(...all.map(p => p[0]!)), minY = Math.min(...all.map(p => p[1]!)), maxY = Math.max(...all.map(p => p[1]!));
			const width = plot.clientWidth, height = plot.clientHeight;
			const xy = (p: number[]) => [40 + (maxX === minX ? .5 : (p[0]! - minX) / (maxX - minX)) * (width - 140), height - 40 - (maxY === minY ? .5 : (p[1]! - minY) / (maxY - minY)) * (height - 80)];
			buttons.forEach((button, i) => { const [x, y] = xy(coordinates(points[i]!)); button.style.left = `${x}px`; button.style.top = `${y}px`; button.classList.remove("k-overlap"); });
			const labels = buttons.map(button => button.querySelector(".k-scatter-label")!.getBoundingClientRect()), shown: DOMRect[] = [];
			labels.forEach((rect, i) => { const overlap = shown.some(other => rect.left < other.right + 6 && rect.right + 6 > other.left && rect.top < other.bottom + 4 && rect.bottom + 4 > other.top); buttons[i]!.classList.toggle("k-overlap", overlap); if (!overlap) shown.push(rect); });
			svg.replaceChildren();
			const shape = (tag: string, attributes: Record<string, string | number>) => { const node = document.createElementNS(svg.namespaceURI, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); svg.append(node); return node; };
			if (result && checkbox.checked) {
				for (let i = 1; i < path.length; i++) {
					const [ax, ay] = xy(path[i - 1]!), [bx, by] = xy(path[i]!), angle = Math.atan2(by! - ay!, bx! - ax!);
					shape("line", { class: "k-scatter-arrow", x1: ax!, y1: ay!, x2: bx!, y2: by!, stroke: "var(--lh-muted)", "stroke-width": 1.5 });
					shape("path", { d: `M${bx! - 8 * Math.cos(angle - .4)},${by! - 8 * Math.sin(angle - .4)} L${bx},${by} L${bx! - 8 * Math.cos(angle + .4)},${by! - 8 * Math.sin(angle + .4)}`, fill: "none", stroke: "var(--lh-muted)", "stroke-width": 1.5 });
				}
				const [x, y] = xy(result); shape("circle", { class: "k-scatter-ring", cx: x!, cy: y!, r: 10, fill: "none", stroke: "var(--lh-text)", "stroke-width": 2 });
				const text = shape("text", { x: x! + 14, y: y! + 26, fill: "var(--lh-text)", "font-size": 13 }); text.textContent = expressionText;
				text.setAttribute("x", String(Math.max(8, Math.min(x! + 14, width - (text as SVGTextElement).getComputedTextLength() - 8))));
				const annotation = text.getBoundingClientRect();
				labels.forEach((rect, i) => { if (rect.left < annotation.right + 6 && rect.right + 6 > annotation.left && rect.top < annotation.bottom + 4 && rect.bottom + 4 > annotation.top) buttons[i]!.classList.add("k-overlap"); });
			}
		};
		checkbox.onchange = () => { buttons.forEach((button, i) => button.classList.toggle("k-nearest", checkbox.checked && points[i]!.label === closest?.point.label)); read(); resize2d(); void redraw3d(); };
		return {
			focus: focused => { box.classList.toggle("k-scatter-focus", focused && !!expression); fields.classList.toggle("k-controls", focused && !!expression); if (focused && expression) box.append(fields); else meta.append(fields); },
			resize: async () => { resize2d(); if (is3d) await view3d?.resize?.(); },
			theme: async () => { if (is3d) { await view3d?.theme?.(); await redraw3d(); } },
			update: async () => {
				const data = { points: this.eval(panel.points) as Point[], groups: panel.groups === undefined ? undefined : this.eval(panel.groups), arithmetic: panel.arithmetic === undefined ? undefined : this.eval(panel.arithmetic) as Arithmetic };
				validatePoints(data.points);
				if (data.groups !== undefined && (!Array.isArray(data.groups) || data.groups.some((group: unknown) => typeof group !== "string"))) throw new Error("groups: use a list of names");
				const sum = data.arithmetic ? arithmetic(data.points, data.arithmetic) : undefined, found = sum ? nearest(data.points, sum, panel.metric, [...data.arithmetic!.plus, ...data.arithmetic!.minus]) : undefined;
				const signature = JSON.stringify(data); if (signature === fingerprint) return; fingerprint = signature;
				const hadFocus = buttons.some(button => button === document.activeElement); points = data.points; expression = data.arithmetic; result = sum; closest = found; groups = [...new Set<string>([...(data.groups ?? []), ...points.flatMap(p => p.group === undefined ? [] : [p.group])])];
				is3d = points[0]!.z !== undefined; active = 0; selected = null; pinned = null; buttons.forEach(button => button.remove()); buttons = [];
				three.hidden = !is3d; scroll.hidden = is3d; fields.hidden = !expression; checkbox.checked = true;
				path = []; expressionText = "";
				if (expression) {
					const operations: { label: string; sign: number }[] = [...expression.plus.slice(0, 1).map(label => ({ label, sign: 1 })), ...expression.minus.map(label => ({ label, sign: -1 })), ...expression.plus.slice(1).map(label => ({ label, sign: 1 }))];
					expressionText = operations.map((op, i) => `${i === 0 && op.sign === 1 ? "" : op.sign === 1 ? " + " : i === 0 ? "−" : " − "}${op.label}`).join("") || "0";
					let current = coordinates(points[0]!).map(() => 0);
					for (const op of operations) { current = current.map((v, i) => v + op.sign * coordinates(points.find(p => p.label === op.label)!)[i]!); path.push(current); }
					if (!path.length) path.push(current);
					choiceText.textContent = `Show ${expressionText}`;
				}
				legend.replaceChildren(); for (const group of groups) { const item = el("span"), swatch = el("i"); swatch.style.setProperty("--k-point-color", `var(${palette[groups.indexOf(group) % palette.length]})`); swatch.setAttribute("aria-hidden", "true"); item.append(swatch, document.createTextNode(group)); legend.append(item); }
				points.forEach((point, i) => {
					const button = el("button", "k-scatter-point"), dot = el("span", "k-scatter-dot"), label = el("span", "k-scatter-label"); button.type = "button"; button.tabIndex = i === active ? 0 : -1; button.dataset.index = String(i); button.setAttribute("aria-label", pointLabel(i)); dot.setAttribute("aria-hidden", "true"); button.style.setProperty("--k-point-color", `var(${color(point)})`); label.textContent = point.label; button.append(dot, label); button.classList.toggle("k-nearest", point.label === closest?.point.label);
					button.onfocus = () => select(i); button.onpointerenter = () => select(i); button.onclick = () => { pinned = i; select(i); }; button.onpointerleave = () => select(pinned);
					button.onkeydown = event => { const move = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0; if (move) { event.preventDefault(); buttons[(i + move + buttons.length) % buttons.length]!.focus(); } };
					buttons.push(button); (is3d ? three : plot).append(button);
				});
				if (is3d) {
					if (!view3d) {
						view3d = await this.plot3d({ type: "plot3d", traces: "[]", width: panel.width }, three, traces);
						const target = three.querySelector(".k-chart") as HTMLElement & { on(name: string, callback: (event: { points: { customdata?: number }[] }) => void): void };
						target.setAttribute("aria-hidden", "true");
						await view3d.update();
						target.on("plotly_hover", event => { const index = event.points[0]?.customdata; if (Number.isInteger(index)) select(index!); });
						target.on("plotly_unhover", () => select(pinned));
						target.on("plotly_click", event => { const index = event.points[0]?.customdata; if (Number.isInteger(index)) { pinned = index!; select(index!); } });
					} else await view3d.update();
				} else resize2d();
				read(); if (hadFocus) buttons[active]!.focus();
			},
		};
	}

	private shapes(panel: Extract<DemoKitPanel, { type: "shapes" }>, box: HTMLElement): PanelView {
		type Dimension = { name: string; size?: number };
		type ShapeStep = { op: string; shape: Dimension[] };
		const legend = el("p", "k-shape-legend"), list = el("ol", "k-shape-list"), readout = el("p", "k-readout-line"); readout.setAttribute("aria-live", "polite"); box.append(legend, list, readout);
		let selected = 0, fingerprint = "", buttons: HTMLButtonElement[] = [];
		const select = (index: number) => { selected = index; buttons.forEach((button, i) => button.setAttribute("aria-current", i === selected ? "step" : "false")); readout.textContent = buttons[selected]!.getAttribute("aria-label"); };
		return { update: () => {
			const steps: ShapeStep[] = this.eval(panel.steps), dims = panel.dims === undefined ? [] : this.eval(panel.dims);
			if (!Array.isArray(steps) || steps.length < 1 || steps.length > 24 || steps.some(step => !step || typeof step.op !== "string" || !Array.isArray(step.shape) || step.shape.length > 6 || step.shape.some(dim => !dim || typeof dim.name !== "string" || (dim.size !== undefined && !Number.isFinite(dim.size))))) throw new Error("steps: provide 1–24 operations with at most 6 named dimensions and finite sizes each");
			if (!Array.isArray(dims) || dims.some(dim => !dim || typeof dim.name !== "string" || typeof dim.meaning !== "string")) throw new Error("dims: provide dimension names and meanings");
			const signature = JSON.stringify({ steps, dims }); if (signature === fingerprint) return; fingerprint = signature;
			const hadFocus = list.contains(document.activeElement); selected = Math.min(selected, steps.length - 1); buttons = []; list.replaceChildren();
			legend.textContent = dims.map(dim => `${dim.name} ${dim.meaning}`).join(" · "); legend.hidden = dims.length === 0;
			const dimension = (dim: Dimension) => `${dim.name}${dim.size === undefined ? "" : ` ${dim.size}`}`;
			const shape = (dims: Dimension[]) => `(${dims.map(dimension).join(", ")})`;
			const equal = (a: Dimension, b: Dimension) => a.name === b.name && a.size === b.size;
			steps.forEach((step, index) => {
				const previous = steps[index - 1]?.shape;
				const same = previous && previous.length === step.shape.length && previous.every((dim, i) => equal(dim, step.shape[i]!));
				const change = previous === undefined ? "start" : same ? "no change" : `${shape(previous)} → ${shape(step.shape)}`;
				const item = el("li"), button = el("button", "k-shape-step"), number = el("span", "k-shape-number"), operation = el("span", "k-shape-op"), tensor = el("span", "k-shape-dims"), transition = el("span", "k-shape-change");
				button.type = "button"; button.dataset.step = String(index); number.textContent = String(index + 1); operation.textContent = step.op; transition.textContent = change;
				button.setAttribute("aria-label", `Step ${index + 1} of ${steps.length} · ${step.op} · (${step.shape.map(dim => dim.name).join(", ")}) · ${change}`);
				const unused = previous?.slice() ?? [];
				tensor.append(document.createTextNode("("));
				for (const dim of step.shape) {
					const match = unused.findIndex(before => equal(before, dim));
					const chip = el("span", `k-shape-dim${previous && match < 0 ? " k-shape-changed" : ""}`); chip.textContent = dimension(dim); tensor.append(chip);
					if (match >= 0) unused.splice(match, 1);
				}
				tensor.append(document.createTextNode(")")); button.append(number, operation, tensor, transition); item.append(button); list.append(item); buttons.push(button); button.onclick = () => select(index);
			}); select(selected); if (hadFocus) buttons[selected]!.focus();
		} };
	}

	private async panel(panel: DemoKitPanel, box: HTMLElement): Promise<PanelView> {
		switch (panel.type) {
			case "tokens": return this.tokens(panel, box);
			case "next_token": return this.nextToken(panel, box);
			case "heatmap": return this.heatmap(panel, box);
			case "network": return this.network(panel, box);
			case "scatter": return this.scatter(panel, box);
			case "shapes": return this.shapes(panel, box);
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

	private async plot3d(panel: Extract<DemoKitPanel, { type: "plot3d" }>, box: HTMLElement, data?: () => Values[]): Promise<PanelView> {
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
				const traces = (data ? data() : this.eval(panel.traces) ?? []) as { type?: string }[];
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
