"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { subscriptionLabels, type SessionPricing, type TurnUsage } from "@/src/core";
import { formatTokens, planCostLabel } from "@/components/usage-format";
import { ModelControl, catalogLimits, useModelCatalog } from "@/components/model-picker";
import { MenuShell } from "@/components/menu-shell";

export function formatContextMeasurement(tokens: number | null, limit: number | null): string {
	const numerator = tokens === null ? "?" : formatTokens(tokens);
	return limit === null ? numerator : `${numerator} / ${formatTokens(limit)}`;
}

/** Every token the session's turns used: input, cache and output. */
export function totalTokens(turns: TurnUsage[]): number {
	let n = 0;
	for (const t of turns)
		for (const s of t.steps) n += (s.inputTokens ?? 0) + (s.outputTokens ?? 0) + (s.cacheReadTokens ?? 0) + (s.cacheWriteTokens ?? 0);
	return n;
}

/**
 * Composer toolbar: model and thinking controls lead, with the session's
 * usage alongside them. Clicking usage opens its detail popover.
 *
 *  Pre-chat views (home, /chat/new) render NO left side at all (owner,
 *  wave 7 sweep: the knowledge-context budget slider that used to live
 *  there died with the injection; a "— · —" summary over an empty
 *  popover is pure noise). Dictate sits right, beside the model pills.
 *
 * Spending arrives already priced by the server through Pi's catalog and
 * calculator. Missing cost stays "—", never fake zero. Context is a separate
 * completed-conversation measurement, never a money-log/summarizer fold or
 * transcript estimate. Its catalog denominator follows the selected model;
 * model changes preserve the numerator. Successful compaction clears it to ?.
 */
export function StatsBarDetails({
	turns,
	contextTokens = null,
	pricing,
	chatId,
	leadingSlot,
}: {
	turns: TurnUsage[];
	contextTokens?: number | null;
	pricing?: SessionPricing;
	/** The bound session (per-session models, owner 2026-09-28): present
	 *  on the in-session bar — the model control binds THE SESSION'S own
	 *  record; absent on the draft surfaces, where it binds the strong
	 *  slot (the new-session default). */
	chatId?: string;
	/** The row's LEFT edge (practice sessions, 2026-10-04): the home
	 *  composer's teach | practice switch rides here — before the session
	 *  data (which renders nothing pre-chat on that surface). */
	leadingSlot?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [selectedModel, setSelectedModel] = useState<string | undefined>();
	// Same dropdown discipline as the model control (owner, df4433f treatment,
	// stats round 1): close on any pointerdown outside the bar or on Escape.
	const barRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			if ((e.target as Element).closest("[data-lh-menu]")) return;
			if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				// THE ONE-ESC LAW (keyboard round 2026-10-06): claim — the
				// window chain must not also act under this popover.
				e.preventDefault();
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);
	// Catalog-only denominator; the picker reports its effective selection.
	// Missing/pending catalog means usage-only, never a hardcoded maximum.
	const { catalog } = useModelCatalog();
	const limits = useMemo(() => (catalog ? catalogLimits(catalog) : undefined), [catalog]);
	const limit = selectedModel ? limits?.get(selectedModel) ?? null : null;
	const contextLabel = formatContextMeasurement(contextTokens, limit);
	const fraction = contextTokens !== null && limit !== null && limit > 0 ? Math.min(1, contextTokens / limit) : 0;
	// Hover previews the detail; a short grace lets the pointer cross into it.
	const leaveTimer = useRef<number | undefined>(undefined);
	const peek = () => {
		window.clearTimeout(leaveTimer.current);
		setOpen(true);
	};
	const unpeek = () => {
		window.clearTimeout(leaveTimer.current);
		leaveTimer.current = window.setTimeout(() => setOpen(false), 150);
	};
	useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
	const { cost = 0, unpriced = turns.length, subscription = 0 } = pricing ?? {};
	// Honest cost: show dollars only when at least one turn priced;
	// otherwise "—" (never a fake $0.0000).
	const pricedCount = turns.length - unpriced - subscription;
	const providers = pricing?.subscriptionProviders ?? subscriptionLabels(turns.map((turn) => turn.model));
	const costLabel = planCostLabel(pricedCount > 0 ? cost : null, providers);

	return (
		<div
			data-testid="stats-bar"
			// pointer-events-auto: the sticky composer wrapper is pointer-events-none
			// (so its transparent gradient area never blocks scrolling) — this row
			// must re-enable events or every control on it is dead (the model-
			// control wave caught this live: buttons rendered, clicks never landed).
			className="pointer-events-auto relative flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground"
		>
			<ModelControl chatId={chatId} onModelChange={setSelectedModel} />
			{/* The summary button + its popover: the popover anchors to this
			    wrapper, CENTERED over the button itself (owner, stats round 2)
			    — not over the whole bar row, which made it line up oddly. The
			    outside-close ref anchors HERE too (owner, round 3): on the whole
			    bar it wrapped the model control, so clicking model/thinking never
			    counted as outside — the asymmetry the owner observed. */}
			{/* The leading slot (2026-10-04): the leftmost control surface —
			    the home composer's mode switch. */}
			{leadingSlot}
			{/* The left side: the session-data summary — only once a session
			    exists (turns). Pre-chat renders nothing (see the header). */}
			{(chatId || turns.length > 0) && (
			<div ref={barRef} className="relative ml-2 sm:ml-auto">
				{/* No tooltip — the numbers describe themselves and the popover
			    speaks on click (owner, subtlety round 2026-09-25). */}
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				onPointerEnter={(e) => { if (e.pointerType === "mouse") peek(); }}
				onPointerLeave={(e) => { if (e.pointerType === "mouse") unpeek(); }}
				aria-expanded={open}
				data-testid="stats-summary"
				className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-accent hover:text-foreground"
			>
				<ContextRing fraction={fraction} />
				{/* The ring's figures, spoken: the bar shows only the gauge. */}
				<span className="sr-only">
					Session usage: context <span data-testid="stats-context">{contextLabel}</span>, <span data-testid="stats-cost">{costLabel}</span>
				</span>
			</button>
				{open && (
					<MenuShell
						anchorRef={barRef}
						testid="stats-detail"
						preferredSide="up"
						focusOnOpen={false}
						onPointerEnter={peek}
						onPointerLeave={unpeek}
						menuClass="w-64 rounded-lg border bg-card p-3 text-sm shadow-xl"
					>
						{/* Summary only (ui-v2): context, turns, tokens, usage. */}
						<div className="mb-1.5 flex items-baseline justify-between gap-2">
							<span className="text-muted-foreground">Context</span>
							<span className="tabular-nums text-card-foreground">{contextLabel}</span>
						</div>
						{contextTokens !== null && limit !== null && limit > 0 && (
							<div className="mb-3 h-1 overflow-hidden rounded-full bg-accent" aria-hidden>
								<div className="h-full rounded-full bg-foreground/60" style={{ width: `${fraction * 100}%` }} />
							</div>
						)}
						<dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-muted-foreground">
							<dt>Turns</dt>
							<dd className="text-right tabular-nums text-card-foreground">{turns.length}</dd>
							<dt>Tokens used</dt>
							<dd className="text-right tabular-nums text-card-foreground">{formatTokens(totalTokens(turns))}</dd>
							<dt>{subscription ? "Plan" : "Cost"}</dt>
							<dd className="text-right tabular-nums text-card-foreground">{costLabel}</dd>
						</dl>
						{providers.includes("ChatGPT") && (
							<a
								href="https://chatgpt.com/settings/usage"
								target="_blank"
								rel="noreferrer"
								className="mt-3 block border-t border-border pt-2 text-muted-foreground transition-colors hover:text-foreground"
							>
								Manage usage ↗
							</a>
						)}
					</MenuShell>
				)}
			</div>
			)}
		</div>
	);
}

/** Model and reasoning triggers stay directly in the composer toolbar. */
export function StatsBar(props: Parameters<typeof StatsBarDetails>[0]) {
	return <StatsBarDetails {...props} />;
}

/** The bar's context gauge: a ring filling clockwise with context used. */
function ContextRing({ fraction }: { fraction: number }) {
	const r = 6;
	const c = 2 * Math.PI * r;
	return (
		<svg aria-hidden="true" data-testid="stats-context-meter" viewBox="0 0 16 16" className="size-4 -rotate-90">
			<circle cx="8" cy="8" r={r} fill="none" stroke="var(--border)" strokeWidth="2" />
			<circle
				cx="8"
				cy="8"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeDasharray={c}
				strokeDashoffset={c * (1 - fraction)}
				className={fraction > 0 ? "transition-[stroke-dashoffset] duration-300" : "opacity-0"}
			/>
		</svg>
	);
}
