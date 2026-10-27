"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { CLERK_APPEARANCE, CLERK_URLS } from "@/components/clerk-appearance";

/** The same Clerk client provider, with the public key supplied by the server. */
export function HostedClientProvider({ children, publishableKey }: { children: React.ReactNode; publishableKey?: string }) {
	return <ClerkProvider publishableKey={publishableKey} appearance={CLERK_APPEARANCE} {...CLERK_URLS}>{children}</ClerkProvider>;
}
