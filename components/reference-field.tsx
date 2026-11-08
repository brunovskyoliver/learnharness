"use client";

/**
 * Chips in a text field (feature 027, US2, research R3-R5). The field stays the
 * plain `<textarea>` it was: its value, events, caret, selection, undo and IME
 * are the browser's. Behind it a mirror layer draws the same characters with the
 * same metrics, and the textarea's own text is transparent, so what shows is the
 * mirror with each reference's characters restyled as a chip. A chip may only
 * restyle the characters it covers, so nothing moves: the caret the browser
 * draws sits where the mirror's characters are.
 *
 * Presentation only (constitution III): the draft is never touched, except that
 * Backspace right after a chip (or Delete right before it) selects the chip and
 * deletes it through the browser's own editing, so one undo brings it back.
 * When `field-sizing` is unsupported or the mirror's height drifts from the
 * field's (a font not loaded, a style differing), the overlay turns off and the
 * field is exactly today's.
 *
 * In the composer's startup graph: no Library code, no navigation.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { KIND_ICON } from "@/components/reference-icons";
import type { MentionCatalog } from "@/components/library/use-library-mention.ts";
import { chipDeleteRange, referenceForms, referenceSpans, type ChipState, type LibraryItem, type LibraryKind, type LibraryTombstone, type ReferenceForm } from "@/src/core";

type Entry = LibraryItem | LibraryTombstone;

/** What the mirror copies from the field, so both lay their text out alike. */
const METRICS = [
	"box-sizing", "padding-top", "padding-right", "padding-bottom", "padding-left",
	"border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
	"font-family", "font-size", "font-weight", "font-style", "font-stretch", "font-variant", "font-feature-settings", "font-variation-settings", "font-kerning", "font-optical-sizing",
	"line-height", "letter-spacing", "word-spacing", "text-transform", "text-indent", "text-align", "text-rendering", "tab-size",
	"white-space", "overflow-wrap", "word-break", "line-break", "hyphens", "direction", "unicode-bidi",
] as const;

const overlaySupported = () => typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("field-sizing", "content");

let warned = false;
function warnOnce(reason: string) {
	if (warned) return;
	warned = true;
	console.warn(`[reference-field] chips off for this field: ${reason}`);
}

/** The forms the mirror draws, with what each chip shows. */
export function fieldChips(value: string, catalog: MentionCatalog | null): { form: ReferenceForm<Entry>; state: ChipState; kind: LibraryKind }[] {
	if (!catalog || !value.includes("@") && !value.includes("<library_passage")) return [];
	const byId = new Map(catalog.entries.map((entry) => [entry.id, entry]));
	const forms = referenceForms(value, referenceSpans(value, catalog.entries, catalog.folders));
	return forms.map((form) => {
		const entry = form.span?.entry ?? byId.get(form.itemId);
		const gone = entry !== undefined && "deletedAt" in entry;
		return { form, state: gone ? (catalog.removedIds.has(entry.id) ? "removed" : "deleted") : "live", kind: entry?.kind ?? "pdf" };
	});
}

export function ReferenceField({ value, catalog, inputRef, children, className }: {
	value: string;
	/** The @ list's loaded list; null draws plain text (the list loads on a trigger). */
	catalog: MentionCatalog | null;
	inputRef: RefObject<HTMLTextAreaElement | null>;
	/** The field's own `<textarea>`. */
	children: ReactNode;
	className?: string;
}) {
	const mirrorRef = useRef<HTMLDivElement>(null);
	const [on, setOn] = useState(false);
	const [composition, setComposition] = useState<{ start: number; length: number } | null>(null);
	const chips = useMemo(() => fieldChips(value, catalog), [value, catalog]);
	const forms = useRef(chips);
	forms.current = chips;

	// The mirror takes the field's metrics; it is turned on only where it can match.
	useEffect(() => {
		const field = inputRef.current;
		const mirror = mirrorRef.current;
		if (!field || !mirror) return;
		if (!overlaySupported()) return;
		const copy = () => {
			const style = getComputedStyle(field);
			for (const name of METRICS) mirror.style.setProperty(name, style.getPropertyValue(name));
			mirror.style.setProperty("border-style", "solid");
		};
		copy();
		setOn(true);
		const observer = new ResizeObserver(copy);
		observer.observe(field);
		return () => observer.disconnect();
	}, [inputRef]);

	// The metrics guard (R4): equal text in equal boxes must be equally tall.
	useEffect(() => {
		if (!on) return;
		const field = inputRef.current;
		const mirror = mirrorRef.current;
		if (!field || !mirror) return;
		const check = () => {
			if (!field.value || !mirror.isConnected) return;
			const drift = Math.abs(mirror.scrollHeight - field.scrollHeight);
			if (drift > 1) {
				warnOnce(`the mirror is ${mirror.scrollHeight}px tall, the field ${field.scrollHeight}px`);
				setOn(false);
			}
		};
		void document.fonts?.ready.then(check);
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, [on, inputRef]);

	// After each draw: the mirror scrolls with the field and is checked again.
	useLayoutEffect(() => {
		const field = inputRef.current;
		const mirror = mirrorRef.current;
		if (!on || !field || !mirror) return;
		mirror.scrollTop = field.scrollTop;
		if (field.value && Math.abs(mirror.scrollHeight - field.scrollHeight) > 1) {
			warnOnce(`the mirror is ${mirror.scrollHeight}px tall, the field ${field.scrollHeight}px`);
			setOn(false);
		}
	});

	// Scroll, composition and the whole-chip Backspace, on the field itself.
	useEffect(() => {
		const field = inputRef.current;
		if (!on || !field) return;
		const scroll = () => { if (mirrorRef.current) mirrorRef.current.scrollTop = field.scrollTop; };
		let start = 0;
		const compositionStart = () => { start = field.selectionStart; setComposition({ start, length: 0 }); };
		const compositionUpdate = (event: CompositionEvent) => setComposition({ start, length: event.data.length });
		const compositionEnd = () => setComposition(null);
		const keydown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			const range = chipDeleteRange(field.value, { start: field.selectionStart, end: field.selectionEnd }, {
				key: event.key, composing: event.isComposing, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey,
			}, forms.current.map((chip) => chip.form));
			if (!range) return;
			const caret = field.selectionStart;
			field.setSelectionRange(range[0], range[1]);
			// The browser's own edit: it fires `input` and joins the undo stack (R5).
			if (document.execCommand("delete")) event.preventDefault();
			else field.setSelectionRange(caret, caret);
		};
		field.addEventListener("scroll", scroll);
		field.addEventListener("compositionstart", compositionStart);
		field.addEventListener("compositionupdate", compositionUpdate);
		field.addEventListener("compositionend", compositionEnd);
		field.addEventListener("keydown", keydown);
		return () => {
			field.removeEventListener("scroll", scroll);
			field.removeEventListener("compositionstart", compositionStart);
			field.removeEventListener("compositionupdate", compositionUpdate);
			field.removeEventListener("compositionend", compositionEnd);
			field.removeEventListener("keydown", keydown);
		};
	}, [on, inputRef]);

	const drawn = useMemo(() => (on ? mirrorPieces(value, chips, composition) : null), [on, value, chips, composition]);

	return (
		<div className={className ? `lh-ref-field ${className}` : "lh-ref-field"} data-overlay={on ? "on" : undefined}>
			<div ref={mirrorRef} className="lh-ref-mirror" aria-hidden="true" data-testid="ref-mirror">{drawn}</div>
			{children}
		</div>
	);
}

/** The mirror's content: the value, character for character, chips restyled. */
export function mirrorPieces(value: string, chips: ReturnType<typeof fieldChips>, composition: { start: number; length: number } | null): ReactNode[] {
	const out: ReactNode[] = [];
	let key = 0;
	const comp = composition && composition.length > 0 ? [composition.start, composition.start + composition.length] as const : null;
	/** Characters [from, to), with the composition underline where it falls. */
	const text = (from: number, to: number, className?: string): ReactNode[] => {
		if (to <= from) return [];
		const cut = comp ? [from, Math.min(Math.max(comp[0], from), to), Math.min(Math.max(comp[1], from), to), to] : [from, to];
		const parts: ReactNode[] = [];
		for (let i = 0; i + 1 < cut.length; i++) {
			const [a, b] = [cut[i]!, cut[i + 1]!];
			if (b <= a) continue;
			const composing = comp !== null && i === 1;
			const cls = [className, composing ? "lh-ref-composing" : ""].filter(Boolean).join(" ");
			parts.push(cls ? <span key={key++} className={cls}>{value.slice(a, b)}</span> : value.slice(a, b));
		}
		return parts;
	};
	/** Quoted lines: `>` markers or the passage's tags transparent, the words italic. */
	const body = (from: number, to: number, state: ChipState): ReactNode => {
		const parts: ReactNode[] = [];
		let at = from;
		while (at < to) {
			const eol = Math.min(value.indexOf("\n", at) === -1 ? to : value.indexOf("\n", at), to);
			const line = value.slice(at, eol);
			const marker = /^<\/?library_passage[^\n]*$/.test(line) ? line.length : (/^> ?/.exec(line)?.[0].length ?? 0);
			parts.push(...text(at, at + marker, "lh-ref-chip-marker"), ...text(at + marker, eol, "lh-ref-chip-passage"));
			if (eol < to) parts.push(...text(eol, eol + 1));
			at = eol + 1;
		}
		return <span key={key++} className="lh-ref-chip lh-ref-chip-body" data-state={state}>{parts}</span>;
	};
	let at = 0;
	for (const { form, state, kind } of chips) {
		const [start, end] = form.range;
		if (start < at) continue;
		out.push(...text(at, start));
		const Icon = KIND_ICON[kind];
		if (form.span) {
			const head = form.span.end;
			const page = form.page !== undefined && !form.passageOnly ? /^, page \d+/.exec(value.slice(head))?.[0] ?? "" : "";
			out.push(
				<span key={key++} className="lh-ref-chip" data-state={state} data-kind={kind} data-testid="ref-field-chip">
					<span className="lh-ref-chip-at">{text(start, start + 1)}<Icon aria-hidden="true" focusable="false" /></span>
					{text(start + 1, head)}
					{page && <span className="lh-ref-chip-page">{text(head, head + page.length)}</span>}
				</span>,
			);
			if (form.quote !== undefined) {
				// The rest of the first line and the blank line, then the passage under the head.
				const bodyStart = value.indexOf("\n\n", head + page.length) + 2;
				out.push(...text(head + page.length, bodyStart), body(bodyStart, end, state));
			}
		} else {
			out.push(body(start, end, state));
		}
		at = end;
	}
	out.push(...text(at, value.length));
	// A last empty line keeps its height.
	if (value === "" || value.endsWith("\n")) out.push("​");
	return out;
}
