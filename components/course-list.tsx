"use client";

import { useId, useMemo } from "react";
import { COURSE_KIND_LABELS, courseCoverage, derivePlanStatuses, latestCourseView, type ItemCoverage } from "@/src/core";
import { latestTree, type PopupMessage } from "@/components/plan-tree";

const STATE_TEXT: Record<ItemCoverage, string> = {
	covered: "Covered",
	"not-covered": "Not yet",
	"not-in-plan": "Not in this lesson's plan",
};

/** True when the transcript holds a recorded course syllabus. */
export function courseExists(messages: readonly PopupMessage[]): boolean {
	return latestCourseView(messages) !== null;
}

/** The plan popup's "Course" section (feature 006): the latest recorded
 *  syllabus in course order, each item's mapped plan topics and whether
 *  it is covered — derived from the plan and the checks, never stored.
 *  Links open in a new tab; the app never fetches them. */
export function CourseList({ messages }: { messages: readonly PopupMessage[] }) {
	const headingId = useId();
	const course = useMemo(() => latestCourseView(messages), [messages]);
	const tree = useMemo(() => latestTree(messages), [messages]);
	const coverage = useMemo(() => {
		if (!course || !tree) return null;
		return courseCoverage(course, tree, derivePlanStatuses(tree, messages as Parameters<typeof derivePlanStatuses>[1]));
	}, [course, tree, messages]);
	if (!course || !tree || !coverage) return null;
	const titleOf = new Map(tree.nodes.map((n) => [n.id, n.title]));
	const covered = coverage.filter((c) => c === "covered").length;
	return (
		<section aria-labelledby={headingId} data-testid="course-list" className="flex flex-col gap-2 pt-4">
			<div className="flex flex-wrap items-baseline gap-2">
				<h2 id={headingId} className="text-sm font-medium">Course</h2>
				<span className="text-sm text-muted-foreground">
					{course.url ? <ExternalLink href={course.url}>{course.title}</ExternalLink> : course.title} · {covered} of {course.items.length} covered
				</span>
			</div>
			<ol className="flex flex-col gap-1">
				{course.items.map((item, i) => {
					const topics = item.topics.map((t) => titleOf.get(t)).filter((t): t is string => t !== undefined);
					return (
						<li key={i} data-testid="course-item" data-state={coverage[i]} className="flex flex-col gap-0.5 rounded-[10px] bg-card px-3 py-2 sm:flex-row sm:items-baseline sm:gap-3">
							<span className="text-sm font-medium text-muted-foreground sm:w-24 sm:shrink-0">{COURSE_KIND_LABELS[item.kind]}</span>
							<span className="min-w-0 flex-1">
								<span className="block text-base text-foreground">{item.url ? <ExternalLink href={item.url}>{item.title}</ExternalLink> : item.title}</span>
								{topics.length > 0 && <span className="block text-sm text-muted-foreground">Topics: {topics.join(", ")}</span>}
							</span>
							<span className={coverage[i] === "covered" ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>{STATE_TEXT[coverage[i]!]}</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className="underline decoration-muted-foreground/60 underline-offset-2 hover:decoration-foreground">
			{children}
		</a>
	);
}
