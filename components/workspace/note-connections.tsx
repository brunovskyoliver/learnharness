"use client";

/** A page's place among the other notes (features 016-017), in the right pane:
 *  what links here, what it links to, what is related, the lessons it came from
 *  and the graph ideas it touches. All of it is read from stored text, with no
 *  model call. Nothing here writes. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { cn } from "@/lib/utils";
import type { BacklinkRow, LibraryKind, NoteLinkRow, RelatedRow } from "@/src/core";
import type { GraphLinkRow } from "@/src/core";

export interface NoteConnections {
	links: NoteLinkRow[];
	backlinks: BacklinkRow[];
	related: RelatedRow[];
	sources: { chatId: string; messageId: string | null; title: string | null; gone: boolean; href: string }[];
	sessions: { chatId: string; title: string | null; gone: boolean; href: string }[];
	graph: GraphLinkRow[];
}

/** Notebook's Links rows (feature 025 T048): 14px name, 12.5px meta, shelf on hover. */
const ROW = "flex min-h-9 w-full flex-col justify-center gap-0.5 rounded-lg px-2 py-1.5 text-left text-md leading-5 transition-colors hover:bg-shelf pointer-coarse:min-h-11";

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-0.5">
			<h3 className="px-2 pb-1 text-xs font-medium text-faint">{title}</h3>
			{children}
		</section>
	);
}

/** Each section's empty sentence, shared with Notebook's Links panel. */
export const CONNECTION_EMPTY = {
	backlinks: "No page links here yet.",
	links: (subject: "page" | "diagram") => (subject === "diagram" ? "Select a node and choose Link to link a note." : "Type [[ in the text to link a page."),
	related: "Nothing related yet.",
	lessons: (subject: "page" | "diagram") => `No lesson is tied to this ${subject}.`,
	sourceGone: "A saved passage's session was deleted. The text stays here, and its source is gone.",
	graph: (subject: "page" | "diagram") => `No graph idea relates to this ${subject} yet.`,
} as const;

const Empty = ({ children }: { children: ReactNode }) => <p className="px-2 text-sm text-graphite">{children}</p>;
const Name = ({ children }: { children: ReactNode }) => <span className="text-ink [overflow-wrap:anywhere]">{children}</span>;
const Meta = ({ children }: { children: ReactNode }) => <span className="text-meta leading-4.5 text-graphite [overflow-wrap:anywhere]">{children}</span>;

/** Pure for render tests: every section, with its own empty line. */
export function NoteConnectionsBody({ data, subject = "page", onOpenPage, onFollowLink, onSource, makeCardsHref }: {
	data: NoteConnections;
	/** A page's own door to drafting flashcards (feature 023), so the Library's menu isn't the only one. */
	makeCardsHref?: string;
	/** What these links belong to (feature 022 adds diagrams). */
	subject?: "page" | "diagram";
	onOpenPage: (id: string, name: string, kind?: LibraryKind) => void;
	onFollowLink: (row: NoteLinkRow) => void;
	onSource: (href: string) => void;
}) {
	const cited = new Set(data.sources.map((row) => row.chatId));
	const otherSessions = data.sessions.filter((row) => !cited.has(row.chatId) && !row.gone);
	return (
		<>
			<Section title={`Links to this ${subject}`}>
				{data.backlinks.length === 0 ? <Empty>{CONNECTION_EMPTY.backlinks}</Empty> : data.backlinks.map((row) => (
					<button key={row.id} type="button" className={ROW} data-testid="note-backlink" onClick={() => onOpenPage(row.id, row.name, row.kind)}>
						<Name>{row.name}{row.archived ? " · archived" : ""}</Name>
						<Meta>{row.kind === "diagram" ? `Diagram · ${row.snippet}` : row.snippet}</Meta>
					</button>
				))}
			</Section>
			<Section title={`Links from this ${subject}`}>
				{data.links.length === 0 ? <Empty>{CONNECTION_EMPTY.links(subject)}</Empty> : data.links.map((row) => (
					<button key={row.target} type="button" className={ROW} data-testid="note-link" data-state={row.resolution.state} onClick={() => onFollowLink(row)}>
						<Name>{row.resolution.name ?? row.target}</Name>
						{row.resolution.state === "missing" && <Meta>No such page yet</Meta>}
						{row.resolution.state === "deleted" && <Meta>Deleted from your Library</Meta>}
						{row.resolution.state === "live" && row.resolution.name !== row.target && <Meta>Written as {row.target}</Meta>}
					</button>
				))}
			</Section>
			<Section title="Related notes">
				{data.related.length === 0 ? <Empty>{CONNECTION_EMPTY.related}</Empty> : data.related.map((row) => (
					<button key={row.id} type="button" className={ROW} data-testid="note-related" onClick={() => onOpenPage(row.id, row.name, row.kind)}>
						<Name>{row.name}</Name>
						<Meta>{row.kind === "diagram" ? `Diagram · ${row.reason}` : row.reason}</Meta>
					</button>
				))}
			</Section>
			<Section title="Lessons">
				{data.sources.length === 0 && otherSessions.length === 0 ? <Empty>{CONNECTION_EMPTY.lessons(subject)}</Empty> : null}
				{data.sources.map((row) => row.gone ? (
					<p key={`${row.chatId}/${row.messageId}`} className="px-2 py-1 text-sm text-graphite" data-testid="note-source-gone">{CONNECTION_EMPTY.sourceGone}</p>
				) : (
					<button key={`${row.chatId}/${row.messageId}`} type="button" className={ROW} data-testid="note-source" onClick={() => onSource(row.href)}>
						<Name>{row.title}</Name>
						<Meta>Saved passage · jump to it</Meta>
					</button>
				))}
				{otherSessions.map((row) => (
					<button key={row.chatId} type="button" className={ROW} data-testid="note-session" onClick={() => onSource(row.href)}>
						<Name>{row.title}</Name>
						<Meta>Open the session</Meta>
					</button>
				))}
			</Section>
			{makeCardsHref && (
				<Section title="Flashcards">
					<Link href={makeCardsHref} className={ROW} data-testid="note-make-cards"><Name>Make flashcards from this page</Name></Link>
				</Section>
			)}
			<Section title="Ideas in your graph">
				{data.graph.length === 0 ? <Empty>{CONNECTION_EMPTY.graph(subject)}</Empty> : data.graph.map((row) => {
					const body = (<><Name>{row.name}</Name><Meta>{row.statement}</Meta></>);
					return row.href
						? <button key={row.id} type="button" className={ROW} data-testid="note-graph" onClick={() => onSource(row.href!)}>{body}</button>
						: <div key={row.id} className={cn(ROW, "hover:bg-transparent")} data-testid="note-graph">{body}</div>;
				})}
			</Section>
		</>
	);
}

/** A page's connections, read while the caller is shown (Study's pane, Notebook's Links panel): a failed refresh keeps the last list. */
export function useNoteConnections(pageId: string): { data: NoteConnections | null; failed: boolean; refresh: () => Promise<void> } {
	const [data, setData] = useState<NoteConnections | null>(null);
	const [failed, setFailed] = useState(false);
	const request = useRef(0);
	const refresh = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch(`/api/library/pages/${encodeURIComponent(pageId)}/connections`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as NoteConnections;
			if (id !== request.current) return;
			setData(body);
			setFailed(false);
		} catch {
			if (id === request.current) setFailed(true);
		}
	}, [pageId]);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => { void refresh(); });
	useServerResync(() => { void refresh(); });
	return { data, failed, refresh };
}

/** Fetched only while shown. Loading, failed and empty are distinct, and a failed refresh keeps the last list. */
export function NoteConnectionsPanel({ pageId, subject, onOpenPage, onFollowLink, onSource, className }: {
	pageId: string;
	subject?: "page" | "diagram";
	onOpenPage: (id: string, name: string, kind?: LibraryKind) => void;
	onFollowLink: (row: NoteLinkRow) => void;
	onSource: (href: string) => void;
	className?: string;
}) {
	const { data, failed, refresh } = useNoteConnections(pageId);
	return (
		<aside aria-label="Links and sources" data-testid="note-connections" className={cn("flex flex-col gap-6", className)}>
			{data
				? <NoteConnectionsBody data={data} subject={subject} onOpenPage={onOpenPage} onFollowLink={onFollowLink} onSource={onSource} makeCardsHref={subject === "diagram" ? undefined : `/review?make=${encodeURIComponent(`page:${pageId}`)}`} />
				: failed
					? <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-sm text-ink"><p>These links could not be loaded.</p><button type="button" className="lh-text-action" onClick={() => void refresh()}>Try again</button></div>
					: <div role="status" aria-label="Loading links" className="flex flex-col gap-2 px-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>}
		</aside>
	);
}
