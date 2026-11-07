"use client";

/**
 * Sign out (hosted only), in the Notebook sidebar's footer: Clerk's own
 * sign-out, the one behind Study's account menu. Loaded on demand so the
 * Clerk SDK stays out of local mode.
 */
import { SignOutButton } from "@clerk/nextjs";

export default function SignOutRow({ className }: { className: string }) {
	return (
		<SignOutButton>
			<button type="button" className={className} data-testid="nb-sign-out">
				<span>Sign out</span>
			</button>
		</SignOutButton>
	);
}
