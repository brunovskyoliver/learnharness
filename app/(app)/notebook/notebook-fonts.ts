import { Instrument_Sans, Newsreader } from "next/font/google";

// Notebook's two faces (feature 024, research R8). Imported only by the
// Notebook route so Study never downloads them. The variables sit on the
// `.nb-root` wrapper: Instrument Sans carries the UI and the learner's
// text; Newsreader (opsz axis) is the AI's voice at weight 420, opsz 14
// (notebook.css `.nb-voice`).
const sans = Instrument_Sans({
	subsets: ["latin"],
	variable: "--nb-font-sans",
	axes: ["wdth"],
});

const voice = Newsreader({
	subsets: ["latin"],
	weight: "variable",
	style: ["normal", "italic"],
	axes: ["opsz"],
	variable: "--nb-font-voice",
});

/** Class names that declare `--nb-font-sans` and `--nb-font-voice`. */
export const notebookFontClasses = `${sans.variable} ${voice.variable}`;
