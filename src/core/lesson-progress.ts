/**
 * How much of a lesson's plan is left (feature 003), projected for Home's
 * "Waiting for you" Continue rows. Pure and browser-safe.
 *
 * Derived at read time with the plan view's own status rule
 * (derivePlanStatusesLh + derivedNodeStatus), so Home and the plan never
 * disagree; nothing is stored (Principle II). Owner rulings 2026-10-28:
 * the current topic counts as left and is the next topic; a lesson is
 * finished once every plan topic has had at least one check.
 *
 * AN ALLOWLIST (FR-007): only counts and one plan topic title leave here.
 */
import type { PlanTree } from "./contracts/plan.ts";
import { derivePlanStatusesLh, derivedNodeStatus } from "./contracts/plan.ts";
import type { LhMessage } from "./native-messages.ts";

export interface LessonProgress {
	/** Plan topics in the current plan (≥ 1). */
	total: number;
	/** Topics not yet finished: the current one plus every upcoming one (≥ 1). */
	left: number;
	/** The current topic's title, else the first upcoming topic in plan order. */
	next: string;
}

export function lessonProgressOf(tree: PlanTree | null | undefined, messages: readonly LhMessage[]): LessonProgress | null {
	if (!tree || tree.nodes.length === 0) return null;
	const statuses = derivePlanStatusesLh(tree, messages);
	// Every topic checked at least once = finished. `visited` holds every
	// checked topic except the current one, which is checked by definition.
	const checked = (id: string) => statuses.visited.has(id) || statuses.current === id;
	if (tree.nodes.every((n) => checked(n.id))) return null;
	const unfinished = tree.nodes.filter((n) => derivedNodeStatus(statuses, n.id) !== "visited");
	const next = tree.nodes.find((n) => n.id === statuses.current) ?? unfinished[0]!;
	return { total: tree.nodes.length, left: unfinished.length, next: next.title };
}

/** The composer text Home's Continue places in an empty composer. */
export function continueDraft(progress: LessonProgress): string {
	return `Continue with ${progress.next}`;
}
