"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIcon, BotIcon, FileTextIcon, PenToolIcon, PlayIcon, SearchIcon, SquareIcon, WaypointsIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemGroup } from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CallUsage, JobKind, JobRecord } from "@/src/core";
import { isModelsRefusal, isProviderKeyRefusal, subscriptionLabel, subscriptionLabels } from "@/src/core";
import { formatTokens, planCostLabel } from "@/components/usage-format";
import { activityText, formatElapsed } from "@/components/activity-text";
import { useServerEvent, useServerResync } from "@/components/server-events";

/**
 * THE BACKGROUND-AGENTS SECTION (owner, sidebar round — the successor of
 * the retired bottom-right floating dock): the bottom strip of the LEFT
 * SIDEBAR, one blob per running BACKGROUND process — session sub-agents
 * (research/demo/visual) and global extraction runs. Teaching turns are
 * deliberately NOT here: the section exists to give background processes
 * the observability the learner can't otherwise see; an in-flight teaching
 * turn is fully visible where it happens (user decision, 2026-09).
 *
 * Data: ONE feed of GET /api/activity (jobs across ALL chats, title-joined,
 * oldest-first + extraction runs), fetched when truth moves (events
 * channel, S5) and folded client-side with core/prices.ts.
 * Cost is INFERRED server-side through Pi; the context line is the LAST model call's
 * input+output against the model's limit (JobUsage.lastStep — pending
 * contract) — never a cumulative sum, which would be the wrong number.
 * Absent data renders "—", never zero (the doctrine).
 *
 * Quiet/ambient by design: no entry animations, stable keys, updates land
 * in place — refreshes never flicker. ALWAYS present (owner, sidebar round):
 * empty means EMPTY — the header sits alone, nothing hides; it populates and
 * GROWS when processes run (max-h + internal scroll so a pile never crowds
 * the session list). The sidebar's closed state means the learner opted
 * out — no ambient signal while closed (user decision: invisibility until
 * a clearer observability story wants building). Per blob: kind icon,
 * elapsed, cost, activity line, an explicit END button (POST
 * /api/activity/abort — the wave-4 backend is live): 404/409 mean the
 * process is already gone (refresh, no error); real failures degrade to
 * an inline "Abort failed", never a dead control. Detail (context, model,
 * steps, session link) EXPANDS INLINE — the section scrolls, so a
 * floating popover would clip at its bounds.
 */

// ─── Wire shapes (client-safe mirrors of server/observability.ts) ────────────

/** JobUsage extended by the pending lastStep contract (the context line). */
interface FeedUsage extends NonNullable<JobRecord["usage"]> {
	lastStep?: CallUsage;
}

export interface FeedJob extends JobRecord {
	/** Read-time server estimate; absent on older transport payloads. */
	costUsd?: number | null;
	title: string;
	usage?: FeedUsage;
	/** Server-joined live catalog limit (owner amendment 2026-09-23) —
	 *  null when the model is missing from pi's catalog (no context line). */
	contextLimit: number | null;
}

export interface FeedExtraction {
	/** Unique row id (source id, or "src#i" for chunk jobs). */
	id: string;
	chatId: string;
	part?: { i: number; n: number };
	title: string;
	phase: string;
	startedAt: number;
}

export interface ActivityFeed {
	jobs: FeedJob[];
	extractions: FeedExtraction[];
}

const EMPTY_FEED: ActivityFeed = { jobs: [], extractions: [] };

// ─── The activity feed (composition root: the root layout) ───────────────────

const ActivityContext = createContext<{ feed: ActivityFeed; refresh: () => void }>({
	feed: EMPTY_FEED,
	refresh: () => {},
});

/**
 * THE ACTIVITY FEED, PUSH-DRIVEN (architecture S5, 2026-10-02): the
 * adaptive poll is RETIRED — the dock refetches exactly when truth moves.
 * Every cause is announced on the events channel: extraction phase
 * transitions (activity-changed), job writes
 * (jobs-changed — the running-jobs blobs), and channel resync (reconnect /
 * dev-restart catch-up) — plus the one client-local cause that predates
 * the channel: visibility, a tab becoming visible refetches at once.
 * Announced fetches ride a 250ms trailing debounce (extraction phase
 * bursts); resync and visibility are immediate. A failed
 * fetch keeps the last feed (the dock never flickers to empty on a blip).
 */
export function ActivityProvider({ children }: { children: React.ReactNode }) {
	const [feed, setFeed] = useState<ActivityFeed>(EMPTY_FEED);
	const [nonce, setNonce] = useState(0);
	const refresh = useCallback(() => setNonce((n) => n + 1), []);
	const refreshRef = useRef(refresh);
	refreshRef.current = refresh;
	const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	useEffect(() => {
		let alive = true;
		void (async () => {
			try {
				const res = await fetch("/api/activity");
				if (res.ok) {
					const data = (await res.json()) as Partial<ActivityFeed>;
					if (alive)
						setFeed({ jobs: data.jobs ?? [], extractions: data.extractions ?? [] });
				}
			} catch {
				// transport blip: keep the last feed, announce again next event
			}
		})();
		return () => {
			alive = false;
		};
	}, [nonce]);

	// Announcements → one trailing fetch per burst (the S4 debounce law).
	const scheduleAnnouncedFetch = () => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			debounceRef.current = undefined;
			refreshRef.current();
		}, 250);
	};
	useServerEvent("activity-changed", scheduleAnnouncedFetch);
	useServerEvent("jobs-changed", scheduleAnnouncedFetch);
	// Reconnect catch-up: events missed while the channel was down.
	useServerResync(() => refreshRef.current());

	// The visibility nudge: returning to the tab refetches immediately —
	// anything missed while hidden lands at once.
	useEffect(() => {
		const onVisibility = () => {
			if (document.visibilityState === "visible") setNonce((n) => n + 1);
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => document.removeEventListener("visibilitychange", onVisibility);
	}, []);

	// The debounce timer never outlives the provider.
	useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	return <ActivityContext.Provider value={{ feed, refresh }}>{children}</ActivityContext.Provider>;
}

/** The activity feed seam for the rest of the shell: the dock's data +
 *  its refresh nudge. The remaining nudgers are client-visible causes
 *  (the extract/import buttons — extraction-coverage, graph-view); every
 *  server-side cause announces itself on the events channel now. */
export function useActivity(): { feed: ActivityFeed; refresh: () => void } {
	return useContext(ActivityContext);
}

// ─── Pure presentation helpers (exported for tests) ──────────────────────────

/** One dock blob: the unified view of a job or an extraction run. */
export interface ActivityBlob {
	/** job.id, or the extraction job's row id (source id, or "src#i" for
	 *  chunk jobs — unique per row, per-chunk jobs owner 2026-09-28). */
	id: string;
	process: "job" | "extraction";
	/** Sub-agent kind for jobs (extraction blobs have none). */
	jobKind?: JobKind;
	/** Extraction phase (extracting/auditing/merging/embedding); jobs carry none. */
	phase?: string;
	title: string;
	chatId: string;
	/** ms epoch — blobs order oldest-first and elapsed counts from it. */
	startedAt: number;
	/** Inferred USD cost (jobCost) — null renders "—". */
	cost: number | null;
	/** Last model call's footprint vs the model's limit — null renders "—". */
	context: { used: number; limit: number } | null;
	/** Latest human-readable activity line (""). */
	activity: string;
	/** Sub-agent model id, when usage is reported. */
	model?: string;
	/** Model calls made so far, when usage is reported. */
	steps?: number;
}

/** Merge the feed into one oldest-first blob list (the stable blob order). */
export function toBlobs(feed: ActivityFeed): ActivityBlob[] {
	const blobs: ActivityBlob[] = feed.jobs.map((job) => {
		const usage = job.usage;
		let context: ActivityBlob["context"] = null;
		const lastStep = usage?.lastStep;
		// Context-meter amendment (owner 2026-09-23): the limit comes off
		// the FEED (server-joined from pi's live catalog) — no client-side
		// table. Null limit = no context line (usage-only render is the
		// blob shape's call — here the line simply hides).
		const limit = job.contextLimit;
		if (usage && lastStep && limit !== null && lastStep.inputTokens !== undefined) {
			// Same metric as the session meter (four normalized buckets — the
			// context-meter audit, owner 2026-09-23): all four directions.
			// Provider "input" EXCLUDES cacheRead/cacheWrite, so input+output
			// alone reads wildly low on cache-heavy jobs.
			context = {
				used:
					lastStep.inputTokens +
					(lastStep.outputTokens ?? 0) +
					(lastStep.cacheReadTokens ?? 0) +
					(lastStep.cacheWriteTokens ?? 0),
				limit,
			};
		}
		return {
			id: job.id,
			process: "job",
			jobKind: job.kind,
			title: job.title,
			chatId: job.chatId,
			startedAt: Date.parse(job.createdAt) || 0,
			cost: job.costUsd ?? null,
			context,
			// BYOK (owner, 2026-09-22): a refusal is info, not failure —
			// the honest line the runner left ("failed") reads as setup
			// needed, matching the dispatch card's quiet tone. The
			// provider-key refusal twin (zero-keys wave, Platform's
			// 66dbea9): a pinned model whose key is gone reads as the key
			// being needed, same quiet tone.
			activity: isModelsRefusal(job.error)
				? "needs model setup"
				: isProviderKeyRefusal(job.error)
					? "needs a provider key"
					: (job.activity ?? ""),
			model: usage?.model,
			steps: usage?.steps,
		};
	});
	for (const run of feed.extractions) {
		blobs.push({
			id: run.id,
			process: "extraction",
			phase: run.phase,
			title: run.title,
			chatId: run.chatId,
			startedAt: run.startedAt,
			cost: null, // extraction runs don't ride the money channel (v1)
			context: null,
			activity: "",
		});
	}
	blobs.sort((a, b) => a.startedAt - b.startedAt);
	return blobs;
}

export { formatElapsed } from "@/components/activity-text";

// ─── The section (the sidebar's bottom strip) ─────────────────────────────────

/** A 1s heartbeat while the section is populated — elapsed lines tick. */
function useNow(active: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, [active]);
	return now;
}

const KIND_ICON: Record<JobKind, typeof SearchIcon> = {
	research: SearchIcon,
	demo: PlayIcon,
	visual: PenToolIcon,
	pdf: FileTextIcon, // sources v0 — type-forced entry (JobKind grew "pdf")
};

/** Abort states per blob id: pending (fired) / failed (backend absent). */
type AbortState = "pending" | "failed";

export function ActivitySection({ feed: feedProp }: { feed?: ActivityFeed }) {
	const ctx = useContext(ActivityContext);
	const feed = feedProp ?? ctx.feed;
	const refresh = ctx.refresh;
	const blobs = useMemo(() => toBlobs(feed), [feed]);
	const [openBlob, setOpenBlob] = useState<string | null>(null); // detail, inline-expanded
	const [abortStates, setAbortStates] = useState<Record<string, AbortState>>({});
	const now = useNow(blobs.length > 0);
	// Refs for stable abort handlers (no re-created closures per tick).
	const abortRef = useRef({ blobs, refresh, setAbortStates });
	abortRef.current = { blobs, refresh, setAbortStates };

	const totalCost = useMemo(() => {
		const priced = blobs.map((b) => b.cost).filter((c): c is number => c !== null);
		return priced.length === 0 ? null : priced.reduce((a, c) => a + c, 0);
	}, [blobs]);

	const abort = useCallback(async (blob: ActivityBlob) => {
		const { setAbortStates: set } = abortRef.current;
		set((s) => ({ ...s, [blob.id]: "pending" }));
		try {
			const res = await fetch("/api/activity/abort", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					kind: blob.process,
					// Extractions abort by SOURCE id (chatId) — chunk rows share one
					// source and die together.
					id: blob.process === "extraction" ? blob.chatId : blob.id,
				}),
			});
			if (!res.ok) {
				// 404 not_found / 409 not_running: the process is already gone —
				// the desired end state. Refresh and clear; nothing to report.
				if (res.status === 404 || res.status === 409) {
					abortRef.current.refresh();
					set((s) => {
						const { [blob.id]: _drop, ...rest } = s;
						return rest;
					});
					return;
				}
				throw new Error(String(res.status));
			}
			abortRef.current.refresh();
		} catch {
			set((s) => ({ ...s, [blob.id]: "failed" }));
		}
	}, []);

	// Sidebar-native skin (owner, sidebar round): part of the sidebar's
	// surface, not a floating card — the border-t separator matches the
	// sidebar's own edge line, the header matches the "Sessions" label, the
	// rows match the session rows' hover. Empty means empty: the header sits
	// alone (the cost span is population, not decoration).
	return (
		<section data-testid="activity-section" className="px-2 pb-2">
			<div className="flex h-8 items-center gap-2 px-2.5 text-sm font-medium text-muted-foreground">
				<ActivityIcon className="size-3.5 shrink-0" />
				<span className="truncate whitespace-nowrap">Background agents</span>
				<span className="h-px min-w-2 flex-1 bg-border" aria-hidden="true" />
				{/* Dollars only: plan-covered runs have no cost worth a label here. */}
				{totalCost !== null && (
					<span className="shrink-0 tabular-nums" data-testid="activity-total-cost" title="Total running cost (inferred)">
						{planCostLabel(totalCost, [])}
					</span>
				)}
			</div>
			{blobs.length > 0 && (
				<ItemGroup className="max-h-[40dvh] gap-1 overflow-y-auto">
					{blobs.map((blob) => (
						<ActivityBlobRow
							key={blob.id}
							blob={blob}
							now={now}
							detailOpen={openBlob === blob.id}
							onToggleDetail={() => setOpenBlob((id) => (id === blob.id ? null : blob.id))}
							abortState={abortStates[blob.id]}
							onAbort={() => void abort(blob)}
						/>
					))}
				</ItemGroup>
			)}
		</section>
	);
}

/** Compact activity row with inline details and a separate stop action. */
function ActivityBlobRow({
	blob,
	now,
	detailOpen,
	onToggleDetail,
	abortState,
	onAbort,
}: {
	blob: ActivityBlob;
	now: number;
	detailOpen: boolean;
	onToggleDetail: () => void;
	abortState: AbortState | undefined;
	onAbort: () => void;
}) {
	const Icon = blob.process === "extraction" ? WaypointsIcon : (blob.jobKind && KIND_ICON[blob.jobKind]) || BotIcon;
	const label =
		blob.process === "extraction"
			? `Extraction — ${blob.phase ?? "running"}`
			: blob.jobKind === "research"
				? "Researcher"
				: blob.jobKind === "demo"
					? "Demo builder"
					: blob.jobKind === "visual"
						? "Figure maker"
						: blob.jobKind === "pdf"
							? "PDF reader"
							: "Sub-agent";
	const activity = activityText(blob.activity);
	const elapsed = formatElapsed(now - blob.startedAt);
	const model = blob.model ? blob.model.replace(/^[^:]+:/, "") : null;
	return (
		<Collapsible open={detailOpen} onOpenChange={onToggleDetail} asChild>
			<Item
				role="listitem"
				data-testid={`activity-blob-${blob.process}`}
				size="sm"
				className="flex-col items-stretch gap-0 p-0 text-sm transition-colors hover:bg-accent"
			>
				<div className="flex items-start gap-1">
					<CollapsibleTrigger asChild>
					<button
						type="button"
						aria-expanded={detailOpen}
						title={blob.title}
						className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pl-2 text-left"
					>
						<Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
						<span className="min-w-0 flex-1">
							<span className="flex items-baseline gap-2">
								<span className="min-w-0 flex-1 truncate font-medium text-card-foreground">{label}</span>
								<span className="shrink-0 tabular-nums text-muted-foreground" data-testid="activity-blob-elapsed">
									{elapsed}
								</span>
							</span>
							<span className="block truncate text-muted-foreground" data-testid="activity-blob-activity">
								{activity || blob.title}
							</span>
						</span>
					</button>
					</CollapsibleTrigger>
					{/* The explicit END on the blob's face, aligned with the first line
					    (it stays put when the detail opens). A failed abort locks the
					    button and says why; a successful one makes the blob vanish. */}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						data-testid="activity-abort"
						onClick={onAbort}
						disabled={abortState !== undefined}
						title={abortState === "failed" ? "Stopping failed, try again" : "Stop"}
						aria-label={`Stop ${label} in ${blob.title}`}
						className="mr-1 mt-1 shrink-0"
					>
						<SquareIcon />
					</Button>
				</div>

				<CollapsibleContent>
					<dl
						data-testid="activity-blob-detail"
						className="mx-2 mb-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md bg-accent/40 p-2 text-muted-foreground"
					>
						<dt>Session</dt>
						<dd className="min-w-0 text-right">
							<a href={`/chat/${blob.chatId}`} className="block truncate text-card-foreground hover:underline" title={blob.title}>
								{blob.title}
							</a>
						</dd>
						{model && (
							<>
								<dt>Model</dt>
								<dd className="truncate text-right text-card-foreground">{model}</dd>
							</>
						)}
						<dt>Context</dt>
						<dd className="text-right tabular-nums text-card-foreground" data-testid="activity-blob-context">
							{blob.context === null ? "—" : `${formatTokens(blob.context.used)} / ${formatTokens(blob.context.limit)}`}
						</dd>
						{blob.steps !== undefined && (
							<>
								<dt>Model calls</dt>
								<dd className="text-right tabular-nums text-card-foreground">{blob.steps}</dd>
							</>
						)}
						{blob.cost !== null && (
							<>
								<dt>Cost</dt>
								<dd className="text-right tabular-nums text-card-foreground" data-testid="activity-blob-cost">
									{planCostLabel(blob.cost, [])}
								</dd>
							</>
						)}
						{abortState && (
							<dd className="col-span-2 text-muted-foreground">
								{abortState === "failed" ? "Stopping failed, try again" : "Stopping…"}
							</dd>
						)}
					</dl>
				</CollapsibleContent>
			</Item>
		</Collapsible>
	);
}
