/** Clerk's widgets on the paper (feature 025, T060). Every colour is a paper
 *  token, so the sign-in card, the account menu and Clerk's modals follow the
 *  resolved theme (light, dark or the system's) with no second set: Clerk
 *  takes CSS variables in `variables` and derives its shades from them with
 *  color-mix(). Elements carry the paper's lift, radius and type. */
export const CLERK_APPEARANCE = {
	variables: {
		colorBackground: "var(--paper)",
		colorForeground: "var(--ink)",
		colorMutedForeground: "var(--faint)",
		colorMuted: "var(--shelf)",
		colorPrimary: "var(--ink)",
		colorPrimaryForeground: "var(--paper)",
		colorDanger: "var(--text-red)",
		colorSuccess: "var(--text-green)",
		colorWarning: "var(--bulb-ink)",
		colorInput: "var(--paper)",
		colorInputForeground: "var(--ink)",
		colorBorder: "var(--rule)",
		colorNeutral: "var(--ink)",
		colorRing: "var(--nb-focus)",
		colorShadow: "var(--ink)",
		colorModalBackdrop: "var(--nb-backdrop)",
		borderRadius: "8px",
		fontFamily: "var(--nb-sans)",
		fontFamilyButtons: "var(--nb-sans)",
		fontFamilyMono: "var(--nb-mono)",
	},
	elements: {
		// The lifted card (contract "Dialogs"): paper, radius 12, the lift, no border.
		cardBox: { borderRadius: "12px", boxShadow: "var(--lift)", border: "none" },
		card: { backgroundColor: "var(--paper)", color: "var(--ink)", boxShadow: "none" },
		footer: { background: "var(--paper)" },
		headerTitle: { color: "var(--ink)", fontWeight: 500, letterSpacing: "-0.032em" },
		headerSubtitle: { color: "var(--graphite)" },
		formButtonPrimary: { backgroundColor: "var(--ink)", color: "var(--paper)", borderRadius: "999px", boxShadow: "none" },
		formFieldInput: { backgroundColor: "var(--paper)", color: "var(--ink)", borderColor: "var(--rule)" },
		socialButtonsBlockButton: { borderColor: "var(--rule)", color: "var(--ink)" },
		// The account menu over the sidebar: paper with the lift, radius 12.
		userButtonPopoverCard: { backgroundColor: "var(--paper)", color: "var(--ink)", borderRadius: "12px", boxShadow: "var(--lift)" },
		userButtonPopoverMain: { backgroundColor: "var(--paper)" },
		userButtonPopoverFooter: { background: "var(--paper)" },
	},
};

/** Our own sign-in pages (app/(auth)). Without these Clerk sends every
 *  redirect and sign-out to its hosted Account Portal instead. */
export const CLERK_URLS = { signInUrl: "/sign-in", signUpUrl: "/sign-up" } as const;
