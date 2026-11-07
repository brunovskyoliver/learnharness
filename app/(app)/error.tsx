"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/top-bar";

/** A surface that fails to render stays inside the shell: the sidebar, the tabs'
 *  saved state and the drafts in this browser are untouched (feature 014).
 *  Feature 025: an error state on the reading edge (contract "Errors"): the
 *  sentence in ink, Try again and Show details as text buttons. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	const [details, setDetails] = useState(false);
	useEffect(() => { console.error(error); }, [error]);
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TopBar />
			<div role="alert" data-testid="route-error" className="lh-reading mx-auto flex w-full flex-col items-start gap-2 px-6 pt-24 pb-10 max-sm:px-[22px] max-sm:pt-20">
				<h1 className="text-xl font-medium tracking-title text-ink">This view could not be shown.</h1>
				<p className="text-md text-graphite">Your drafts are kept in this browser. Try again, or pick something else from the sidebar.</p>
				<div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
					<button type="button" className="lh-text-action" onClick={retry}>Try again</button>
					<button type="button" className="lh-text-action" aria-expanded={details} onClick={() => setDetails((open) => !open)}>{details ? "Hide details" : "Show details"}</button>
				</div>
				{details && <p className="lh-state-detail">{error.digest ?? error.message}</p>}
			</div>
		</div>
	);
}
