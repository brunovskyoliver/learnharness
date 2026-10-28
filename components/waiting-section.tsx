"use client";

import Link from "next/link";
import { useId, useMemo } from "react";
import type { ChatListItem, WaitingItem } from "@/src/core";
import { useSessionList, useSessionListDemand } from "@/components/session-list";
import { shortAgo } from "@/components/sidebar";
import { Teaser, teaserPlain } from "@/components/teaser";
import { Skeleton } from "@/components/ui/skeleton";

type Waiting = ChatListItem & { waiting: WaitingItem };

/** Every session waiting on the learner, newest posed first (feature 002). */
export function waitingSessions(chats: readonly ChatListItem[]): Waiting[] {
	return chats
		.filter((chat): chat is Waiting => chat.waiting !== undefined)
		.sort((a, b) => b.waiting.postedAt.localeCompare(a.waiting.postedAt));
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
	return (
		<section aria-labelledby={headingId} data-testid="waiting-section" className="flex flex-col gap-2">
			<div className="flex items-baseline gap-2.5 px-1">
				<h2 id={headingId} className="text-xl font-semibold leading-[1.3]">Waiting for you</h2>
				{items && items.length > 0 && <span className="text-sm font-medium text-muted-foreground">{items.length} open</span>}
			</div>
			{items === null ? (
				loadError ? (
					<div role="status" className="flex flex-wrap items-center gap-2 px-1 text-ink-2">
						<p>Could not load what is waiting.</p>
						<button type="button" onClick={onRetry} className="prompt-secondary">Try again</button>
					</div>
				) : (
					<div role="status" aria-label="Loading what is waiting" className="flex flex-col gap-1">
						<Skeleton className="h-[75px] w-full rounded-[10px]" />
						<Skeleton className="h-[75px] w-full rounded-[10px]" />
					</div>
				)
			) : items.length === 0 ? (
				<p className="px-1 text-ink-2">Nothing is waiting. Every check is answered and every problem solved.</p>
			) : (
				<ul className="flex flex-col gap-1">
					{items.map((chat) => <WaitingRow key={chat.id} chat={chat} />)}
				</ul>
			)}
		</section>
	);
}

function WaitingRow({ chat }: { chat: Waiting }) {
	const id = useId();
	const { kind, action, teaser, postedAt } = chat.waiting;
	return (
		<li className="waiting-row" data-testid="waiting-row">
			<span className="waiting-row-kind text-sm font-medium text-primary">{kind}</span>
			<span id={`${id}-meta`} suppressHydrationWarning className="waiting-row-meta min-w-0 truncate text-sm font-medium text-muted-foreground">
				{chat.title} · {shortAgo(postedAt)}
			</span>
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-lg leading-[27px] text-foreground">
				<Teaser text={teaserPlain(teaser)} />
			</p>
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
