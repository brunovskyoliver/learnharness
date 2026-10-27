import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import localFont from "next/font/local";

// UI and reading text use Source Sans. Code and the registered legacy serif
// load only when used; preloading them on every route wastes startup bandwidth.
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", preload: false });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

const title = localFont({
	src: "../public/fonts/cmunbx.woff2",
	weight: "700",
	style: "normal",
	variable: "--font-cmu",
	preload: false,
	fallback: ["serif"],
});

export const fontClasses = `dark ${ui.variable} ${prose.variable} ${title.variable}`;
