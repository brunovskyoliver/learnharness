import { Type } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { FollowupInput, FollowupResult } from "../../core/followup-session.ts";
import { serverExecute } from "../tool-execute.ts";

export type StartFollowup = (toolCallId: string, input: FollowupInput) => Promise<FollowupResult>;

export function followupResult(created: FollowupResult) {
	const status = created.startup.state === "started"
		? "Opening generation has started; it may still be running."
		: created.startup.state === "failed"
			? `The session was created, but opening generation failed: ${created.startup.error}`
			: "The session was created; opening startup has not been confirmed.";
	return { text: `${created.reused ? "Existing" : "Created"} follow-up: ${created.url}\n${status}\nGive the learner a Markdown link to this session and report this startup status.`, details: created };
}

const inputSchema = Type.Object({
	title: Type.String({ minLength: 1, maxLength: 200, description: "Short title for the new session." }),
	kind: Type.Union([Type.Literal("teach"), Type.Literal("practice")], { description: "teach for a next lesson; practice for application or retrieval of covered material." }),
	goal: Type.String({ minLength: 1, maxLength: 10_000, description: "The learner-requested follow-up goal and exercise constraints." }),
	context: Type.String({ minLength: 1, maxLength: 30_000, description: "Teacher-written source summary: goals, covered ideas, observed learner answers, unresolved gaps, and relevant references. Distinguish learner evidence from teacher explanations." }),
});

export function followupTool(start: StartFollowup): AgentTool<any> {
	return {
		name: "start_followup_session",
		label: "start_followup_session",
		description: "Create a linked follow-up to this lesson and immediately start its opening turn. Returns the session link and startup status. The new session receives only your goal and context summary, with source attribution, and inherits this session's model settings. Repeating the same tool call reuses its session.",
		parameters: inputSchema,
		executionMode: "sequential",
		execute: serverExecute("start_followup_session", inputSchema, async (input, { toolCallId }) => {
			return followupResult(await start(toolCallId, input));
		}),
	};
}
