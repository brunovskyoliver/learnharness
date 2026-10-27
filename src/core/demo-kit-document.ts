/** Browser-safe demo document helpers. Schema validation lives in demo-kit.ts. */
import type { DemoKitSpec } from "./demo-kit.ts";

export const DEMO_KIT_RUNTIME_PATH = "/demo-kit/runtime.js";
const SPEC_ID = "lh-kit-spec";

/** The stored demo document: the spec as JSON plus the runtime script. */
export function kitDemoHtml(spec: DemoKitSpec): string {
	const json = JSON.stringify(spec).replace(/</g, "\\u003c");
	return [
		"<!doctype html>",
		'<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
		'<body><div id="lh-kit"></div>',
		`<script type="application/json" id="${SPEC_ID}">${json}</script>`,
		`<script src="${DEMO_KIT_RUNTIME_PATH}"></script>`,
		"</body></html>",
	].join("\n");
}

/** The spec inside a kit demo's HTML, or null for a hand-written demo. */
export function kitSpecOf(html: string): DemoKitSpec | null {
	const m = new RegExp(`<script type="application/json" id="${SPEC_ID}">([\\s\\S]*?)</script>`).exec(html);
	if (!m) return null;
	try {
		return JSON.parse(m[1]!) as DemoKitSpec;
	} catch {
		return null;
	}
}
