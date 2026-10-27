import { JetBrains_Mono, Newsreader, Source_Sans_3 } from "next/font/google";

// UI and reading text use Source Sans. Code and the title serif load only
// when used; preloading them on every route wastes startup bandwidth.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", preload: false });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });
const title = Newsreader({
	subsets: ["latin"],
	weight: ["500", "600"],
	variable: "--font-newsreader",
	display: "swap",
	preload: false,
	fallback: ["Georgia", "serif"],
});

export const fontClasses = `dark ${mono.variable} ${prose.variable} ${title.variable}`;
