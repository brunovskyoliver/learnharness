"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import type { ChatListItem, LessonProgress, WaitingItem } from "@/src/core";
import { useSessionList, useSessionListDemand } from "@/components/session-list";
import { shortAgo } from "@/components/sidebar";
import { Teaser, teaserPlain } from "@/components/teaser";
import { Skeleton } from "@/components/ui/skeleton";

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
	return <WaitingSectionView chats={chats} loadError={loadError} onRetry={() => void refresh()} />;
}

/** The section as a pure function of the list state. Exported for render tests. */
export function WaitingSectionView({ chats, loadError, onRetry }: { chats: readonly ChatListItem[] | null; loadError: boolean; onRetry: () => void }) {
	const headingId = useId();
	const items = useMemo(() => (chats ? waitingSessions(chats) : null), [chats]);
	const lessons = useMemo(() => (chats ? continueSessions(chats) : []), [chats]);
	const open = (items?.length ?? 0) + lessons.length;
	return (
		<section aria-labelledby={headingId} data-testid="waiting-section" className="flex flex-col gap-2">
			<div className="flex items-baseline gap-2.5">
				<h2 id={headingId} className="text-xl font-semibold leading-[1.3]">Waiting for you</h2>
				{items && open > 0 && <span className="text-sm font-medium text-muted-foreground">{open} open</span>}
			</div>
			{items === null ? (
				loadError ? (
					<div role="status" className="flex flex-wrap items-center gap-2 text-ink-2">
						<p>Could not load what is waiting.</p>
						<button type="button" onClick={onRetry} className="prompt-secondary">Try again</button>
					</div>
				) : (
					<div role="status" aria-label="Loading what is waiting" className="flex flex-col gap-1">
						<Skeleton className="h-[75px] w-full rounded-[10px]" />
						<Skeleton className="h-[75px] w-full rounded-[10px]" />
					</div>
				)
			) : open === 0 ? (
				<p className="text-ink-2">Nothing is waiting. Every check is answered and every problem solved.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{items.map((chat) => <WaitingRow key={chat.id} chat={chat} />)}
					{lessons.map((chat) => <LessonRow key={chat.id} chat={chat} />)}
				</ul>
			)}
		</section>
	);
}

/** "{session} · {time}" on a Home row: the title truncates, the time never
 *  does — on phones a long title would otherwise hide it. */
export function RowMeta({ id, title, at }: { id: string; title: string; at: string }) {
	return (
		<span id={id} suppressHydrationWarning className="waiting-row-meta flex min-w-0 text-sm font-medium text-muted-foreground">
			<span className="min-w-0 truncate">{title}</span>
			<span className="shrink-0 whitespace-pre"> · {shortAgo(at)}</span>
		</span>
	);
}

function WaitingRow({ chat }: { chat: Waiting }) {
	const id = useId();
	const { kind, action, teaser, postedAt } = chat.waiting;
	return (
		<li className="waiting-row" data-testid="waiting-row" data-progress={chat.progress ? "" : undefined}>
			<span className="waiting-row-kind text-sm font-medium text-primary">{kind}</span>
			<RowMeta id={`${id}-meta`} title={chat.title} at={postedAt} />
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-lg leading-[27px] text-foreground">
				<Teaser text={teaserPlain(teaser)} />
			</p>
			{chat.progress && <span className="waiting-row-progress min-w-0 text-sm text-muted-foreground">{progressLine(chat.progress, chat.course)}</span>}
			<Link
				href={answerHref(chat)}
				aria-describedby={`${id}-teaser ${id}-meta`}
				data-quiet=""
				className="waiting-row-action prompt-primary"
			>
				{action}
			</Link>
		</li>
	);
}

/** A lesson with topics left and nothing waiting (feature 003): the waiting
 *  row's grid, the progress line in the teaser slot, a quiet Continue. */
function LessonRow({ chat }: { chat: Unfinished }) {
	const id = useId();
	return (
		<li className="waiting-row" data-testid="waiting-row">
			<span className="waiting-row-kind text-sm font-medium text-primary">Lesson</span>
			<RowMeta id={`${id}-meta`} title={chat.title} at={chat.updatedAt} />
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-lg leading-[27px] text-foreground">
				{progressLine(chat.progress, chat.course)}
			</p>
			<Link
				href={continueHref(chat)}
				aria-describedby={`${id}-teaser ${id}-meta`}
				data-quiet=""
				className="waiting-row-action prompt-primary"
			>
				Continue
			</Link>
		</li>
	);
}
