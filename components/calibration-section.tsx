"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { levelLine, mergeCalibration, messageAnchorId, type ChatListItem, type MergedMiss } from "@/src/core";
import { useSessionList, useSessionListDemand } from "@/components/session-list";
import { shortAgo } from "@/components/sidebar";
import { Teaser, teaserPlain } from "@/components/teaser";

/** Rows shown before "Show all" (owner, 2026-10-28). */
const FIRST_MISSES = 5;

/** A miss opens its session at the teacher message before the check. */
export function missHref(miss: Pick<MergedMiss, "chatId" | "messageId">): string {
	const base = `/chat/${encodeURIComponent(miss.chatId)}`;
	return miss.messageId ? `${base}#${encodeURIComponent(messageAnchorId(miss.messageId))}` : base;
}

/**
 * Home's "Calibration" (feature 004): how stated confidence matched graded
 * results across every session, from the shared session list (no request
 * of its own). Hidden until an answer counts (owner). The list's own
 * loading and failure states show in "Waiting for you"; a failed refresh
 * keeps the last list here too.
 */
export function CalibrationSection() {
	const { chats } = useSessionList();
	useSessionListDemand(true);
	return <CalibrationSectionView chats={chats} />;
}

/** The section as a pure function of the list. Exported for render tests. */
export function CalibrationSectionView({ chats }: { chats: readonly ChatListItem[] | null }) {
	const headingId = useId();
	const missesId = useId();
	const merged = useMemo(() => (chats ? mergeCalibration(chats) : null), [chats]);
	const [showAll, setShowAll] = useState(false);
	if (!merged || merged.levels.length === 0) return null;
	const shown = showAll ? merged.misses : merged.misses.slice(0, FIRST_MISSES);
	return (
		<section aria-labelledby={headingId} data-testid="calibration-section" className="flex flex-col gap-2">
			<h2 id={headingId} className="px-1 text-xl font-semibold leading-[1.3]">Calibration</h2>
			<ul className="flex flex-col gap-0.5 px-1">
				{merged.levels.map((level) => (
					<li key={level.level} className="text-base text-foreground">{levelLine(level)}</li>
				))}
			</ul>
			<h3 id={missesId} className="px-1 pt-2 text-sm font-medium text-muted-foreground">Wrong while Certain</h3>
			{merged.misses.length === 0 ? (
				<p className="px-1 text-ink-2">None yet. Every answer you marked Certain was right.</p>
			) : (
				<>
					<ul aria-labelledby={missesId} className="flex flex-col gap-1">
						{shown.map((miss) => <MissRow key={`${miss.chatId}/${miss.toolCallId}`} miss={miss} />)}
					</ul>
					{!showAll && merged.misses.length > FIRST_MISSES && (
						<button type="button" onClick={() => setShowAll(true)} className="prompt-secondary self-start">
							Show all {merged.misses.length}
						</button>
					)}
				</>
			)}
		</section>
	);
}

function MissRow({ miss }: { miss: MergedMiss }) {
	const id = useId();
	return (
		<li className="waiting-row" data-testid="calibration-miss" data-no-kind="">
			<span id={`${id}-meta`} suppressHydrationWarning className="waiting-row-meta min-w-0 truncate text-sm font-medium text-muted-foreground">
				{miss.title} · {shortAgo(miss.answeredAt)}
			</span>
			<p id={`${id}-teaser`} className="waiting-row-teaser min-w-0 text-lg leading-[27px] text-foreground">
				<Teaser text={teaserPlain(miss.question)} />
			</p>
			<Link
				href={missHref(miss)}
				aria-describedby={`${id}-teaser ${id}-meta`}
				data-quiet=""
				className="waiting-row-action prompt-primary"
			>
				Review
			</Link>
		</li>
	);
}
