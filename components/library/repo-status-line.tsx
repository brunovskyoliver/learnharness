"use client";

import { useEffect, useState } from "react";
import { syncStatusText, type RepoLinkView, type SkippedReason } from "@/src/core";
import { BlotGlyph } from "@/components/paper/blot";
import { StatusSwap } from "@/components/paper/status-swap";

/** A clock that moves once a minute, enough for "Synced {n} min ago". */
function useMinuteClock(): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

const REASON: Record<SkippedReason, string> = {
	"too-large": "over 50 MB",
	"bad-name": "name can't be used",
	lfs: "Git LFS file",
	submodule: "submodule",
	symlink: "symbolic link",
	"content-mismatch": "contents don't match its type",
};

const busy = (link: RepoLinkView) => link.sync.state === "syncing" || link.sync.state === "never";

/** The blot that waits beside "Syncing…"; static under reduced motion (paper.css). */
const Blot = () => <span className="nb-ink-wait" aria-hidden="true"><BlotGlyph className="nb-ink-wait-blot" size={11} /></span>;

/** "Synced 3 min ago" and friends, for a linked folder's row meta: text only, no actions. */
export function RepoStatusText({ link }: { link: RepoLinkView }) {
	const now = useMinuteClock();
	return (
		<span className="inline-flex items-center gap-1.5" data-testid="repo-status-text">
			{busy(link) && <Blot />}
			<StatusSwap swapKey={link.sync.state} text={syncStatusText(link.sync, now)}>{syncStatusText(link.sync, now)}</StatusSwap>
		</span>
	);
}

/** The status line under a linked folder's title (ui-contract.md): state, time,
 *  failure with "Show details" and "Sync now", skipped files with "Show which".
 *  A polite live region; the minute-by-minute time is kept out of it, so only
 *  a change of state is announced. */
export function RepoStatusLine({ link, onSyncNow }: { link: RepoLinkView; onSyncNow: () => void }) {
	const now = useMinuteClock();
	const [details, setDetails] = useState(false);
	const [which, setWhich] = useState(false);
	const { sync } = link;
	const text = syncStatusText(sync, now);
	const failed = sync.state === "failed";
	// The time part ("3 min ago") changes every minute; it isn't news.
	const timed = sync.state === "synced" && text.startsWith("Synced ") ? { head: "Synced", tail: text.slice("Synced".length) } : null;
	const skipped = sync.skipped;
	const otherTypes = skipped?.unsupported ?? 0;
	const skippedCount = (skipped?.named.length ?? 0) + otherTypes;
	return (
		<div className="flex flex-col gap-1 text-sm text-faint" data-testid="repo-status-line">
			<p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 [overflow-wrap:anywhere]">
				<span role="status" aria-live="polite" className="inline-flex flex-wrap items-center gap-1.5" data-testid="repo-status">
					{busy(link) && <Blot />}
					{/* Row 24 (feature 028): a change of state settles in over the old words. */}
					<StatusSwap swapKey={failed ? `failed:${sync.failure?.message ?? ""}` : timed ? "synced" : text} text={failed ? `Sync failed · ${sync.failure?.message ?? "The repo couldn't be pulled."}` : text}>
						{failed ? (
							<span>Sync failed<span className="text-red"> · {sync.failure?.message ?? "The repo couldn't be pulled."}</span></span>
						) : timed ? (
							<span>{timed.head}<span aria-live="off">{timed.tail}</span></span>
						) : text}
					</StatusSwap>
				</span>
				{!failed && skippedCount > 0 && (
					<>
						<span>· {skippedCount} {skippedCount === 1 ? "file" : "files"} skipped</span>
						<button type="button" className="lh-text-action" aria-expanded={which} onClick={() => setWhich((on) => !on)} data-testid="repo-status-which">{which ? "Hide which" : "Show which"}</button>
					</>
				)}
				{failed && (
					<>
						{sync.failure?.detail && <button type="button" className="lh-text-action" aria-expanded={details} onClick={() => setDetails((on) => !on)} data-testid="repo-status-details">{details ? "Hide details" : "Show details"}</button>}
						<button type="button" className="lh-text-action" onClick={onSyncNow} data-testid="repo-status-sync">Sync now</button>
					</>
				)}
			</p>
			{failed && details && sync.failure?.detail && (
				<pre className="whitespace-pre-wrap font-mono text-xs text-graphite [overflow-wrap:anywhere]" data-testid="repo-status-detail">{sync.failure.detail}</pre>
			)}
			{which && skipped && (
				<ul className="flex flex-col gap-0.5 text-xs" data-testid="repo-status-skipped">
					{skipped.named.map((file) => (
						<li key={file.path} className="[overflow-wrap:anywhere]"><span className="font-mono text-graphite">{file.path}</span> · {REASON[file.reason]}</li>
					))}
					{otherTypes > 0 && <li>{otherTypes} {otherTypes === 1 ? "file" : "files"} of other types</li>}
				</ul>
			)}
		</div>
	);
}
