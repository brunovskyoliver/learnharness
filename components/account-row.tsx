"use client";

import { UserButton } from "@clerk/nextjs";

/** Hosted mode only: the signed-in account (avatar menu with Manage
 *  account and Sign out), bottom-pinned under the Settings row. */
export function AccountRow() {
	return (
		<div className="px-3 pb-3" data-testid="account-row">
			<UserButton showName appearance={{ elements: { userButtonBox: "flex-row-reverse gap-1.5", userButtonOuterIdentifier: "text-xs text-muted-foreground", avatarBox: "size-5" } }} />
		</div>
	);
}
