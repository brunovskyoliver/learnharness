/** Download the fallback layout engine only when a graph lacks saved positions. */
export async function loadGraphLayout() {
	const { incrementalLayout } = await import("./graph-layout-engine.ts");
	return incrementalLayout;
}
