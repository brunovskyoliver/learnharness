/** The demo kit spec: a demo described as JSON (controls, state, a step
 *  function and panels) and drawn by the bundled runtime in
 *  public/demo-kit/ (src/demo-kit/runtime.ts) with Vega-Lite, Plotly and
 *  React Flow. The stored demo stays ordinary HTML (kitDemoHtml), so the
 *  lesson iframe, side panel, inversion and download work unchanged.
 *
 *  Expressions and `step` are JavaScript, evaluated inside the demo's
 *  sandboxed iframe with: p (params), s (state), d (derived), t (step
 *  count), range(start, stop, step) and Math's functions. */

import { Array as ArrayType, Boolean as BooleanType, Integer as IntegerType, Literal as LiteralType, Number as NumberType, Object as ObjectType, Optional as OptionalType, Record as RecordType, String as StringType, Union as UnionType, Unknown as UnknownType, type Static } from "typebox";
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
	panels: Type.Array(Type.Union([ChartPanel, Plot3dPanel, FlowPanel, ReadoutsPanel, TablePanel, NotePanel]), { minItems: 1 }),
});

export type DemoKitSpec = Static<typeof DemoKitSpecSchema>;
export type DemoKitPanel = DemoKitSpec["panels"][number];

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
