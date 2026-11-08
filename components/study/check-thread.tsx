"use client";

/**
 * A pending lesson check or practice problem as a thread (feature 025,
 * research R8, owner gate 1 Q2): Notebook's thread shell around the form.
 * In the margin it sits 71px right of the reading column beside the tutor
 * paragraph it follows, tethered to that paragraph's last line, portalled
 * into a layer beside the column (transcript rows paint-contain their
 * children, so nothing drawn outside a row could show). Where the lesson
 * has no room it sits inline under that paragraph, at its own place in the
 * transcript (Notebook's inline variant, 22px indent).
 *
 * Collapsed, the thread is one button: "Your turn · {kind}" (or "Check your
 * understanding" until a teach check is revealed), the teaser in the voice,
 * and Answer or Solve. Open, the form unfolds under its head. The form
 * stays mounted while the thread is closed, so nothing typed or chosen is
 * dropped; its state lives in session state with bare keys.
 */
import { createPortal } from "react-dom";
import { ChevronUpIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { InkDot } from "@/components/paper/ink-dot";
import { InkText } from "@/components/paper/ink-text";
import { Tether } from "@/components/paper/tether";
import { NOTE_LINE, placeStack, RIGHT_TEXT_GAP } from "@/components/paper/thread-geometry";
import { useMeasuredRefs } from "@/components/paper/use-measured-refs";
import { useSessionState } from "@/components/session-state";
import { cn } from "@/lib/utils";
import { DEFAULT_CONFIDENCE_INDEX } from "@/src/core";
import { CHECK_COLLAPSED_WIDTH, CHECK_OPEN_WIDTH, CHECK_PAD, checkColumn } from "./check-geometry";

export const REVEAL_LINE = "Check your understanding";
/** On the collapsed line when the closed thread holds a draft. */
export const DRAFT_KEPT = "Draft kept";

const NO_SELECTION = { selected: [] as number[], otherSelected: false, dontKnow: false };
/** Whether the form holds anything the learner typed, chose or moved: the
 *  same session keys the forms write (question-dock.tsx, practice-dock.tsx). */
export function useCheckDraft(kind: "question" | "problem", id: string): boolean {
	const prefix = `${kind}/${id}`;
	const [thinking] = useSessionState(`${prefix}/thinking`, "");
	const [text] = useSessionState(`${prefix}/text`, "");
	const [other] = useSessionState(`${prefix}/other`, "");
	const [selection] = useSessionState(`${prefix}/selection`, NO_SELECTION);
	const [confidence] = useSessionState(`${prefix}/confidence`, DEFAULT_CONFIDENCE_INDEX);
	if (thinking.trim()) return true;
	if (kind === "problem") return false;
	const chosen = (Array.isArray(selection.selected) && selection.selected.length > 0) || selection.otherSelected || selection.dontKnow;
	return Boolean(text.trim() || other.trim() || chosen || confidence !== DEFAULT_CONFIDENCE_INDEX);
}

/** Checks whose words have inked in this page load (a remount never re-inks). */
const inked = new Set<string>();

export interface CheckThreadProps {
	id: string;
	kind: "question" | "problem";
	/** The kind label (Lesson check, Question, Prediction, Explain, Recall, Problem). */
	label: string;
	/** The question or statement as plain text, for the collapsed line. */
	teaser: string;
	/** A teach check not yet revealed: the collapsed line invites. */
	reveal: boolean;
	open: boolean;
	/** Arrived while the lesson was open: the dot splats and the words ink in, once. */
	fresh: boolean;
	variant: "margin" | "inline";
	/** The margin layer beside the column (CheckMarginLayer). */
	layer: HTMLElement | null;
	/** The lesson's width and how far the column moved left for the margin. */
	lessonWidth: number;
	shift: number;
	/** The tutor paragraph it follows (`data-answer-part-id`), or null. */
	anchorId: string | null;
	onOpen: () => void;
	onClose: () => void;
	/** The "Using {demo}" line. */
	using?: ReactNode;
	children: ReactNode;
}

interface Placement { top: number; left: number; width: number; passageY: number; passageX?: number; column: { left: number; right: number } }

/** How to find a focused control again in a remounted thread, and where its caret was. */
type FocusMark = { selector: string; index: number; start: number | null; end: number | null };

function focusMark(root: Element, target: HTMLElement): FocusMark | null {
	const attr = (["aria-label", "data-kbdrow", "data-testid", "name"] as const).find((name) => target.hasAttribute(name));
	if (!attr) return null;
	const value = (target.getAttribute(attr) ?? "").replace(/["\\]/g, "\\$&");
	const selector = `[${attr}="${value}"]`;
	const index = [...root.querySelectorAll(selector)].indexOf(target);
	const field = target as HTMLInputElement | HTMLTextAreaElement;
	const caret = "selectionStart" in field && typeof field.selectionStart === "number";
	return { selector, index: Math.max(0, index), start: caret ? field.selectionStart : null, end: caret ? field.selectionEnd : null };
}

/** A field typed into while the software keyboard is up stays above the
 *  bottom bar (feature 025, T061): the bar rides on the keyboard
 *  (visualViewport), and the browser only brings a focused field into the
 *  visual viewport, which can leave it under the bar. */
export function keepFieldAboveBar(field: HTMLElement): void {
	const bar = document.querySelector<HTMLElement>('[data-testid="dock-shell"]');
	if (!bar) return;
	const gap = field.getBoundingClientRect().bottom - (bar.getBoundingClientRect().top - 12);
	if (gap <= 0) return;
	for (let el = field.parentElement; el; el = el.parentElement) {
		if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { el.scrollBy({ top: gap }); return; }
	}
}

function useFieldAboveKeyboard(root: () => HTMLElement | null, active: boolean) {
	const rootRef = useRef(root);
	rootRef.current = root;
	useEffect(() => {
		const el = rootRef.current();
		const view = typeof window === "undefined" ? undefined : window.visualViewport;
		if (!active || !el || !view || !window.matchMedia("(pointer: coarse)").matches) return;
		const typing = () => {
			const field = document.activeElement;
			return field instanceof HTMLElement && el.contains(field) && field.matches("textarea, input") ? field : null;
		};
		const fit = () => { const field = typing(); if (field) keepFieldAboveBar(field); };
		// The keyboard opens after focus; the bar moves with the viewport's resize.
		const onFocus = () => { requestAnimationFrame(fit); };
		el.addEventListener("focusin", onFocus);
		view.addEventListener("resize", fit);
		return () => { el.removeEventListener("focusin", onFocus); view.removeEventListener("resize", fit); };
	}, [active]);
}

export function CheckThread(props: CheckThreadProps) {
	const { id, kind, variant, layer } = props;
	const slotRef = useRef<HTMLDivElement>(null);
	const thread = <ThreadBody {...props} slotRef={slotRef} />;
	// Moving between the margin and inline (the right pane opens, the window narrows) mounts
	// the thread afresh; whatever had focus in it gets it back, caret and all.
	const mark = useRef<FocusMark | null>(null);
	useEffect(() => {
		const threadOf = (el: Element | null) => {
			const root = el?.closest('[data-testid="check-thread"]');
			return root?.getAttribute("data-check") === id ? root : null;
		};
		const onFocus = (event: FocusEvent) => {
			const target = event.target instanceof HTMLElement ? event.target : null;
			const root = threadOf(target);
			mark.current = root && target ? focusMark(root, target) : null;
		};
		// The caret moves without a focus event; keep its place.
		const onKey = () => {
			const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			const root = threadOf(active);
			if (root && active) mark.current = focusMark(root, active);
		};
		document.addEventListener("focusin", onFocus);
		document.addEventListener("keyup", onKey);
		document.addEventListener("pointerup", onKey);
		return () => {
			document.removeEventListener("focusin", onFocus);
			document.removeEventListener("keyup", onKey);
			document.removeEventListener("pointerup", onKey);
		};
	}, [id]);
	const placed = useRef(variant);
	useLayoutEffect(() => {
		if (placed.current === variant) return;
		placed.current = variant;
		const wanted = mark.current;
		const active = document.activeElement;
		if (!wanted || (active && active !== document.body)) return;
		const root = [...document.querySelectorAll('[data-testid="check-thread"]')].find((el) => el.getAttribute("data-check") === id);
		const target = root?.querySelectorAll<HTMLElement>(wanted.selector)[wanted.index];
		if (!target) return;
		target.focus({ preventScroll: true });
		if (wanted.start !== null && "setSelectionRange" in target) (target as HTMLTextAreaElement).setSelectionRange(wanted.start, wanted.end ?? wanted.start);
	}, [variant, id]);
	return (
		<div ref={slotRef} data-check-slot={id} data-check-kind={kind}>
			{variant === "inline" ? thread : layer ? createPortal(thread, layer) : null}
		</div>
	);
}

function ThreadBody({ id, kind, label, teaser, reveal, open, fresh, variant, layer, lessonWidth, shift, anchorId, onOpen, onClose, using, children, slotRef }: CheckThreadProps & { slotRef: React.RefObject<HTMLDivElement | null> }) {
	const margin = variant === "margin";
	// A closed thread says when it holds his draft; an empty one says nothing.
	const draft = useCheckDraft(kind, id);
	useFieldAboveKeyboard(() => elements.get(id) ?? null, !margin && open);
	const { elements, refFor, bump } = useMeasuredRefs();
	const [place, setPlace] = useState<Placement | null>(null);
	const [tick, setTick] = useState(0);
	// The teaser and the dot ink in once, on arrival; the question inks in on its first opening.
	const [inkTeaser] = useState(() => fresh && !inked.has(id));
	const [inkBody, setInkBody] = useState(false);
	const openedRef = useRef(false);
	useEffect(() => {
		if (!open) { setInkBody(false); return; }
		if (openedRef.current) return;
		openedRef.current = true;
		if (fresh && !inked.has(`${id}:open`)) { inked.add(`${id}:open`); setInkBody(true); }
	}, [open, fresh, id]);
	useEffect(() => { if (fresh) inked.add(id); }, [fresh, id]);

	// The lesson grows and shrinks under the thread (earlier chunks mount, a demo resizes).
	useEffect(() => {
		if (!margin || !layer) return;
		const lesson = layer.parentElement?.querySelector<HTMLElement>('[data-testid="lesson-content"]');
		if (!lesson || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(() => setTick((n) => n + 1));
		observer.observe(lesson);
		return () => observer.disconnect();
	}, [margin, layer]);

	useLayoutEffect(() => {
		if (!margin || !layer) return;
		const box = layer.getBoundingClientRect();
		const lesson = layer.parentElement?.querySelector<HTMLElement>('[data-testid="lesson-content"]');
		const anchor = (anchorId ? layer.parentElement?.querySelector<HTMLElement>(`[data-answer-part-id="${CSS.escape(anchorId)}"]`) : null) ?? slotRef.current;
		if (!anchor || !lesson) return;
		const end = lastLineEnd(anchor);
		const passageY = end.y - box.top;
		const height = elements.get(id)?.offsetHeight ?? NOTE_LINE * 3;
		const bottom = lesson.getBoundingClientRect().bottom - box.top;
		const wanted = placeStack([{ id, want: passageY - NOTE_LINE / 2, height }]).get(id) ?? 0;
		// Never past the lesson's end, where the bottom bar covers it.
		const top = Math.max(0, Math.min(wanted, bottom - height));
		const column = checkColumn(lessonWidth, shift);
		// Just past the last word, in the column's coordinates (the tether's x = 0 is the column's left edge).
		// Measured from the lesson's own edge, not the layer's: the lesson eases left (margin-left
		// transition) when it makes room for the thread, and the words move with it.
		const passageX = end.x === null ? undefined : end.x - lesson.getBoundingClientRect().left - CHECK_PAD + 6;
		const next = { top, left: column.right + RIGHT_TEXT_GAP, width: open ? CHECK_OPEN_WIDTH : CHECK_COLLAPSED_WIDTH, passageY, passageX, column };
		setPlace((prev) => (prev && Math.abs(prev.top - next.top) < 0.5 && prev.left === next.left && prev.width === next.width && Math.abs(prev.passageY - next.passageY) < 0.5 && Math.abs((prev.passageX ?? 0) - (next.passageX ?? 0)) < 0.5 && prev.column.left === next.column.left ? prev : next));
	}, [margin, layer, anchorId, id, elements, bump, tick, lessonWidth, shift, open, slotRef]);

	const action = kind === "problem" ? "Solve" : "Answer";
	const testId = kind === "problem" ? "practice-dock-bar" : reveal ? "teach-check-reveal" : "question-dock-bar";
	const style: React.CSSProperties | undefined = margin
		? place ? { top: place.top, left: place.left, width: place.width } : { top: 0, left: 0, width: CHECK_COLLAPSED_WIDTH, opacity: 0, pointerEvents: "none" }
		: undefined;

	const body = (
		<section
			ref={refFor(id)}
			aria-label={`Your turn: ${label}`}
			data-testid="check-thread"
			data-check={id}
			data-variant={variant}
			data-state={open ? "open" : "collapsed"}
			data-side={margin ? "right" : undefined}
			className={cn(margin ? "nb-note lh-check-note" : "nb-inline lh-check-inline", "lh-check-thread", fresh && inkTeaser && "nb-settle")}
			style={style}
		>
			<InkDot fresh={inkTeaser} className={margin ? "nb-note-dot" : "nb-inline-dot"} />
			{margin && open && <span className="nb-thread-rail" aria-hidden="true" />}
			{open ? (
				<div className="lh-check-head">
					<span className="lh-check-meta"><span className="lh-check-turn">Your turn</span> · <span>{label}</span></span>
					<button type="button" className="nb-thread-button lh-check-collapse" aria-label={kind === "problem" ? "Collapse problem" : "Collapse question"} onClick={() => {
						onClose();
						// The control goes with the open head: focus returns to the thread's button.
						requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="check-thread"][data-check="${CSS.escape(id)}"] .lh-check-open`)?.focus({ preventScroll: true }));
					}}>
						<ChevronUpIcon aria-hidden="true" />
					</button>
				</div>
			) : (
				<button type="button" className="nb-thread-open lh-check-open" aria-expanded={false} data-testid={testId} onClick={onOpen}>
					<span className="lh-check-meta"><span className="lh-check-turn">Your turn</span> · <span>{reveal ? REVEAL_LINE : label}</span></span>
					<span className="lh-check-teaser nb-voice"><InkText text={teaser || (kind === "problem" ? "Open the active problem" : "")} animate={inkTeaser} /></span>
					{draft && <span className="lh-check-draft" data-testid="check-draft-kept">{DRAFT_KEPT}</span>}
					<span className="lh-check-action">{action}</span>
				</button>
			)}
			{using}
			<div className={cn("lh-check-body", open && "nb-unfold", inkBody && "lh-check-inking")} hidden={!open} inert={!open}>
				{children}
			</div>
		</section>
	);

	if (!margin) return body;
	return (
		<>
			{place && (
				<div className="lh-check-tether" aria-hidden="true" style={{ left: place.column.left, width: place.column.right - place.column.left }}>
					<svg className="nb-tether">
						<Tether key={open ? "open" : "closed"} threadId={id} side="right" columnWidth={place.column.right - place.column.left} noteY={place.top + NOTE_LINE / 2} passageY={place.passageY} passageX={place.passageX} faint={!open} />
					</svg>
				</div>
			)}
			{body}
		</>
	);
}

/**
 * The centre of an element's last line of words and where that line ends.
 * Only text counts, never the response's copy row under it, so the tether
 * ends on the tutor's last word. With no text, the element's box (x null).
 */
function lastLineEnd(element: HTMLElement): { y: number; x: number | null } {
	try {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => (!node.textContent?.trim() || node.parentElement?.closest('[data-testid="response-actions"], .katex-mathml, .sr-only') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
		});
		let last: Node | null = null;
		for (let node = walker.nextNode(); node; node = walker.nextNode()) last = node;
		if (last) {
			const range = document.createRange();
			range.selectNodeContents(last);
			const rect = [...range.getClientRects()].filter((r) => r.height > 0 && r.width > 0).at(-1);
			if (rect) return { y: (rect.top + rect.bottom) / 2, x: rect.right };
		}
	} catch {
		// fall through to the box
	}
	const box = element.getBoundingClientRect();
	return { y: box.bottom - NOTE_LINE / 2, x: null };
}

/**
 * The layer the margin thread is portalled into: a sibling of the reading
 * column inside the scrolled lesson, as wide as the lesson. It reports the
 * lesson's width, which decides margin or inline (check-geometry.ts).
 */
export function CheckMarginLayer({ onLayer, onWidth }: { onLayer: (el: HTMLDivElement | null) => void; onWidth: (width: number) => void }) {
	const ref = useRef<HTMLDivElement>(null);
	const widthRef = useRef(onWidth);
	widthRef.current = onWidth;
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		onLayer(el);
		const measure = () => widthRef.current(el.clientWidth);
		measure();
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
		observer?.observe(el);
		return () => { observer?.disconnect(); onLayer(null); };
	}, [onLayer]);
	return <div ref={ref} data-testid="check-margin" className="lh-check-margin" />;
}
