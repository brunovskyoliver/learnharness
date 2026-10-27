"use client";

import { createContext, useContext } from "react";
import { demoPrefersInvert, type DemoResult, type LhViewMessage, type SubagentArtifactData } from "@/src/core";

/** A delivered demo in this session: the steer message that carries it. */
export interface SessionDemo {
	/** The steer message id (the invert switch persists on it). */
	id: string;
	title: string;
	html: string;
	inverted: boolean;
}

/** Every delivered, non-failed demo in transcript order. A re-built demo with
 *  the same title is a new entry; title lookups take the latest. Pure. */
export function sessionDemos(messages: readonly LhViewMessage[]): SessionDemo[] {
	const demos: SessionDemo[] = [];
	for (const m of messages) {
		if (m.role !== "user") continue;
		const part = m.parts.find((p) => p.type === "data-subagent-artifact") as { data?: SubagentArtifactData } | undefined;
		const data = part?.data;
		if (data?.kind !== "demo") continue;
		const result = data.result as DemoResult;
		if (typeof result?.html !== "string" || result.html.length === 0 || typeof result.title !== "string") continue;
		demos.push({
			id: m.id,
			title: result.title,
			html: result.html,
			inverted: data.ui?.inverted ?? demoPrefersInvert(result.html),
		});
	}
	return demos;
}

/** Title match for teacher mentions: case, quotes and spacing ignored. */
export function normalizeDemoTitle(text: string): string {
	return text.toLowerCase().replace(/[“”"'‘’]/g, "").replace(/\s+/g, " ").trim();
}

export function findDemoByTitle(demos: readonly SessionDemo[], text: string): SessionDemo | undefined {
	const want = normalizeDemoTitle(text);
	if (!want) return undefined;
	for (let i = demos.length - 1; i >= 0; i--) {
		if (normalizeDemoTitle(demos[i]!.title) === want) return demos[i];
	}
	return undefined;
}

export interface DemoPanelApi {
	demos: readonly SessionDemo[];
	openId: string | null;
	panelIndex?: number;
	open: (id: string, panelIndex?: number) => void;
	close: () => void;
}

/** Provided by the chat page; null elsewhere (previews, tests), where demo
 *  links render as plain bold text and the card has no panel button. */
export const DemoPanelContext = createContext<DemoPanelApi | null>(null);

export function useDemoPanel() {
	return useContext(DemoPanelContext);
}

/** Exact revision references take priority. Legacy titles only auto-open when unique. */
export function resolveQuestionDemo(demos: readonly SessionDemo[], input: unknown): { demo?: SessionDemo; candidates: SessionDemo[]; missing: boolean; panel?: number } {
	if (!input || typeof input !== "object") return { candidates: [], missing: false };
	const q = input as { demoRef?: { messageId?: unknown; panel?: unknown }; question?: unknown; details?: unknown };
	if (typeof q.demoRef?.messageId === "string") {
		const demo = demos.find((d) => d.id === q.demoRef!.messageId);
		return { demo, candidates: demo ? [demo] : [], missing: !demo, panel: typeof q.demoRef.panel === "number" && Number.isInteger(q.demoRef.panel) && q.demoRef.panel >= 0 ? q.demoRef.panel : undefined };
	}
	const text = normalizeDemoTitle([q.question, q.details].filter((x) => typeof x === "string").join(" "));
	const candidates = demos.filter((d) => text.includes(normalizeDemoTitle(d.title)));
	return { demo: candidates.length === 1 ? candidates[0] : undefined, candidates, missing: false };
}
