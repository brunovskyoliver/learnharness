import type { Metadata } from "next";
import "../globals.css";
import { fontClasses } from "../fonts";
import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_APPEARANCE, CLERK_URLS } from "@/components/clerk-appearance";
import { hostedMode } from "@/src/server";

export const metadata: Metadata = { title: "Sign in · Learning Harness" };

// The sign-in pages get their own root layout: Clerk soft-navigates after
// sign-in and sign-out, and Next turns a jump between root layouts into a
// full page load, so the app shell (and its providers) is never swapped in
// or out under a cached layout.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={fontClasses}>
			<body className="min-h-dvh antialiased">
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
