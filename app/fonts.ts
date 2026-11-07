import { Instrument_Sans, Newsreader } from "next/font/google";

// The paper system's two faces for the whole app (feature 025, research R3;
// feature 024, R8). Instrument Sans (variable, wdth axis) carries the UI and
// the learner's words; Newsreader (variable, opsz axis, normal and italic) is
// the AI's voice at weight 420, opsz 14 (app/paper.css `.nb-voice`). Both
// are preloaded: lessons and Notebook set tutor text on first paint. Code
// uses the system mono stack (--nb-mono), so no third face downloads.
const sans = Instrument_Sans({
	subsets: ["latin"],
	variable: "--nb-font-sans",
	axes: ["wdth"],
	display: "swap",
});

const voice = Newsreader({
	subsets: ["latin"],
	weight: "variable",
	style: ["normal", "italic"],
	axes: ["opsz"],
	variable: "--nb-font-voice",
	display: "swap",
});

/** Class names that declare `--nb-font-sans` and `--nb-font-voice` (on <html>). */
export const fontClasses = `${sans.variable} ${voice.variable}`;
