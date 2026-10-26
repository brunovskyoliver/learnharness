import type { ChatKind, ChatRecord, FollowupStartup } from "./contracts/chat.ts";
import { newMessageId, type GraphContextPick, type LhMarkerMessage } from "./native-messages.ts";

export interface FollowupInput {
	title: string;
	kind: ChatKind;
	goal: string;
	context: string;
	graphContext?: { propositions: GraphContextPick[]; chains: string[] };
}

export interface FollowupResult {
	id: string;
	title: string;
	url: string;
	reused: boolean;
	startup: FollowupStartup;
}

/** Context is attributed to the previous teacher, never stored as a learner answer. */
export function newFollowupContext(source: ChatRecord, input: FollowupInput): LhMarkerMessage {
	const sourceUrl = `/chat/${encodeURIComponent(source.id)}`;
	return {
		id: newMessageId(),
		role: "custom",
		customType: "followup-context",
		display: true,
		timestamp: Date.now(),
		details: { sourceChatId: source.id, sourceTitle: source.title, ...input },
		content: [
			"[Follow-up session context prepared by the previous teacher]",
			`Source: [Previous lesson](${sourceUrl})`,
			`Requested goal:\n${input.goal}`,
			`Source lesson summary (reported context, not new learner answers):\n${input.context}`,
			`Begin this ${input.kind === "practice" ? "practice" : "teaching"} session for the requested goal. Use the summary as prior evidence, not proof of mastery.`,
		].join("\n\n"),
	};
}
