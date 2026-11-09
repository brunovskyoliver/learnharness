import { redirect } from "next/navigation";
import { Home } from "@/components/home";
import { RouteExit } from "@/components/paper/route-content";
import { graphView, readSettingsRecord, withTenantPage, studySlotsConfigured } from "@/src/server";
import { resolveSettings, type GraphSnapshot } from "@/src/core";

// Dynamic: the configured state is server-rendered into the page (the
// setup CTA's truth on the first frame), and every navigation re-reads
// the record (dynamic routes aren't cached client-side).
export const dynamic = "force-dynamic";

async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
	// First-run gate (model-slots wave): chats cannot start until the user
	// has picked all three slots — the dock shows the CTA while the raw
	// record's models section lacks any slot pin.
	const record = readSettingsRecord();
	// Feature 024: a plain visit to / opens the mode the learner left in.
	// Study's own links to Home carry no query either, but Study only runs
	// with interface "study", so they never bounce.
	const resolved = resolveSettings(record ?? null);
	if (resolved.general.interface === "notebook" && Object.keys(await searchParams).length === 0) redirect("/notebook");
	// GRAPH RENDERING (owner, 2026-10-06): off = the home's main view is
	// the chains view. Resolved through the one core resolver (missing
	// section / absent key → factory default on); re-read per navigation.
	const rendering = resolved.graph.rendering;
	let initialGraph: GraphSnapshot | undefined;
	// This page already runs inside withTenantPage. Seed the same pure read
	// as /api/graph, removing the hydration-to-fetch waterfall. Failed reads
	// retain the ordinary client retry path.
	if (rendering) {
		try { initialGraph = graphView(); } catch { /* client retries */ }
	}
	return (
		<RouteExit><Home initialConfigured={studySlotsConfigured(record?.models)} rendering={rendering} initialGraph={initialGraph} /></RouteExit>
	);
}

export default withTenantPage(HomePage);
