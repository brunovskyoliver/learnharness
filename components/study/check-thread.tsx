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
import { cn } from "@/lib/utils";
import { CHECK_COLLAPSED_WIDTH, CHECK_OPEN_WIDTH, checkColumn } from "./check-geometry";

export const REVEAL_LINE = "Check your understanding";

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

interface Placement { top: number; left: number; width: number; passageY: number; column: { left: number; right: number } }

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
		const passageY = lastLineCentre(anchor) - box.top;
		const height = elements.get(id)?.offsetHeight ?? NOTE_LINE * 3;
		const bottom = lesson.getBoundingClientRect().bottom - box.top;
		const wanted = placeStack([{ id, want: passageY - NOTE_LINE / 2, height }]).get(id) ?? 0;
		// Never past the lesson's end, where the bottom bar covers it.
		const top = Math.max(0, Math.min(wanted, bottom - height));
		const column = checkColumn(lessonWidth, shift);
		const next = { top, left: column.right + RIGHT_TEXT_GAP, width: open ? CHECK_OPEN_WIDTH : CHECK_COLLAPSED_WIDTH, passageY, column };
		setPlace((prev) => (prev && Math.abs(prev.top - next.top) < 0.5 && prev.left === next.left && prev.width === next.width && Math.abs(prev.passageY - next.passageY) < 0.5 && prev.column.left === next.column.left ? prev : next));
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
						<Tether key={open ? "open" : "closed"} threadId={id} side="right" columnWidth={place.column.right - place.column.left} noteY={place.top + NOTE_LINE / 2} passageY={place.passageY} faint={!open} />
					</svg>
				</div>
			)}
			{body}
		</>
	);
}

/** The vertical centre of an element's last line of text (its last box when it has no text). */
function lastLineCentre(element: HTMLElement): number {
	try {
		const range = document.createRange();
		range.selectNodeContents(element);
		const rects = [...range.getClientRects()].filter((rect) => rect.height > 0 && rect.width > 0);
		const last = rects.at(-1);
		if (last) return (last.top + last.bottom) / 2;
	} catch {
		// fall through to the box
	}
	const box = element.getBoundingClientRect();
	return box.bottom - NOTE_LINE / 2;
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
