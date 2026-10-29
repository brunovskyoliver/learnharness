/** Inline ML panels: literal inputs become expressions only inside the sandbox. */
import { Literal, Object as ObjectType, Optional, String as StringType, Union, type Static } from "typebox";
import { Check, Errors } from "typebox/value";
import { ML_PANEL_DATA_SCHEMAS, ML_PANEL_EXPRESSION_FIELDS, mlPanelDataProblems, type DemoKitPanel, type DemoKitSpec } from "./demo-kit.ts";

const Common = { title: StringType({ minLength: 1, maxLength: 80 }), caption: Optional(StringType({ maxLength: 200 })) };
export const MlVisualInputSchema = Union([
	ObjectType({ kind: Literal("heatmap"), ...Common, data: ML_PANEL_DATA_SCHEMAS.heatmap }),
	ObjectType({ kind: Literal("tokens"), ...Common, data: ML_PANEL_DATA_SCHEMAS.tokens }),
	ObjectType({ kind: Literal("next_token"), ...Common, data: ML_PANEL_DATA_SCHEMAS.next_token }),
	ObjectType({ kind: Literal("scatter"), ...Common, data: ML_PANEL_DATA_SCHEMAS.scatter }),
	ObjectType({ kind: Literal("network"), ...Common, data: ML_PANEL_DATA_SCHEMAS.network }),
	ObjectType({ kind: Literal("shapes"), ...Common, data: ML_PANEL_DATA_SCHEMAS.shapes }),
]);
export type MlVisualInput = Static<typeof MlVisualInputSchema>;

export function mlVisualInputProblems(input: unknown): string[] {
	if (!Check(MlVisualInputSchema, input)) return [...Errors(MlVisualInputSchema, input)].slice(0, 12).map(error => `${error.instancePath || "/"}: ${error.message}`);
	const value = input as MlVisualInput;
	return mlPanelDataProblems(value.kind, value.data);
}

export function mlVisualKitSpec(input: unknown): DemoKitSpec {
	const problems = mlVisualInputProblems(input);
	if (problems.length) throw new Error(problems.join("\n"));
	const value = input as MlVisualInput;
	const expressions: readonly string[] = ML_PANEL_EXPRESSION_FIELDS[value.kind];
	const data = Object.fromEntries(Object.entries(value.data).map(([key, item]) => [key, expressions.includes(key) ? JSON.stringify(item) : item]));
	return { panels: [{ ...data, type: value.kind, title: value.title, ...(value.caption !== undefined ? { caption: value.caption } : {}) } as DemoKitPanel] };
}
