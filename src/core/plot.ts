/** Quick plots (feature 005): the `plot` tool's input and the demo-kit
 *  spec built from it in code — no builder agent. One variable draws a
 *  line chart; two draw a 3D surface beside a contour view; each
 *  parameter becomes a slider. The expression runs only inside the
 *  sandboxed demo iframe (and the headless check), never on the server;
 *  validateDemoKitSpec only compiles it. */
import { Array as ArrayType, Literal as LiteralType, Number as NumberType, Object as ObjectType, Optional as OptionalType, Record as RecordType, String as StringType, Tuple as TupleType, Union as UnionType, type Static } from "typebox";
import type { DemoKitSpec } from "./demo-kit.ts";

const Type = { Array: ArrayType, Literal: LiteralType, Number: NumberType, Object: ObjectType, Optional: OptionalType, Record: RecordType, String: StringType, Tuple: TupleType, Union: UnionType };

const Range = Type.Object({ min: Type.Number(), max: Type.Number() });

export const PlotInputSchema = Type.Object({
	title: Type.String({ minLength: 1, maxLength: 80, description: "Short title for the plot card; refer to it in bold." }),
	variables: Type.Union([Type.Tuple([Type.Literal("x")]), Type.Tuple([Type.Literal("x"), Type.Literal("y")])], {
		description: '["x"] for y = f(x); ["x", "y"] for z = f(x, y).',
	}),
	expression: Type.String({ minLength: 1, description: "JavaScript over x (and y), the parameters by name and Math functions without the Math. prefix, e.g. x**2 + 3*x*y**2." }),
	x: Range,
	y: Type.Optional(Range),
	zClip: Type.Optional(Type.Object({ min: Type.Number(), max: Type.Number() }, { description: "Optional visible range for the output; values outside are dropped (steep or singular functions)." })),
	params: Type.Optional(Type.Record(Type.String(), Type.Object({
		label: Type.Optional(Type.String()),
		min: Type.Number(),
		max: Type.Number(),
		step: Type.Number(),
		value: Type.Number(),
	}), { description: "Up to 6 parameters, each a slider; read by bare name in the expression." })),
});

export type PlotInput = Static<typeof PlotInputSchema>;

const MAX_PARAMS = 6;
const RESERVED = new Set(["x", "y", "p", "s", "d", "t", "range", ...Object.getOwnPropertyNames(Math)]);
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Everything wrong with the input, as short lines for the model. */
export function plotInputProblems(input: PlotInput): string[] {
	const problems: string[] = [];
	const two = input.variables.length === 2;
	const range = (where: string, r: { min: number; max: number }) => {
		if (!(r.min < r.max)) problems.push(`${where}: min must be below max`);
	};
	range("x", input.x);
	if (two && !input.y) problems.push("y: required for two variables");
	if (!two && input.y) problems.push("y: only for two variables");
	if (input.y) range("y", input.y);
	if (input.zClip) range("zClip", input.zClip);
	const params = Object.entries(input.params ?? {});
	if (params.length > MAX_PARAMS) problems.push(`params: at most ${MAX_PARAMS} parameters`);
	for (const [name, p] of params) {
		if (!IDENTIFIER.test(name) || RESERVED.has(name)) problems.push(`params.${name}: not a usable name (letters, digits, _; not x, y or a Math function)`);
		if (!(p.min < p.max)) problems.push(`params.${name}: min must be below max`);
		if (!(p.step > 0)) problems.push(`params.${name}: step must be above 0`);
		if (p.value < p.min || p.value > p.max) problems.push(`params.${name}: value must lie within min..max`);
	}
	return problems;
}

const ONE_SAMPLES = 400;
const GRID = 60;

/** The demo-kit spec for a valid input (check plotInputProblems first). */
export function plotKitSpec(input: PlotInput): DemoKitSpec {
	const names = Object.keys(input.params ?? {});
	const two = input.variables.length === 2;
	const args = two ? "x, y" : "x";
	const unpack = names.length ? `const { ${names.join(", ")} } = p; ` : "";
	const keep = input.zClip ? ` && v >= ${input.zClip.min} && v <= ${input.zClip.max}` : "";
	const axis = (r: { min: number; max: number }, n: number) => `Array.from({ length: ${n + 1} }, (_, i) => ${r.min} + i * (${r.max} - ${r.min}) / ${n})`;
	const params: DemoKitSpec["params"] = Object.fromEntries(
		Object.entries(input.params ?? {}).map(([name, p]) => [name, { type: "slider" as const, label: p.label ?? name, min: p.min, max: p.max, step: p.step, value: p.value }]),
	);
	const derived: Record<string, string> = {
		f: `(${args}) => { ${unpack}return (${input.expression}); }`,
	};
	let panels: DemoKitSpec["panels"];
	if (!two) {
		derived.points = `${axis(input.x, ONE_SAMPLES)}.map((x) => ({ x, y: d.f(x) })).filter((r) => { const v = r.y; return Number.isFinite(v)${keep}; })`;
		derived.check = `d.points.length > 0 || (() => { throw new Error("no finite values in range"); })()`;
		panels = [{
			type: "chart",
			title: input.title,
			data: { points: "d.points" },
			spec: {
				data: { name: "points" },
				mark: { type: "line" },
				encoding: {
					x: { field: "x", type: "quantitative", title: "x", scale: { domain: [input.x.min, input.x.max] } },
					y: { field: "y", type: "quantitative", title: "y", ...(input.zClip ? { scale: { domain: [input.zClip.min, input.zClip.max] } } : {}) },
				},
			},
		}];
	} else {
		const y = input.y!;
		derived.grid = `(() => { const xs = ${axis(input.x, GRID)}; const ys = ${axis(y, GRID)}; let finite = 0; const z = ys.map((y) => xs.map((x) => { const v = d.f(x, y); if (Number.isFinite(v)${keep}) { finite++; return v; } return null; })); return { xs, ys, z, finite }; })()`;
		derived.check = `d.grid.finite > 0 || (() => { throw new Error("no finite values in range"); })()`;
		const layout = { scene: { xaxis: { title: { text: "x" } }, yaxis: { title: { text: "y" } }, zaxis: { title: { text: "z" } } } };
		panels = [
			{ type: "plot3d", title: "Surface", width: "half", traces: `[{ type: "surface", x: d.grid.xs, y: d.grid.ys, z: d.grid.z, showscale: false }]`, layout },
			{ type: "plot3d", title: "Contour", width: "half", traces: `[{ type: "contour", x: d.grid.xs, y: d.grid.ys, z: d.grid.z, showscale: false }]`, layout: { xaxis: { title: { text: "x" } }, yaxis: { title: { text: "y" } } } },
		];
	}
	return { ...(names.length ? { params } : {}), derived, panels };
}
