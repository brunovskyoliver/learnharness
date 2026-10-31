"use client";

/** The tutor's changes on an open page (feature 010, US3): which tutor
 *  versions the learner hasn't seen, what they changed, and the line the bar
 *  shows. Seen moves on Done and on close (owner, 2026-10-31). */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PageVersion } from "@/src/core";
import { tutorHunks, type TutorHunk } from "./page-blocks.ts";
import type { TutorHighlights } from "./page-editor-extras.ts";
import { parsePageMarkdown, serializePageJson } from "./page-markdown.ts";

export interface TutorChanges { hunks: TutorHunk[]; versions: number[] }

const places = (n: number) => `${n} ${n === 1 ? "place" : "places"}`;

/** "The tutor changed 2 places · version 8", or "· versions 7–9". */
export function changeBarText(changes: TutorChanges): string {
	const versions = [...changes.versions].sort((a, b) => a - b);
	const which = versions.length === 1 ? `version ${versions[0]}` : `versions ${versions[0]}–${versions.at(-1)}`;
	return `The tutor changed ${places(changes.hunks.length)} · ${which}`;
}

export function skippedText(skipped: number): string {
	return skipped === 1 ? "1 place you also edited was left as it is." : `${skipped} places you also edited were left as they are.`;
}

export const UNDO_FAILED_TEXT = "The tutor's edit could not be undone. Your text is kept.";

/** A block in the editor's own Markdown form, so highlights match its nodes. */
export function editorKey(raw: string): string {
	return serializePageJson(parsePageMarkdown(raw)).trim();
}
export const nodeJsonKey = (json: unknown) => serializePageJson({ type: "doc", content: [json as never] }).trim();

export function highlightsOf(changes: TutorChanges | null): TutorHighlights | null {
	if (!changes) return null;
	return {
		added: changes.hunks.flatMap((h) => h.added.map(editorKey)),
		removed: changes.hunks.filter((h) => h.removed.length > 0).map((h) => ({
			anchor: h.added.length === 0 && h.anchor !== null ? editorKey(h.anchor) : null,
			before: h.added.length > 0 ? editorKey(h.added[0]!) : null,
			blocks: h.removed,
		})),
	};
}

const pageUrl = (id: string) => `/api/library/pages/${encodeURIComponent(id)}`;

async function versionText(id: string, n: number): Promise<string> {
	const response = await fetch(`${pageUrl(id)}/versions/${n}`, { cache: "no-store" });
	if (!response.ok) throw new Error(String(response.status));
	return ((await response.json()) as { content: string }).content;
}

/** Loads on open and whenever the page's version moves; `done` marks them seen. */
export function useTutorChanges(id: string, loaded: boolean, base: number) {
	const [changes, setChanges] = useState<TutorChanges | null>(null);
	const latest = useRef(0);
	const shown = useRef<number[]>([]);
	useEffect(() => {
		if (!loaded) return;
		const run = ++latest.current;
		void (async () => {
			try {
				const response = await fetch(`${pageUrl(id)}/seen`, { cache: "no-store" });
				if (!response.ok) return;
				const { unseen } = (await response.json()) as { version: number; unseen: PageVersion[] };
				const hunks: TutorHunk[] = [];
				for (const version of unseen) {
					const [before, after] = await Promise.all([versionText(id, version.base), versionText(id, version.n)]);
					hunks.push(...tutorHunks(version.n, before, after));
				}
				if (run !== latest.current) return;
				const versions = unseen.map((v) => v.n);
				shown.current = versions;
				setChanges(hunks.length > 0 ? { hunks, versions } : null);
			} catch { /* no highlights is the safe failure: the text itself is right */ }
		})();
	}, [id, loaded, base]);

	/** Done, close or undo: everything up to the newest shown is seen. */
	const done = useCallback(async () => {
		const version = Math.max(0, ...shown.current);
		latest.current++;
		setChanges(null);
		shown.current = [];
		if (!version) return;
		await fetch(`${pageUrl(id)}/seen`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }), keepalive: true }).catch(() => {});
	}, [id]);

	return { changes, done };
}
