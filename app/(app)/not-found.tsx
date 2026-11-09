import { TopBar } from "@/components/top-bar";

/** A route that calls notFound() inside the shell (an unknown session or
 *  note): one sentence on the reading edge (feature 025, contract "Empty
 *  states"), in Next's own words; the sidebar stays one click away. */
export default function NotFound() {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<TopBar />
			<div data-testid="route-not-found" className="lh-reading mx-auto flex w-full flex-col items-start gap-2 px-6 pt-24 pb-10 max-sm:px-[22px] max-sm:pt-20">
				<h1 className="text-xl font-medium tracking-title text-ink">This page could not be found.</h1>
			</div>
		</div>
	);
}
