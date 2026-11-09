"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_MAX_BYTES } from "@/src/core";
import type { PaneItem } from "./page-pane-context.tsx";
import { RepoFreshnessLine, useRepoFreshness } from "./repo-freshness.tsx";

const contentUrl = (id: string, download = false) => `/api/library/items/${id}/content${download ? "?download=1" : ""}`;

/** Text before the line, the line, and text after. Line numbers are 1-indexed. */
export function splitAtLine(text: string, line: number): [string, string, string] {
	let start = 0;
	for (let n = 1; n < line; n++) {
		const next = text.indexOf("\n", start);
		if (next === -1) return [text, "", ""];
		start = next + 1;
	}
	const end = text.indexOf("\n", start);
	return end === -1 ? [text.slice(0, start), text.slice(start), ""] : [text.slice(0, start), text.slice(start, end), text.slice(end)];
}

/** A Markdown, text, code or CSV original, in the pane. Never editable. */
export function ReadOnlyView({ item }: { item: PaneItem }) {
	const [text, setText] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	// A mirrored file (feature 026): known from the row that opened it, or from the content's header.
	const [repo, setRepo] = useState(item.repo ?? null);
	const tooLong = item.size > PAGE_MAX_BYTES;
	// After a pull: "Updated from the repo" + Reload, or "Removed from the repo".
	const { freshness, record, reset } = useRepoFreshness(item.id);
	const load = useCallback(async () => {
		setFailed(false);
		try {
			const response = await fetch(contentUrl(item.id), { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const from = response.headers.get("X-Library-Repo");
			if (from) setRepo(decodeURIComponent(from));
			record(response);
			setText(await response.text());
			reset();
		} catch {
			setFailed(true);
		}
	}, [item.id, record, reset]);
	useEffect(() => { if (!tooLong) void load(); }, [load, tooLong]);
	// A search hit lands on its line (feature 019), marked until another jump.
	const jumpLine = item.jump?.line ?? null;
	const mark = useRef<HTMLElement>(null);
	useEffect(() => { mark.current?.scrollIntoView({ block: "center" }); }, [jumpLine, item.jump?.nonce, text]);
	const lines = text !== null && jumpLine !== null ? splitAtLine(text, jumpLine) : null;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-4" data-testid="library-read-only">
			<p className="text-sm text-faint [overflow-wrap:anywhere]" data-testid="library-read-only-source">{repo ? `This comes from ${repo}. Change it in the repo.` : "This is your original; it can't be edited here."}</p>
			<RepoFreshnessLine freshness={freshness} onReload={() => void load()} />
			{tooLong ? (
				<p className="flex flex-wrap items-center gap-2 text-sm text-graphite">
					Too long to preview
					<a href={contentUrl(item.id, true)} className="lh-text-action">Download</a>
				</p>
			) : failed ? (
				<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-graphite">
					<p>{item.name} could not be loaded.</p>
					<button type="button" className="lh-text-action" onClick={() => void load()}>Try again</button>
				</div>
			) : text === null ? (
				<p role="status" className="text-sm text-faint">Loading…</p>
			) : (
				<pre
					// Keyboard users scroll it; the track stays hidden globally.
					tabIndex={0}
					aria-label={item.name}
					className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md text-md [overflow-wrap:anywhere] ${item.kind === "code" || item.kind === "csv" ? "font-mono" : "font-sans"}`}
				>{lines ? <>{lines[0]}<mark ref={mark} className="lh-doc-line" data-testid="library-read-only-line">{lines[1]}</mark>{lines[2]}</> : text}</pre>
			)}
		</div>
	);
}
