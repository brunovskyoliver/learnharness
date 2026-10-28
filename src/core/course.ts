/** Course track (feature 006): a lesson's course syllabus mapped onto its
 *  plan. The syllabus is the latest successful `course` call (like the
 *  plan is the latest plan_init) — append-only in the transcript, no record
 *  field. Coverage is derived at read time with the plan view's status
 *  rule (Principle II): an item is covered once every mapped topic still
 *  in the plan has had a check. Pure and browser-safe. */
import { Array as ArrayType, Literal as LiteralType, Object as ObjectType, Optional as OptionalType, String as StringType, Union as UnionType, type Static } from "typebox";
import type { DerivedPlanStatuses, PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh } from "./contracts/plan.ts";
import type { LhMessage } from "./native-messages.ts";

const Type = { Array: ArrayType, Literal: LiteralType, Object: ObjectType, Optional: OptionalType, String: StringType, Union: UnionType };

export const COURSE_ITEM_KINDS = ["lecture", "problem-set", "notes", "reading"] as const;
export type CourseItemKind = (typeof COURSE_ITEM_KINDS)[number];
export const COURSE_KIND_LABELS: Record<CourseItemKind, string> = { lecture: "Lecture", "problem-set": "Problem set", notes: "Notes", reading: "Reading" };

const MAX_ITEMS = 100;

export const CourseInputSchema = Type.Object({
	title: Type.String({ minLength: 1, maxLength: 120, description: "The course's name, e.g. Stanford CS229: Machine Learning (Autumn 2018)." }),
	url: Type.Optional(Type.String({ description: "The course's home or index page (http/https)." })),
	items: Type.Array(Type.Object({
		title: Type.String({ minLength: 1, maxLength: 160 }),
		kind: Type.Union([Type.Literal("lecture"), Type.Literal("problem-set"), Type.Literal("notes"), Type.Literal("reading")]),
		url: Type.Optional(Type.String({ description: "http/https link to this item, when known." })),
		topics: Type.Array(Type.String(), { description: "Plan node slugs that cover this item; empty when the plan does not cover it." }),
	}), { minItems: 1, maxItems: MAX_ITEMS, description: "Every lecture, problem set, notes or reading, in course order." }),
});

export type CourseInput = Static<typeof CourseInputSchema>;
export type CourseItem = CourseInput["items"][number];

const httpLink = (url: string) => /^https?:\/\/\S+$/i.test(url);

/** Everything wrong with a call, as short lines for the teacher. */
export function courseInputProblems(input: CourseInput, tree: PlanTree | null | undefined): string[] {
	if (!tree || tree.nodes.length === 0) return ["There is no plan yet: write it with plan_init first, then map the course onto it."];
	const problems: string[] = [];
	if (input.items.length === 0) problems.push("items: at least one item");
	if (input.items.length > MAX_ITEMS) problems.push(`items: at most ${MAX_ITEMS}`);
	if (input.url !== undefined && !httpLink(input.url)) problems.push("url: must be an http(s) link");
	const ids = new Set(tree.nodes.map((n) => n.id));
	input.items.forEach((item, i) => {
		if (item.url !== undefined && !httpLink(item.url)) problems.push(`items[${i}].url: must be an http(s) link`);
		for (const topic of item.topics) if (!ids.has(topic)) problems.push(`items[${i}].topics: "${topic}" is not a node of the current plan`);
	});
	return problems;
}

/** The course recorded by a successful call: the `course` tool's details. */
export interface CourseDetails {
	ok: true;
	course: CourseInput;
}

const courseOf = (details: unknown): CourseInput | null => {
	const d = details as Partial<CourseDetails> | null | undefined;
	return d?.ok === true && d.course && Array.isArray(d.course.items) ? d.course : null;
};

/** The current syllabus from the native record: the latest successful call. */
export function latestCourseLh(messages: readonly LhMessage[]): CourseInput | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]!;
		if (m.role !== "toolResult" || m.toolName !== "course" || m.isError) continue;
		const course = courseOf((m as { details?: unknown }).details);
		if (course) return course;
	}
	return null;
}

/** The same from view messages (the plan popup): the latest settled part. */
export function latestCourseView(messages: readonly { parts?: readonly { type: string; state?: string; output?: unknown }[] }[]): CourseInput | null {
	for (let m = messages.length - 1; m >= 0; m--) {
		const parts = messages[m]?.parts ?? [];
		for (let p = parts.length - 1; p >= 0; p--) {
			const part = parts[p]!;
			if (part.type !== "tool-course" || part.state !== "output-available") continue;
			const course = courseOf(part.output);
			if (course) return course;
		}
	}
	return null;
}

export type ItemCoverage = "covered" | "not-covered" | "not-in-plan";

/** Coverage per item, in course order. A topic counts as checked when the
 *  plan view shows it visited or current; topics no longer in the plan
 *  stop counting. */
export function courseCoverage(course: CourseInput, tree: PlanTree, statuses: DerivedPlanStatuses): ItemCoverage[] {
	const ids = new Set(tree.nodes.map((n) => n.id));
	const checked = (id: string) => statuses.visited.has(id) || statuses.current === id;
	return course.items.map((item) => {
		const mapped = item.topics.filter((t) => ids.has(t));
		if (mapped.length === 0) return "not-in-plan";
		return mapped.every(checked) ? "covered" : "not-covered";
	});
}

/** Home's counts from the native record, or null without a syllabus. */
export function courseCountsOf(tree: PlanTree | null | undefined, messages: readonly LhMessage[]): { covered: number; items: number } | null {
	const course = latestCourseLh(messages);
	if (!course || !tree) return null;
	const coverage = courseCoverage(course, tree, derivePlanStatusesLh(tree, messages));
	return { covered: coverage.filter((c) => c === "covered").length, items: course.items.length };
}
