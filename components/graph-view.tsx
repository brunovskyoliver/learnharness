"use client";

/**
 * The home knowledge-graph view (W4; vision §1 "Rendering (DECIDED)").
 *
 * ARCHITECTURE (2026-09-13, decided after the research pass —
 * docs/research/graph-rendering.md, Option B): sigma.js is GONE. The
 * renderer is now a hand-rolled single Canvas 2D (./graph-canvas.ts) —
 * a DUMB DRAW FUNCTION over plain data with ONE requestAnimationFrame
 * loop and a dirty flag. Everything that made the sigma era fragile is
 * structurally impossible now: hulls cannot lag nodes (one loop, one
 * camera, one frame), settings changes cannot shift anything (the
 * camera lives in the renderer and no rebuild ever happens), and the
 * per-camera-event full-canvas repaints (GPU spikes + coil whine) are
 * gone (at most one draw per frame, and NO frame at all while idle).
 *
 * Layout fallback (ledger absent): ONE synchronous incrementalLayout
 * pass (d3-force, core/layout.ts) inside a useEffect writes world-space
 * x/y, then the positions are handed to the renderer as data. No layout
 * animation ever starts; the only animation is the
 * short hover fade, strictly bounded in time — idle CPU is zero (the
 * loop schedules no rAF until something actually changes).
 *
 * The component's job is everything AROUND drawing: fetch + refetch the
 * snapshot, run the layout, resolve theme colors to hex, filter via the
 * search box, own the settings panel / detail card / import button /
 * pipeline chips, and FEED the renderer (data, settings, visibility).
 * The renderer's contract stays presentation-only — which is exactly
 * what the upcoming playground and cluster-first layout work needs: a
 * renderer that draws whatever data it is given, never questioning it.
 *
 * Visual semantics, all preserved verbatim from the sigma era:
 *   - Node labels (the short extractor-coined names) wrap under the
 *     node; one GLOBAL zoom gate fades them together (no per-node pop).
 *   - Hover: a soft glow halo in the node's own color at a constant
 *     radius, opacity cross-faded ~180ms with the name brightening on
 *     the same factor; the whole halo is hit-testable (picking pad).
 *   - Cluster hulls (vision §1): soft layered translucent fills + a
 *     dashed boundary per cluster, stable hue from the cluster id; the
 *     region label at the centroid fades in over the exact zoom span
 *     node labels fade out (THE single zoom control) — and is
 *     toggleable in the settings panel (hulls always draw).
 *   - The persisted labelZoom setting keeps sigma's camera-ratio
 *     convention (1 = fit zoom, SMALLER = zoomed in): labels until
 *     zoom 0.5x means labels appear once zoomed in past 2x fit.
 *   - Click a node -> the detail card anchored just below it (flipping
 *     above near the bottom edge); any camera move dismisses it.
 *     Clicking the empty stage closes it. Search filtering hides nodes
 *     (and their edges) from rendering, picking, hover, AND labels;
 *     an open card closes if its node is filtered out.
 *
 * Rendering settings (2026-09-13): the gear in the search panel reveals
 * five sliders (node size, edge width, arrowhead length, label size, the
 * zoom threshold), and the cluster-labels checkbox. (The supports-edge
 * draw toggle + thickness slider died with supports edges themselves —
 * chains-primary, 2026-09-30.) SERVER-persisted
 * (data/render-settings.json via /api/graph/render-settings): loaded
 * once after mount, saved debounced on every user change — one source
 * of truth shared by every browser. The label-zoom slider is log-scaled
 * (its useful band 0.25–0.5 sits mid-slider, not crammed at the left)
 * and displays normalized units where the default 0.5 reads as "1×".
 * Settings apply by just redrawing — no rebuild, no re-layout, and the
 * camera never moves.
 */

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FileTextIcon, ListTreeIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react";
import { loadGraphLayout, propositionSessionHref, type GraphCostSummary, type GraphNode, type GraphSnapshot } from "@/src/core";
import { planCostLabel } from "@/components/usage-format";
import type { GraphCanvasRenderer, GraphRenderSettings } from "./graph-canvas.ts";
import { loadGraphRenderer } from "./graph-engine-loader";
import { useReloadRetry } from "./reload-recovery";
import { usePopoverDismiss } from "@/components/popover-dismiss";
import { onSettingsSaved } from "@/components/settings-signal";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { MenuShell } from "@/components/menu-shell.tsx";
import { DeleteNodeDialog } from "@/components/delete-node-dialog.tsx";
import { LazyChainTableOverlay as ChainTableOverlay } from "@/components/lazy-chain-table";
import { InOverlayHost } from "@/components/overlay-host";
import { containModalTab } from "@/components/modal-focus";
import { Hint } from "@/components/ui/hint";
import { DEFAULT_RENDER_SETTINGS, sanitizeRenderSettings } from "@/src/core";

/** The uniform node look (no state classes — canvas wants hex, not oklch):
 *  the accent color, until the state model lands. */
const NODE_COLOR_TOKEN = "--primary";

/** Per-device graph camera persistence (zoom+pan view state). v1 in the
 *  key: the stored shape is the renderer's d3 transform {k, x, y}. */
const CAMERA_STORAGE_KEY = "lh.graph.camera.v1";

// ---- Render settings ------------------------------------------------------
//
// The shape, defaults, sanitizer, and slider mappings live in
// src/core/render-settings.ts (shared with the server store + tests); the
// controls live in Settings → Graph (components/settings/graph-display-section.tsx).

/**
 * Pure filter predicate for the search panel: a node is visible when the
 * query is empty or matches its name or statement (case-insensitive).
 * Exported for tests; the visibility feed just consumes its verdict.
 */
export function isNodeVisible(node: Pick<GraphNode, "name" | "statement">, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return true;
	return node.name.toLowerCase().includes(q) || node.statement.toLowerCase().includes(q);
}

/** In-place sessions patch for a live rename (rename-shuffle fix,
 *  2026-09-23). The OLD path built a fresh snapshot object, which
 *  flowed through the [snapshot]-keyed setData effect → geometry
 *  rebuild → last-fetched ledger became authoritative + pending drag
 *  commit cancelled → the graph visibly rewound whenever display had
 *  drifted. This seam NEVER changes object identity: same snapshot
 *  reference, same clusters array — so the data feed cannot re-fire.
 *  The display refresh rides a separate tick state, and the cluster
 *  label itself goes through the renderer's label-only channel
 *  (setClusterLabels). Exported for tests; pure display state only —
 *  the server derives the same join on its next read. */
export function renameSessionsPatch(snapshot: Pick<GraphSnapshot, "sessions">, id: string, title: string): void {
	snapshot.sessions[id] = title;
}

/** Seed positions for nodes the ledger doesn't know yet (hygiene,
 *  2026-09-23 fix wave): they used to fall through to a ?? 0 and dump
 *  at the origin. Place them on a deterministic ring around the known
 *  positions' centroid — angle hashed from the id (FNV-1a), golden-angle
 *  spiral offset so even hash collisions spread. Stable across
 *  remounts, far enough off the mass to see, and they relax with the
 *  pack on the next drag. In-place on the provided map; pure otherwise. */
export function seedMissingNodePositions(
	nodes: readonly { id: string }[],
	positions: Map<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
	if (positions.size === 0 || nodes.every((n) => positions.has(n.id))) return positions;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of positions.values()) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	const radius = Math.max(maxX - minX, maxY - minY, 40) * 0.7 + 20;
	const missing = nodes.filter((n) => !positions.has(n.id));
	missing.forEach((n, i) => {
		// FNV-1a hash → [0,1) → angle; the golden-angle spiral offset
		// both spreads collisions and staggers long paths deterministically.
		let h = 0x811c9dc5;
		for (let c = 0; c < n.id.length; c++) {
			h ^= n.id.charCodeAt(c);
			h = (h * 0x01000193) >>> 0;
		}
		const angle = ((h / 0xffffffff) * 2 * Math.PI + i * 2.39996323) % (2 * Math.PI);
		positions.set(n.id, {
			x: cx + Math.cos(angle) * radius,
			y: cy + Math.sin(angle) * radius,
		});
	});
	return positions;
}

// ---- Color helpers (canvas wants hex, not oklch) ---------------------------

/** Resolve a CSS variable (oklch in this app) to #rrggbb via the canvas. */
function cssColorToHex(css: string): string {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "#888888";
	ctx.fillStyle = css;
	ctx.fillRect(0, 0, 1, 1);
	const { data } = ctx.getImageData(0, 0, 1, 1);
	return `#${[data[0]!, data[1]!, data[2]!]
		.map((v) => v.toString(16).padStart(2, "0"))
		.join("")}`;
}

function tokenHex(cssVar: string): string {
	const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
	return value ? cssColorToHex(value) : "#888888";
}

// ---- Component ------------------------------------------------------------

interface Selection {
	node: GraphNode;
	/** The sources that touched this node: chat ids (deep-linkable sessions)
	 *  and notes-source ids ("src_…" — imported files, static entries). */
	sourceIds: string[];
	/** Node position in container pixels (at click time; camera moves
	 *  dismiss the card, so it never needs re-anchoring). */
	anchor: { x: number; y: number };
}

/** Compact token display: 45231 → "45.2k"; absent → "—". */
function fmtTokens(n: number | undefined): string {
	if (n === undefined) return "—";
	if (n < 1000) return String(Math.round(n));
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}

/** Relative time for run rows: "now", "12m", "3h", "2d". */
function timeAgo(startedAt: number): string {
	const mins = Math.round((Date.now() - startedAt) / 60_000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.round(hours / 24)}d`;
}

/** Run/stage cost at 3 decimals (pipeline pennies are real money at this
 *  scale); headline totals use 2. Null (unpriced model) renders "—". */
function fmtRunCost(dollars: number | null, providers: readonly string[] = []): string {
	return planCostLabel(dollars, providers, (value) => `$${value.toFixed(3)}`);
}
function graphProviders(value: { subscriptionRuns?: number; subscriptionProviders?: string[] }): string[] {
	return value.subscriptionProviders ?? ((value.subscriptionRuns ?? 0) > 0 ? ["ChatGPT"] : []);
}
function graphUsageLabel(costs: Pick<GraphCostSummary, "stages">): string {
	const stages = [costs.stages.extraction, costs.stages.audit];
	const providers = [...new Set(stages.flatMap(graphProviders))];
	const priced = stages.some((stage) => stage.runs - stage.unpricedRuns - (stage.subscriptionRuns ?? 0) > 0);
	const dollars = displayCostTotals(costs).totalDollars;
	return planCostLabel(priced ? dollars : null, providers, (value) => `$${value.toFixed(2)}`);
}

/**
 * The cost figures the UI DISPLAYS (owner refinement round, 2026-09-24):
 * extraction + audit only. Cluster naming is dead — labels are session
 * titles / file names — so the core's naming fold (and its historical
 * spend) is deliberately not shown anywhere: the pill and the panel must
 * agree, and both read THIS, never GraphCostSummary.totalDollars.
 * (The core fold's naming stage was then culled outright — 2026-09-24 —
 * so the recent-runs list carries extraction runs only.)
 */
export function displayCostTotals(costs: Pick<GraphCostSummary, "stages">): {
	totalDollars: number;
	unpricedRuns: number;
} {
	// The two live stages (the spine came and went on one day,
	// 2026-09-30 — digest-aware extraction replaced it).
	return {
		totalDollars: costs.stages.extraction.dollars + costs.stages.audit.dollars,
		unpricedRuns: costs.stages.extraction.unpricedRuns + costs.stages.audit.unpricedRuns,
	};
}

/**
 * The graph-pipeline cost control (2026-09-20 placement wave): a bare
 * cumulative-dollars number — no pill chrome (owner: "just a number"),
 * hover-highlighted, click toggles the breakdown panel. Same dismiss
 * pattern as the settings gear: outside click or Escape closes. The
 * panel is viewport-capped + scrollable like the coverage dropdown.
 */
/** Exported for the chains home (graph rendering off, owner
 * 2026-10-06): the same bare cumulative-dollars pill + panel. */
export function GraphCostControl({ costs }: { costs: GraphCostSummary }) {
	const [open, setOpen] = useState(false);
	// Click anywhere outside (or Escape) closes the panel — the root
	// wraps button + panel, so the toggle itself keeps working.
	const rootRef = useRef<HTMLDivElement>(null);
	usePopoverDismiss(rootRef, open, () => setOpen(false));
	return (
		<div ref={rootRef} className="relative">
			<Hint
				// Trimmed (owner, subtlety round 2026-09-25).
				label="Graph costs — click for details"
				side="bottom"
			>
				<button
				type="button"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				className={`rounded-lg px-2 py-1 text-sm tabular-nums transition-colors hover:bg-accent ${
					open ? "text-foreground" : "text-muted-foreground hover:text-foreground"
				}`}
			>
				Graph · {graphUsageLabel(costs)}
			</button>
			</Hint>
			{open && (
				<div className="absolute right-0 top-full mt-2 max-h-[60vh] overflow-y-auto">
					<GraphCostPanel costs={costs} />
				</div>
			)}
		</div>
	);
}

/**
 * The cost control's expanded panel: stage totals (extraction / audit —
 * dollars headline, tokens secondary) + the recent-runs list.
 * Presentational: the fold happens server-side (core/cost-summary.ts);
 * dollars are inferred read-time, never stored. Cluster naming is GONE
 * from the panel (owner refinement round, 2026-09-24): labels are session
 * titles / file names now, the namer is dead, and its historical spend is
 * not tracked anymore — the headline sums the displayed stages only and
 * naming-kind runs never reach the list.
 */
function GraphCostPanel({ costs }: { costs: GraphCostSummary }) {
	const stageRows: [string, GraphCostSummary["stages"]["extraction"]][] = [
		["Extraction", costs.stages.extraction],
		["Audit", costs.stages.audit],
	];
	// The displayed figures come from displayCostTotals (naming excluded —
	// the pill and this panel must agree).
	const { unpricedRuns } = displayCostTotals(costs);
	return (
		<div className="w-80 max-w-[calc(100vw-1.5rem)] rounded-xl border bg-card p-3 text-sm ">
			<div className="mb-2 flex items-baseline justify-between">
				<span className="text-sm font-medium text-muted-foreground">
					Graph pipeline costs
				</span>
				<span className="text-foreground tabular-nums">
					{graphUsageLabel(costs)}
					{unpricedRuns > 0 && (
						<span className="text-muted-foreground"> · {unpricedRuns} unpriced</span>
					)}
				</span>
			</div>
			<div className="flex flex-col gap-1">
				{stageRows.map(([label, stage]) => (
					<div key={label} className="flex items-baseline justify-between gap-2 text-sm">
						<span className="shrink-0 text-muted-foreground">{label}</span>
						<span className="min-w-0 text-right tabular-nums">
							{fmtRunCost(stage.runs - stage.unpricedRuns - (stage.subscriptionRuns ?? 0) <= 0 ? null : stage.dollars, graphProviders(stage))}
							{stage.unpricedRuns > 0 && (stage.runs - stage.unpricedRuns - (stage.subscriptionRuns ?? 0) > 0 || (stage.subscriptionRuns ?? 0) > 0) && (
								<span className="text-muted-foreground"> +{stage.unpricedRuns} unpriced</span>
							)}
							<span className="text-muted-foreground">
								{" "}
								· {fmtTokens(stage.tokens.inputTokens)} in / {fmtTokens(stage.tokens.outputTokens)} out
							</span>
						</span>
					</div>
				))}
			</div>
			<div className="mt-2 flex flex-col gap-0.5 pt-2">
				{costs.runs.map((run) => (
						<div key={run.startedAt} className="flex items-baseline justify-between gap-2 text-sm">
							<span className="min-w-0 flex-1 truncate text-muted-foreground">
								<span className="text-ink-2">{timeAgo(run.startedAt)}</span>{" "}
								{run.title}
								{run.merged && (
									<span className="text-muted-foreground">
										{" "}
										+{run.merged.nodes}n
									</span>
								)}
							</span>
							<span className="shrink-0 tabular-nums">{fmtRunCost(run.dollars, graphProviders(run))}{run.dollars === null && run.subscriptionRuns === 1 ? " +1 unpriced" : ""}</span>
						</div>
					))}
			</div>
		</div>
	);
}

/** The top-chrome actions row's body (empty-graph chrome wave, owner
 *  2026-09-25): Import Notes renders ALWAYS (graph enabled) — it's the
 *  one action that works on an empty graph, the entry point itself;
 *  search + settings render only when the snapshot has nodes (dead
 *  controls are lies — the honesty principle). The two gated controls
 *  fade in on their mount (graph-chrome-fade-in, globals.css — the
 *  appear-once transition as the first nodes land). Exported pure for
 *  the empty/populated SSR pins (the DeleteNodeBody pattern). */
export function GraphChromeRow({
	isEmpty,
	query,
	onQuery,
	noMatch,
	searchInputRef,
	onOpenChains,
}: {
	isEmpty: boolean;
	query: string;
	onQuery: (v: string) => void;
	/** The search panel's "No matching ideas." note (computed by the
	 *  wrapper — it owns visibleIds + the snapshot). */
	noMatch: boolean;
	searchInputRef: React.RefObject<HTMLInputElement | null>;
	/** Opens the chain table overlay (the chains-overlay plan,
	 *  2026-09-29). */
	onOpenChains: () => void;
}) {
	const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
	const searchTriggerRef = useRef<HTMLButtonElement>(null);
	const restoreSearchFocus = useRef(false);
	const closeMobileSearch = () => {
		restoreSearchFocus.current = true;
		setMobileSearchOpen(false);
	};
	useLayoutEffect(() => {
		if (mobileSearchOpen) searchInputRef.current?.focus();
		else if (restoreSearchFocus.current) {
			restoreSearchFocus.current = false;
			searchTriggerRef.current?.focus();
		}
	}, [mobileSearchOpen, searchInputRef]);
	useEffect(() => {
		if (isEmpty) return;
		const onFind = () => {
			if (window.matchMedia("(max-width: 639px)").matches) setMobileSearchOpen(true);
			searchInputRef.current?.focus();
		};
		window.addEventListener("lh:kbd-find", onFind);
		return () => window.removeEventListener("lh:kbd-find", onFind);
	}, [isEmpty, searchInputRef]);
	return (
		<>
			{!isEmpty && (
				<div
					data-mobile-graph-search={mobileSearchOpen ? "true" : undefined}
					className={cn("min-w-0 shrink rounded-xl border bg-card px-1 py-[3px] sm:static sm:w-56", mobileSearchOpen ? "fixed inset-x-2 top-2 z-30 w-auto" : "graph-chrome-fade-in w-auto sm:w-56")}
					onKeyDown={(event) => {
						if (event.key === "Escape" && mobileSearchOpen && window.matchMedia("(max-width: 639px)").matches) {
							event.preventDefault();
							event.stopPropagation();
							closeMobileSearch();
						}
					}}
				>
					<button
						ref={searchTriggerRef}
						type="button"
						aria-label="Search ideas"
						aria-expanded={mobileSearchOpen}
						onClick={() => setMobileSearchOpen(true)}
						data-testid="graph-search-toggle"
						className={cn("size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent sm:hidden", mobileSearchOpen ? "hidden" : "flex")}
					><SearchIcon className="size-4" aria-hidden /></button>
					<Hint
						// ⌘F focuses node search (surface-scoped registry action).
						label="Search ideas"
						action="find"
						side="bottom"
					>
					<div className={cn("relative items-center gap-1 sm:flex", mobileSearchOpen ? "flex" : "hidden")}>
						<SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<input
							ref={searchInputRef}
							value={query}
							onChange={(e) => onQuery(e.target.value)}
							placeholder="Search ideas…"
							aria-label="Search ideas"
							spellCheck={false}
							className="h-7 min-w-0 w-full rounded-lg border bg-background pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
						/>
						<button
							type="button"
							aria-label="Close search"
							onClick={closeMobileSearch}
							className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent sm:hidden"
						><XIcon className="size-4" aria-hidden /></button>
					</div>
					</Hint>
					{noMatch && (
						<div className={cn("px-1.5 pt-1 text-sm text-muted-foreground", !mobileSearchOpen && "max-sm:hidden")}>No matching ideas.</div>
					)}
				</div>
			)}
			{/* The chain table (chains overlay, owner plan 2026-09-29). Own
			    container (36px band), between the search and Import. */}
			{!isEmpty && (
				<div className={cn("graph-chrome-fade-in shrink-0 rounded-xl border bg-card px-1 py-[3px] ", mobileSearchOpen && "max-sm:hidden")}>
					<Hint label="Every reasoning chain" side="bottom">
						<button
							type="button"
							onClick={onOpenChains}
							data-testid="open-chain-table"
							className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent"
						>
							<ListTreeIcon className="size-4" />
							<span className="max-sm:sr-only">Chains</span>
						</button>
					</Hint>
				</div>
			)}
		</>
	);
}

export interface GraphSection {
	expanded: boolean;
	/** Escape or Close: the caller collapses and restores focus to Expand. */
	onCollapse: () => void;
}

export interface GraphStats {
	ideas: number;
	chains: number;
}

/** "38 ideas · 12 chains" (owner 2026-10-28); null for an empty graph. */
export function graphStatsLabel(stats: GraphStats | null): string | null {
	if (!stats || stats.ideas === 0) return null;
	return `${stats.ideas} ${stats.ideas === 1 ? "idea" : "ideas"} · ${stats.chains} ${stats.chains === 1 ? "chain" : "chains"}`;
}

export function GraphView({
	initialSnapshot,
	chainSelectOpen = false,
	practiceSelection,
	onPracticeSelectionChange,
	onChainSelectClose,
	section,
	onStats,
}: {
	/** Home's graph section (feature 002): a fixed-height box in the page,
	 *  or — the same mounted element, so camera, selection and search
	 *  survive — a full-viewport layer while expanded. Absent = full bleed. */
	section?: GraphSection;
	/** Counts for the section header, reported on every snapshot. */
	onStats?: (stats: GraphStats) => void;
	/** Tenant-scoped server seed avoids an extra initial graph round trip. */
	initialSnapshot?: GraphSnapshot;
	/** PRACTICE SELECT (owner vision, 2026-10-04): the LIFTED, persistent
	 *  pick set — every check/clear in the chain table (however opened)
	 *  reports the full node list up immediately; the composer-side chip
	 *  reflects it live. chainSelectOpen still drives the picker mode
	 *  (Done instead of Delete). */
	chainSelectOpen?: boolean;
	practiceSelection?: ReadonlySet<string>;
	onPracticeSelectionChange?: (nodes: { id: string; name: string; statement: string }[]) => void;
	onChainSelectClose?: () => void;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const cardRef = useRef<HTMLDivElement | null>(null);
	const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(initialSnapshot ?? null);
	const [selected, setSelected] = useState<Selection | null>(null);
	// The latest snapshot for the renderer's click callbacks (they are
	// constructed once, so they read through this ref, never a closure).
	const snapshotRef = useRef<GraphSnapshot | null>(null);
	snapshotRef.current = snapshot;

	// Search panel state: the query text + the settings section toggle.
	const [query, setQuery] = useState("");
	// The chrome owns mobile expansion before the find shortcut focuses search.
	const searchInputRef = useRef<HTMLInputElement>(null);
	// Render settings: SERVER-persisted (data/render-settings.json via
	// /api/graph/render-settings) — sizes AND the region/physics sections.
	// Edited in Settings → Graph → Display (feature 002); this view reads
	// them after mount and again whenever that section saves. Defaults
	// render until the load resolves — a fraction of a second at worst.
	const [settings, setSettings] = useState<GraphRenderSettings>(DEFAULT_RENDER_SETTINGS);
	// The two nested sections, unpacked for the renderer feed effects
	// below (same names the old session state had).
	const regionTuning = settings.regions;
	const physicsTuning = settings.physics;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const readRenderSettings = useCallback(() => {
		fetch("/api/graph/render-settings")
			.then((res) => (res.ok ? (res.json() as Promise<unknown>) : null))
			.then((raw) => {
				if (raw !== null) setSettings(sanitizeRenderSettings(raw));
			})
			.catch(() => {
				// server unreachable → the current settings keep working
			});
	}, []);
	useEffect(() => {
		readRenderSettings();
		return onSettingsSaved((section) => {
			if (section === "graph") readRenderSettings();
		});
	}, [readRenderSettings]);

	// The renderer instance lives across snapshot refetches and settings
	// changes (its camera is never reset by either); `posRef` carries the
	// frozen layout out of the layout effect.
	const rendererRef = useRef<GraphCanvasRenderer | null>(null);
	const posRef = useRef<Map<string, { x: number; y: number }> | null>(null);
	const [layoutSnapshot, setLayoutSnapshot] = useState<GraphSnapshot | null>(null);
	const [rendererEpoch, setRendererEpoch] = useState(0);
	const settingsRendererRef = useRef<GraphCanvasRenderer | null>(null);
	const [readySnapshot, setReadySnapshot] = useState<GraphSnapshot | null>(null);
	const [engineFailed, setEngineFailed] = useState(false);
	const graphRecovery = useReloadRetry({ kind: "graph" });

	// The id set that survives the current search — consumed by the
	// visibility feed and the "no matches" hint.
	const visibleIds = useMemo(() => {
		const set = new Set<string>();
		if (snapshot)
			for (const node of snapshot.nodes) {
				if (isNodeVisible(node, query)) set.add(node.id);
			}
		return set;
	}, [snapshot, query]);

	// Fetch the derived graph. Re-runs when a background pipeline run
	// finishes (refreshTick) — its merges just landed in the ledger.
	const [refreshTick, setRefreshTick] = useState(0);
	// The chain table overlay (chains-overlay plan, 2026-09-29) —
	// component-local: a browsing surface, not graph state.
	const [chainsOpen, setChainsOpen] = useState(false);
	// PRACTICE SELECT (2026-10-04): the parent's chip drives the select
	// mode; closing (either the picker's confirm or its X) reports back so
	// the chip's open state and the table's never disagree.
	useEffect(() => {
		if (chainSelectOpen) setChainsOpen(true);
	}, [chainSelectOpen]);
	useEffect(() => {
		if (refreshTick === 0 && initialSnapshot) return;
		let cancelled = false;
		fetch("/api/graph")
			.then((res) => res.json() as Promise<GraphSnapshot>)
			.then((data) => {
				if (!cancelled) setSnapshot(data);
			})
			.catch((err) => console.error("[graph] fetch failed:", err));
		return () => {
			cancelled = true;
		};
	}, [refreshTick, initialSnapshot]);

	// Notes import lives in Home's section header (feature 002); its runs
	// surface in the status chips below, and the graph refetches when they
	// finish (the runs-empty transition).

	// Background pipeline status: read /api/graph/status; whenever a run
	// LEAVES the feed (finished / aborted / failed), refetch the graph.
	// A run only leaves the registry after its merge + settle + usage
	// persist complete, so disappearance ⇒ the graph change is already on
	// disk. The old some→none transition batched PARALLEL runs into one
	// reveal (owner 2026-09-28): with serialized audits, the first run's
	// merge is its own graph change and must surface immediately, not wait
	// for the whole feed to drain. A redundant fetch on aborted runs is
	// free — the same doctrine as the deletion-refresh path below.
	// Tracked by ROW id (the registry JOB key — source id, or "src#i" for
	// chunk jobs), NOT chatId: chatId-scoping re-batched per-chunk jobs
	// into one end-of-import reveal (the exact bug this rule exists to
	// prevent — a chunk's row leaving IS its merge landing).
	const [pipelineRuns, setPipelineRuns] = useState<{ id: string; chatId: string; title: string; phase: string; startedAt: number }[]>([]);
	const rowIdsRef = useRef<Set<string>>(new Set());
	const readPipelineStatus = useCallback(() => {
		fetch("/api/graph/status")
			.then((res) => res.json() as Promise<{ runs: typeof pipelineRuns }>)
			.then(({ runs }) => {
				setPipelineRuns(runs);
				const ids = new Set(runs.map((r) => r.id));
				if ([...rowIdsRef.current].some((id) => !ids.has(id))) setRefreshTick((t) => t + 1);
				rowIdsRef.current = ids;
			})
			.catch(() => {}); // status is cosmetic — never surface read errors
	}, []);
	// PUSH (S7, 2026-10-02): the standing 2s poll is RETIRED — the
	// extraction registry announces every phase transition and every
	// finish (activity-changed), so each read lands exactly when truth
	// moved. The per-chunk reveal semantics are PRESERVED event-for-event:
	// setPhase + finishExtraction fire per part, so a chunk's row leaving
	// is still its own, immediately-visible merge landing. Debounced (the
	// S4 law); resync heals a reconnect that ate events.
	const statusDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useServerEvent("activity-changed", () => {
		if (statusDebounceRef.current) clearTimeout(statusDebounceRef.current);
		statusDebounceRef.current = setTimeout(() => {
			statusDebounceRef.current = undefined;
			readPipelineStatus();
		}, 250);
	});
	useServerResync(() => readPipelineStatus());
	useEffect(() => {
		readPipelineStatus();
		return () => {
			if (statusDebounceRef.current) clearTimeout(statusDebounceRef.current);
		};
	}, [readPipelineStatus]);

	// Graph pipeline costs (2026-09 cost metrics wave): the cumulative fold
	// of the usage channels (chat + notes extraction runs; the dead namer's
	// channel is not displayed anymore, owner 2026-09-24)
	// behind the bottom-left cost pill. Fetched once on mount and refetched
	// when a pipeline run finishes (running -> none) so fresh spend lands
	// without a manual reload. Best-effort: a fetch failure never blocks
	// the view — the pill just stays on its last numbers.
	const [costs, setCosts] = useState<GraphCostSummary | null>(null);
	const refreshCosts = useCallback(() => {
		fetch("/api/graph/costs")
			.then((res) => res.json() as Promise<GraphCostSummary>)
			.then(setCosts)
			.catch(() => {});
	}, []);
	useEffect(() => {
		refreshCosts();
	}, [refreshCosts]);
	// The same disappearance rule as the snapshot refresh (owner
	// 2026-09-28): usage persists per JOB (per-chunk jobs), so costs refresh
	// per job row — not only when the whole feed drains.
	const prevRunIds = useRef(new Set<string>());
	useEffect(() => {
		const gone = [...prevRunIds.current].some((id) => !pipelineRuns.some((r) => r.id === id));
		if (gone && prevRunIds.current.size > 0) refreshCosts();
		prevRunIds.current = new Set(pipelineRuns.map((r) => r.id));
	}, [pipelineRuns, refreshCosts]);

	/* Deletion refresh (wave 6 chunk A): the DELETE /api/chats/:id response
	   carries the new graphRevision, and the sidebar (which owns the delete
	   flow) announces it as lh:graph-revision. The status poll above can't
	   see a deletion — no pipeline run ever disappears from the feed for
	   it — so this event is the one seam. Refetch the snapshot and the
	   costs on every announcement: deletions are rare, a redundant fetch
	   is free. */
	useEffect(() => {
		const onRevision = () => {
			setRefreshTick((t) => t + 1);
			refreshCosts();
		};
		window.addEventListener("lh:graph-revision", onRevision);
		return () => window.removeEventListener("lh:graph-revision", onRevision);
	}, [refreshCosts]);

	/* Live rename labels (rename-shuffle fix, 2026-09-23): a session
	   rename anywhere (sidebar inline row, chat header) announces itself
	   as lh:chat-renamed {id, title} — and the birth-session partition
	   means that title IS the cluster label. The label update goes
	   through the renderer's label-only channel (setClusterLabels): NO
	   new snapshot object, NO setData, NO geometry rebuild — so the
	   position ledger can't assert itself and a pending drag commit
	   survives. The sessions map (the detail card's provenance line)
	   patches in place; a tick bump re-renders the view so an open
	   detail card reads the fresh title. Unlabeled clusters keep their
	   hull-only silence — the null-label guard lives in the channel
	   (applyClusterLabels): a rename can't reach a gone record. */
	const [, setLabelTick] = useState(0);
	useEffect(() => {
		const onRenamed = (e: Event) => {
			const { id, title } = (e as CustomEvent<{ id?: string; title?: string }>).detail ?? {};
			if (typeof id !== "string" || typeof title !== "string" || id === "" || title === "") return;
			const snap = snapshotRef.current;
			if (snap != null) renameSessionsPatch(snap, id, title);
			rendererRef.current?.setClusterLabels(new Map([[id, title]]));
			setLabelTick((t) => t + 1);
		};
		window.addEventListener("lh:chat-renamed", onRenamed);
		return () => window.removeEventListener("lh:chat-renamed", onRenamed);
	}, []);

	// The node context menu (node interlude): right-click a node → Delete.
	// The anchor is a zero-size div positioned at the pointer inside the
	// canvas container — MenuShell's placement machine measures it like
	// any element. Camera moves close the menu (it would float stale);
	// the dismissal contract is the sidebar's (wave 6).
	const [ctxNode, setCtxNode] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
	const ctxAnchorRef = useRef<HTMLDivElement | null>(null);
	const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null);
	useEffect(() => {
		if (ctxNode === null) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (ctxAnchorRef.current?.contains(target)) return;
			setCtxNode(null);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setCtxNode(null);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [ctxNode]);

	// Layout (Option A): the positions ledger (written by the server's
	// incremental settle after every merge) IS the layout — the renderer
	// receives it as frozen data. The local one-shot forceAtlas2 pass runs
	// ONLY as a fallback when the ledger is absent (a graph never merged
	// through the pipeline, e.g. tests or a fresh install).
	useEffect(() => {
		if (!snapshot || snapshot.nodes.length === 0 || engineFailed) return;
		let cancelled = false;
		// The ledger path: every positioned node uses its resting position;
		// nodes the ledger doesn't know yet (raced mid-settle) fall through
		// to seeded scatter below.
		const ledger = snapshot.positions;
		if (ledger) {
			const positions = new Map<string, { x: number; y: number }>();
			for (const node of snapshot.nodes) {
				const p = ledger[node.id];
				if (p) positions.set(node.id, { x: p.x, y: p.y });
			}
			if (positions.size > 0) {
				// Hygiene (2026-09-23 fix wave): nodes the ledger doesn't know
				// yet (raced mid-settle) get seeded ring positions instead of
				// the old ?? 0 origin dump.
				posRef.current = seedMissingNodePositions(snapshot.nodes, positions);
				setLayoutSnapshot(snapshot);
				return () => {
					posRef.current = null;
				};
			}
		}
		// Bootstrap fallback: the ledger is absent (fresh graph) — run
		// the SAME engine the server settle uses (d3-force via
		// incrementalLayout, seeded deterministic) and freeze the result.
		// Deterministic for a given node set across remounts.
		void loadGraphLayout().then((incrementalLayout) => {
			if (cancelled) return;
			posRef.current = incrementalLayout(snapshot.nodes, snapshot.edges, new Map());
			setLayoutSnapshot(snapshot);
		}).catch(() => { if (!cancelled) setEngineFailed(true); });
		return () => {
			cancelled = true;
			posRef.current = null;
		};
	}, [snapshot, engineFailed]);

	// Construct the renderer once the canvas exists; destroy when it goes
	// away (the empty-graph placeholder replaces it). The callbacks are
	// created once and read through refs, so they never go stale.
	const isEmpty = snapshot === null || snapshot.nodes.length === 0;

	// Home's section header counts (ideas · chains), per snapshot.
	const onStatsRef = useRef(onStats);
	onStatsRef.current = onStats;
	useEffect(() => {
		if (snapshot) onStatsRef.current?.({ ideas: snapshot.propositions.length, chains: snapshot.chains.length });
	}, [snapshot]);

	// Expanded (feature 002): the same element becomes a full-viewport
	// layer — focus moves to Close and stays inside; Escape collapses only
	// when no inner layer (chain table, menus, dialogs, node menu) is up.
	const expanded = section?.expanded ?? false;
	const rootRef = useRef<HTMLDivElement | null>(null);
	const closeRef = useRef<HTMLButtonElement | null>(null);
	const collapseRef = useRef(section?.onCollapse);
	collapseRef.current = section?.onCollapse;
	const innerLayerOpen = chainsOpen || ctxNode !== null || deletingNode !== null;
	useEffect(() => {
		if (expanded) closeRef.current?.focus();
	}, [expanded]);
	useEffect(() => {
		if (!expanded) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented || innerLayerOpen) return;
			if (document.querySelector("[data-lh-menu], [role='dialog'][aria-modal='true']:not([data-expanded])")) return;
			event.preventDefault();
			event.stopPropagation();
			collapseRef.current?.();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [expanded, innerLayerOpen]);
	useEffect(() => {
		if (isEmpty || engineFailed) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		let cancelled = false;
		let renderer: GraphCanvasRenderer | null = null;
		// Persisted camera (2026-09-15): the graph reopens exactly where the
		// user left it — zoom AND pan, in localStorage (per-device view
		// state, deliberately NOT the server settings ledger). Absent or
		// corrupt → undefined → the renderer fits on first open, ever.
		let initialCamera: { k: number; x: number; y: number } | null = null;
		try {
			const stored = localStorage.getItem(CAMERA_STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as { k?: unknown; x?: unknown; y?: unknown };
				if (
					typeof parsed.k === "number" && Number.isFinite(parsed.k) && parsed.k > 0 &&
					typeof parsed.x === "number" && Number.isFinite(parsed.x) &&
					typeof parsed.y === "number" && Number.isFinite(parsed.y)
				)
					initialCamera = { k: parsed.k, x: parsed.x, y: parsed.y };
			}
		} catch {
			// Corrupt entry → treat as absent; the renderer fits.
		}
		// Debounced camera writes: a pan emits hundreds of transforms per
		// second; one trailing write per quiet spell is plenty.
		let cameraTimer: ReturnType<typeof setTimeout> | null = null;
		let lastCamera: { k: number; x: number; y: number } | null = null;
		const persistCamera = (t: { k: number; x: number; y: number }) => {
			lastCamera = t;
			if (cameraTimer) clearTimeout(cameraTimer);
			cameraTimer = setTimeout(() => {
				cameraTimer = null;
				try {
					localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(t));
				} catch {
					// Storage full/blocked: camera persistence is best-effort.
				}
			}, 250);
		};
		void loadGraphRenderer().then((GraphCanvasRenderer) => {
			if (cancelled) return;
			renderer = new GraphCanvasRenderer(
				canvas,
				{
					onSelect: (nodeId, pos) => {
						const snap = snapshotRef.current;
						const node = snap?.nodes.find((n) => n.id === nodeId);
						if (!snap || !node) return;
						setSelected({
							node,
							sourceIds: snap.nodeSessions[node.id] ?? [],
							anchor: pos,
						});
					},
					onStageClick: () => setSelected(null),
					// Right-click → the node context menu (node interlude). Null
					// (empty stage) closes a stale menu; a pick opens one anchored
					// at the pointer. The name comes from the snapshot — what the
					// canvas shows is what the menu and dialog speak.
					onContext: (nodeId, pos) => {
						if (nodeId === null) {
							setCtxNode(null);
							return;
						}
						const node = snapshotRef.current?.nodes.find((n) => n.id === nodeId);
						if (!node) return;
						setCtxNode({ id: node.id, name: node.name, x: pos.x, y: pos.y });
					},
					// Any camera move detaches the card from its node — close
					// it, and (debounced) remember where the camera stands. The
					// context menu closes with it: a menu floating over a moved
					// graph is anchored to nothing.
					onCameraMove: (t) => {
						setSelected(null);
						setCtxNode(null);
						persistCamera(t);
					},
					// Live physics settled: persist the new rest state. Fire-and-
					// forget — the next snapshot fetch carries the ledger anyway.
					onCommit: (positions) => {
						void fetch("/api/graph/positions", {
							method: "PUT",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(positions),
						}).catch((err) => console.error("[graph] positions commit failed", err));
					},
				},
				initialCamera,
			);
			rendererRef.current = renderer;
			setRendererEpoch((epoch) => epoch + 1);
		}).catch(() => { if (!cancelled) setEngineFailed(true); });
		return () => {
			cancelled = true;
			rendererRef.current = null;
			// Flush a pending camera write so an unmount <250ms after a
			// move still persists the user's last standpoint.
			if (cameraTimer && lastCamera) {
				clearTimeout(cameraTimer);
				cameraTimer = null;
				try {
					localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(lastCamera));
				} catch {
					// best-effort
				}
			}
			renderer?.destroy();
		};
	}, [isEmpty, engineFailed]);

	// Feed #1 — data: positions + edges + clusters + resolved colors. Runs
	// after the layout effect (same commit, declaration order) and after
	// the construct effect, so the renderer exists and positions are fresh.
	useEffect(() => {
		const renderer = rendererRef.current;
		const positions = posRef.current;
		if (!renderer || !snapshot || snapshot.nodes.length === 0 || !positions || layoutSnapshot !== snapshot) return;
		renderer.setData({
			nodes: snapshot.nodes.map((n) => ({
				id: n.id,
				x: positions.get(n.id)?.x ?? 0,
				y: positions.get(n.id)?.y ?? 0,
				label: n.name,
			})),
			edges: snapshot.edges.map((e) => ({ from: e.from, to: e.to })),
			logicalEdges: snapshot.logicalEdges.map((e) => ({ from: e.from, to: e.to })),
			impLinks: snapshot.impLinks,
			clusters: snapshot.clusters.map((c) => ({ id: c.id, label: c.label, members: c.members })),
			colors: {
				node: tokenHex(NODE_COLOR_TOKEN),
				edge: tokenHex("--ring"),
				label: tokenHex("--muted-foreground"),
				hoverText: tokenHex("--foreground"),
			},
			// Match the app typography (Geist via the body's stack).
			fontFamily: getComputedStyle(document.body).fontFamily,
		});
		// Update paint and typography without resetting the live simulation.
		const observer = new MutationObserver(() => renderer.setTheme({
			node: tokenHex(NODE_COLOR_TOKEN),
			edge: tokenHex("--ring"),
			label: tokenHex("--muted-foreground"),
			hoverText: tokenHex("--foreground"),
		}, getComputedStyle(document.body).fontFamily));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
		return () => observer.disconnect();
	}, [snapshot, isEmpty, layoutSnapshot, rendererEpoch]);

	// Feed #2 — settings: just marks the frame dirty. No rebuild, no
	// re-layout, no camera touch (the whole point of the new renderer).
	const deferredSettings = useDeferredValue(settings);
	useEffect(() => {
		const renderer = rendererRef.current;
		if (!renderer) return;
		// A late download starts with the latest committed settings, even
		// if an expensive settings update still has a deferred render pending.
		renderer.setSettings(settingsRendererRef.current === renderer ? deferredSettings : settingsRef.current);
		settingsRendererRef.current = renderer;
	}, [deferredSettings, isEmpty, rendererEpoch]);

	// Feed #3 — visibility: hidden nodes drop out of rendering, picking,
	// hover, AND labels; edges drop when either endpoint is hidden.
	useEffect(() => {
		rendererRef.current?.setVisible(query.trim() ? visibleIds : null);
		// The open detail card cannot outlive its node's visibility.
		setSelected((sel) => (sel && visibleIds.has(sel.node.id) ? sel : null));
	}, [visibleIds, query, rendererEpoch]);

	// Feed #4 — region tuning. `isEmpty` in the deps (same as Feed #2):
	// the settings fetch resolves BEFORE the snapshot creates the renderer,
	// so the load-time run hits a null renderer and would never re-fire —
	// the renderer would silently keep the default tuning forever.
	useEffect(() => {
		rendererRef.current?.setRegionTuning(regionTuning);
	}, [regionTuning, isEmpty, rendererEpoch]);

	// Feed #5 — physics tuning: rebuilds the live sim in place (drag pins
	// survive; a mid-settle change re-anneals, the honest response). Same
	// isEmpty dep as Feed #4 — see there.
	useEffect(() => {
		rendererRef.current?.setPhysicsTuning(physicsTuning);
	}, [physicsTuning, isEmpty, rendererEpoch]);

	// Publish readiness after data, settings, visibility, and both tuning feeds
	// have run against the current renderer and snapshot.
	useEffect(() => {
		if (!rendererRef.current || layoutSnapshot !== snapshot || !snapshot || engineFailed) return;
		// setData scheduled the renderer's draw first; publish after that frame.
		const frame = requestAnimationFrame(() => setReadySnapshot(snapshot));
		return () => cancelAnimationFrame(frame);
	}, [snapshot, layoutSnapshot, rendererEpoch, engineFailed]);

	// Position the detail card: below the clicked node, flipped above near
	// the bottom edge, clamped horizontally. Imperative (ref + layout effect,
	// before paint) because the flip needs the card's measured height.
	useLayoutEffect(() => {
		const card = cardRef.current;
		const container = containerRef.current;
		if (!selected || !card || !container) return;
		const width = card.offsetWidth;
		const height = card.offsetHeight;
		const margin = 8;
		const gap = 12;
		const left = Math.min(
			Math.max(selected.anchor.x - width / 2, margin),
			Math.max(container.clientWidth - width - margin, margin),
		);
		let top = selected.anchor.y + gap;
		if (top + height > container.clientHeight - margin) {
			top = Math.max(selected.anchor.y - gap - height, margin);
		}
		card.style.left = `${left}px`;
		card.style.top = `${top}px`;
		card.style.visibility = "visible";
	}, [selected]);

	return (
		<div
			ref={rootRef}
			data-testid={section ? "graph-section-view" : undefined}
			data-expanded={expanded ? "true" : undefined}
			role={expanded ? "dialog" : undefined}
			aria-modal={expanded || undefined}
			aria-label={expanded ? "Knowledge graph" : undefined}
			tabIndex={expanded ? -1 : undefined}
			onKeyDown={expanded ? (event) => containModalTab(event, event.currentTarget) : undefined}
			className={cn(
				"relative w-full",
				!section ? "h-full" : expanded ? "fixed inset-0 z-50 h-dvh bg-background outline-none" : "h-[260px] overflow-hidden rounded-[10px] bg-card sm:h-[420px]",
			)}
			data-graph-ready={snapshot !== null && (isEmpty || (readySnapshot === snapshot && !engineFailed)) ? "true" : undefined}
		>
			{expanded && (
				<button
					ref={closeRef}
					type="button"
					onClick={section?.onCollapse}
					data-testid="graph-collapse"
					className="lh-no-drag lh-closed-toggle prompt-secondary absolute left-2 top-2 z-20 gap-2 bg-card"
				>
					<XIcon aria-hidden="true" className="size-4" />
					Close
				</button>
			)}
			{!isEmpty && engineFailed && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-5">
				<div role="alert" className="pointer-events-auto flex max-h-[50dvh] max-w-md flex-col items-center gap-3 overflow-y-auto rounded-xl bg-card p-5 text-center text-sm">
				<p>The knowledge graph could not load. Reload to retry. Your draft will be saved before reloading.</p>
				<button type="button" onClick={graphRecovery.reload} className="min-h-11 rounded-md border px-4">Reload to retry</button>
				{graphRecovery.error && <p>{graphRecovery.error}</p>}
				</div>
			</div>}
			{isEmpty ? (
				// The empty graph keeps the first action clear without zero-valued statistics.
				<div className="flex h-full w-full items-center justify-center px-4">
					<p data-testid="graph-empty" className="text-center text-ink-2">Start a session or import notes to build your graph.</p>
				</div>
			) : (
				<div ref={containerRef} className="relative h-full w-full">
					{/* THE single canvas: every layer (hulls, edges, nodes, both
					    label systems, hover) draws into it, once per frame. */}
					<canvas ref={canvasRef} className="block h-full w-full touch-none" />
					{readySnapshot !== snapshot && !engineFailed && <div role="status" aria-label="Loading knowledge graph" className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-sm text-muted-foreground">Loading knowledge graph…</div>}
					{/* The context menu's anchor: a zero-size point at the
					    right-click position (canvas-relative == container-relative,
					    the canvas fills this div). */}
					{ctxNode !== null && (
						<div
							ref={ctxAnchorRef}
							style={{ position: "absolute", left: ctxNode.x, top: ctxNode.y, width: 0, height: 0 }}
						/>
					)}
				</div>
			)}

			{/* The node context menu (node interlude): Delete is its one action
			    (the same MenuShell discipline as the sidebar's session menu —
			    placement, focus, arrow cycling; the dismissal effect above owns
			    the contract). */}
			{ctxNode !== null && (
				<MenuShell
					anchorRef={ctxAnchorRef}
					testid="node-context-menu"
					preferredSide="down"
					menuClass="flex w-fit flex-col gap-0.5 rounded-xl border bg-card p-2 text-sm "
				>
					<button
						type="button"
						data-testid="ctx-node-delete"
						onClick={() => {
							setDeletingNode({ id: ctxNode.id, name: ctxNode.name });
							setCtxNode(null);
						}}
						className="flex items-center rounded-lg px-2.5 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						Delete
					</button>
				</MenuShell>
			)}

			{/* The full-death confirm dialog (node interlude) — portaled to
			    body by the component itself, lives here for state locality. */}
			<DeleteNodeDialog
				nodes={deletingNode ? [deletingNode] : null}
				onClose={() => setDeletingNode(null)}
				onDeleted={(nodeIds, graphRevision) => {
					// Close the dialog; close the detail card if it pointed here
					// (the refetch would close it anyway, but the same frame
					// should not show a card for a node the user just killed).
					setDeletingNode(null);
					if (selected && nodeIds.includes(selected.node.id)) setSelected(null);
					// The wave-6 chain: every listener refetches on this. Clusters
					// shrink / unrender below the minimum on the server's read.
					window.dispatchEvent(new CustomEvent("lh:graph-revision", { detail: { graphRevision } }));
				}}
			/>



			{/* Legend + filters: search box and per-state toggle rows. */}
			{/* Top-right controls — separate floating containers (owner,
			    graph-view round 2). Row order (2026-09-17): search,
			    coverage, import, gear — coverage sits between search and
			    import; the gear keeps the corner. items-start (not center)
			    so the search container's no-match note can grow downward
			    without shifting its siblings — every control is 36px tall
			    (header band, 2026-09-20), top alignment pins the row.
			    Coverage renders even when the graph is EMPTY — an empty
			    graph with unextracted sessions is exactly when it matters
			    (extract → the graph gains nodes).
			    lh-no-drag (2026-09-17): home.tsx's floating drag strip
			    underlays this row — Electron's drag mask ignores z-index,
			    so without an explicit carve-out the controls were
			    unclickable in the desktop app (owner report). The old
				    flex-wrap folded the row onto two lines; the owner retained
				    one row. On phones, search now opens from its icon into a
				    viewport-wide field while the other actions hide. */}
			{/* Header band (owner, 2026-09-20): the controls sit IN the
			    header's visual row — top-2 aligns with the sidebar toggle's
			    band (header py-2, toggle h-9), every control slimmed to 36px.
			    The width cap lives HERE on the absolute element (100% resolves
			    against the full-bleed parent) — the row NEVER wraps (owner
			    rejected the two-row fold). Desktop search shrinks within this
			    row; the expanded phone search overlays it at viewport width. */}
			<div className={cn("lh-no-drag absolute right-2 top-2 z-10 flex flex-col items-end gap-2", section && !expanded ? "max-w-[calc(100%-1rem)]" : "lh-wco-floating max-w-[calc(100%-5.5rem)]")}>
			{/* z-20 (2026-09-20): the row paints above the cost number below
			    it — without this, the later-in-DOM cost control layered over
			    the settings/coverage dropdowns (owner report), still hoverable
			    and clickable on top of them. The row is a stacking context, so
			    its open dropdowns cover the number; clicks land on the panel. */}
			<div className="relative z-20 flex min-w-0 max-w-full items-start gap-2">
				{/* The actions row (empty-graph chrome wave, owner 2026-09-25):
				    Import Notes always — the empty graph's entry point; search +
				    settings only when nodes exist, fading in on their mount. */}
				<GraphChromeRow
					isEmpty={isEmpty}
					query={query}
					onQuery={setQuery}
					noMatch={snapshot !== null && visibleIds.size === 0 && query.trim() !== ""}
					searchInputRef={searchInputRef}
					onOpenChains={() => setChainsOpen(true)}
				/>
			</div>

			{/* Top-right tail (owner, 2026-09-20): the pipeline cost number —
			    just a number, hover-highlighted, dropdown breakdown — then
			    the running-pipeline pills under it. Lives BELOW the actions
			    row so narrow windows can never push it over the composer
			    the way the old bottom-left stack did; the whole top-right
			    cluster is one column, right-aligned. */}
			{costs && costs.runs.length > 0 && <GraphCostControl costs={costs} />}
			{pipelineRuns.map((run) => (
				<div
					key={run.id}
					className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground "
				>
					<Loader2Icon className="size-3.5 shrink-0 animate-spin" />
					<span className="capitalize">{run.phase}</span>
					<span className="max-w-48 truncate text-foreground">{run.title}</span>
					<span className="tabular-nums">{Math.max(0, Math.round((Date.now() - run.startedAt) / 1000))}s</span>
				</div>
			))}
			</div>

			{selected && !isEmpty && (
				<div
					ref={cardRef}
					// Positioned imperatively in the layout effect above; hidden
					// until placed so the flip never flashes in the wrong spot.
					style={{ visibility: "hidden", left: 0, top: 0 }}
					// lh-no-drag: the card is placed anywhere on the canvas —
					// when it lands in the top strip it must stay interactive
					// over home.tsx's drag surface (2026-09-17).
					className="lh-no-drag absolute z-10 w-80 max-w-[calc(100%-1rem)] rounded-xl border bg-card p-4 text-left "
				>
					<div className="text-sm font-medium leading-snug">{selected.node.name}</div>
					<div className="mt-1 text-sm leading-relaxed text-muted-foreground">{selected.node.statement}</div>
					{selected.sourceIds.length > 0 ? (
						<div className="mt-3 flex flex-col gap-1">
							<div className="text-sm text-muted-foreground">Sessions</div>
							{selected.sourceIds.map((sourceId) => {
								// An imported-notes file: a STATIC entry — the path,
								// plain text, never a link (no session to open).
								if (snapshot?.fileSources?.[sourceId] !== undefined) {
									return (
										<div key={sourceId} className="flex items-center gap-1.5">
											<FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
											<span className="min-w-0 flex-1 truncate px-2 py-1.5 text-sm text-muted-foreground">
												{snapshot.fileSources[sourceId]}
											</span>
										</div>
									);
								}
								// A real session: deep-linkable provenance.
								return (
									<div key={sourceId} className="flex items-center gap-1.5">
										<Link
											href={propositionSessionHref(selected.node, sourceId)}
											scroll={false}
											className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
										>
											{snapshot?.sessions[sourceId] ?? sourceId}
										</Link>
									</div>
								);
							})}
						</div>
					) : (
						<div className="mt-3 text-sm text-muted-foreground">No sessions recorded.</div>
					)}
				</div>
			)}
			{/* The chain table overlay (chains-overlay plan, 2026-09-29):
			    ABSOLUTE INSIDE the graph area (the session-overlay idiom —
			    never a body portal) so the app chrome stays sharp and
			    reachable; the overlay itself is read-only toward the graph
			    and owns its selection.
			    LAST CHILD OF THE ROOT, DELIBERATELY (owner, 2026-09-29
			    night): app-region subtraction resolves by DOM order, not
			    z-index — mounted earlier, the chrome's lh-no-drag column
			    punched dead zones through the overlay's TopBar drag band
			    (over the counts, around the search field). A full-bleed
			    surface covering a drag band must paint AFTER everything it
			    covers. (DeleteNodeDialog is body-portaled — DOM-irrelevant
			    here.) */}
			<InOverlayHost inPlace={expanded}><ChainTableOverlay
				open={chainsOpen && !isEmpty}
				nodes={snapshot?.propositions ?? []}
				chains={snapshot?.chains ?? []}
				sessions={snapshot?.sessions ?? {}}
				fileSources={snapshot?.fileSources ?? {}}
				onClose={() => {
					setChainsOpen(false);
					onChainSelectClose?.();
				}}
				selectMode={chainSelectOpen}
				controlledSelection={practiceSelection}
				onSelectionChange={(ids) => {
					// Resolve ids → nodes against the live snapshot; the
					// caller holds the pick set (count + seed).
					const props = snapshot?.propositions ?? [];
					const picked: { id: string; name: string; statement: string }[] = [];
					for (const id of ids) {
						const n = props.find((node) => node.id === id);
						if (n) picked.push({ id: n.id, name: n.name, statement: n.statement });
					}
					onPracticeSelectionChange?.(picked);
				}}
			/></InOverlayHost>
		</div>
	);
}
