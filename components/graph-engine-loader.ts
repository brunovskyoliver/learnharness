import type { GraphCanvasRenderer } from "./graph-canvas.ts";

let request: Promise<typeof GraphCanvasRenderer> | undefined;

/** Empty graphs have no canvas, physics, or zoom engine to download. */
export function loadGraphRenderer(): Promise<typeof GraphCanvasRenderer> {
	return request ??= import("./graph-canvas.ts").then((module) => module.GraphCanvasRenderer);
}
