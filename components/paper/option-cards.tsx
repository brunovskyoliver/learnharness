"use client";

/**
 * Option cards (feature 024 §19, lifted for both modes in feature 025, T040):
 * a labelled radio group of `.nb-option-card`s (radius 10, rule edge, the
 * chosen one a 1.5px ink ring, no fill). Arrow keys move and choose; only the
 * chosen card is in the tab order. Plus the greyscale thumbnails Notebook's
 * settings draw (where questions appear, appearance).
 */
import { RadioGroup } from "radix-ui";
import { useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { NotebookAppearance, NotebookLayout } from "@/src/core";
import { noteSoakOrigin } from "./appearance";
import { useArrowChoice } from "./shared";

/** The slide's longest run (300ms) with margin: past it the card's own ring is back. */
const SLIDE_MS = 600;

/**
 * Row 27 (feature 028, research R8): when the choice moves, one ink ring
 * slides from the old card to the new one (transform only, 300ms
 * `--spring-soft`), then hands back to the chosen card's own ring, so first
 * paint and no-JS keep the ring. Reduced motion: the ring jumps.
 */
function useSlidingRing(group: React.RefObject<HTMLDivElement | null>, ring: React.RefObject<HTMLSpanElement | null>, field: string, value: string) {
	const last = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
	const slides = useRef(0);
	useLayoutEffect(() => {
		const host = group.current, mark = ring.current;
		const card = host?.querySelector<HTMLElement>(`[data-testid="nb-set-${CSS.escape(field)}-${CSS.escape(value)}"]`);
		if (!host || !mark || !card) return;
		const to = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
		const from = last.current;
		last.current = to;
		if (!from || (from.left === to.left && from.top === to.top) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		Object.assign(mark.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, transition: "none" });
		mark.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
		host.setAttribute("data-ring-sliding", "");
		void mark.getBoundingClientRect();
		mark.style.transition = "";
		mark.style.transform = "none";
		const token = ++slides.current;
		const rest = () => { if (token === slides.current) host.removeAttribute("data-ring-sliding"); };
		const timer = window.setTimeout(rest, SLIDE_MS);
		const ended = (event: TransitionEvent) => { if (event.propertyName === "transform") rest(); };
		mark.addEventListener("transitionend", ended);
		return () => { window.clearTimeout(timer); mark.removeEventListener("transitionend", ended); rest(); };
	}, [group, ring, field, value]);
}

/** A section: its label and a radio group of option cards (`nb-set-{field}`). */
export function OptionCardGroup<T extends string>({ field, label, value, columns, onChange, rowId, children }: {
	field: string;
	label: string;
	value: T;
	columns: number;
	onChange: (value: T) => void;
	/** The settings search and deep-link target (`data-settings-row`). */
	rowId?: string;
	children: ReactNode;
}) {
	const id = useId();
	const group = useRef<HTMLDivElement>(null);
	const ring = useRef<HTMLSpanElement>(null);
	// Row 23: the chosen card is where a theme change soaks in from (pointer or keyboard).
	const choose = (next: T) => {
		const card = group.current?.querySelector<HTMLElement>(`[data-testid="nb-set-${CSS.escape(field)}-${CSS.escape(next)}"]`);
		if (card) noteSoakOrigin(card.getBoundingClientRect());
		onChange(next);
	};
	const arrows = useArrowChoice(value, choose);
	useSlidingRing(group, ring, field, value);
	return (
		<section className="nb-set-section" data-section={field} data-settings-row={rowId}>
			<h3 id={id} className="nb-set-label">{label}</h3>
			<RadioGroup.Root
				ref={group}
				aria-labelledby={id}
				className="nb-set-grid"
				style={{ "--cols": columns } as CSSProperties}
				value={value}
				onValueChange={(next) => choose(next as T)}
				{...arrows}
				loop
				data-testid={`nb-set-${field}`}
			>
				{children}
				<span ref={ring} className="lh-choice-ring" aria-hidden="true" />
			</RadioGroup.Root>
		</section>
	);
}

/** One card of an OptionCardGroup (`nb-set-{field}-{value}`). */
export function OptionCard({ field, value, className = "", label, children }: { field: string; value: string; className?: string; label?: string; children: ReactNode }) {
	return (
		<RadioGroup.Item value={value} className={`nb-option-card nb-set-card ${className}`} aria-label={label} data-testid={`nb-set-${field}-${value}`}>
			{children}
		</RadioGroup.Item>
	);
}

// ─── thumbnails (greyscale miniatures, drawn like the frame's) ──────────────

const Bar = ({ x, y, w, tone }: { x: number; y: number; w: number; tone: "text" | "head" | "note" }) => (
	<rect x={x} y={y} width={w} height={3} rx={1.5} className={`nb-thumb-${tone}`} />
);
const Tick = ({ d }: { d: string }) => <path d={d} className="nb-thumb-tick" />;

/** Where questions appear: the page column with its notes beside it. */
export function LayoutThumb({ layout }: { layout: NotebookLayout }) {
	return (
		<svg className="nb-thumb nb-thumb-layout" viewBox="0 0 158 96" aria-hidden="true" data-thumb={layout}>
			{layout === "both" && (
				<>
					<Bar x={55} y={20} w={40} tone="head" />
					<Bar x={55} y={36} w={50} tone="text" /><Bar x={55} y={44} w={46} tone="text" />
					<Bar x={55} y={60} w={58} tone="text" /><Bar x={55} y={68} w={52} tone="text" /><Bar x={55} y={76} w={40} tone="text" />
					<Tick d="M106 41 q6 -3 12 -1" /><Bar x={118} y={38} w={28} tone="note" /><Bar x={118} y={46} w={21} tone="note" />
					<Tick d="M53 69 q-6 3 -12 1" /><Bar x={11} y={68} w={28} tone="note" /><Bar x={11} y={76} w={20} tone="note" />
				</>
			)}
			{layout === "right" && (
				<>
					<Bar x={15} y={20} w={40} tone="head" />
					<Bar x={15} y={36} w={66} tone="text" /><Bar x={15} y={44} w={60} tone="text" />
					<Bar x={15} y={60} w={66} tone="text" /><Bar x={15} y={68} w={58} tone="text" /><Bar x={15} y={76} w={44} tone="text" />
					<Tick d="M84 41 q8 -3 16 -1" /><Bar x={102} y={38} w={38} tone="note" /><Bar x={102} y={46} w={30} tone="note" />
					<Tick d="M84 66 q8 -6 16 -8" /><Bar x={102} y={56} w={38} tone="note" /><Bar x={102} y={64} w={30} tone="note" />
				</>
			)}
			{layout === "marks" && (
				<>
					<Bar x={39} y={20} w={40} tone="head" />
					<Bar x={39} y={36} w={58} tone="text" /><Bar x={39} y={44} w={50} tone="text" />
					<circle cx={104} cy={45.5} r={3.6} className="nb-thumb-ring" />
					<rect x={35} y={53} width={86} height={24} rx={4} className="nb-thumb-card" />
					<Bar x={42} y={60} w={52} tone="note" /><Bar x={42} y={67} w={40} tone="note" />
					<Bar x={39} y={84} w={54} tone="text" />
				</>
			)}
		</svg>
	);
}

const THEME_INK = {
	light: { paper: "#f8f7f4", ink: "#1d1c1a", graphite: "#8e8a83", ring: "#dedbd4" },
	dark: { paper: "#1a1a19", ink: "#e9e7e2", graphite: "#a9a69e", ring: "#33322f" },
} as const;

function MiniToolbar({ theme }: { theme: "light" | "dark" }) {
	const c = THEME_INK[theme];
	return (
		<g>
			<rect x={18} y={22} width={64} height={3.5} rx={1.75} fill={c.ink} opacity={0.75} />
			<circle cx={98} cy={23.75} r={2.6} fill={c.ink} />
			<rect x={106} y={22} width={34} height={3.5} rx={1.75} fill={c.ink} opacity={0.75} />
			<rect x={18} y={33} width={44} height={3.5} rx={1.75} fill={c.graphite} opacity={0.8} />
		</g>
	);
}

/** Appearance: a mini toolbar on light paper, dark paper, or half of each. */
export function AppearanceThumb({ appearance }: { appearance: NotebookAppearance }) {
	const clip = useId().replace(/:/g, "");
	const panel = (theme: "light" | "dark") => (
		<>
			<rect x={0.5} y={0.5} width={157} height={59} rx={6} fill={THEME_INK[theme].paper} stroke={THEME_INK[theme].ring} />
			<MiniToolbar theme={theme} />
		</>
	);
	return (
		<svg className="nb-thumb nb-thumb-appearance" viewBox="0 0 158 60" aria-hidden="true" data-thumb={appearance}>
			{appearance === "system" ? (
				<>
					<defs>
						<clipPath id={`${clip}-l`}><rect x={0} y={0} width={79} height={60} /></clipPath>
						<clipPath id={`${clip}-r`}><rect x={79} y={0} width={79} height={60} /></clipPath>
					</defs>
					<g clipPath={`url(#${clip}-l)`}>{panel("light")}</g>
					<g clipPath={`url(#${clip}-r)`}>{panel("dark")}</g>
				</>
			) : panel(appearance)}
		</svg>
	);
}
