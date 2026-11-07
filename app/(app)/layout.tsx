import type { Metadata } from "next";
import { Suspense } from "react";
import "katex/dist/katex.min.css";
import "../globals.css";
import "../paper.css";
import { fontClasses } from "../fonts";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { PagePaneProvider } from "@/components/library/page-pane-context";
import { ServerEventsProvider } from "@/components/server-events";
import { PaperAppearanceProvider } from "@/components/paper/appearance";
import UpdateBanner from "@/components/update-banner";
import { SessionAccountProvider } from "@/components/session-state";
import { SessionStateStore, WORKSPACE_STATE_ID } from "@/components/session-state-store";
import { compactionInFlight, hostedMode, isTurnRunning, listChats, readSettingsRecord, runAsTenant, signedInUserId } from "@/src/server";
import { DEFAULT_SHARED_APPEARANCE, resolveSharedAppearance, sharedAppearanceAttributes, type SharedAppearance } from "@/src/core";

/** The signed-in reader's shared Appearance (feature 025, R2), read from the
 * stored record (not the factory merge) so the first response is already in
 * the right theme. */
function readAppearance(account: string | null, hosted: boolean): { loaded: boolean; appearance: SharedAppearance } {
	try {
		if (hosted && !account) return { loaded: false, appearance: DEFAULT_SHARED_APPEARANCE };
		const read = () => resolveSharedAppearance(readSettingsRecord());
		return { loaded: true, appearance: hosted ? runAsTenant(account!, read) : read() };
	} catch {
		return { loaded: false, appearance: DEFAULT_SHARED_APPEARANCE };
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
	const app = (
		/* The notification channel rides OUTSIDE everything: sidebar, dock,
		   and pages all subscribe as the polls retire (push S3, 2026-10-02). */
		<SessionAccountProvider account={account}><ServerEventsProvider>
			<PaperAppearanceProvider initial={appearance} loaded={loaded}>
				<SidebarProvider>
					<ActivityProvider>
						<PagePaneProvider><AppShell initialChats={initialChats} hosted={hosted} account={hostedShell ? <hostedShell.AccountRow /> : undefined}><Suspense>{children}</Suspense></AppShell></PagePaneProvider>
					</ActivityProvider>
				</SidebarProvider>
			</PaperAppearanceProvider>
		</ServerEventsProvider></SessionAccountProvider>
	);
	return (
		<html lang="en" className={`lh-paper ${fontClasses}`} {...sharedAppearanceAttributes(appearance)}>
			<body className="min-h-dvh antialiased">
				{/* The paper's grain behind every page (app/paper.css). */}
				<div className="nb-paper lh-body-paper" aria-hidden="true" />
				{/* Reserve the tab strip on surfaces that show it only with tabs, so a reload doesn't shift them (feature 014). */}
				{account && <script dangerouslySetInnerHTML={{ __html: `try{var t=JSON.parse(localStorage.getItem(${JSON.stringify(new SessionStateStore(account, WORKSPACE_STATE_ID, () => undefined).storageKey).replace(/</g, "\\u003c")})||'{}').values;if(t&&t.tabs&&t.tabs.length){var b=document.createElement('style');b.id='lh-tabs-bootstrap';b.textContent='[data-tab-reserve]{display:block!important}';document.head.appendChild(b)}}catch{}` }} />}
				{hostedShell ? <hostedShell.HostedProvider publishableKey={process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>{app}</hostedShell.HostedProvider> : app}
				{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
				<UpdateBanner />
			</body>
		</html>
	);
}
