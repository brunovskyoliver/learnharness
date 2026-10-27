import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "../globals.css";
import { fontClasses } from "../fonts";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_APPEARANCE, CLERK_URLS } from "@/components/clerk-appearance";
import { AccountRow } from "@/components/account-row";
import { SessionAccountProvider } from "@/components/session-state";
import { appearanceVars, resolveAppearance } from "@/components/settings/appearance-vars";
import { hostedMode, readSettingsRecord, runAsTenant, signedInUserId } from "@/src/server";
import type { AppearanceSettings } from "@/src/core";

/** The signed-in reader's appearance, read here so the first response is
 * already styled (the client used to restyle after a settings fetch). */
function readAppearance(account: string | null, hosted: boolean): { loaded: boolean; appearance?: AppearanceSettings } {
	try {
		if (hosted && !account) return { loaded: false };
		const read = () => readSettingsRecord()?.appearance;
		return { loaded: true, appearance: hosted ? runAsTenant(account!, read) : read() };
	} catch {
		return { loaded: false };
	}
}

export const metadata: Metadata = {
	title: "Brunovský's study",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// Hosted mode: signed-out visitors never get here (proxy.ts redirects
	// them to the (auth) group, which has its own root layout so crossing
	// between the two is a full page load, never a soft swap of shells).
	const hosted = hostedMode();
	const account = hosted ? await signedInUserId() : "local";
	const { loaded, appearance } = readAppearance(account, hosted);
	const htmlStyle = loaded ? (appearanceVars(resolveAppearance(appearance)) as React.CSSProperties) : undefined;
	const app = (
		/* The notification channel rides OUTSIDE everything: sidebar, dock,
		   and pages all subscribe as the polls retire (push S3, 2026-10-02). */
		<SessionAccountProvider account={account}><ServerEventsProvider>
			<AppearanceProvider initialAppearance={appearance} initialLoaded={loaded}>
				<SidebarProvider>
					<ActivityProvider>
						<AppShell hosted={hosted} account={hosted ? <AccountRow /> : undefined}>{children}</AppShell>
					</ActivityProvider>
				</SidebarProvider>
			</AppearanceProvider>
		</ServerEventsProvider></SessionAccountProvider>
	);
	return (
		<html lang="en" className={fontClasses} style={htmlStyle}>
			<body className="min-h-dvh antialiased">
				{hosted ? (
					<ClerkProvider
						publishableKey={process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
						appearance={CLERK_APPEARANCE}
						{...CLERK_URLS}
					>
						{app}
					</ClerkProvider>
				) : app}
				{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
				<UpdateBanner />
			</body>
		</html>
	);
}
