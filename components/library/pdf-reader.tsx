"use client";

/**
 * The in-app PDF reader (feature 020). Loaded with the first PDF. It renders with
 * pdf.js onto a canvas under a selectable text layer, and runs nothing from the
 * file (see pdf-options.ts). The learner's bytes are never written: highlights and
 * notes live in the annotation store, per item id.
 */
import "./pdf-reader.css";
import { useRouter } from "next/navigation";
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, HighlighterIcon, MinusIcon, PlusIcon, TextCursorInputIcon } from "lucide-react";
import { ChatActionsContext } from "@/components/chat-actions-context.ts";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ANCHOR_UNANCHORED_TEXT, anchorContext, CARD_PASSAGE_KEY, ANNOTATION_QUOTE_MAX, locateQuote, type AnchorRect, type DocumentAnnotation, type TextAnchor } from "@/src/core";
import { pdfLoadOptions, PDF_WORKER_SRC } from "./pdf-options.ts";
import type { PaneItem } from "./page-pane-context.tsx";
import { DOCUMENT_TUTOR_ACTIONS, documentTutorMessage, TUTOR_ACTION_LABEL, TUTOR_BLOCKED_TEXT, type DocumentTutorAction } from "./page-tutor-actions.ts";
import { firstPdfCursor, movePdfCursor, pdfCursorMoveFor, type PdfCursor } from "./pdf-keyboard-selection.ts";
import { SavePassageDialog, type DocumentPassage } from "./save-passage-dialog.tsx";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;

const contentUrl = (id: string) => `/api/library/items/${encodeURIComponent(id)}/content`;
const annotationsUrl = (id: string) => `/api/library/items/${encodeURIComponent(id)}/annotations`;
const POSITION_KEY = "lh-pdf-position:";
const TOOL = "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-1 focus-visible:outline-ring disabled:text-muted-foreground pointer-coarse:size-11";
const TEXT_BUTTON = "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm text-foreground hover:bg-accent focus-visible:outline-1 focus-visible:outline-ring pointer-coarse:min-h-11";
const MAX_DPR = 2;
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const NEAR_MARGIN = "800px 0px";

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
	pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
		pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
		return pdfjs;
	});
	return pdfjsPromise;
}

/** The layer's text in DOM order, and where each text node starts in it. */
function layerText(layer: HTMLElement): { text: string; nodes: { node: Text; start: number }[] } {
	const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
	const nodes: { node: Text; start: number }[] = [];
	let text = "";
	for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
		nodes.push({ node, start: text.length });
		text += node.data;
	}
	return { text, nodes };
}

function rangeFor(layer: HTMLElement, start: number, end: number): Range | null {
	const { nodes } = layerText(layer);
	const find = (at: number, edge: "start" | "end") => {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const row = nodes[i]!;
			if (edge === "start" ? row.start <= at : row.start < at) return { node: row.node, offset: at - row.start };
		}
		return null;
	};
	const from = find(start, "start");
	const to = find(end, "end");
	if (!from || !to) return null;
	const range = document.createRange();
	range.setStart(from.node, Math.min(from.offset, from.node.length));
	range.setEnd(to.node, Math.min(to.offset, to.node.length));
	return range;
}

function rectsOf(range: Range, box: DOMRect): AnchorRect[] {
	const out: AnchorRect[] = [];
	for (const rect of range.getClientRects()) {
		if (rect.width < 1 || rect.height < 1) continue;
		out.push([(rect.left - box.left) / box.width, (rect.top - box.top) / box.height, rect.width / box.width, rect.height / box.height]);
	}
	return out;
}

function offsetIn(layer: HTMLElement, node: Node, offset: number): number {
	const { nodes } = layerText(layer);
	const row = nodes.find((candidate) => candidate.node === node);
	if (row) return row.start + offset;
	// An element boundary: count the text before that child.
	const probe = document.createRange();
	probe.selectNodeContents(layer);
	probe.setEnd(node, offset);
	return probe.toString().length;
}

interface PageLocated { anchored: Set<string>; lost: Set<string> }

/** One page: canvas, marks and text layer, drawn only while near the viewport. */
function PdfPage({ pdfjs, doc, number, width, fallbackRatio, annotations, cite, onLocated, onCite, register, scrollRoot }: {
	/** The margin below only reaches past the viewport when measured against this. */
	scrollRoot: HTMLElement | null;
	pdfjs: PdfJs;
	doc: PdfDocument;
	number: number;
	width: number;
	fallbackRatio: number;
	annotations: readonly DocumentAnnotation[];
	/** A quote to find and show here. */
	cite: { quote: string; nonce: number } | null;
	onLocated: (page: number, located: PageLocated) => void;
	onCite: (found: boolean, nonce: number, element: HTMLElement | null) => void;
	register: (page: number, element: HTMLElement | null) => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const canvas = useRef<HTMLCanvasElement>(null);
	const layer = useRef<HTMLDivElement>(null);
	const [near, setNear] = useState(false);
	const [ratio, setRatio] = useState<number | null>(null);
	const [textReady, setTextReady] = useState(0);
	const [failed, setFailed] = useState(false);
	const [drawn, setDrawn] = useState<Map<string, AnchorRect[]>>(new Map());
	const [citeRects, setCiteRects] = useState<AnchorRect[]>([]);
	useEffect(() => {
		const element = box.current;
		if (!element) return;
		register(number, element);
		const observer = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), { root: scrollRoot, rootMargin: NEAR_MARGIN });
		observer.observe(element);
		return () => { observer.disconnect(); register(number, null); };
	}, [number, register, scrollRoot]);
	// Rendered whenever near, or at a new size. A superseded render is cancelled.
	useEffect(() => {
		if (!near || width <= 0) return;
		let cancelled = false;
		let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
		let text: { cancel: () => void } | null = null;
		void (async () => {
			try {
				const page = await doc.getPage(number);
				if (cancelled) return;
				const unit = page.getViewport({ scale: 1 });
				setRatio(unit.height / unit.width);
				const scale = width / unit.width;
				const cssViewport = page.getViewport({ scale });
				const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
				const target = canvas.current;
				const holder = layer.current;
				if (!target || !holder) return;
				target.width = Math.floor(cssViewport.width * dpr);
				target.height = Math.floor(cssViewport.height * dpr);
				task = page.render({ canvas: target, viewport: page.getViewport({ scale: scale * dpr }) });
				await task.promise;
				if (cancelled) return;
				holder.replaceChildren();
				holder.style.setProperty("--total-scale-factor", String(scale));
				const textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }), container: holder, viewport: cssViewport });
				text = textLayer;
				await textLayer.render();
				if (cancelled) return;
				setFailed(false);
				setTextReady((n) => n + 1);
			} catch (err) {
				if (!cancelled && (err as { name?: string })?.name !== "RenderingCancelledException") setFailed(true);
			}
		})();
		return () => {
			cancelled = true;
			task?.cancel();
			text?.cancel();
			setTextReady(0);
		};
	}, [near, width, doc, number, pdfjs]);
	// The quote decides where a mark goes; the stored rectangles fill the moment before.
	useEffect(() => {
		const holder = layer.current;
		const element = box.current;
		if (!textReady || !holder || !element) {
			setDrawn(new Map(annotations.map((annotation) => [annotation.id, annotation.anchor.rects])));
			return;
		}
		const { text } = layerText(holder);
		const pageBox = element.getBoundingClientRect();
		const next = new Map<string, AnchorRect[]>();
		const anchored = new Set<string>();
		const lost = new Set<string>();
		for (const annotation of annotations) {
			const at = locateQuote(text, annotation.anchor);
			const range = at && rangeFor(holder, at.start, at.end);
			if (range) {
				next.set(annotation.id, rectsOf(range, pageBox));
				anchored.add(annotation.id);
			} else lost.add(annotation.id);
		}
		setDrawn(next);
		onLocated(number, { anchored, lost });
	}, [textReady, annotations, number, onLocated]);
	useEffect(() => {
		if (!cite) { setCiteRects([]); return; }
		const holder = layer.current;
		const element = box.current;
		if (!textReady || !holder || !element) return;
		if (!cite.quote) { onCite(true, cite.nonce, null); return; }
		const at = locateQuote(layerText(holder).text, { quote: cite.quote });
		const range = at && rangeFor(holder, at.start, at.end);
		if (!range) { setCiteRects([]); onCite(false, cite.nonce, null); return; }
		setCiteRects(rectsOf(range, element.getBoundingClientRect()));
		onCite(true, cite.nonce, element);
	}, [cite, textReady, onCite]);
	const height = Math.round(width * (ratio ?? fallbackRatio));
	const percent = (rect: AnchorRect) => ({ left: `${rect[0] * 100}%`, top: `${rect[1] * 100}%`, width: `${rect[2] * 100}%`, height: `${rect[3] * 100}%` });
	return (
		<div ref={box} className="lh-pdf-page" data-pdf-page={number} data-testid="pdf-page" data-text-ready={textReady > 0 ? "" : undefined} role="group" aria-label={`Page ${number}`} style={{ width, height }}>
			<canvas ref={canvas} aria-hidden="true" />
			<div className="lh-pdf-marks" aria-hidden="true">
				{annotations.flatMap((annotation) => (drawn.get(annotation.id) ?? []).map((rect, index) => <div key={`${annotation.id}-${index}`} className="lh-pdf-mark" data-testid="pdf-mark" data-noted={annotation.note ? "" : undefined} style={percent(rect)} />))}
				{citeRects.map((rect, index) => <div key={index} className="lh-pdf-cite" data-testid="pdf-cite-mark" style={percent(rect)} />)}
			</div>
			<div ref={layer} className="lh-pdf-text" data-testid="pdf-text-layer" />
			{failed && <p role="status" className="absolute inset-x-2 top-2 rounded-[6px] bg-card p-2 text-sm text-foreground">Page {number} could not be drawn.</p>}
		</div>
	);
}

interface Selected {
	anchor: TextAnchor;
	/** Part of the selection was on another page, and was left out. */
	clipped: boolean;
	rect: DOMRect;
}

function readSelection(root: HTMLElement): Selected | null {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
	const raw = selection.getRangeAt(0);
	const startElement = raw.startContainer instanceof Element ? raw.startContainer : raw.startContainer.parentElement;
	const pageBox = startElement?.closest<HTMLElement>("[data-pdf-page]");
	if (!pageBox || !root.contains(pageBox)) return null;
	const layer = pageBox.querySelector<HTMLElement>('[data-testid="pdf-text-layer"]');
	if (!layer) return null;
	const range = raw.cloneRange();
	const clipped = !layer.contains(raw.endContainer);
	if (clipped) range.setEnd(layer, layer.childNodes.length);
	const quote = range.toString();
	if (!quote.trim()) return null;
	const { text } = layerText(layer);
	const start = offsetIn(layer, range.startContainer, range.startOffset);
	const end = start + quote.length;
	const context = anchorContext(text, start, end);
	const rects = rectsOf(range, pageBox.getBoundingClientRect());
	return {
		anchor: { page: Number(pageBox.dataset.pdfPage), quote: quote.slice(0, ANNOTATION_QUOTE_MAX), prefix: context.prefix, suffix: context.suffix, start, rects },
		clipped,
		rect: range.getBoundingClientRect(),
	};
}

export function PdfReader({ item, phone, onClosePane }: { item: PaneItem; phone: boolean; onClosePane: () => void }) {
	const chat = useContext(ChatActionsContext);
	const router = useRouter();
	const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
	const [doc, setDoc] = useState<PdfDocument | null>(null);
	const [failure, setFailure] = useState<"load" | "password" | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [ratio, setRatio] = useState(1.3);
	const [paneWidth, setPaneWidth] = useState(0);
	const [zoom, setZoom] = useState(1);
	const [current, setCurrent] = useState(1);
	const [pageField, setPageField] = useState("1");
	const [noText, setNoText] = useState(false);
	const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
	const [annotationsFailed, setAnnotationsFailed] = useState(false);
	const [fingerprint, setFingerprint] = useState<DocumentAnnotation["fingerprint"] | null>(null);
	const [lost, setLost] = useState<ReadonlySet<string>>(new Set());
	const [panel, setPanel] = useState(false);
	const [selected, setSelected] = useState<Selected | null>(null);
	const [notePrompt, setNotePrompt] = useState<{ anchor: TextAnchor } | { annotation: DocumentAnnotation } | null>(null);
	const [noteText, setNoteText] = useState("");
	const [failureLine, setFailureLine] = useState<string | null>(null);
	const [removed, setRemoved] = useState<DocumentAnnotation | null>(null);
	const [bubbleHeight, setBubbleHeight] = useState(150);
	const noteOpener = useRef<HTMLElement | null>(null);
	// The keyboard's selection (feature 023): which page, and what is selected on it.
	const [keyboardPage, setKeyboardPage] = useState<number | null>(null);
	const keyboardCursor = useRef<PdfCursor | null>(null);
	const [keyboardLine, setKeyboardLine] = useState<string | null>(null);
	const [saving, setSaving] = useState<DocumentPassage | null>(null);
	const [sentLine, setSentLine] = useState<string | null>(null);
	const [cite, setCite] = useState<{ page: number; quote: string; nonce: number; citation: boolean; terms?: readonly string[] } | null>(null);
	const [jumpLine, setJumpLine] = useState<string | null>(null);
	const scroller = useRef<HTMLDivElement>(null);
	const bubble = useRef<HTMLDivElement>(null);
	const pressingBubble = useRef(false);
	const pages = useRef(new Map<number, HTMLElement>());
	const register = useCallback((page: number, element: HTMLElement | null) => {
		if (element) pages.current.set(page, element);
		else pages.current.delete(page);
	}, []);

	// Load: the same bytes the Download link gives, through the tenant's own route.
	useEffect(() => {
		let cancelled = false;
		let task: { destroy: () => Promise<void> } | null = null;
		setFailure(null);
		setDoc(null);
		void (async () => {
			try {
				const library = await loadPdfJs();
				if (cancelled) return;
				setPdfjs(library);
				const loading = library.getDocument(pdfLoadOptions(contentUrl(item.id)));
				task = loading;
				const loaded = await loading.promise;
				if (cancelled) return;
				const first = await loaded.getPage(1);
				const unit = first.getViewport({ scale: 1 });
				setRatio(unit.height / unit.width);
				setDoc(loaded);
				// Scanned PDFs: the pages still show, and the reader says why nothing selects.
				let found = false;
				for (let n = 1; n <= loaded.numPages && !cancelled && !found; n++) {
					const content = await (await loaded.getPage(n)).getTextContent();
					found = content.items.some((entry) => "str" in entry && entry.str.trim() !== "");
				}
				if (!cancelled) setNoText(!found);
			} catch (err) {
				if (!cancelled) setFailure((err as { name?: string })?.name === "PasswordException" ? "password" : "load");
			}
		})();
		return () => { cancelled = true; void task?.destroy().catch(() => {}); };
	}, [item.id, attempt]);

	const loadAnnotations = useCallback(async () => {
		setAnnotationsFailed(false);
		try {
			const response = await fetch(annotationsUrl(item.id), { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as { annotations: DocumentAnnotation[]; fingerprint: DocumentAnnotation["fingerprint"] };
			setAnnotations(body.annotations);
			setFingerprint(body.fingerprint);
		} catch {
			setAnnotationsFailed(true);
		}
	}, [item.id]);
	useEffect(() => { void loadAnnotations(); }, [loadAnnotations]);

	useEffect(() => {
		const element = scroller.current;
		if (!element || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => setPaneWidth(Math.floor(entry?.contentRect.width ?? 0)));
		observer.observe(element);
		return () => observer.disconnect();
	}, [doc]);

	const numPages = doc?.numPages ?? 0;
	const scrollToPage = useCallback((page: number, block: ScrollLogicalPosition = "start") => {
		pages.current.get(page)?.scrollIntoView({ block });
	}, []);

	// The reading position survives leaving and coming back (constitution III).
	const restored = useRef(false);
	useEffect(() => {
		if (!doc || restored.current || paneWidth === 0) return;
		restored.current = true;
		if (item.jump?.page) return;
		const saved = Number(window.localStorage.getItem(POSITION_KEY + item.id));
		if (Number.isInteger(saved) && saved > 1 && saved <= doc.numPages) requestAnimationFrame(() => scrollToPage(saved));
	}, [doc, paneWidth, item.id, item.jump?.page, scrollToPage]);
	useEffect(() => {
		const element = scroller.current;
		if (!element || !doc) return;
		let frame = 0;
		const onScroll = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const middle = element.getBoundingClientRect().top + element.clientHeight / 2;
				let best = 1;
				for (const [page, node] of pages.current) if (node.getBoundingClientRect().top <= middle && page > best) best = page;
				setCurrent(best);
				setPageField(String(best));
				try { window.localStorage.setItem(POSITION_KEY + item.id, String(best)); } catch { /* still reads for this visit */ }
			});
		};
		element.addEventListener("scroll", onScroll, { passive: true });
		return () => { cancelAnimationFrame(frame); element.removeEventListener("scroll", onScroll); };
	}, [doc, item.id]);

	// A search hit or citation: the page, then the quote, and an honest word about it.
	const jump = item.jump;
	useEffect(() => {
		if (!doc || !jump?.page || paneWidth === 0) return;
		if (jump.page > doc.numPages) {
			setCite(null);
			setJumpLine(`This PDF has ${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}, so page ${jump.page} doesn't exist.`);
			return;
		}
		setJumpLine(null);
		setCite({ page: jump.page, quote: jump.quote ?? "", nonce: jump.nonce ?? 0, citation: Boolean(jump.citation), terms: jump.terms });
		requestAnimationFrame(() => scrollToPage(jump.page!));
	}, [doc, paneWidth === 0, jump?.nonce, scrollToPage]);
	const citeReported = useRef<number | null>(null);
	const citeRef = useRef(cite);
	citeRef.current = cite;
	const onCite = useCallback((found: boolean, nonce: number, element: HTMLElement | null) => {
		const asked = citeRef.current;
		// Once per request: a page redrawn later must not pull the learner back to it.
		if (!asked || asked.nonce !== nonce || citeReported.current === nonce) return;
		citeReported.current = nonce;
		if (found && element) {
			const mark = element.querySelector<HTMLElement>('[data-testid="pdf-cite-mark"]');
			// The mark lands on the next paint.
			requestAnimationFrame(() => (element.querySelector<HTMLElement>('[data-testid="pdf-cite-mark"]') ?? mark ?? element).scrollIntoView({ block: "center" }));
		}
		if (!asked.quote) { if (asked.citation) setJumpLine(`Showing page ${asked.page}. This link names no words to check.`); return; }
		if (asked.citation) setJumpLine(found ? `Quote found on page ${asked.page}.` : `This quote isn't on page ${asked.page}, so the citation can't be confirmed. Showing the page anyway.`);
		else if (!found) setJumpLine(`That passage wasn't found on page ${asked.page}. The file may have changed. Showing the page anyway.`);
	}, []);

	const onLocated = useCallback((page: number, located: PageLocated) => {
		setLost((previous) => {
			const next = new Set(previous);
			for (const id of located.anchored) next.delete(id);
			for (const id of located.lost) next.add(id);
			return next.size === previous.size && [...next].every((id) => previous.has(id)) ? previous : next;
		});
	}, []);

	// The selection, on one page. A press on the bubble keeps it for that click.
	useEffect(() => {
		let frame = 0;
		const read = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				if (pressingBubble.current || !scroller.current) return;
				const next = readSelection(scroller.current);
				setSelected(next);
				// A click elsewhere ended it: the keyboard's mode goes too. Focus staying put isn't enough to keep it.
				if (!next && document.activeElement !== scroller.current && keyboardCursor.current) { keyboardCursor.current = null; setKeyboardPage(null); setKeyboardLine(null); }
			});
		};
		document.addEventListener("selectionchange", read);
		return () => { cancelAnimationFrame(frame); document.removeEventListener("selectionchange", read); };
	}, []);
	const clearSelection = () => {
		pressingBubble.current = false;
		setSelected(null);
		window.getSelection()?.removeAllRanges();
		keyboardCursor.current = null;
		setKeyboardPage(null);
		setKeyboardLine(null);
	};
	/** Puts a real selection on the page, so what follows is what a pointer gets. */
	const showKeyboardSelection = (page: number, cursor: PdfCursor): boolean => {
		const box = pages.current.get(page);
		const layer = box?.querySelector<HTMLElement>('[data-testid="pdf-text-layer"]');
		const range = layer && rangeFor(layer, cursor.start, cursor.end);
		if (!range) return false;
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		keyboardCursor.current = cursor;
		setKeyboardPage(page);
		const quote = range.toString();
		setKeyboardLine(`Page ${page}: ${quote.length > 80 ? `${quote.slice(0, 80)}…` : quote}`);
		const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
		start?.scrollIntoView({ block: "nearest", inline: "nearest" });
		return true;
	};
	/** A page's first word, once its text is drawn: it may still be off screen, so it can take a moment. */
	const startKeyboardSelectionOn = (page: number, tries = 40) => {
		const box = pages.current.get(page);
		const layer = box?.querySelector<HTMLElement>('[data-testid="pdf-text-layer"]');
		const ready = box?.hasAttribute("data-text-ready") && layer;
		const first = ready ? firstPdfCursor(layerText(layer).text) : null;
		if (first) { showKeyboardSelection(page, first); return; }
		if (ready || tries <= 0) { setKeyboardLine(`Page ${page} has no text to select.`); setKeyboardPage(page); return; }
		setKeyboardPage(page);
		setKeyboardLine(`Getting page ${page}'s text…`);
		window.setTimeout(() => startKeyboardSelectionOn(page, tries - 1), 100);
	};
	const startKeyboardSelection = () => {
		scroller.current?.focus({ preventScroll: true });
		scrollToPage(current, "nearest");
		startKeyboardSelectionOn(current);
	};
	/** Arrows move, Shift extends, and off the end of a page goes on to the next one. */
	const moveKeyboardSelection = (key: string, extend: boolean): boolean => {
		if (keyboardPage === null) return false;
		const move = pdfCursorMoveFor(key);
		if (!move) return false;
		const cursor = keyboardCursor.current;
		const layer = pages.current.get(keyboardPage)?.querySelector<HTMLElement>('[data-testid="pdf-text-layer"]');
		if (!cursor || !layer) return true;
		const { text, nodes } = layerText(layer);
		const next = movePdfCursor(text, nodes.map((node) => node.start), cursor, move, extend);
		if (next) { showKeyboardSelection(keyboardPage, next); return true; }
		// A selection stays on one page, as a pointer's does: Shift stops at the edge.
		if (extend) return true;
		const page = keyboardPage + (move.endsWith("next") ? 1 : -1);
		if (page < 1 || page > numPages) return true;
		scrollToPage(page, "nearest");
		startKeyboardSelectionOn(page);
		return true;
	};

	const saveHighlight = async (anchor: TextAnchor, note?: string) => {
		setFailureLine(null);
		try {
			const response = await fetch(annotationsUrl(item.id), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anchor, ...(note ? { note } : {}) }) });
			const body = await response.json().catch(() => ({})) as { annotation?: DocumentAnnotation; error?: string };
			if (!response.ok || !body.annotation) throw new Error(body.error ?? "The highlight could not be saved.");
			setAnnotations((list) => [...list, body.annotation!]);
			return true;
		} catch (err) {
			setFailureLine(err instanceof Error && err.message !== "Failed to fetch" ? err.message : "The highlight could not be saved. Check your connection and try again.");
			return false;
		}
	};
	const saveNote = async () => {
		if (!notePrompt) return;
		const text = noteText.trim();
		if ("anchor" in notePrompt) {
			if (await saveHighlight(notePrompt.anchor, text)) { setNotePrompt(null); clearSelection(); }
			return;
		}
		try {
			const response = await fetch(`${annotationsUrl(item.id)}/${encodeURIComponent(notePrompt.annotation.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: text || null }) });
			const body = await response.json().catch(() => ({})) as { annotation?: DocumentAnnotation; error?: string };
			if (!response.ok || !body.annotation) throw new Error(body.error);
			setAnnotations((list) => list.map((entry) => (entry.id === body.annotation!.id ? body.annotation! : entry)));
			setNotePrompt(null);
		} catch (err) {
			setFailureLine((err as Error).message || "The note could not be saved.");
		}
	};
	const removeAnnotation = async (annotation: DocumentAnnotation) => {
		setFailureLine(null);
		try {
			const response = await fetch(`${annotationsUrl(item.id)}/${encodeURIComponent(annotation.id)}`, { method: "DELETE" });
			if (!response.ok && response.status !== 404) throw new Error(String(response.status));
			setAnnotations((list) => list.filter((entry) => entry.id !== annotation.id));
			setRemoved(annotation);
		} catch {
			setFailureLine("That highlight could not be removed.");
		}
	};

	/** Only on an explicit click, through the tutor's own path. */
	const askTutor = (action: DocumentTutorAction, anchor: TextAnchor) => {
		const message = documentTutorMessage(action, { itemId: item.id, name: item.name, page: anchor.page }, anchor.quote);
		const summary = `Sent to the tutor: this passage from page ${anchor.page} of ${item.name}.`;
		clearSelection();
		if (chat) {
			if (action === "ask") {
				chat.fillComposer(message);
				setSentLine(`In your message box, not sent: this passage from page ${anchor.page} of ${item.name}.`);
			} else {
				chat.sendText(message);
				setSentLine(summary);
			}
			if (phone) onClosePane();
			return;
		}
		router.push(`/chat/new?${action === "ask" ? "draft" : "send"}=${encodeURIComponent(message)}`);
	};

	useLayoutEffect(() => {
		if (selected && bubble.current) setBubbleHeight(bubble.current.offsetHeight);
	}, [selected]);
	const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);
	const pageWidth = Math.max(0, Math.round((paneWidth - 16) * zoom));
	const goToField = () => {
		const page = Number(pageField);
		if (Number.isInteger(page) && page >= 1 && page <= numPages) scrollToPage(page);
		else setPageField(String(current));
	};
	const stepZoom = (by: 1 | -1) => setZoom((value) => {
		const at = ZOOMS.indexOf(value);
		return ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + by))]!;
	});
	const pageAnnotations = useMemo(() => {
		const byPage = new Map<number, DocumentAnnotation[]>();
		for (const annotation of annotations) {
			if (lost.has(annotation.id)) continue;
			byPage.set(annotation.anchor.page, [...(byPage.get(annotation.anchor.page) ?? []), annotation]);
		}
		return byPage;
	}, [annotations, lost]);
	/** A mark on a page past the end, or whose quote has gone. Listed, never dropped. */
	const isUnanchored = (annotation: DocumentAnnotation) => lost.has(annotation.id) || (numPages > 0 && annotation.anchor.page > numPages);
	const listed = [...annotations].sort((a, b) => a.anchor.page - b.anchor.page || a.anchor.start - b.anchor.start);
	const changedFile = fingerprint !== null && annotations.some((annotation) => annotation.fingerprint.size !== fingerprint.size || annotation.fingerprint.updatedAt !== fingerprint.updatedAt);

	if (failure) {
		return (
			<div role="status" className="flex flex-wrap items-center gap-2 px-3 text-sm text-ink-2" data-testid="pdf-failed">
				<p>{failure === "password" ? `${item.name} needs a password, so it can't be shown here. Open it in a new tab, or download it.` : `${item.name} could not be shown here. Open it in a new tab, or download it.`}</p>
				{failure === "load" && <button type="button" className="prompt-secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
			</div>
		);
	}
	const blocked = chat?.sendBlock ? TUTOR_BLOCKED_TEXT[chat.sendBlock] : null;
	// Above the selection, or below on touch, where the system's own menu sits above;
	// on the other side when there is no room, and always on screen.
	const bubbleTop = (() => {
		if (!selected) return 0;
		const above = selected.rect.top - bubbleHeight - 8;
		const below = selected.rect.bottom + 8;
		const coarse = window.matchMedia("(pointer: coarse)").matches;
		const preferred = coarse ? (below + bubbleHeight > window.innerHeight ? above : below) : (above < 8 ? below : above);
		return Math.max(8, Math.min(window.innerHeight - bubbleHeight - 8, preferred));
	})();
	return (
		<div
			className="flex min-h-0 flex-1 flex-col"
			data-testid="pdf-reader"
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				// Innermost first: the selection, then the list, then the pane's own Escape.
				if (selected || keyboardPage !== null) {
					event.preventDefault();
					event.stopPropagation();
					clearSelection();
					scroller.current?.focus({ preventScroll: true });
				}
				else if (panel) { event.preventDefault(); event.stopPropagation(); setPanel(false); }
			}}
		>
			<div role="toolbar" aria-label="PDF controls" className="flex shrink-0 flex-wrap items-center gap-1 px-2 pb-1">
				<button type="button" className={TEXT_BUTTON} aria-pressed={keyboardPage !== null} disabled={noText} onClick={() => { if (keyboardPage !== null) clearSelection(); else startKeyboardSelection(); }} data-testid="pdf-keyboard-select" title="Select text with the keyboard">
					<TextCursorInputIcon className="ui-icon" aria-hidden="true" />
					Select text
				</button>
				<button type="button" className={TOOL} aria-label="Previous page" disabled={current <= 1} onClick={() => scrollToPage(current - 1)}><ChevronLeftIcon className="ui-icon" aria-hidden="true" /></button>
				<form className="flex items-center gap-1 text-sm text-ink-2" onSubmit={(event) => { event.preventDefault(); goToField(); }}>
					<label className="sr-only" htmlFor={`pdf-page-${item.id}`}>Page number</label>
					<input id={`pdf-page-${item.id}`} name="page" value={pageField} inputMode="numeric" autoComplete="off" data-testid="pdf-page-field" onChange={(event) => setPageField(event.target.value)} onBlur={goToField} className="h-9 w-11 rounded-md border border-input bg-transparent px-1 text-center text-sm text-foreground pointer-coarse:h-11" />
					<span className="whitespace-nowrap" data-testid="pdf-page-count">of {numPages || "…"}</span>
				</form>
				<button type="button" className={TOOL} aria-label="Next page" disabled={current >= numPages} onClick={() => scrollToPage(current + 1)}><ChevronRightIcon className="ui-icon" aria-hidden="true" /></button>
				<button type="button" className={TOOL} aria-label="Zoom out" disabled={zoom <= ZOOMS[0]!} onClick={() => stepZoom(-1)}><MinusIcon className="ui-icon" aria-hidden="true" /></button>
				<button type="button" className={`${TEXT_BUTTON} max-[359px]:hidden`} aria-label={`Fit to width. Zoom is ${Math.round(zoom * 100)} percent`} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
				<button type="button" className={TOOL} aria-label="Zoom in" disabled={zoom >= ZOOMS.at(-1)!} onClick={() => stepZoom(1)}><PlusIcon className="ui-icon" aria-hidden="true" /></button>
				<button type="button" className={`${TEXT_BUTTON} ml-auto aria-pressed:bg-accent`} aria-pressed={panel} onClick={() => setPanel((open) => !open)} data-testid="pdf-highlights-toggle">
					<HighlighterIcon className="ui-icon" aria-hidden="true" />
					Highlights{annotations.length ? ` (${annotations.length})` : ""}
				</button>
			</div>
			{keyboardPage !== null && (
				<p role="status" aria-live="polite" className="px-3 pb-1 text-sm text-ink-2 [overflow-wrap:anywhere]" data-testid="pdf-keyboard-line">
					<span className="block">Arrows move a word or line. Shift extends. Enter opens the actions. Escape stops.</span>
					{keyboardLine && <span className="block text-muted-foreground">{keyboardLine}</span>}
				</p>
			)}
			{noText && <p role="status" className="px-3 pb-1 text-sm text-ink-2" data-testid="pdf-no-text">No text could be read in this PDF, so passages can&apos;t be selected, highlighted or searched. It may be a scan.</p>}
			{jumpLine && (
				<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-1 text-sm text-ink-2" data-testid="pdf-jump-status">
					<p className="min-w-0 flex-[1_1_12rem]">{jumpLine}</p>
					<button type="button" className="prompt-secondary" onClick={() => { setJumpLine(null); setCite(null); }}>Dismiss</button>
				</div>
			)}
			{sentLine && (
				<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-1 text-sm text-ink-2" data-testid="pdf-sent">
					<p className="min-w-0 flex-[1_1_12rem] [overflow-wrap:anywhere]">{sentLine}</p>
					<button type="button" className="prompt-secondary" onClick={() => setSentLine(null)}>Dismiss</button>
				</div>
			)}
			{removed && (
				<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-1 text-sm text-ink-2" data-testid="pdf-removed">
					<p>Highlight on page {removed.anchor.page} removed.</p>
					<button type="button" className="prompt-secondary" data-testid="pdf-removed-undo" onClick={() => void saveHighlight(removed.anchor, removed.note).then((ok) => { if (ok) setRemoved(null); })}>Undo</button>
					<button type="button" className="prompt-secondary" onClick={() => setRemoved(null)}>Dismiss</button>
				</div>
			)}
			{failureLine && <p role="alert" className="px-3 pb-1 text-sm text-destructive">{failureLine}</p>}
			{annotationsFailed && (
				<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-1 text-sm text-ink-2">
					<p>Your highlights could not be loaded.</p>
					<button type="button" className="prompt-secondary" onClick={() => void loadAnnotations()}>Try again</button>
				</div>
			)}
			{panel && (
				<div className="mx-2 mb-1 flex max-h-[40dvh] shrink-0 flex-col gap-1 overflow-y-auto rounded-[10px] bg-popover p-2 text-sm" data-testid="pdf-highlights">
					{changedFile && <p className="text-ink-2">This file changed after some of these were made. Each is checked again on its page.</p>}
					{annotationsFailed ? null : listed.length === 0 ? <p className="text-ink-2">Nothing highlighted yet. Select text in the PDF to start.</p> : listed.map((annotation) => (
						<div key={annotation.id} className="flex flex-col gap-0.5 rounded-[6px] bg-card p-2" data-testid="pdf-highlight-row">
							<p className="text-muted-foreground">Page {annotation.anchor.page}{isUnanchored(annotation) && <span data-testid="pdf-unanchored"> · {ANCHOR_UNANCHORED_TEXT}</span>}</p>
							<p className="line-clamp-3 text-ink-2 [overflow-wrap:anywhere]">{annotation.anchor.quote}</p>
							{annotation.note && <p className="text-foreground [overflow-wrap:anywhere]" data-testid="pdf-highlight-note">{annotation.note}</p>}
							<div className="flex flex-wrap gap-1">
								{annotation.anchor.page <= numPages && <button type="button" className="prompt-secondary" aria-label={`Go to page ${annotation.anchor.page}`} onClick={() => scrollToPage(annotation.anchor.page)}>Go to</button>}
								<button type="button" className="prompt-secondary" aria-label={`${annotation.note ? "Edit" : "Add"} note on page ${annotation.anchor.page}`} onClick={(event) => { noteOpener.current = event.currentTarget; setNoteText(annotation.note ?? ""); setNotePrompt({ annotation }); }}>{annotation.note ? "Edit note" : "Add note"}</button>
								<button type="button" className="prompt-secondary" aria-label={`Remove highlight on page ${annotation.anchor.page}`} onClick={() => void removeAnnotation(annotation)}>Remove</button>
							</div>
						</div>
					))}
				</div>
			)}
			<div
				ref={scroller}
				tabIndex={0}
				role="region"
				aria-label={`${item.name}, pages`}
				data-testid="pdf-scroll"
				className="min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring"
				onKeyDown={(event) => {
					if (keyboardPage === null || event.target !== event.currentTarget) return;
					if (event.key === "Enter" && selected) {
						event.preventDefault();
						bubble.current?.querySelector<HTMLElement>("button")?.focus();
						return;
					}
					if (moveKeyboardSelection(event.key, event.shiftKey)) event.preventDefault();
				}}
			>
				{!doc || !pdfjs ? (
					<div role="status" aria-label={`Loading ${item.name}`} className="flex flex-col gap-2 px-3 py-2">
						<Skeleton className="h-96 w-full rounded-md" />
					</div>
				) : (
					<div className="flex w-max min-w-full flex-col gap-2 px-2 pb-6">
						{paneWidth > 0 && pageNumbers.map((number) => (
							<PdfPage
								key={number}
								pdfjs={pdfjs}
								doc={doc}
								number={number}
								width={pageWidth}
								fallbackRatio={ratio}
								annotations={pageAnnotations.get(number) ?? EMPTY_ANNOTATIONS}
								cite={cite?.page === number ? cite : null}
								onLocated={onLocated}
								onCite={onCite}
								register={register}
								scrollRoot={scroller.current}
							/>
						))}
					</div>
				)}
			</div>
			{selected && !notePrompt && !saving && (
				<div
					ref={bubble}
					role="toolbar"
					aria-label="Selected passage"
					className="lh-pdf-bubble"
					data-testid="pdf-bubble"
					style={{
						left: `clamp(0.5rem, ${selected.rect.left}px, calc(100vw - min(22rem, 100vw - 1rem) - 0.5rem))`,
						top: bubbleTop,
					}}
					onPointerDownCapture={() => {
						// A tap can drop the selection before its click lands. Look again afterwards.
						pressingBubble.current = true;
						window.setTimeout(() => {
							pressingBubble.current = false;
							if (scroller.current) setSelected(readSelection(scroller.current));
						}, 500);
					}}
					onMouseDown={(event) => event.preventDefault()}
				>
					<button type="button" data-testid="pdf-highlight" onClick={() => void saveHighlight(selected.anchor).then((ok) => { if (ok) clearSelection(); })}>Highlight</button>
					<button type="button" data-testid="pdf-note" onClick={() => { noteOpener.current = null; setNoteText(""); setNotePrompt({ anchor: selected.anchor }); }}>Add a note</button>
					<button type="button" data-testid="pdf-save-passage" onClick={() => setSaving({ itemId: item.id, page: selected.anchor.page, text: selected.anchor.quote })}>Save to a page</button>
					<button type="button" data-testid="pdf-make-cards" onClick={() => { try { sessionStorage.setItem(CARD_PASSAGE_KEY, JSON.stringify({ itemId: item.id, page: selected.anchor.page, text: selected.anchor.quote })); } catch { /* the panel says it can't read it */ } router.push("/review?make=passage"); }}>Make flashcards</button>
					{blocked ? <p className="w-full px-2 py-1 text-sm text-ink-2">{blocked}</p> : (
						<>
							<p className="w-full px-2 pt-1 text-sm text-muted-foreground">Ask the tutor. Sends this passage, from page {selected.anchor.page}:</p>
							{DOCUMENT_TUTOR_ACTIONS.map((action) => <button key={action} type="button" data-testid={`pdf-tutor-${action}`} onClick={() => askTutor(action, selected.anchor)}>{TUTOR_ACTION_LABEL[action]}</button>)}
						</>
					)}
					{selected.clipped && <p className="w-full px-2 pb-1 text-sm text-muted-foreground">Only the part on page {selected.anchor.page} is used.</p>}
				</div>
			)}
			<Dialog open={notePrompt !== null} onOpenChange={(open) => { if (!open) setNotePrompt(null); }}>
				<DialogContent className="gap-3 rounded-[10px] border-0 bg-card sm:max-w-md" data-testid="pdf-note-dialog" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); (noteOpener.current?.isConnected ? noteOpener.current : scroller.current)?.focus({ preventScroll: true }); }}>
					<DialogTitle className="title-serif text-[17px] font-medium">Note on page {notePrompt ? ("anchor" in notePrompt ? notePrompt.anchor.page : notePrompt.annotation.anchor.page) : ""}</DialogTitle>
					<label className="flex flex-col gap-1 text-sm font-medium text-ink-2">
						Your note
						<textarea autoFocus rows={4} value={noteText} onChange={(event) => setNoteText(event.currentTarget.value)} data-testid="pdf-note-text" className="w-full rounded-[6px] border border-input bg-transparent px-2 py-1 text-base font-normal text-foreground" />
					</label>
					{failureLine && <p role="alert" className="text-sm text-destructive">{failureLine}</p>}
					<div className="flex justify-end gap-2">
						<button type="button" className="prompt-secondary" onClick={() => setNotePrompt(null)}>Cancel</button>
						<button type="button" className="prompt-primary" data-testid="pdf-note-save" onClick={() => void saveNote()}>Save note</button>
					</div>
				</DialogContent>
			</Dialog>
			{saving && <SavePassageDialog document={saving} onClose={() => { setSaving(null); clearSelection(); requestAnimationFrame(() => scroller.current?.focus({ preventScroll: true })); }} />}
		</div>
	);
}

const EMPTY_ANNOTATIONS: readonly DocumentAnnotation[] = [];
