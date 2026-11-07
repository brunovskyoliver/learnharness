"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { BookOpenIcon, DumbbellIcon, FileTextIcon, FolderIcon, SearchIcon, ZapIcon } from "lucide-react";
import { DocSnippetText } from "@/components/library/doc-snippet";
import { useDocumentSearch } from "@/components/library/use-document-search";
import { switchInterface } from "@/components/interface-switch";
import { createBlankPage, createStudyNotes, SAVE_PASSAGE_EVENT, usePagePane } from "@/components/library/page-pane-api";
import { useSessionList, useSessionListDemand } from "@/components/session-list";
import { useSettingsDialog } from "@/components/settings/settings-dialog.tsx";
import { useSidebar } from "@/components/sidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useLibrarySnapshot } from "@/components/workspace/library-snapshot";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { cn } from "@/lib/utils";
import { buildPaletteEntries, chatIdOfPath, docCountText, kbdEventForAction, passageGroup, rankPalette, type PaletteActionId, type PaletteEntry, type PaletteGroup } from "@/src/core";

export interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** What had focus, for Escape to return to. */
	opener: RefObject<HTMLElement | null>;
}

const ROUTES: Partial<Record<PaletteActionId, string>> = {
	"new-lesson": "/chat/new",
	"new-practice": "/chat/new?mode=practice",
	"open-home": "/",
	"library-all": "/library",
	"library-favorites": "/library?view=favorites",
	"library-recent": "/library?view=recent",
	"library-archive": "/library?view=archive",
	"library-trash": "/library?view=trash",
	"open-review": "/review",
	"new-card": "/review?new=1",
};

function EntryIcon({ entry }: { entry: PaletteEntry }) {
	const className = "ui-icon shrink-0 text-faint";
	if (entry.kind === "session") return entry.practice ? <DumbbellIcon className={className} aria-hidden="true" /> : <BookOpenIcon className={className} aria-hidden="true" />;
	if (entry.kind === "item" || entry.kind === "passage") return <FileTextIcon className={className} aria-hidden="true" />;
	if (entry.kind === "folder") return <FolderIcon className={className} aria-hidden="true" />;
	return <ZapIcon className={className} aria-hidden="true" />;
}

/** The list, pure for render tests. */
export function PaletteList({ groups, activeId, listId, optionId, onHover, onPick }: {
	groups: readonly PaletteGroup[];
	activeId: string | null;
	listId: string;
	optionId: (entry: PaletteEntry) => string;
	onHover: (id: string) => void;
	onPick: (entry: PaletteEntry) => void;
}) {
	return (
		<div id={listId} role="listbox" aria-label="Commands" data-testid="command-palette-list" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pb-1">
			{groups.map((group) => (
				<div key={group.label} role="group" aria-label={group.label} className="flex flex-col">
					<div className="px-2.5 pb-0.5 pt-1.5 text-sm text-faint" aria-hidden="true">{group.label}</div>
					{group.entries.map((entry) => (
						<div
							key={entry.id}
							id={optionId(entry)}
							role="option"
							aria-selected={entry.id === activeId}
							data-testid="command-palette-option"
							data-entry-id={entry.id}
							onPointerMove={() => onHover(entry.id)}
							// Keep focus in the field; the pick closes the dialog.
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => onPick(entry)}
							className={cn("flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1 text-md text-ink pointer-coarse:min-h-11", entry.id === activeId && "bg-shelf")}
						>
							<EntryIcon entry={entry} />
							<span className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
							{entry.label}
							{entry.kind === "passage" && entry.hit.snippet && <DocSnippetText snippet={entry.hit.snippet} className="text-sm text-graphite" />}
						</span>
							{entry.meta && <span className="min-w-0 shrink-[2] truncate text-sm text-faint">{entry.meta}</span>}
						</div>
					))}
				</div>
			))}
		</div>
	);
}

/** Cmd/Ctrl+K: a combobox over a listbox (feature 015). Nothing here calls a
 *  model or sends anything: every entry navigates or opens. */
export default function CommandPaletteDialog({ open, onOpenChange, opener }: CommandPaletteProps) {
	const router = useRouter();
	const pathname = usePathname();
	const pane = usePagePane();
	const workspace = useWorkspace();
	const sidebar = useSidebar();
	const { open: openSettings } = useSettingsDialog();
	const { chats, loadError, refresh } = useSessionList();
	useSessionListDemand(open);
	const library = useLibrarySnapshot(open);
	const [query, setQuery] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const listId = useId();
	const baseId = useId();
	const input = useRef<HTMLInputElement>(null);
	// A pick that moves focus itself says so; Escape returns to the opener.
	const skipReturn = useRef(false);

	useEffect(() => {
		if (!open) return;
		setQuery("");
		setActiveId(null);
		setFailure(null);
		skipReturn.current = false;
	}, [open]);

	const inSession = chatIdOfPath(pathname) !== null;
	const sessionId = chatIdOfPath(pathname);
	const inLesson = sessionId !== null && chats?.find((chat) => chat.id === sessionId)?.kind !== "practice";
	const entries = useMemo(() => buildPaletteEntries({ inSession, inLesson, chats: chats ?? [], items: library.items ?? [], folders: library.folders }), [inSession, inLesson, chats, library.items, library.folders]);
	const documents = useDocumentSearch({ query, limit: 8 }, open);
	const groups = useMemo(() => {
		const ranked = rankPalette(entries, query);
		const found = query.trim() ? passageGroup(documents.response?.results ?? []) : null;
		return found ? [...ranked, found] : ranked;
	}, [entries, query, documents.response]);
	const flat = useMemo(() => groups.flatMap((group) => group.entries), [groups]);
	const active = flat.find((entry) => entry.id === activeId) ?? flat[0] ?? null;
	const optionId = (entry: PaletteEntry) => `${baseId}-${entry.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

	useEffect(() => {
		if (!open || !active) return;
		document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
	}, [open, active?.id]);

	const close = () => onOpenChange(false);
	const go = (href: string) => { skipReturn.current = true; close(); router.push(href); };

	const runAction = async (action: PaletteActionId) => {
		const href = ROUTES[action];
		if (href) { go(href); return; }
		switch (action) {
			case "new-page": {
				const result = await createBlankPage();
				if ("error" in result) { setFailure(`New page · ${result.error}`); return; }
				const { item } = result;
				skipReturn.current = true;
				close();
				if (workspace) workspace.openItem(item);
				else pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size });
				return;
			}
			case "new-diagram": {
				const { createDiagram } = await import("@/components/diagram/new-diagram-dialog.tsx");
				const result = await createDiagram("Untitled diagram", "diagram", null, true);
				if ("error" in result) { setFailure(`New diagram · ${result.error}`); return; }
				const { item } = result;
				skipReturn.current = true;
				close();
				if (workspace) workspace.openItem(item);
				else pane?.open({ id: item.id, name: item.name, kind: item.kind, size: item.size });
				return;
			}
			case "open-settings":
				skipReturn.current = true;
				close();
				if (sidebar.overlay) sidebar.close();
				openSettings(undefined, undefined, opener.current ?? undefined);
				return;
			case "toggle-sidebar":
				close();
				sidebar.toggle();
				return;
			case "toggle-right-pane":
				close();
				workspace?.toggleRightPane();
				return;
			case "choose-model":
				skipReturn.current = true;
				close();
				window.dispatchEvent(new CustomEvent(kbdEventForAction("open-model-picker")));
				return;
			case "study-notes": {
				if (!sessionId) return;
				const result = await createStudyNotes(sessionId);
				if ("error" in result) { setFailure(`Study notes · ${result.error}`); return; }
				skipReturn.current = true;
				close();
				if (workspace) workspace.openItem(result.item);
				else pane?.open({ id: result.item.id, name: result.item.name, kind: result.item.kind, size: result.item.size });
				return;
			}
			case "make-cards":
				if (sessionId) go(`/review?make=${encodeURIComponent(`lesson:${sessionId}`)}`);
				return;
			case "save-passage":
				skipReturn.current = true;
				close();
				window.dispatchEvent(new CustomEvent(SAVE_PASSAGE_EVENT));
				return;
			case "show-shortcuts":
				close();
				window.dispatchEvent(new CustomEvent(kbdEventForAction("cheat-sheet")));
				return;
			case "switch-to-notebook":
				skipReturn.current = true;
				close();
				if (sidebar.overlay) sidebar.close();
				void switchInterface("notebook", (href) => router.push(href));
				return;
		}
	};

	const pick = (entry: PaletteEntry) => {
		if (entry.kind === "action") { void runAction(entry.action); return; }
		if (entry.kind === "session") { go(`/chat/${encodeURIComponent(entry.chatId)}`); return; }
		if (entry.kind === "folder") { go(`/library?folder=${encodeURIComponent(entry.folderId)}`); return; }
		skipReturn.current = true;
		close();
		if (sidebar.overlay) sidebar.close();
		if (entry.kind === "passage") {
			workspace?.openItem({ id: entry.hit.itemId, name: entry.hit.name, kind: entry.hit.kind, size: entry.hit.size }, entry.hit.jump ?? undefined);
			return;
		}
		workspace?.openItem(entry.item);
	};

	const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
		if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
			event.preventDefault();
			event.stopPropagation();
			close();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const n = flat.length;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			if (n === 0) return;
			const at = active ? flat.indexOf(active) : -1;
			setActiveId(flat[(at + (event.key === "ArrowDown" ? 1 : -1) + n) % n]!.id);
		} else if (event.key === "Enter") {
			event.preventDefault();
			if (active) pick(active);
		}
	};

	const librarySettling = query.trim() !== "" || flat.length === 0;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				aria-describedby={undefined}
				data-testid="command-palette"
				className="top-[10dvh] flex max-h-[min(70dvh,32rem)] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl border-0 bg-paper shadow-lift p-0 sm:max-w-xl"
				onOpenAutoFocus={(event) => { event.preventDefault(); input.current?.focus(); }}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					if (!skipReturn.current && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
				}}
			>
				<DialogTitle className="sr-only">Command palette</DialogTitle>
				<label className="flex h-11 shrink-0 items-center gap-2 rounded-t-lg px-3 text-faint focus-within:bg-shelf">
					<SearchIcon className="ui-icon shrink-0" aria-hidden="true" />
					<input
						ref={input}
						role="combobox"
						aria-expanded={flat.length > 0}
						aria-controls={listId}
						aria-autocomplete="list"
						aria-activedescendant={active ? optionId(active) : undefined}
						aria-label="Search sessions, the Library and actions"
						autoComplete="off"
						spellCheck={false}
						data-testid="command-palette-input"
						value={query}
						onChange={(event) => { setQuery(event.target.value); setActiveId(null); setFailure(null); }}
						onKeyDown={onKeyDown}
						placeholder="Search or run an action…"
						className="min-w-0 flex-1 bg-transparent text-md text-ink outline-none placeholder:text-faint"
					/>
				</label>
				{failure && <p role="alert" data-testid="command-palette-failure" className="px-3 pb-1 text-sm text-red">{failure}</p>}
				<PaletteList groups={groups} activeId={active?.id ?? null} listId={listId} optionId={optionId} onHover={setActiveId} onPick={pick} />
				{flat.length === 0 && query.trim() !== "" && documents.phase !== "searching" && <p role="status" data-testid="command-palette-empty" className="px-3 pb-3 text-sm text-graphite">Nothing matched</p>}
				{documents.phase === "searching" && <p role="status" className="px-3 pb-2 text-sm text-faint">Searching inside your documents…</p>}
				{documents.phase === "failed" && (
					<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-graphite">
						<p>Your documents could not be searched.</p>
						<button type="button" className="prompt-secondary" onClick={documents.retry}>Try again</button>
					</div>
				)}
				{documents.response && documents.phase === "done" && <p role="status" aria-live="polite" className="sr-only" data-testid="command-palette-doc-count">{docCountText(documents.response.results.length, documents.response.total)} inside your documents</p>}
				{/* Each source reports for itself: the others stay usable. */}
				{librarySettling && library.items === null && !library.failed && <p role="status" className="px-3 pb-2 text-sm text-faint">Loading your Library…</p>}
				{library.failed && (
					<div role="status" data-testid="command-palette-library-failed" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-graphite">
						<p>Your Library could not be loaded.</p>
						<button type="button" className="prompt-secondary" onClick={library.retry}>Try again</button>
					</div>
				)}
				{chats === null && (loadError
					? <div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-graphite"><p>Could not load sessions.</p><button type="button" className="prompt-secondary" onClick={() => void refresh()}>Try again</button></div>
					: <p role="status" className="px-3 pb-2 text-sm text-faint">Loading sessions…</p>)}
			</DialogContent>
		</Dialog>
	);
}
