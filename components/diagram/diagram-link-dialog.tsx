"use client";

/** Link a node or the whole diagram to a note, a lesson or a graph idea (feature 022).
 *  A note is stored by its written name and resolved by wiki-link rules, so a rename
 *  keeps it and a dangling one is honest. Linking reads the graph and never writes it. */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { diagramLinkKey, isWikiTarget, nameKey, type DiagramLink } from "@/src/core";

type Tab = "note" | "lesson" | "idea";
const TAB_LABEL: Record<Tab, string> = { note: "Notes", lesson: "Lessons", idea: "Ideas" };
const ROW = "flex min-h-9 w-full flex-col justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left text-md hover:bg-shelf pointer-coarse:min-h-11";

interface Row { key: string; name: string; meta?: string; link: DiagramLink }

const linkWords = (link: DiagramLink) => (link.kind === "note" ? link.target : link.kind === "lesson" ? `Lesson: ${link.title}` : `Idea: ${link.name}`);

async function loadRows(tab: Tab): Promise<Row[]> {
	const url = tab === "note" ? "/api/library" : tab === "lesson" ? "/api/chats" : "/api/graph";
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) throw new Error(String(response.status));
	const body = await response.json() as {
		items?: { id: string; name: string; kind: string }[];
		chats?: { id: string; title: string; kind?: string }[];
		nodes?: { id: string; name: string; statement: string }[];
	};
	if (tab === "note") return (body.items ?? []).filter((item) => isWikiTarget(item.name)).map((item) => ({ key: item.id, name: item.name, meta: item.kind, link: { kind: "note", target: item.name } }));
	if (tab === "lesson") return (body.chats ?? []).filter((chat) => chat.kind !== "practice").map((chat) => ({ key: chat.id, name: chat.title, link: { kind: "lesson", chatId: chat.id, messageId: null, title: chat.title } }));
	return (body.nodes ?? []).map((node) => ({ key: node.id, name: node.name, meta: node.statement, link: { kind: "idea", nodeId: node.id, name: node.name } }));
}

export function DiagramLinkDialog({ subject, links, onAdd, onRemove, onClose }: {
	subject: string;
	links: readonly DiagramLink[];
	onAdd: (link: DiagramLink) => void;
	onRemove: (key: string) => void;
	onClose: () => void;
}) {
	const [tab, setTab] = useState<Tab>("note");
	const [rows, setRows] = useState<Row[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [query, setQuery] = useState("");
	useEffect(() => {
		let live = true;
		setRows(null);
		setFailed(false);
		loadRows(tab).then((next) => { if (live) setRows(next); }, () => { if (live) setFailed(true); });
		return () => { live = false; };
	}, [tab, attempt]);
	const shown = useMemo(() => {
		const key = nameKey(query.trim());
		return (rows ?? []).filter((row) => !links.some((link) => diagramLinkKey(link) === diagramLinkKey(row.link)) && nameKey(`${row.name} ${row.meta ?? ""}`).includes(key)).slice(0, 50);
	}, [rows, query, links]);
	const dangling = tab === "note" && rows && isWikiTarget(query.trim()) && !rows.some((row) => nameKey(row.name) === nameKey(query.trim()));
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="flex max-h-[85dvh] flex-col gap-3" data-testid="diagram-link-dialog">
				<DialogTitle className="pe-6 [overflow-wrap:anywhere]">Link {subject}</DialogTitle>
				<DialogDescription>Links show in the Links panel of both sides. Nothing is written to your graph.</DialogDescription>
				{links.length > 0 && (
					<ul aria-label="Already linked" className="flex flex-col gap-1">
						{links.map((link) => (
							<li key={diagramLinkKey(link)} className="flex items-center gap-2 text-sm text-ink" data-testid="diagram-link-existing">
								<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{linkWords(link)}</span>
								<button type="button" className="lh-text-action" aria-label={`Remove link to ${linkWords(link)}`} onClick={() => onRemove(diagramLinkKey(link))}>Remove</button>
							</li>
						))}
					</ul>
				)}
				<div role="group" aria-label="What to link" className="nb-set-pills">
					{(Object.keys(TAB_LABEL) as Tab[]).map((name) => (
						<button key={name} type="button" aria-pressed={tab === name} data-testid={`diagram-link-tab-${name}`} className="nb-set-pill" onClick={() => setTab(name)}>{TAB_LABEL[name]}</button>
					))}
				</div>
				<input
					aria-label={`Filter ${TAB_LABEL[tab].toLowerCase()}`}
					name="link-filter"
					value={query}
					autoComplete="off"
					placeholder={tab === "note" ? "Filter, or name a page to come…" : "Filter…"}
					data-testid="diagram-link-filter"
					className="lh-line-field"
					onChange={(event) => setQuery(event.target.value)}
				/>
				<div className="flex min-h-24 flex-col gap-0.5 overflow-y-auto" data-testid="diagram-link-rows">
					{failed ? (
						<div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink"><p>These could not be loaded.</p><button type="button" className="lh-text-action" onClick={() => setAttempt((n) => n + 1)}>Try again</button></div>
					) : !rows ? (
						<div role="status" aria-label="Loading" className="flex flex-col gap-2"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>
					) : (
						<>
							{dangling && (
								<button type="button" className={ROW} data-testid="diagram-link-dangling" onClick={() => { onAdd({ kind: "note", target: query.trim() }); setQuery(""); }}>
									<span className="text-ink [overflow-wrap:anywhere]">Link {query.trim()}</span>
									<span className="text-meta text-faint">Nothing has this name yet. Link it now, make the page later.</span>
								</button>
							)}
							{shown.length === 0 && !dangling && <p className="px-2 text-sm text-graphite">Nothing to link here.</p>}
							{shown.map((row) => (
								<button key={row.key} type="button" className={ROW} data-testid="diagram-link-row" onClick={() => onAdd(row.link)}>
									<span className="text-ink [overflow-wrap:anywhere]">{row.name}</span>
									{row.meta && <span className="line-clamp-2 text-meta text-faint [overflow-wrap:anywhere]">{row.meta}</span>}
								</button>
							))}
						</>
					)}
				</div>
				<div className="flex justify-end"><button type="button" className="nb-pill" onClick={onClose}>Done</button></div>
			</DialogContent>
		</Dialog>
	);
}
