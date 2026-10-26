import { getChat, sessionCost, sessionCoverage, withTenant } from "@/src/server";

/** Usage refreshes never retransmit the transcript. */
export const GET = withTenant(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
	const { id } = await params;
	const chat = getChat(id);
	if (!chat) return Response.json({ error: "Not found" }, { status: 404 });
	return Response.json({ turns: chat.turns ?? [], pricing: sessionCost(chat), settings: chat.settings, coverage: sessionCoverage(id) });
});
