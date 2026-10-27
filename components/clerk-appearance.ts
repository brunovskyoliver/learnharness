/** Clerk widgets in the app's dark palette (globals.css :root). Clerk
 *  derives shade scales from these, so they are literal colors, not vars. */
export const CLERK_APPEARANCE = {
	variables: {
		colorBackground: "#1c1c1c",
		colorForeground: "#e6e6e6",
		colorMutedForeground: "#a1a1a1",
		colorMuted: "#1c1c1c",
		colorPrimary: "#e6e6e6",
		colorPrimaryForeground: "#141414",
		colorInput: "#141414",
		colorInputForeground: "#e6e6e6",
		colorBorder: "#434343",
		colorNeutral: "#e6e6e6",
		colorRing: "#a1a1a1",
		borderRadius: "8px",
		fontFamily: "var(--font-ui)",
	},
	// Elements use the live app roles; literal variables above seed Clerk
	// shade generation before client appearance preferences are applied.
	elements: {
		card: { backgroundColor: "var(--card)", color: "var(--foreground)", borderColor: "var(--border)" },
		formFieldInput: { backgroundColor: "var(--background)", color: "var(--foreground)", borderColor: "var(--input)" },
	},
};

/** Our own sign-in pages (app/(auth)). Without these Clerk sends every
 *  redirect and sign-out to its hosted Account Portal instead. */
export const CLERK_URLS = { signInUrl: "/sign-in", signUpUrl: "/sign-up" } as const;
