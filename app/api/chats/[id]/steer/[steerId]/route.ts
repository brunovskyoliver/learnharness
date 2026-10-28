// DELETE /api/chats/[id]/steer/[steerId] — withdraw one queued message
// before the agent receives it (feature 002, contracts/steer-cancel.md).
// The learner pressed × on a queued row: no confirmation, no undo; the text
// is discarded. Only an undelivered steer can go — a delivered one answers
// an honest 409 and its card lands in the transcript as usual.
import { cancelUserSteer, getChat, withTenant } from "@/src/server";

async function handleDELETE(_request: Request, ctx: { params: Promise<{ id: string; steerId: string }> }): Promise<Response> {
	const { id, steerId } = await ctx.params;
	if (!getChat(id)) return Response.json({ error: "unknown chat" }, { status: 404 });
	switch (cancelUserSteer(id, steerId)) {
		case "cancelled":
			return Response.json({ ok: true });
		case "delivered":
			return Response.json({ error: "already delivered" }, { status: 409 });
		case "unsupported":
			return Response.json({ error: "cannot withdraw" }, { status: 409 });
		case "unknown":
			return Response.json({ error: "unknown steer" }, { status: 404 });
	}
}

export const DELETE = withTenant(handleDELETE);
