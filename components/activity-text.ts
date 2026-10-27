/** Background-job activity lines in plain words. Sub-agents record terse
 *  tool-shaped lines ("run_demo: clean", "write_svg: 3.1 KB"); the learner
 *  sees what is happening instead. Unknown lines pass through. Pure. */

const RULES: [RegExp, string | ((m: RegExpMatchArray) => string)][] = [
	[/^write_kit_demo$/, "Writing the demo"],
	[/^write_kit_demo: (\d+) panels?$/, (m) => `Drafted the demo (${m[1]} panel${m[1] === "1" ? "" : "s"})`],
	[/^write_kit_demo: \d+ problems?$/, "Fixing the demo spec"],
	[/^write_demo(?::.*)?$/, "Writing the demo"],
	[/^run_demo$/, "Testing the demo"],
	[/^run_demo: clean$/, "Test passed, checking the result"],
	[/^run_demo: browser error$/, "Test browser failed, retrying"],
	[/^run_demo: .+$/, "Test found problems, fixing"],
	[/^final verification$/, "Final check"],
	[/^write_svg(?::.*)?$/, "Drawing the figure"],
	[/^edit_svg(?::.*)?$/, "Adjusting the figure"],
	[/^render_svg: inspecting final render$/, "Checking the final figure"],
	[/^render_svg: render error$/, "Figure failed to render, fixing"],
	[/^render_svg(?::.*)?$/, "Checking the figure"],
	[/^pdf_info(?::.*)?$/, "Looking through the PDF"],
	[/^pdf_extract: (.+)$/, (m) => `Reading ${m[1]}`],
	[/^pdf_search: (.+)$/, (m) => `Searching for ${m[1]}`],
	[/^pdf_render: (.+?) @\d+dpi$/, (m) => `Looking at ${m[1]}`],
	[/^recovering: re-running$/, "Restarted after a server restart"],
	[/^building demo$/, "Starting"],
	[/^drawing figure$/, "Starting"],
	[/^researching$/, "Researching"],
	[/^reading pdf$/, "Reading the PDF"],
];

export function activityText(raw: string | undefined | null): string {
	const line = (raw ?? "").trim();
	if (!line) return "";
	for (const [re, out] of RULES) {
		const m = line.match(re);
		if (m) return typeof out === "string" ? out : out(m);
	}
	return line;
}

/** Elapsed as a compact ticking string: 45s / 3m 04s / 1h 12m. */
export function formatElapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
	return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
