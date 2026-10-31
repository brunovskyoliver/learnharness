"use client";

import Link from "next/link";
import { useMemo, type ReactNode, type RefObject } from "react";
import { XIcon } from "lucide-react";
import { requestFullTranscript } from "@/components/transcript-window";
import { scrollSessionTarget, type SessionScrollContext } from "@/components/session-navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePane } from "@/components/workspace-pane";
import { folderPathLabel, sessionTurnEntries, type LhMessage, type LhViewMessage, type LibraryFolder, type LibraryItem, type SessionTurnEntry, type TurnUsage } from "@/src/core";
import { useWorkspace } from "./workspace-context";

const ROW = "block min-h-8 w-full rounded-[6px] px-2 py-1 text-left text-sm text-ink-2 hover:bg-accent hover:text-foreground pointer-coarse:min-h-11";

function Shell({ title, children }: { title: string; children: ReactNode }) {
	const workspace = useWorkspace();
	return (
		<WorkspacePane label={title} resizeLabel="Resize context panel" testId="context-pane" className="hidden md:flex">
			{() => (
				<>
					<div className="flex h-13 shrink-0 items-center gap-3 px-3">
						<h2 className="min-w-0 flex-1 truncate text-base font-medium">{title}</h2>
						<button type="button" aria-label={`Close ${title}`} data-testid="context-pane-close" onClick={workspace?.closeContext} className="ui-icon-button text-muted-foreground hover:bg-accent hover:text-foreground">
							<XIcon className="ui-icon" />
						</button>
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
			<h3 className="px-2 text-sm font-medium text-muted-foreground">{title}</h3>
			{children}
		</section>
	);
}

/** What an outline row reads: the learner's question if there was one, or how the answer starts. */
export const outlineLabel = (entry: Pick<SessionTurnEntry, "prompt" | "answer">) => entry.prompt.trim() || entry.answer.trim();

/** The session's context, pure for render tests: its turns, then its demos. */
export function SessionContextBody({ entries, demos, onJump, onOpenDemo }: {
	entries: readonly SessionTurnEntry[];
	demos: readonly { id: string; title: string }[];
	onJump: (entry: SessionTurnEntry) => void;
	onOpenDemo: (id: string) => void;
}) {
	return (
		<>
			<Section title="Outline">
				{entries.length === 0
					? <p className="px-2 text-sm text-ink-2">The outline fills in as the session goes.</p>
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

/** Beside a session when no page or demo holds the pane. It moves the session's
 *  own scroller, so there is still one scroll owner. */
export function SessionContextPane({ messages, nativeMessages, turns, demos, onOpenDemo, scopeRef, scrollContextRef }: {
	messages: readonly LhViewMessage[];
	nativeMessages: readonly LhMessage[];
	turns: readonly TurnUsage[];
	demos: readonly { id: string; title: string }[];
	onOpenDemo: (id: string) => void;
	scopeRef: RefObject<HTMLElement | null>;
	scrollContextRef: RefObject<SessionScrollContext | null>;
}) {
	const entries = useMemo(() => sessionTurnEntries(messages, nativeMessages, turns), [messages, nativeMessages, turns]);
	const jump = (entry: SessionTurnEntry) => {
		requestFullTranscript();
		requestAnimationFrame(() => {
			const scope = scopeRef.current;
			const target = [...(scope?.querySelectorAll<HTMLElement>("[data-answer-part-id]") ?? [])].find((element) => element.dataset.answerPartId === entry.partId);
			if (scope && target) scrollSessionTarget(target, scope, scrollContextRef.current);
		});
	};
	return <Shell title="This session"><SessionContextBody entries={entries} demos={demos} onJump={jump} onOpenDemo={onOpenDemo} /></Shell>;
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
			? <p role="status" className="px-2 text-sm text-ink-2">Your Library could not be loaded.</p>
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
				<p className="px-2 text-sm text-ink-2 [overflow-wrap:anywhere]" data-testid="context-location">{folderPathLabel(folderId, [...folders]) || "Library"}</p>
				<p className="px-2 text-sm text-muted-foreground">{count(subfolders.length, "folder")} · {count(here.length, "item")}</p>
			</Section>
			{tags.length > 0 && (
				<Section title="Tags here">
					{tags.map((tag) => <Link key={tag} href={`/library?tag=${encodeURIComponent(tag)}`} className={ROW}>{tag}</Link>)}
				</Section>
			)}
			<Section title="Recently opened">
				{recent.length === 0
					? <p className="px-2 text-sm text-ink-2">Nothing opened yet.</p>
					: recent.map((item) => <button key={item.id} type="button" onClick={() => onOpenItem(item)} className={ROW}>{item.name}</button>)}
			</Section>
		</>
	);
}

export function LibraryContextPane(props: { items: LibraryItem[] | null; folders: LibraryFolder[]; folderId: string | null; recentIds: string[]; failed: boolean }) {
	const workspace = useWorkspace();
	return <Shell title="This place"><LibraryContextBody {...props} onOpenItem={(item) => workspace?.openItem(item)} /></Shell>;
}
