"use client";

/** Where a lesson passage goes (feature 017): a page in the Library, or a new one. */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useLibrarySnapshot } from "@/components/workspace/library-snapshot";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { matchMentions } from "@/src/core";
import type { LibraryItem } from "@/src/core";
import type { PassageSelection } from "@/components/passage-selection";

const ROW = "flex min-h-9 w-full items-center rounded-md px-2 text-left text-sm text-ink hover:bg-shelf focus-visible:outline-1 focus-visible:outline-focus pointer-coarse:min-h-11";

async function postPassage(pageId: string, chatId: string, passage: PassageSelection): Promise<string | null> {
	try {
		const response = await fetch(`/api/library/pages/${encodeURIComponent(pageId)}/passages`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ markdown: passage.markdown, chatId, messageId: passage.messageId }),
		});
		if (response.ok) return null;
		return ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The passage could not be saved.";
	} catch {
		return "The passage could not be saved. Check your connection and try again.";
	}
}

async function postDocumentPassage(pageId: string, source: DocumentPassage): Promise<string | null> {
	try {
		const response = await fetch(`/api/library/pages/${encodeURIComponent(pageId)}/document-passages`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(source),
		});
		if (response.ok) return null;
		return ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The passage could not be saved.";
	} catch {
		return "The passage could not be saved. Check your connection and try again.";
	}
}

/** A passage from a PDF (feature 020): the page travels with it as a citation. */
export interface DocumentPassage { itemId: string; page: number; text: string }

/** `chatId` and `passage` for a lesson's words; `document` for a PDF's. */
export function SavePassageDialog({ chatId, passage, document: fromDocument, onClose }: { chatId?: string; passage?: PassageSelection; document?: DocumentPassage; onClose: () => void }) {
	const library = useLibrarySnapshot(true);
	const workspace = useWorkspace();
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [saved, setSaved] = useState<LibraryItem | null>(null);
	const pages = useMemo(() => (library.items ?? []).filter((item) => item.kind === "page" && !item.archivedAt), [library.items]);
	const rows = useMemo(() => matchMentions(pages, query).slice(0, 30), [pages, query]);
	const saveTo = async (page: LibraryItem) => {
		setBusy(true);
		setError(null);
		const refusal = fromDocument ? await postDocumentPassage(page.id, fromDocument) : await postPassage(page.id, chatId!, passage!);
		setBusy(false);
		if (refusal) setError(refusal);
		else setSaved(page);
	};
	const saveToNew = async () => {
		const name = query.trim();
		if (!name) return;
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/library/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content: "" }) });
			const body = await response.json().catch(() => ({})) as { item?: LibraryItem; error?: string };
			if (!response.ok || !body.item) { setError(body.error ?? `${name} could not be created.`); setBusy(false); return; }
			await saveTo(body.item);
		} catch {
			setError(`${name} could not be created. Check your connection and try again.`);
			setBusy(false);
		}
	};
	const exact = pages.some((page) => page.name.toLowerCase() === query.trim().toLowerCase());
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="gap-3 rounded-lg border-0 bg-shelf sm:max-w-md" data-testid="save-passage-dialog" aria-describedby={undefined}>
				<DialogTitle className="text-lg font-medium tracking-title">{saved ? "Saved" : "Save to a page"}</DialogTitle>
				{saved ? (
					<>
						<p role="status" className="text-sm text-graphite" data-testid="save-passage-saved">Saved to {saved.name}, {fromDocument ? `with a citation to page ${fromDocument.page}` : "with a link back to this lesson"}.</p>
						<div className="flex flex-wrap gap-2">
							<button type="button" className="lh-text-action" data-testid="save-passage-open" onClick={() => { workspace?.openItem(saved); onClose(); }}>Open page</button>
							<button type="button" className="nb-pill" onClick={onClose}>Done</button>
						</div>
					</>
				) : (
					<>
						<p className="max-h-24 overflow-y-auto rounded-md bg-paper px-2 py-1 text-sm text-graphite [overflow-wrap:anywhere] [scrollbar-width:none]" data-testid="save-passage-preview">{fromDocument?.text ?? passage?.markdown}</p>
						<label className="flex flex-col gap-1 text-sm font-medium text-graphite">
							Find a page, or name a new one
							<input
								autoFocus
								value={query}
								onChange={(event) => setQuery(event.currentTarget.value)}
								autoComplete="off"
								data-testid="save-passage-query"
								className="h-8 w-full rounded-md border border-rule bg-transparent px-2 text-md font-normal text-ink pointer-coarse:h-11"
							/>
						</label>
						<div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]">
							{library.items === null && !library.failed && <div role="status" aria-label="Loading your pages" className="flex flex-col gap-2 py-1"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>}
							{library.failed && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-graphite"><p>Your Library could not be loaded.</p><button type="button" className="lh-text-action" onClick={library.retry}>Try again</button></div>}
							{library.items !== null && pages.length === 0 && !query.trim() && <p className="text-sm text-graphite">You have no pages yet. Name one above.</p>}
							{rows.map((page) => <button key={page.id} type="button" className={ROW} disabled={busy} data-testid="save-passage-page" onClick={() => void saveTo(page)}>{page.name}</button>)}
							{library.items !== null && query.trim() && !exact && <button type="button" className={ROW} disabled={busy} data-testid="save-passage-new" onClick={() => void saveToNew()}>New page: {query.trim()}</button>}
						</div>
						{error && <p role="alert" className="text-sm text-red">{error}</p>}
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
