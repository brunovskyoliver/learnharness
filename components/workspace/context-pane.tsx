"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createStudyNotes } from "@/components/library/page-pane-api";
import { usePhoneLayer } from "@/components/library/page-pane";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { ArrowLeftIcon, XIcon } from "lucide-react";
import { requestFullTranscript } from "@/components/transcript-window";
import { scrollSessionTarget, type SessionScrollContext } from "@/components/session-navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePane } from "@/components/workspace-pane";
import { folderPathLabel, sessionTurnEntries, type LhMessage, type LhViewMessage, type LibraryFolder, type LibraryItem, type SessionTurnEntry, type TurnUsage } from "@/src/core";
import { useWorkspace } from "./workspace-context";

const ROW = "block min-h-8 w-full rounded-md px-2 py-1 text-left text-sm text-graphite hover:bg-shelf hover:text-ink pointer-coarse:min-h-11";

function Shell({ title, children }: { title: string; children: ReactNode }) {
	const workspace = useWorkspace();
	const phone = Boolean(workspace?.phoneContext);
	const root = useRef<HTMLElement | null>(null);
	usePhoneLayer(phone, root);
	return (
		<WorkspacePane
			label={title}
			resizeLabel="Resize context panel"
			testId="context-pane"
			className={phone ? "page-workspace bg-paper" : "hidden md:flex"}
			rootRef={root}
			onKeyDown={(event) => {
				if (!phone || event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				workspace?.closeContext();
			}}
		>
			{() => (
				<>
					<div className="flex min-h-13 shrink-0 items-center gap-3 px-3">
						{phone && (
							<button type="button" data-testid="page-back" onClick={workspace?.closeContext} className="prompt-secondary inline-flex shrink-0 items-center gap-1.5">
								<ArrowLeftIcon className="ui-icon" aria-hidden="true" />
								Back to chat
							</button>
						)}
						<h2 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{title}</h2>
						{!phone && (
							<button type="button" aria-label={`Close ${title}`} data-testid="context-pane-close" onClick={workspace?.closeContext} className="ui-icon-button text-faint hover:bg-shelf hover:text-ink">
								<XIcon className="ui-icon" />
							</button>
						)}
					</div>
					<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-6">{children}</div>
				</>
			)}
		</WorkspacePane>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-1">
			<h3 className="px-2 text-sm font-medium text-faint">{title}</h3>
			{children}
		</section>
	);
}

/** What an outline row reads: the learner's question if there was one, or how the answer starts. */
export const outlineLabel = (entry: Pick<SessionTurnEntry, "prompt" | "answer">) => entry.prompt.trim() || entry.answer.trim();

/** The session's context, pure for render tests: its turns, then its demos. */
export function SessionContextBody({ entries, demos, onJump, onOpenDemo, notes }: {
	entries: readonly SessionTurnEntry[];
	demos: readonly { id: string; title: string }[];
	onJump: (entry: SessionTurnEntry) => void;
	onOpenDemo: (id: string) => void;
	/** The session's pages and study notes (feature 017). */
	notes?: ReactNode;
}) {
	return (
		<>
			{notes}
			<Section title="Outline">
				{entries.length === 0
					? <p className="px-2 text-sm text-graphite">The outline fills in as the session goes.</p>
					: <nav aria-label="Session outline" data-testid="session-outline" className="flex flex-col gap-0.5">{entries.map((entry) => (
						<button key={entry.id} type="button" onClick={() => onJump(entry)} className={`${ROW} line-clamp-2`}>{outlineLabel(entry)}</button>
					))}</nav>}
			</Section>
			{demos.length > 0 && (
				<Section title="Demos">
					{demos.map((demo) => <button key={demo.id} type="button" data-testid="context-demo" onClick={() => onOpenDemo(demo.id)} className={ROW}>{demo.title}</button>)}
				</Section>
			)}
		</>
	);
}

export interface SessionPageRow { id: string; name: string; kind: LibraryItem["kind"]; size: number; passages: number }

/** Pages tied to this session, and the one action that makes more. Pure for render tests. */
export function SessionNotesBody({ pages, failed, canMakeNotes, busy, error, onOpen, onStudyNotes, onRetry, chatId }: {
	chatId?: string;
	pages: readonly SessionPageRow[] | null;
	failed: boolean;
	canMakeNotes: boolean;
	busy: boolean;
	error: string | null;
	onOpen: (row: SessionPageRow) => void;
	onStudyNotes: () => void;
	onRetry: () => void;
}) {
	const count = (n: number) => `${n} saved ${n === 1 ? "passage" : "passages"}`;
	return (
		<Section title="Notes">
			{pages === null && !failed && <div role="status" aria-label="Loading notes" className="flex flex-col gap-2 px-2"><Skeleton className="h-5 w-2/3" /></div>}
			{pages === null && failed && <div role="status" className="flex flex-wrap items-center gap-2 px-2 text-sm text-graphite"><p>Notes could not be loaded.</p><button type="button" className="prompt-secondary" onClick={onRetry}>Try again</button></div>}
			{pages?.length === 0 && <p className="px-2 text-sm text-graphite">No page is tied to this session yet.</p>}
			{pages?.map((row) => (
				<button key={row.id} type="button" data-testid="session-note" onClick={() => onOpen(row)} className={ROW}>
					<span className="block text-ink [overflow-wrap:anywhere]">{row.name}</span>
					{row.passages > 0 && <span className="block text-faint">{count(row.passages)}</span>}
				</button>
			))}
			{canMakeNotes && <button type="button" className={ROW} disabled={busy} data-testid="session-study-notes" onClick={onStudyNotes}>{busy ? "Making study notes…" : "Turn this lesson into study notes"}</button>}
			{canMakeNotes && chatId && <Link href={`/review?make=${encodeURIComponent(`lesson:${chatId}`)}`} data-testid="session-make-cards" className={ROW}>Make flashcards from this lesson</Link>}
			{error && <p role="alert" className="px-2 text-sm text-red">{error}</p>}
		</Section>
	);
}

function SessionNotes({ chatId, practice }: { chatId: string; practice: boolean }) {
	const workspace = useWorkspace();
	const [pages, setPages] = useState<SessionPageRow[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const refresh = useCallback(async () => {
		try {
			const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}/pages`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setPages(((await response.json()) as { pages: SessionPageRow[] }).pages);
			setFailed(false);
		} catch { setFailed(true); }
	}, [chatId]);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => { void refresh(); });
	useServerResync(() => { void refresh(); });
	return (
		<SessionNotesBody
			pages={pages}
			failed={failed}
			canMakeNotes={!practice}
			busy={busy}
			error={error}
			onRetry={() => void refresh()}
			onOpen={(row) => { if (workspace?.phoneContext) workspace.closeContext(); workspace?.openItem(row); }}
			chatId={chatId}
			onStudyNotes={() => {
				setBusy(true);
				setError(null);
				void createStudyNotes(chatId).then((result) => {
					setBusy(false);
					if ("error" in result) { setError(result.error); return; }
					if (workspace?.phoneContext) workspace.closeContext();
					workspace?.openItem(result.item);
				});
			}}
		/>
	);
}

/** Beside a session when no page or demo holds the pane. It moves the session's
 *  own scroller, so there is still one scroll owner. */
export function SessionContextPane({ chatId, practice, messages, nativeMessages, turns, demos, onOpenDemo, scopeRef, scrollContextRef }: {
	chatId: string;
	practice: boolean;
	messages: readonly LhViewMessage[];
	nativeMessages: readonly LhMessage[];
	turns: readonly TurnUsage[];
	demos: readonly { id: string; title: string }[];
	onOpenDemo: (id: string) => void;
	scopeRef: RefObject<HTMLElement | null>;
	scrollContextRef: RefObject<SessionScrollContext | null>;
}) {
	const entries = useMemo(() => sessionTurnEntries(messages, nativeMessages, turns), [messages, nativeMessages, turns]);
	const workspaceNow = useWorkspace();
	const jump = (entry: SessionTurnEntry) => {
		if (workspaceNow?.phoneContext) workspaceNow.closeContext();
		requestFullTranscript();
		requestAnimationFrame(() => {
			const scope = scopeRef.current;
			const target = [...(scope?.querySelectorAll<HTMLElement>("[data-answer-part-id]") ?? [])].find((element) => element.dataset.answerPartId === entry.partId);
			if (scope && target) scrollSessionTarget(target, scope, scrollContextRef.current);
		});
	};
	return <Shell title="This session"><SessionContextBody entries={entries} demos={demos} onJump={jump} onOpenDemo={onOpenDemo} notes={<SessionNotes chatId={chatId} practice={practice} />} /></Shell>;
}

/** The Library place's context, pure for render tests. */
export function LibraryContextBody({ items, folders, folderId, recentIds, failed, onOpenItem }: {
	items: readonly LibraryItem[] | null;
	folders: readonly LibraryFolder[];
	folderId: string | null;
	recentIds: readonly string[];
	failed: boolean;
	onOpenItem: (item: LibraryItem) => void;
}) {
	if (items === null) {
		return failed
			? <p role="status" className="px-2 text-sm text-graphite">Your Library could not be loaded.</p>
			: <div role="status" aria-label="Loading context" className="flex flex-col gap-2 px-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>;
	}
	const here = items.filter((item) => !item.archivedAt && (item.folderId ?? null) === folderId);
	const subfolders = folders.filter((folder) => !folder.archivedAt && folder.parentId === folderId);
	const tags = [...new Set(here.flatMap((item) => item.tags ?? []))].sort((a, b) => a.localeCompare(b));
	const byId = new Map(items.map((item) => [item.id, item]));
	const recent = recentIds.map((id) => byId.get(id)).filter((item): item is LibraryItem => Boolean(item) && !item!.archivedAt).slice(0, 5);
	const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
	return (
		<>
			<Section title="Location">
				<p className="px-2 text-sm text-graphite [overflow-wrap:anywhere]" data-testid="context-location">{folderPathLabel(folderId, [...folders]) || "Library"}</p>
				<p className="px-2 text-sm text-faint">{count(subfolders.length, "folder")} · {count(here.length, "item")}</p>
			</Section>
			{tags.length > 0 && (
				<Section title="Tags here">
					{tags.map((tag) => <Link key={tag} href={`/library?tag=${encodeURIComponent(tag)}`} className={ROW}>{tag}</Link>)}
				</Section>
			)}
			<Section title="Recently opened">
				{recent.length === 0
					? <p className="px-2 text-sm text-graphite">Nothing opened yet.</p>
					: recent.map((item) => <button key={item.id} type="button" onClick={() => onOpenItem(item)} className={ROW}>{item.name}</button>)}
			</Section>
		</>
	);
}

export function LibraryContextPane(props: { items: LibraryItem[] | null; folders: LibraryFolder[]; folderId: string | null; recentIds: string[]; failed: boolean }) {
	const workspace = useWorkspace();
	return <Shell title="This place"><LibraryContextBody {...props} onOpenItem={(item) => workspace?.openItem(item)} /></Shell>;
}
