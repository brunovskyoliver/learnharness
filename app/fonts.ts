import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import localFont from "next/font/local";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (bundled, no CDN). Shared by both root layouts. CMU goes through
// next/font/local (polish pass 2026-10-26): a preloaded latin woff2 subset
// (~37 KB, was a 217 KB TTF) with a size-adjusted fallback, so titles no
// longer flash and reflow. Rebuild: pyftsubset cmunbx.ttf (fontTools,
// --flavor=woff2, Latin + Latin Extended + punctuation) from the upstream TTF.
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

const title = localFont({
	src: "../public/fonts/cmunbx.woff2",
	weight: "700",
	style: "normal",
	variable: "--font-cmu",
	fallback: ["serif"],
});

export const fontClasses = `dark ${ui.variable} ${prose.variable} ${title.variable}`;
