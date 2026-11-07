import type { Metadata } from "next";
import "../globals.css";
import "../paper.css";
import { fontClasses } from "../fonts";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_APPEARANCE, CLERK_URLS } from "@/components/clerk-appearance";
import { hostedMode } from "@/src/server";
import { DEFAULT_SHARED_APPEARANCE, sharedAppearanceAttributes } from "@/src/core";

export const metadata: Metadata = { title: "Sign in · Brunovský's study" };

// The sign-in pages get their own root layout: Clerk soft-navigates after
// sign-in and sign-out, and Next turns a jump between root layouts into a
// full page load, so the app shell (and its providers) is never swapped in
// or out under a cached layout.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return (
		// Signed out there is no stored Appearance: the paper follows the OS.
		<html lang="en" className={`lh-paper ${fontClasses}`} {...sharedAppearanceAttributes(DEFAULT_SHARED_APPEARANCE)}>
			<body className="min-h-dvh antialiased">
				<div className="nb-paper lh-body-paper" aria-hidden="true" />
				{/* Outside hosted mode the pages 404; no keys, so no Clerk. */}
				{hostedMode() ? (
					<ClerkProvider
						publishableKey={process.env.CLERK_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
						appearance={CLERK_APPEARANCE}
						{...CLERK_URLS}
					>
						{children}
					</ClerkProvider>
				) : children}
			</body>
		</html>
	);
}
