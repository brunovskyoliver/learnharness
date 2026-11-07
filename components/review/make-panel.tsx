"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { CARD_PASSAGE_KEY, type CardGenerationSource } from "@/src/core";
import { cardFetch, failed } from "./card-api.ts";

export interface MakePreview { label: string; source: unknown; chars: number; truncated: boolean; model: string | null; refusal: { error?: string } | null }

/** The address `?make=` holds, and the passage a PDF left for it. */
export function parseMakeParam(value: string | null, stored: () => string | null): CardGenerationSource | null {
	if (!value) return null;
	if (value.startsWith("page:") && value.length > 5) return { kind: "page", itemId: value.slice(5) };
	if (value.startsWith("lesson:") && value.length > 7) return { kind: "lesson", chatId: value.slice(7) };
	if (value === "passage") {
		try {
			const passage = JSON.parse(stored() ?? "null") as { itemId?: unknown; page?: unknown; text?: unknown } | null;
			if (typeof passage?.itemId === "string" && typeof passage.text === "string") {
				// A note's passage (Notebook) has no page; a PDF's has one.
				if (passage.page === undefined) return { kind: "passage", itemId: passage.itemId, text: passage.text };
				if (typeof passage.page === "number") return { kind: "passage", itemId: passage.itemId, page: passage.page, text: passage.text };
			}
		} catch { /* read as nothing to make cards from */ }
	}
	return null;
}

/** What Make flashcards would send, said before the click that costs. */
export function MakePreviewBody({ preview, busy, failure, onGenerate, onByHand, onCancel, onSettings }: { preview: MakePreview; busy: boolean; failure: string | null; onGenerate: () => void; onByHand: () => void; onCancel: () => void; onSettings: () => void }) {
	return (
		<section aria-label="Make flashcards" data-testid="make-panel" className="flex flex-col gap-3 rounded-lg bg-shelf p-4">
			<h2 className="tracking-title text-xl font-medium [overflow-wrap:anywhere]">Make flashcards from {preview.label}</h2>
			{preview.refusal ? (
				<div role="status" data-testid="make-refusal" className="flex flex-col items-start gap-2 text-graphite">
					<p>{preview.refusal.error ?? "No model is set up for this."}</p>
					<button type="button" className="prompt-secondary" onClick={onSettings}>Open settings</button>
				</div>
			) : (
				<p className="text-graphite" data-testid="make-consent">Sends {preview.chars.toLocaleString()} characters of this source to {preview.model ?? "your model"}, which costs what a background step costs. The cost shows while it runs.{preview.truncated ? " The source is long, so only the first part goes." : ""}</p>
			)}
			<p className="text-sm text-faint">You read each draft and choose what to keep. Nothing joins your queue until you do.</p>
			{failure && <p role="alert" className="text-sm text-red">{failure}</p>}
			<div className="flex flex-wrap gap-2">
				{!preview.refusal && <button type="button" className="prompt-primary" data-testid="make-generate" disabled={busy} onClick={onGenerate}>{busy ? "Starting…" : "Generate drafts"}</button>}
				<button type="button" className="prompt-secondary" data-testid="make-by-hand" onClick={onByHand}>Write one by hand</button>
				<button type="button" className="prompt-secondary" onClick={onCancel}>Cancel</button>
			</div>
		</section>
	);
}

export function MakePanel({ param, onStarted, onByHand, onCancel }: { param: string; onStarted: () => void; onByHand: (source: unknown, label: string) => void; onCancel: () => void }) {
	const settings = useSettingsDialog();
	const [source, setSource] = useState<CardGenerationSource | null | undefined>(undefined);
	const [preview, setPreview] = useState<MakePreview | null>(null);
	const [loadFailure, setLoadFailure] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);
	useEffect(() => {
		const parsed = parseMakeParam(param, () => { try { return sessionStorage.getItem(CARD_PASSAGE_KEY); } catch { return null; } });
		setSource(parsed);
		setPreview(null); setLoadFailure(null);
		if (!parsed) return;
		let live = true;
		void cardFetch<MakePreview>("/api/cards/generate", { method: "POST", body: { ...parsed, preview: true } }).then((body) => {
			if (!live) return;
			if (failed(body)) setLoadFailure(body.failure); else setPreview(body);
		});
		return () => { live = false; };
	}, [param]);

	if (source === null || loadFailure) {
		return (
			<div role="status" data-testid="make-failed" className="flex flex-wrap items-center gap-2 text-graphite">
				<p>{loadFailure ?? "That source could not be read. Open it again and choose Make flashcards."}</p>
				<button type="button" className="prompt-secondary" onClick={onCancel}>Back to Review</button>
			</div>
		);
	}
	if (!preview) return <div role="status" aria-label="Reading the source"><Skeleton className="h-32 w-full rounded-lg" /></div>;
	const generate = async () => {
		if (!source || busy) return;
		setBusy(true); setFailure(null);
		const body = await cardFetch("/api/cards/generate", { method: "POST", body: source });
		setBusy(false);
		if (failed(body)) { setFailure(body.failure); return; }
		try { sessionStorage.removeItem(CARD_PASSAGE_KEY); } catch { /* nothing to clean */ }
		onStarted();
	};
	return <MakePreviewBody preview={preview} busy={busy} failure={failure} onGenerate={() => void generate()} onByHand={() => onByHand(preview.source, preview.label)} onCancel={onCancel} onSettings={() => settings.open()} />;
}
