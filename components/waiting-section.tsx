"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { dueRowText, type ChatListItem, type LessonProgress, type ReviewQueue, type WaitingItem } from "@/src/core";
import { useServerEvent } from "@/components/server-events";
import { useSessionList, useSessionListDemand } from "@/components/session-list";
import { shortAgo } from "@/components/sidebar";
import { Teaser, teaserPlain } from "@/components/teaser";
import { Skeleton } from "@/components/ui/skeleton";
import { inkOrder } from "@/components/paper/motion-arrival";

type Waiting = ChatListItem & { waiting: WaitingItem };
type Unfinished = ChatListItem & { progress: LessonProgress };

/** Every session waiting on the learner, newest posed first (feature 002). */
export function waitingSessions(chats: readonly ChatListItem[]): Waiting[] {
	return chats
		.filter((chat): chat is Waiting => chat.waiting !== undefined)
		.sort((a, b) => b.waiting.postedAt.localeCompare(a.waiting.postedAt));
}

/** Lessons with topics left and nothing waiting (feature 003), last active first. */
export function continueSessions(chats: readonly ChatListItem[]): Unfinished[] {
	return chats
		.filter((chat): chat is Unfinished => chat.progress !== undefined && chat.waiting === undefined)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Continue: the lesson opens at the bottom with the next topic drafted (unsent). */
export function continueHref(chat: Pick<ChatListItem, "id">): string {
	return `/chat/${encodeURIComponent(chat.id)}?continue=1`;
}

export function progressLine(progress: LessonProgress, course?: { covered: number; items: number }): string {
	const line = `${progress.left} of ${progress.total} topics left · next: ${progress.next}`;
	// The course syllabus (feature 006), appended when one is recorded.
	return course ? `${line} · Course: ${course.covered} of ${course.items} covered` : line;
}

/** The answer link: the session opens with its prompt bar expanded on this item. */
export function answerHref(chat: Waiting): string {
	return `/chat/${encodeURIComponent(chat.id)}?answer=${encodeURIComponent(chat.waiting.toolCallId)}`;
}

/**
 * Home's "Waiting for you" (feature 002): every unanswered check and open
 * problem across sessions, from the shared session list (no request of its
 * own). Loading, empty, failed and populated are distinct; a failed refresh
 * keeps the last list.
 */
export function WaitingSection() {
	const { chats, loadError, refresh } = useSessionList();
	useSessionListDemand(true);
	const cards = useDueCards();
	return <WaitingSectionView chats={chats} loadError={loadError} onRetry={() => void refresh()} cards={cards} />;
}

/** What Home shows of the flashcards (feature 021): how many, never a card. */
export interface DueCards { due: number; weakDue: number; failed: boolean; retry: () => void }

function useDueCards(): DueCards {
	const [state, setState] = useState({ due: 0, weakDue: 0, failed: false });
	const ticket = useRef(0);
	const load = useCallback(async () => {
		const mine = ++ticket.current;
		try {
			const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
			const response = await fetch(`/api/cards/queue?tz=${encodeURIComponent(zone)}`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const { queue } = await response.json() as { queue: ReviewQueue };
			if (mine === ticket.current) setState({ due: queue.due, weakDue: queue.weakDue, failed: false });
		} catch {
			// A failed refresh keeps the last count.
			if (mine === ticket.current) setState((last) => ({ ...last, failed: true }));
		}
	}, []);
	useEffect(() => { void load(); }, [load]);
	useServerEvent("cards-changed", () => void load());
	return { ...state, retry: () => void load() };
}

/** The section as a pure function of the list state. Exported for render tests. */
export function WaitingSectionView({ chats, loadError, onRetry, cards }: { chats: readonly ChatListItem[] | null; loadError: boolean; onRetry: () => void; cards?: DueCards }) {
	const headingId = useId();
	const items = useMemo(() => (chats ? waitingSessions(chats) : null), [chats]);
	const lessons = useMemo(() => (chats ? continueSessions(chats) : []), [chats]);
	const due = cards?.due ?? 0;
	const open = (items?.length ?? 0) + lessons.length + (due > 0 ? 1 : 0);
	return (
		<section aria-labelledby={headingId} data-testid="waiting-section" className="flex flex-col gap-2">
			{/* Home's reading order (feature 028): after its heading (0) and composer (1). */}
			<div className="flex items-baseline gap-2.5" {...inkOrder(2)}>
				<h2 id={headingId} className="text-lg font-[550] leading-heading text-ink">Waiting for you</h2>
				{items && open > 0 && <span className="text-meta text-faint">{open} open</span>}
			</div>
			{items === null ? (
				loadError ? (
					<div role="status" className="flex flex-wrap items-center gap-2 text-graphite">
						<p>Could not load what is waiting.</p>
						<button type="button" onClick={onRetry} className="lh-text-action">Try again</button>
					</div>
				) : (
					<div role="status" aria-label="Loading what is waiting" className="flex flex-col gap-1">
						<Skeleton className="h-[68px] w-full rounded-lg" />
						<Skeleton className="h-[68px] w-full rounded-lg" />
					</div>
				)
			) : open === 0 ? (
				<p className="text-md text-faint">Nothing is waiting. Every check is answered and every problem solved.</p>
			) : (
				<ul className="waiting-list flex flex-col">
					{items.map((chat, i) => <WaitingRow key={chat.id} chat={chat} order={3 + i} />)}
					{lessons.map((chat, i) => <LessonRow key={chat.id} chat={chat} order={3 + items.length + i} />)}
					{due > 0 && <CardsRow due={due} weakDue={cards?.weakDue ?? 0} order={3 + items.length + lessons.length} />}
				</ul>
			)}
			{cards?.failed && (
				<div role="status" data-testid="waiting-cards-failed" className="flex flex-wrap items-center gap-2 text-sm text-graphite">
					<p>Could not count your flashcards.</p>
					<button type="button" onClick={cards.retry} className="lh-text-action">Try again</button>
				</div>
			)}
		</section>
	);
}

/** "{session} · {time}" on a Home row: the title truncates, the time never
 *  does — on phones a long title would otherwise hide it. */
export function RowMeta({ id, title, at }: { id: string; title: string; at: string }) {
	return (
		<span id={id} suppressHydrationWarning className="waiting-row-meta flex min-w-0 text-meta text-faint">
			<span className="min-w-0 truncate">{title}</span>
			<span className="shrink-0 whitespace-pre"> · {shortAgo(at)}</span>
		</span>
	);
}

function WaitingRow({ chat, order }: { chat: Waiting; order: number }) {
	const id = useId();
	const { kind, action, teaser, postedAt } = chat.waiting;
	return (
		<li className="waiting-row" data-testid="waiting-row" data-progress={chat.progress ? "" : undefined} {...inkOrder(order)}>
			<span className="waiting-row-kind text-sm font-medium text-bulb-ink">{kind}</span>
			<RowMeta id={`${id}-meta`} title={chat.title} at={postedAt} />
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-base leading-row text-graphite">
				<Teaser text={teaserPlain(teaser)} />
			</p>
			{chat.progress && <span className="waiting-row-progress min-w-0 text-sm text-faint">{progressLine(chat.progress, chat.course)}</span>}
			<Link
				href={answerHref(chat)}
				aria-describedby={`${id}-teaser ${id}-meta`}
				className="waiting-row-action lh-tool"
			>
				{action}
			</Link>
		</li>
	);
}

/** A lesson with topics left and nothing waiting (feature 003): the waiting
 *  row's grid, the progress line in the teaser slot, a quiet Continue. */
function LessonRow({ chat, order }: { chat: Unfinished; order: number }) {
	const id = useId();
	return (
		<li className="waiting-row" data-testid="waiting-row" {...inkOrder(order)}>
			<span className="waiting-row-kind text-sm font-medium text-bulb-ink">Lesson</span>
			<RowMeta id={`${id}-meta`} title={chat.title} at={chat.updatedAt} />
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-base leading-row text-graphite">
				{progressLine(chat.progress, chat.course)}
			</p>
			<Link
				href={continueHref(chat)}
				aria-describedby={`${id}-teaser ${id}-meta`}
				className="waiting-row-action lh-tool"
			>
				Continue
			</Link>
		</li>
	);
}

/** The day's flashcards (feature 021): one row, however many are due. */
function CardsRow({ due, weakDue, order }: { due: number; weakDue: number; order: number }) {
	const id = useId();
	return (
		<li className="waiting-row" data-testid="waiting-cards-row" {...inkOrder(order)}>
			<span className="waiting-row-kind text-sm font-medium text-bulb-ink">Flashcards</span>
			<span id={`${id}-meta`} className="waiting-row-meta min-w-0 truncate text-meta text-faint">{weakDue > 0 ? `${weakDue} on weak ideas` : "Today"}</span>
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-base leading-row text-graphite">{dueRowText(due)}</p>
			<Link href="/review" aria-describedby={`${id}-teaser ${id}-meta`} className="waiting-row-action lh-tool">Review</Link>
		</li>
	);
}
