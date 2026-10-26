import type { ChatStore } from "../core/ports.ts";
import { newFollowupContext, type FollowupInput, type FollowupResult } from "../core/followup-session.ts";
import type { ChatRecord, FollowupStartup } from "../core/contracts/chat.ts";
import { newGraphContextMessage } from "../core/native-messages.ts";

export interface FollowupSessionContext {
	chatId: string;
	chatStore: ChatStore;
	/** The ordinary turn runner, called inside the source request's tenant. */
	startTurn: (chatId: string) => Promise<Response>;
}

function result(record: ChatRecord, reused: boolean): FollowupResult {
	return {
		id: record.id,
		title: record.title,
		url: `/chat/${encodeURIComponent(record.id)}`,
		reused,
		startup: record.followup!.startup,
	};
}

/** Seed before publishing the session; replaying a tool call never starts a second turn. */
export async function startFollowupSession(
	ctx: FollowupSessionContext,
	toolCallId: string,
	input: FollowupInput,
): Promise<FollowupResult> {
	if (!toolCallId.trim()) throw new Error("A tool call id is required.");
	if (!["teach", "practice"].includes(input.kind)) throw new Error("Choose teach or practice.");
	for (const [name, limit] of [["title", 200], ["goal", 10_000], ["context", 30_000]] as const) {
		if (!input[name]?.trim() || input[name].length > limit) throw new Error(`${name} must contain 1–${limit} characters.`);
	}
	const source = ctx.chatStore.getChat(ctx.chatId);
	if (!source) throw new Error("Source session not found.");
	const existing = ctx.chatStore.listChats().find((chat) =>
		chat.followup?.sourceChatId === ctx.chatId && chat.followup.toolCallId === toolCallId,
	);
	if (existing) {
		const record = ctx.chatStore.getChat(existing.id);
		if (!record) throw new Error("The previously created follow-up is unavailable.");
		return result(record, true);
	}
	const child = ctx.chatStore.createChat(input.title, input.kind === "practice" ? "practice" : undefined, {
		messages: [newFollowupContext(source, input), ...(input.graphContext ? [newGraphContextMessage(input.graphContext.propositions, input.graphContext.chains)] : [])],
		settings: source.settings,
		followup: { sourceChatId: source.id, toolCallId, startup: { state: "starting" } },
	});
	let startup: FollowupStartup;
	try {
		const response = await ctx.startTurn(child.id);
		if (response.ok) {
			startup = { state: "started" };
		} else {
			const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
			const reason = typeof body?.error === "string" ? body.error : typeof body?.message === "string" ? body.message : `Turn runner refused startup (HTTP ${response.status}).`;
			startup = { state: "failed", error: reason };
		}
	} catch {
		startup = { state: "failed", error: "The opening turn could not be started. Open the follow-up session to retry." };
	}
	ctx.chatStore.saveFollowupStartup(child.id, startup);
	return { ...result(child, false), startup };
}
