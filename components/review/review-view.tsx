"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlusIcon } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { RouteContent } from "@/components/paper/route-content";
import { useServerEvent } from "@/components/server-events";
import { cardFetch, failed } from "./card-api.ts";
import { CardEditorDialog, CardHistoryDialog, DeleteForGoodDialog, type EditorTarget } from "./card-dialogs.tsx";
import { useCardDraftStore } from "./card-draft.ts";
import { AllCards, DeletedCards, DraftList, ListStates, type CardListData } from "./card-lists.tsx";
import { MakePanel } from "./make-panel.tsx";
import { QueuePanel } from "./queue-panel.tsx";

const VIEWS = { due: "Due", cards: "All cards", drafts: "Drafts", deleted: "Deleted" } as const;
type ViewName = keyof typeof VIEWS;

/** `/review`: the day's queue, every card, drafts waiting, and what was deleted. */
export function ReviewView() {
	const params = useSearchParams();
	const router = useRouter();
	const raw = params.get("view");
	const view: ViewName = raw === "cards" || raw === "drafts" || raw === "deleted" ? raw : "due";
	const make = params.get("make");
	const wantsNew = params.get("new") === "1";
	const drafts = useCardDraftStore();

	const [draftCount, setDraftCount] = useState<number | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [data, setData] = useState<CardListData | null>(null);
	const [listFailed, setListFailed] = useState(false);
	const [note, setNote] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [editor, setEditor] = useState<EditorTarget | null>(null);
	const [historyOf, setHistoryOf] = useState<string | null>(null);
	const [deleteOf, setDeleteOf] = useState<string | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	const remember = () => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; };
	const refocus = () => { const at = opener.current; if (at?.isConnected) requestAnimationFrame(() => at.focus({ preventScroll: true })); };

	const loadList = useCallback(async () => {
		const body = await cardFetch<CardListData>("/api/cards");
		if (failed(body)) { setListFailed(true); return; }
		setListFailed(false);
		setData(body);
		setDraftCount(body.drafts.length);
	}, []);
	const listShown = view !== "due" && !make;
	useEffect(() => { if (listShown) void loadList(); }, [listShown, loadList, refreshKey]);
	useServerEvent("cards-changed", () => { if (listShown) void loadList(); });

	// Reopen what a reload interrupted, and honor the palette's New card.
	const reopened = useRef(false);
	useEffect(() => {
		if (reopened.current) return;
		reopened.current = true;
		const open = drafts.readOpen();
		if (wantsNew) { remember(); setEditor({ mode: "new" }); router.replace("/review"); return; }
		if (open) setEditor(open === "new" ? { mode: "new" } : { mode: "edit", id: open });
		// Once, on arrival.
	}, []);

	const changed = (message: string) => {
		setFailure(null);
		setNote(message);
		setRefreshKey((key) => key + 1);
	};
	const edit = (id: string) => { remember(); setEditor({ mode: "edit", id }); };
	const history = (id: string) => { remember(); setHistoryOf(id); };
	const newCard = () => { remember(); setEditor({ mode: "new" }); };

	const hrefOf = (name: ViewName) => (name === "due" ? "/review" : `/review?view=${name}`);
	return (
		<div className="relative flex h-dvh flex-col">
			<TopBar tabs />
			<div data-testid="review-scroll" className="min-h-0 flex-1 overflow-y-auto">
				{/* The content inks in as one on arrival (feature 028); its panels load their own rows. */}
				<RouteContent className="mx-auto flex w-full max-w-[52rem] flex-col gap-4 px-4 pb-12 pt-3 sm:pt-11">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h1 className="tracking-title text-2xl font-medium leading-title">Review</h1>
						<button type="button" className="lh-tool" data-testid="review-new" onClick={newCard}>
							<PlusIcon aria-hidden="true" />
							New card
						</button>
					</div>
					<nav aria-label="Flashcard views" className="nb-set-pills" data-testid="review-views">
						{(Object.keys(VIEWS) as ViewName[]).map((name) => (
							<Link key={name} href={hrefOf(name)} aria-current={view === name && !make ? "page" : undefined} className="nb-set-pill">
								{VIEWS[name]}{name === "drafts" && draftCount ? ` (${draftCount})` : ""}
							</Link>
						))}
					</nav>
					{note && <p role="status" data-testid="review-note" className="text-sm text-graphite">{note}</p>}
					{failure && <p role="alert" data-testid="review-failure" className="text-sm text-red">{failure}</p>}

					{make ? (
						<MakePanel param={make} onStarted={() => router.push("/review?view=drafts")} onCancel={() => router.push("/review")} onByHand={(source, label) => { remember(); drafts.clear("new"); setEditor({ mode: "new", source, sourceLabel: label }); router.replace("/review"); }} />
					) : view === "due" ? (
						<QueuePanel refreshKey={refreshKey} busyLayer={editor !== null || historyOf !== null} onDrafts={setDraftCount} onEdit={edit} onHistory={history} onNew={newCard} />
					) : (
						<ListStates data={data} failure={listFailed} onRetry={() => void loadList()} label="Loading your flashcards">
							{(list) => view === "cards"
								? <AllCards cards={list.cards} onEdit={edit} onHistory={history} onChanged={changed} onFailure={setFailure} />
								: view === "drafts"
									? <DraftList drafts={list.drafts} runs={list.runs} onEdit={edit} onChanged={changed} onFailure={setFailure} />
									: <DeletedCards cards={list.cards} onDeleteForGood={(id) => { remember(); setDeleteOf(id); }} onChanged={changed} onFailure={setFailure} />}
						</ListStates>
					)}
				</RouteContent>
			</div>
			<CardEditorDialog target={editor} onClose={() => { setEditor(null); refocus(); }} onSaved={(message) => { setEditor(null); changed(message); refocus(); }} />
			<CardHistoryDialog cardId={historyOf} onClose={() => { setHistoryOf(null); refocus(); }} />
			<DeleteForGoodDialog cardId={deleteOf} onClose={() => { setDeleteOf(null); refocus(); }} onDone={() => { setDeleteOf(null); changed("Card deleted for good."); }} />
		</div>
	);
}
