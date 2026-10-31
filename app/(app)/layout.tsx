import type { Metadata } from "next";
import { Suspense } from "react";
import "katex/dist/katex.min.css";
import "../globals.css";
import { fontClasses } from "../fonts";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { PagePaneProvider } from "@/components/library/page-pane-context";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { SessionAccountProvider } from "@/components/session-state";
import { appearanceVars, resolveAppearance } from "@/components/settings/appearance-vars";
import { compactionInFlight, hostedMode, isTurnRunning, listChats, readSettingsRecord, runAsTenant, signedInUserId } from "@/src/server";
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
	const hostedShell = hosted ? await import("@/components/hosted-shell") : null;
	const account = hosted ? await signedInUserId() : "local";
	const { loaded, appearance } = readAppearance(account, hosted);
	const readSidebar = () => listChats().map((chat) => ({ ...chat, busy: isTurnRunning(chat.id), compacting: compactionInFlight(chat.id) }));
	// Use the same tenant boundary as page and API reads. A failed seed leaves
	// the sidebar's ordinary retry path available without blocking the shell.
	let initialChats;
	try { initialChats = hosted ? account ? runAsTenant(account, readSidebar) : undefined : readSidebar(); } catch { /* client retries */ }
	const htmlStyle = loaded ? (appearanceVars(resolveAppearance(appearance)) as React.CSSProperties) : undefined;
	const app = (
		/* The notification channel rides OUTSIDE everything: sidebar, dock,
		   and pages all subscribe as the polls retire (push S3, 2026-10-02). */
		<SessionAccountProvider account={account}><ServerEventsProvider>
			<AppearanceProvider initialAppearance={appearance} initialLoaded={loaded}>
				<SidebarProvider>
					<ActivityProvider>
						<PagePaneProvider><AppShell initialChats={initialChats} hosted={hosted} account={hostedShell ? <hostedShell.AccountRow /> : undefined}><Suspense>{children}</Suspense></AppShell></PagePaneProvider>
					</ActivityProvider>
				</SidebarProvider>
			</AppearanceProvider>
		</ServerEventsProvider></SessionAccountProvider>
	);
	return (
		<html lang="en" className={fontClasses} style={htmlStyle}>
			<body className="min-h-dvh antialiased">
				{/* Apply local navigation preferences before the seeded pane paints. */}
				<script dangerouslySetInnerHTML={{ __html: `try{var s=localStorage.getItem('lh:sidebar-open'),w=Number(localStorage.getItem('lh:sidebar-width'));var css=s==='0'?'width:0!important;visibility:hidden':Number.isFinite(w)&&w>0?'width:'+Math.round(Math.max(208,Math.min(w,innerWidth-640)))+'px!important':'';if(css){var e=document.createElement('style');e.textContent='@media(min-width:928px){[data-sidebar-bootstrap]{'+css+'}}';document.head.appendChild(e)}}catch{}` }} />
				{hostedShell ? <hostedShell.HostedProvider publishableKey={process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>{app}</hostedShell.HostedProvider> : app}
				{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
				<UpdateBanner />
			</body>
		</html>
	);
}
