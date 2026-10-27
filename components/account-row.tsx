"use client";

import dynamic from "next/dynamic";

const UserButton = dynamic(() => import("@clerk/nextjs").then((module) => module.UserButton));

/** Hosted mode only: the signed-in account's avatar menu (Manage account,
 *  Sign out), at the right end of the sidebar footer. */
export function AccountRow() {
	return (
		<div className="flex items-center pr-1" data-testid="account-row">
			<UserButton appearance={{ elements: { avatarBox: "size-6" } }} />
		</div>
	);
}
