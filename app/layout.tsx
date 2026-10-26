import type { Metadata } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_APPEARANCE } from "@/components/clerk-appearance";
import { AccountRow } from "@/components/account-row";
import { hostedMode, signedInUserId } from "@/src/server";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// Hosted mode: signed-out visitors only ever reach the sign-in pages
	// (proxy.ts redirects everything else), and they get no app shell.
	const hosted = hostedMode();
	const signedIn = !hosted || (await signedInUserId()) !== null;
	const app = signedIn ? (
		/* The notification channel rides OUTSIDE everything: sidebar, dock,
		   and pages all subscribe as the polls retire (push S3, 2026-10-02). */
		<ServerEventsProvider>
			<AppearanceProvider>
				<SidebarProvider>
					<ActivityProvider>
						<AppShell hosted={hosted} account={hosted ? <AccountRow /> : undefined}>{children}</AppShell>
					</ActivityProvider>
				</SidebarProvider>
			</AppearanceProvider>
		</ServerEventsProvider>
	) : children;
	return (
		<html lang="en" className={`dark ${ui.variable} ${prose.variable}`}>
			<body className="min-h-dvh antialiased">
				{hosted ? (
					<ClerkProvider
						publishableKey={process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
						appearance={CLERK_APPEARANCE}
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
