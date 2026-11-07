"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef } from "react";

/** The account menu, rendered into the sidebar dialog it sits in (feature 025):
 *  the sidebar is a modal Radix dialog, so a popover portalled to <body> would
 *  sit under its dim and lose pointer and focus to the dialog's trap. */
const AccountMenu = dynamic(() => import("@clerk/nextjs").then(({ UNSAFE_PortalProvider, UserButton }) => {
	function AccountMenu({ getContainer }: { getContainer: () => HTMLElement | null }) {
		return (
			<UNSAFE_PortalProvider getContainer={getContainer}>
				<UserButton appearance={{ elements: { avatarBox: "size-6" } }} />
			</UNSAFE_PortalProvider>
		);
	}
	return AccountMenu;
}));

/** Hosted mode only: the signed-in account's avatar menu (Manage account,
 *  Sign out), at the right end of the sidebar footer. */
export function AccountRow() {
	const row = useRef<HTMLDivElement>(null);
	const getContainer = useCallback(() => row.current?.closest<HTMLElement>('[role="dialog"]') ?? null, []);
	return (
		<div ref={row} className="flex items-center pr-1" data-testid="account-row">
			<AccountMenu getContainer={getContainer} />
		</div>
	);
}
