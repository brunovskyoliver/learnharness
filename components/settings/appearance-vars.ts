/** The pure half of the appearance application: settings delta -> CSS
 * variables. Split from appearance.tsx (a client module) so the server
 * layout can put the same variables on <html> in the first response. */

import { FACTORY_SETTINGS, type AppearanceSettings } from "@/src/core";

/** The resolved, fully-concrete appearance view (delta + factory merged). */
export function resolveAppearance(delta: AppearanceSettings | undefined) {
	const f = FACTORY_SETTINGS.appearance;
	return {
		mode: delta?.mode ?? f.mode,
		background: delta?.background ?? f.background,
		fontFamily: delta?.fontFamily ?? f.fontFamily,
		proseFontSize: delta?.proseFontSize ?? f.proseFontSize,
		sessionNameSerif: delta?.sessionNameSerif ?? f.sessionNameSerif,
		mdRendering: {
			headingWeight: delta?.mdRendering?.headingWeight ?? f.mdRendering.headingWeight,
			boldColor: delta?.mdRendering?.boldColor ?? f.mdRendering.boldColor,
			italicColor: delta?.mdRendering?.italicColor ?? f.mdRendering.italicColor,
		},
	};
}

/** One channel clamped on the dark curve: additive offsets matching today's
 *  hand-picked palette (#141414 → card #1c1c1c (+8) → accent #2a2a2a (+22)
 *  → border #434343 (+47)) — the "per-mode derivation in code" the schema
 *  promises, as the thinnest curve that keeps the palette's relationships. */
function raise(hex: string, add: number): string {
	const n = hex.length === 4
		? hex.slice(1).split("").map((c) => parseInt(c + c, 16))
		: [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
	return `#${n.map((c) => Math.min(255, c + add).toString(16).padStart(2, "0")).join("")}`;
}

/** The derived palette a chosen background implies (dark curve): background
 *  itself, the raised surfaces (card/popover/secondary/muted, +8), the
 *  accent (+22), the edges (border/input, +47), and primary-foreground
 *  (the inverted text on primary = the background's own color, as today). */
export function derivedPalette(background: string): Record<string, string> {
	const card = raise(background, 8);
	const accent = raise(background, 22);
	const border = raise(background, 47);
	return {
		"--background": background,
		"--card": card,
		"--popover": card,
		"--secondary": card,
		"--muted": card,
		"--accent": accent,
		"--border": border,
		"--input": border,
		"--primary-foreground": background,
	};
}

/** THE mapping: resolved appearance → the CSS variables to set on <html>.
 *  Absent entries = leave the factory stylesheet value in place. Pure —
 *  exported for tests. */
export function appearanceVars(a: ReturnType<typeof resolveAppearance>): Record<string, string> {
	const vars: Record<string, string> = {};
	if (a.background !== null) Object.assign(vars, derivedPalette(a.background));
	if (a.fontFamily !== null) {
		vars["--font-prose"] = `"${a.fontFamily}", var(--font-sans3), ui-sans-serif, system-ui, sans-serif`;
	}
	// The ONE documented reading-size variable (typography round 4): prose,
	// inputs, and session titles all read it, so one setProperty moves them.
	vars["--lh-prose-size"] = `${a.proseFontSize}px`;
	// Session names: CMU Serif by default; the toggle swaps the title font
	// to the prose family — covers chat.tsx + new-session.tsx titles with
	// zero component edits (they use the .font-title utility).
	if (!a.sessionNameSerif) vars["--font-title"] = "var(--font-prose)";
	// Markdown rendering: heading weight + the emphasis inks (the vars
	// were built "ready for the settings UI").
	vars["--lh-heading-weight"] = String(a.mdRendering.headingWeight);
	if (a.mdRendering.boldColor !== null) vars["--lh-ink-strong"] = a.mdRendering.boldColor;
	if (a.mdRendering.italicColor !== null) vars["--lh-ink-italic"] = a.mdRendering.italicColor;
	return vars;
}

/** Pure: the previously-applied names ABSENT from the next var set —
 *  these get removeProperty so the factory stylesheet value returns.
 *  (Owner repro, fix wave: resets and toggle-backs never reverted because
 *  application only ever SET properties — the removal half was missing.)
 *  Exported for tests. */
export function staleVarNames(
	prevNames: readonly string[],
	nextVars: Record<string, string>,
): string[] {
	return prevNames.filter((n) => !(n in nextVars));
}
