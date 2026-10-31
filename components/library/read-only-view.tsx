"use client";

import { useCallback, useEffect, useState } from "react";
import { PAGE_MAX_BYTES } from "@/src/core";
import type { PaneItem } from "./page-pane-context.tsx";

const contentUrl = (id: string, download = false) => `/api/library/items/${id}/content${download ? "?download=1" : ""}`;

/** A Markdown, text, code or CSV original, in the pane. Never editable. */
export function ReadOnlyView({ item }: { item: PaneItem }) {
	const [text, setText] = useState<string | null>(null);
	const [failed, setFailed] = useState(false);
	const tooLong = item.size > PAGE_MAX_BYTES;
	const load = useCallback(async () => {
		setFailed(false);
		try {
			const response = await fetch(contentUrl(item.id), { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setText(await response.text());
		} catch {
			setFailed(true);
		}
	}, [item.id]);
	useEffect(() => { if (!tooLong) void load(); }, [load, tooLong]);
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-3" data-testid="library-read-only">
			<p className="text-sm text-muted-foreground">This is your original; it can&apos;t be edited here.</p>
			{tooLong ? (
				<p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
					Too long to preview
					<a href={contentUrl(item.id, true)} className="prompt-secondary">Download</a>
				</p>
			) : failed ? (
				<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
					<p>{item.name} could not be loaded.</p>
					<button type="button" className="prompt-secondary" onClick={() => void load()}>Try again</button>
				</div>
			) : text === null ? (
				<p role="status" className="text-sm text-muted-foreground">Loading…</p>
			) : (
				<pre
					// Keyboard users scroll it; the track stays hidden globally.
					tabIndex={0}
					aria-label={item.name}
					className={`min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md text-base [overflow-wrap:anywhere] ${item.kind === "code" || item.kind === "csv" ? "font-mono" : "font-ui"}`}
				>{text}</pre>
			)}
		</div>
	);
}
