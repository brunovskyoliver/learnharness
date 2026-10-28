import type { AgentTool } from "@earendil-works/pi-agent-core";
import { CourseInputSchema, courseInputProblems, type CourseDetails, type CourseInput } from "../../core/index.ts";
import type { ChatStore } from "../../core/ports.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";

/**
 * Course track (feature 006): the teacher records the course syllabus the
 * learner is following, mapped onto the plan. The call's result details
 * ARE the record — the latest successful call is the syllabus (core/
 * course.ts), as the latest plan_init is the plan.
 */

/** Owner-approved wording, 2026-10-28. */
const COURSE_DESCRIPTION =
	"Record the syllabus of the course the learner is following, mapped onto your plan: the course title and link, then every " +
	"lecture, problem set, notes or reading in course order, each with its link when known and the plan topics (node slugs from " +
	"`plan_init`) that cover it. Give items the plan does not cover an empty `topics` list. A new call replaces the whole " +
	"syllabus. Call it after `plan_init`, once you know the course's materials (research them if you need to); never invent links.";

export interface CourseToolContext {
	chatId: string;
	chatStore: Pick<ChatStore, "getChat">;
}

export function courseTool(ctx: CourseToolContext): AgentTool<typeof CourseInputSchema> {
	const record = serverExecute("course", CourseInputSchema, (input: CourseInput) => {
		const details: CourseDetails = { ok: true, course: input };
		return { text: `Course recorded: ${input.items.length} item${input.items.length === 1 ? "" : "s"}.`, details };
	});
	return {
		name: "course",
		label: "course",
		description: COURSE_DESCRIPTION,
		parameters: CourseInputSchema,
		execute: async (toolCallId, input, signal) => {
			const problems = courseInputProblems(input, ctx.chatStore.getChat(ctx.chatId)?.tree);
			if (problems.length > 0) return invalidInputResult("course", problems);
			return record(toolCallId, input, signal);
		},
	};
}
