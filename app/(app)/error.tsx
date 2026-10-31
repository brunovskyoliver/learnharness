"use client";

import { useEffect, useState } from "react";

/** A surface that fails to render stays inside the shell: the sidebar, the tabs'
 *  saved state and the drafts in this browser are untouched (feature 014). */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
	const [details, setDetails] = useState(false);
	useEffect(() => { console.error(error); }, [error]);
	return (
		<div role="alert" data-testid="route-error" className="mx-auto flex h-dvh w-full max-w-[52rem] flex-col items-start justify-center gap-3 px-4">
			<h1 className="font-title text-2xl font-medium leading-[1.2]">This view could not be shown.</h1>
			<p className="text-ink-2">Your drafts are kept in this browser. Try again, or pick something else from the sidebar.</p>
			<div className="flex flex-wrap gap-2">
				<button type="button" className="prompt-primary" onClick={retry}>Try again</button>
				<button type="button" className="prompt-secondary" aria-expanded={details} onClick={() => setDetails((open) => !open)}>{details ? "Hide details" : "Show details"}</button>
			</div>
			{details && <p className="font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{error.digest ?? error.message}</p>}
		</div>
	);
}
