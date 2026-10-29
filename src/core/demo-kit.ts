/** The demo kit spec: a demo described as JSON (controls, state, a step
 *  function and panels) and drawn by the bundled runtime in
 *  public/demo-kit/ (src/demo-kit/runtime.ts) with Vega-Lite, Plotly and
 *  React Flow. The stored demo stays ordinary HTML (kitDemoHtml), so the
 *  lesson iframe, side panel, inversion and download work unchanged.
 *
 *  Expressions and `step` are JavaScript, evaluated inside the demo's
 *  sandboxed iframe with: p (params), s (state), d (derived), t (step
 *  count), range(start, stop, step) and Math's functions. */

import { Array as ArrayType, Boolean as BooleanType, Integer as IntegerType, Literal as LiteralType, Number as NumberType, Object as ObjectType, Optional as OptionalType, Record as RecordType, String as StringType, Union as UnionType, Unknown as UnknownType, type Static, type TSchema } from "typebox";
const Type = { Array: ArrayType, Boolean: BooleanType, Integer: IntegerType, Literal: LiteralType, Number: NumberType, Object: ObjectType, Optional: OptionalType, Record: RecordType, String: StringType, Union: UnionType, Unknown: UnknownType };
import { Check, Errors } from "typebox/value";

const Expr = Type.String({ minLength: 1, description: "JavaScript expression over p, s, d, t, range() and Math functions." });
const Width = Type.Optional(Type.Union([Type.Literal("full"), Type.Literal("half")], { description: "Panel width; default full." }));
const Title = Type.Optional(Type.String({ description: "Short panel heading." }));

const Slider = Type.Object({
	type: Type.Literal("slider"),
	label: Type.String(),
	min: Type.Number(),
	max: Type.Number(),
	step: Type.Number({ exclusiveMinimum: 0 }),
	value: Type.Number(),
});
const Select = Type.Object({
	type: Type.Literal("select"),
	label: Type.String(),
	options: Type.Array(Type.Union([Type.Number(), Type.String()]), { minItems: 2 }),
	value: Type.Union([Type.Number(), Type.String()]),
});
const Toggle = Type.Object({ type: Type.Literal("toggle"), label: Type.String(), value: Type.Boolean() });

const ChartPanel = Type.Object({
	type: Type.Literal("chart"),
	title: Title,
	width: Width,
	data: Type.Record(Type.String(), Expr, {
		description: "Named datasets: name → expression returning an array of row objects. The Vega-Lite spec refers to them with data: {name}.",
	}),
	spec: Type.Record(Type.String(), Type.Unknown(), {
		description: "A Vega-Lite spec (layers allowed). Use data: {name: \"…\"} — never inline values; no title, width, height or config (the kit sets them).",
	}),
});
const Plot3dPanel = Type.Object({
	type: Type.Literal("plot3d"),
	title: Title,
	width: Width,
	traces: Type.String({ minLength: 1, description: "Expression returning an array of Plotly traces (surface, contour, scatter3d, scatter…)." }),
	layout: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Extra Plotly layout (axis titles, camera). Colors and fonts come from the kit." })),
});
const FlowPanel = Type.Object({
	type: Type.Literal("flow"),
	title: Title,
	width: Width,
	nodes: Type.String({ minLength: 1, description: "Expression returning [{id, label, value?, highlight?}]." }),
	edges: Type.String({ minLength: 1, description: "Expression returning [{from, to, label?, highlight?}]." }),
	direction: Type.Optional(Type.Union([Type.Literal("LR"), Type.Literal("TB")])),
});
const ReadoutsPanel = Type.Object({
	type: Type.Literal("readouts"),
	width: Width,
	items: Type.Array(
		Type.Object({ label: Type.String(), value: Expr, digits: Type.Optional(Type.Integer({ minimum: 0, maximum: 8 })) }),
		{ minItems: 1 },
	),
});
const TablePanel = Type.Object({
	type: Type.Literal("table"),
	title: Title,
	width: Width,
	columns: Type.Array(Type.String(), { minItems: 1 }),
	rows: Type.String({ minLength: 1, description: "Expression returning an array of row arrays, one value per column." }),
	digits: Type.Optional(Type.Integer({ minimum: 0, maximum: 8 })),
});
const NotePanel = Type.Object({
	type: Type.Literal("note"),
	width: Width,
	text: Type.String({ minLength: 1, description: "One or two sentences telling the learner what to try. **bold** allowed." }),
});

const Encoding = Type.Union([Type.Literal("o200k"), Type.Literal("cl100k"), Type.Literal("gpt2")]);
const Scale = Type.Union([Type.Literal("sequential"), Type.Literal("diverging")]);
const Metric = Type.Union([Type.Literal("cosine"), Type.Literal("euclidean")]);
const Activation = Type.Union([Type.Literal("sigmoid"), Type.Literal("tanh"), Type.Literal("relu")]);
const Loss = Type.Union([Type.Literal("mse"), Type.Literal("bce")]);
const Strings = Type.Array(Type.String(), { minItems: 1, maxItems: 64 });
const Numbers = Type.Array(Type.Number(), { minItems: 1, maxItems: 8 });
const LogitToken = Type.Object({ text: Type.String(), logit: Type.Number() }, { additionalProperties: false });
const ProbabilityToken = Type.Object({ text: Type.String(), p: Type.Number({ minimum: 0, maximum: 1 }) }, { additionalProperties: false });

/** Literal shapes shared by inline validation and runtime evaluated-data checks. */
export const ML_PANEL_DATA_SCHEMAS = {
	heatmap: Type.Object({ rows: Strings, cols: Strings, values: Type.Array(Type.Array(Type.Number(), { minItems: 1, maxItems: 64 }), { minItems: 1, maxItems: 64 }), scale: Scale, min: Type.Optional(Type.Number()), max: Type.Optional(Type.Number()), rowAxis: Type.Optional(Type.String()), colAxis: Type.Optional(Type.String()), digits: Type.Optional(Type.Integer({ minimum: 0, maximum: 8 })) }),
	tokens: Type.Object({ text: Type.String({ minLength: 1, maxLength: 2000 }), encoding: Type.Optional(Encoding) }, { additionalProperties: false }),
	next_token: Type.Object({ context: Type.String(), tokens: Type.Union([Type.Array(LogitToken, { minItems: 1, maxItems: 30 }), Type.Array(ProbabilityToken, { minItems: 1, maxItems: 30 })]), temperature: Type.Optional(Type.Number({ exclusiveMinimum: 0, default: 1 })), topK: Type.Optional(Type.Integer({ minimum: 0, default: 0 })), topP: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 1, default: 1 })) }),
	scatter: Type.Object({ points: Type.Array(Type.Object({ label: Type.String(), x: Type.Number(), y: Type.Number(), z: Type.Optional(Type.Number()), group: Type.Optional(Type.String()) }), { minItems: 1, maxItems: 200 }), groups: Type.Optional(Type.Array(Type.String())), arithmetic: Type.Optional(Type.Object({ plus: Type.Array(Type.String()), minus: Type.Array(Type.String()) })), metric: Metric }),
	network: Type.Object({ layers: Type.Array(Type.Integer({ minimum: 1, maximum: 8 }), { minItems: 2, maxItems: 5 }), weights: Type.Array(Type.Array(Numbers, { minItems: 1, maxItems: 8 }), { minItems: 1, maxItems: 4 }), biases: Type.Array(Numbers, { minItems: 1, maxItems: 4 }), input: Numbers, target: Numbers, activation: Activation, loss: Loss }),
	shapes: Type.Object({ dims: Type.Optional(Type.Array(Type.Object({ name: Type.String(), meaning: Type.String() }))), steps: Type.Array(Type.Object({ op: Type.String(), shape: Type.Array(Type.Object({ name: Type.String(), size: Type.Optional(Type.Number()) }), { maxItems: 6 }) }), { minItems: 1, maxItems: 24 }) }),
} as const;

export type MlPanelKind = keyof typeof ML_PANEL_DATA_SCHEMAS;
export type MlPanelData<K extends MlPanelKind> = Static<(typeof ML_PANEL_DATA_SCHEMAS)[K]>;
export const ML_PANEL_EXPRESSION_FIELDS = {
	heatmap: ["rows", "cols", "values", "min", "max", "rowAxis", "colAxis", "digits"],
	tokens: [],
	next_token: ["context", "tokens", "temperature", "topK", "topP"],
	scatter: ["points", "groups", "arithmetic"],
	network: ["layers", "weights", "biases", "input", "target"],
	shapes: ["dims", "steps"],
} as const;
const MlCommon = { title: Title, width: Width, caption: Type.Optional(Type.String({ maxLength: 200 })), link: Type.Optional(Type.String()) };
const HeatmapPanel = Type.Object({ type: Type.Literal("heatmap"), ...MlCommon, rows: Expr, cols: Expr, values: Expr, scale: Scale, min: Type.Optional(Expr), max: Type.Optional(Expr), rowAxis: Type.Optional(Expr), colAxis: Type.Optional(Expr), digits: Type.Optional(Expr) });
const TokensPanel = Type.Object({ type: Type.Literal("tokens"), ...MlCommon, text: Type.String({ minLength: 1, maxLength: 2000 }), encoding: Type.Optional(Encoding) });
const NextTokenPanel = Type.Object({ type: Type.Literal("next_token"), ...MlCommon, context: Expr, tokens: Expr, temperature: Type.Optional(Expr), topK: Type.Optional(Expr), topP: Type.Optional(Expr) });
const ScatterPanel = Type.Object({ type: Type.Literal("scatter"), ...MlCommon, points: Expr, groups: Type.Optional(Expr), arithmetic: Type.Optional(Expr), metric: Metric });
const NetworkPanel = Type.Object({ type: Type.Literal("network"), ...MlCommon, layers: Expr, weights: Expr, biases: Expr, input: Expr, target: Expr, activation: Activation, loss: Loss });
const ShapesPanel = Type.Object({ type: Type.Literal("shapes"), ...MlCommon, dims: Type.Optional(Expr), steps: Expr });

/** Validate known fields only; kit expressions unknown until runtime are omitted. */
export function mlPanelDataProblems(kind: MlPanelKind, data: Record<string, unknown>): string[] {
	const errors: string[] = [];
	const schema = ML_PANEL_DATA_SCHEMAS[kind];
	for (const [key, value] of Object.entries(data)) {
		const field = (schema.properties as Record<string, TSchema>)[key];
		if (field && !Check(field, value)) errors.push(`${key}: invalid ${kind} data`);
	}
	if (errors.length) return errors;
	if ("tokenized" in data) errors.push("tokenized: only the server may supply tokens");
	if (kind === "heatmap") {
		const d = data as Partial<MlPanelData<"heatmap">>;
		if (d.rows && d.values && d.rows.length !== d.values.length) errors.push("values: one row per row label required");
		if (d.cols && d.values && d.values.some(row => row.length !== d.cols!.length)) errors.push("values: one column per column label required");
	}
	if (kind === "next_token") {
		const d = data as Partial<MlPanelData<"next_token">>;
		if (d.tokens?.length && "p" in d.tokens[0]! && Math.abs(d.tokens.reduce((sum, token) => sum + ("p" in token ? token.p : 0), 0) - 1) > 0.01) errors.push("tokens: probabilities must sum to 1 ± 0.01");
	}
	if (kind === "scatter") {
		const d = data as Partial<MlPanelData<"scatter">>;
		if (d.points) {
			if (new Set(d.points.map(point => point.label)).size !== d.points.length) errors.push("points: labels must be unique");
			if (d.points.some(point => (point.z !== undefined) !== (d.points![0]!.z !== undefined))) errors.push("points: use all 2D or all 3D points");
			if (d.arithmetic && [...d.arithmetic.plus, ...d.arithmetic.minus].some(label => !d.points!.some(point => point.label === label))) errors.push("arithmetic: every operand must name a point");
		}
	}
	if (kind === "network") {
		const d = data as Partial<MlPanelData<"network">>;
		if (d.layers) {
			if (d.weights && (d.weights.length !== d.layers.length - 1 || d.weights.some((layer, i) => layer.length !== d.layers![i + 1] || layer.some(row => row.length !== d.layers![i])))) errors.push("weights: shapes must match adjacent layer sizes");
			if (d.biases && (d.biases.length !== d.layers.length - 1 || d.biases.some((layer, i) => layer.length !== d.layers![i + 1]))) errors.push("biases: shapes must match output layer sizes");
			if (d.input && d.input.length !== d.layers[0]) errors.push("input: length must match input layer");
			if (d.target && d.target.length !== d.layers.at(-1)) errors.push("target: length must match output layer");
		}
	}
	return errors;
}

export const DemoKitSpecSchema = Type.Object({
	params: Type.Optional(Type.Record(Type.String(), Type.Union([Slider, Select, Toggle]), { description: "Controls, keyed by name (read as p.name)." })),
	state: Type.Optional(Type.Record(Type.String(), Expr, {
		description: "Initial state, keyed by name (read as s.name). Re-evaluated on Reset and whenever a param it reads changes.",
	})),
	step: Type.Optional(Type.String({ minLength: 1, description: "JavaScript statements run on Step/Run; mutate s. Adds Step, Run and Reset buttons." })),
	stopWhen: Type.Optional(Type.String({ minLength: 1, description: "Expression; Run pauses when it is true." })),
	run: Type.Optional(Type.Object({
		intervalMs: Type.Optional(Type.Integer({ minimum: 30, maximum: 2000 })),
		maxSteps: Type.Optional(Type.Integer({ minimum: 1, maximum: 10_000 })),
	})),
	derived: Type.Optional(Type.Record(Type.String(), Expr, { description: "Computed values in order, keyed by name (read as d.name)." })),
	panels: Type.Array(Type.Union([ChartPanel, Plot3dPanel, FlowPanel, ReadoutsPanel, TablePanel, NotePanel, HeatmapPanel, TokensPanel, NextTokenPanel, ScatterPanel, NetworkPanel, ShapesPanel]), { minItems: 1 }),
});

export type DemoKitSpec = Static<typeof DemoKitSpecSchema>;
export type DemoKitPanel = DemoKitSpec["panels"][number];
export type TokenEncoding = "o200k" | "cl100k" | "gpt2";
export type Token = { id: number; text: string | null; bytes?: number[] };
/** Server output only. Agent input schemas never accept tokenized. */
export type TokenizedPanel = Extract<DemoKitPanel, { type: "tokens" }> & { tokenized: Record<TokenEncoding, Token[]> };
export type FinalizedDemoKitPanel = Exclude<DemoKitPanel, { type: "tokens" }> | TokenizedPanel;
export type FinalizedDemoKitSpec = Omit<DemoKitSpec, "panels"> & { panels: FinalizedDemoKitPanel[] };

const SCOPE = ["p", "s", "d", "t", "range", ...Object.getOwnPropertyNames(Math)];

/** Every problem with a spec, as short lines for the builder. Schema first;
 *  then each expression and the step body must compile. Compiling only
 *  parses (new Function never runs the body), so this is safe server-side. */
export function validateDemoKitSpec(spec: unknown): string[] {
	if (!Check(DemoKitSpecSchema, spec)) {
		return [...Errors(DemoKitSpecSchema, spec)].slice(0, 12).map((e) => `${e.instancePath || "/"}: ${e.message}`);
	}
	const s = spec as DemoKitSpec;
	const errors: string[] = [];
	const compile = (where: string, body: string) => {
		try {
			new Function(...SCOPE, body);
		} catch (err) {
			errors.push(`${where}: ${err instanceof Error ? err.message : String(err)}`);
		}
	};
	const expr = (where: string, e: string) => compile(where, `return (${e});`);
	for (const [k, e] of Object.entries(s.state ?? {})) expr(`state.${k}`, e);
	for (const [k, e] of Object.entries(s.derived ?? {})) expr(`derived.${k}`, e);
	if (s.step) compile("step", s.step);
	if (s.stopWhen) expr("stopWhen", s.stopWhen);
	if (s.stopWhen && !s.step) errors.push("stopWhen: needs a step");
	for (const [k, p] of Object.entries(s.params ?? {})) {
		if (p.type === "slider" && (p.min >= p.max || p.value < p.min || p.value > p.max)) errors.push(`params.${k}: value must lie within min < max`);
		if (p.type === "select" && !p.options.includes(p.value)) errors.push(`params.${k}: value must be one of the options`);
	}
	s.panels.forEach((panel, i) => {
		const at = `panels[${i}]`;
		if (panel.type in ML_PANEL_DATA_SCHEMAS) {
			const kind = panel.type as MlPanelKind;
			const data: Record<string, unknown> = { ...panel };
			for (const key of ML_PANEL_EXPRESSION_FIELDS[kind]) {
				const value = data[key];
				if (typeof value !== "string") continue;
				expr(`${at}.${key}`, value);
				try { data[key] = JSON.parse(value); } catch { delete data[key]; }
			}
			if ("tokenized" in panel) errors.push(`${at}.tokenized: only the server may supply tokens`);
			errors.push(...mlPanelDataProblems(kind, data).map(problem => `${at}.${problem}`));
		}
		switch (panel.type) {
			case "chart":
				for (const [k, e] of Object.entries(panel.data)) expr(`${at}.data.${k}`, e);
				if (Object.keys(panel.data).length === 0) errors.push(`${at}.data: at least one dataset`);
				break;
			case "plot3d":
				expr(`${at}.traces`, panel.traces);
				break;
			case "flow":
				expr(`${at}.nodes`, panel.nodes);
				expr(`${at}.edges`, panel.edges);
				break;
			case "readouts":
				panel.items.forEach((item, j) => expr(`${at}.items[${j}].value`, item.value));
				break;
			case "table":
				expr(`${at}.rows`, panel.rows);
				break;
		}
	});
	return errors;
}


export { DEMO_KIT_RUNTIME_PATH, kitDemoHtml, kitSpecOf } from "./demo-kit-document.ts";
