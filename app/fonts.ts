import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN). Shared by
// both root layouts.
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const fontClasses = `dark ${ui.variable} ${prose.variable}`;
