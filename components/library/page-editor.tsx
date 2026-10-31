"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { LibraryItem } from "@/src/core";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createSourceLinks, findBlockHolding, createTutorHighlights, insertFormula, PagePlaceholder, pageStats, runSlashBlock, sourceLinkAt, sourceLinksKey, tutorHighlightsKey, wikiLinkBeside, type PageStats, type TutorHighlights } from "./page-editor-extras.ts";
import { isWikiTarget, wikiQuery } from "@/src/core";
import { matchMentions } from "@/src/core";
import type { WikiBridge } from "./page-note-views.ts";
import { countWords } from "./page-blocks.ts";
import { nodeJsonKey } from "./page-changes.ts";
import { createPageCodec, pageExtensions } from "./page-markdown.ts";
import { OPEN_MATH_SOURCE_EVENT } from "./page-math-view.ts";
import { slashQuery, type SlashItem } from "./page-slash.ts";
import { anchorBelowSelection, filterSlashItems, ImageAltPopover, LinkPopover, PageBubble, PageToolbar, SlashMenu, WikiMenu, type PageTutor, type WikiMenuRow } from "./page-toolbar.tsx";

const CHANGE_DELAY_MS = 120;

/** The end of the top-level block holding `pos`: where a new image paragraph goes. */
function afterBlock(doc: import("@tiptap/pm/model").Node, pos: number): number {
	const $pos = doc.resolve(Math.min(pos, doc.content.size));
	return $pos.depth === 0 ? $pos.pos : $pos.after(1);
}

export interface PageEditorHandle {
	/** Hand over text still inside the short serialize delay. */
	flush: () => void;
	focus: () => void;
	/** Puts the caret at a heading and scrolls to it (the outline). */
	jumpTo: (pos: number) => void;
	/** Scrolls to the first block holding `quote`, or else a term, and marks it for
	 *  a moment (feature 019). The text stays as it is. False when none is there. */
	jumpToText: (quote: string | undefined, terms: readonly string[] | undefined) => boolean;
	/** Where an image chosen now would go: after the block holding the caret. */
	imagePosition: () => number;
	/** Inserts an uploaded image, in a paragraph of its own, at `at`. */
	insertImage: (at: number, attrs: { src: string; alt: string }) => void;
}

/** What makes the surface a named, focusable text field. */
export function pageEditorAttributes(ariaLabel: string): Record<string, string> {
	return {
		role: "textbox",
		"aria-multiline": "true",
		"aria-label": ariaLabel,
		class: "lh-prose lh-page-editor",
		"data-testid": "page-editor",
	};
}

/** The one rich-text surface, loaded on demand. Holds no storage logic: it takes
 *  stored Markdown, and answers with Markdown that is byte-identical until
 *  something is really edited (components/library/page-markdown.ts). A new
 *  `value` from outside comes with a new React key. */
export function PageEditor({ value, onChange, onSaveShortcut, readOnly = false, ariaLabel, handle, tutor, highlights = null, onStats, onImageFiles, onChooseImage, wiki, wikiMenu, goneSessions, onSourceLink }: {
	value: string;
	/** Draws and follows wiki links (feature 016). */
	wiki?: WikiBridge;
	/** The `[[` list's rows and its status line. */
	wikiMenu?: () => { items: readonly LibraryItem[]; status: string | null };
	/** Sessions that no longer exist, so their source links can say so. */
	goneSessions?: ReadonlySet<string>;
	/** A lesson link was followed. */
	onSourceLink?: (href: string) => void;
	/** Image files pasted or dropped, and where they go. */
	onImageFiles?: (files: File[], at: number) => void;
	/** The Image button and slash row: open the file chooser. */
	onChooseImage?: () => void;
	/** Word count and headings, after each settled change. */
	onStats?: (stats: PageStats) => void;
	/** The tutor's changes to point at; decorations only, never stored. */
	highlights?: TutorHighlights | null;
	/** The tutor's actions on selected text; absent hides them. */
	tutor?: PageTutor;
	onChange: (markdown: string) => void;
	onSaveShortcut?: () => void;
	readOnly?: boolean;
	ariaLabel: string;
	handle?: Ref<PageEditorHandle>;
}) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const statsRef = useRef(onStats);
	statsRef.current = onStats;
	const imagesRef = useRef(onImageFiles);
	imagesRef.current = onImageFiles;
	const saveRef = useRef(onSaveShortcut);
	saveRef.current = onSaveShortcut;
	// The stored text at load only. The parent passes each edit back in `value`,
	// and a new text from outside arrives with a new key.
	const [codec] = useState(() => createPageCodec(value));
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);

	const emit = useCallback(() => {
		if (timer.current) { clearTimeout(timer.current); timer.current = null; }
		const editor = editorRef.current;
		if (editor && !editor.isDestroyed) {
			onChangeRef.current(codec.toMarkdown(editor.getJSON()));
			statsRef.current?.(pageStats(editor.state.doc, countWords));
		}
	}, [codec]);

	// The extensions live as long as the editor, so links read the bridge through one stable object.
	const wikiRef = useRef<WikiBridge | undefined>(wiki);
	const sourceRef = useRef(onSourceLink);
	sourceRef.current = onSourceLink;
	const extensions = useMemo(() => [
		...pageExtensions({ onSave: () => { emit(); saveRef.current?.(); }, wiki: wikiRef.current }),
		PagePlaceholder,
		createTutorHighlights(nodeJsonKey),
		createSourceLinks(),
	], [emit]);
	const host = useRef<HTMLDivElement>(null);
	const [scrollHost, setScrollHost] = useState<HTMLDivElement | null>(null);
	const setHost = useCallback((node: HTMLDivElement | null) => { host.current = node; setScrollHost(node); }, []);
	const [linkAt, setLinkAt] = useState<{ left: number; top: number } | null>(null);
	const openLinkRef = useRef<() => void>(() => {});
	// The slash menu: open while the caret ends a paragraph that holds "/query".
	// Escape hides it until the query changes.
	const [slashActive, setSlashActive] = useState(0);
	const slashDismissed = useRef<string | null>(null);
	const slashRef = useRef<{ items: SlashItem[]; range: { from: number; to: number } } | null>(null);

	const editor = useEditor({
		extensions,
		content: codec.doc,
		editable: !readOnly,
		immediatelyRender: false,
		editorProps: {
			attributes: pageEditorAttributes(ariaLabel),
			handlePaste: (view, event) => {
				const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
				if (files.length === 0 || !imagesRef.current) return false;
				event.preventDefault();
				imagesRef.current(files, afterBlock(view.state.doc, view.state.selection.from));
				return true;
			},
			handleDrop: (view, event) => {
				const files = [...(event.dataTransfer?.files ?? [])];
				if (files.length === 0 || !imagesRef.current) return false;
				event.preventDefault();
				const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
				imagesRef.current(files, afterBlock(view.state.doc, at));
				return true;
			},
			// A selected formula is not overwritten by a stray key; Backspace still removes it.
			handleTextInput: (view) => {
				const selection = view.state.selection;
				return selection instanceof NodeSelection && (selection.node.type.name === "inlineMath" || selection.node.type.name === "blockMath");
			},
			handleClick: (view, pos, event) => {
				if (!sourceRef.current || event.button !== 0) return false;
				const href = sourceLinkAt(view.state.doc, pos);
				if (!href) return false;
				event.preventDefault();
				emit();
				sourceRef.current(href);
				return true;
			},
			handleKeyDown: (view, event) => {
				const wikiOpen = wikiMenuRef.current;
				if (wikiOpen && !event.isComposing) {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						const n = Math.max(1, wikiOpen.rows.length);
						setWikiActive((i) => (i + (event.key === "ArrowDown" ? 1 : n - 1)) % n);
						return true;
					}
					if ((event.key === "Enter" || event.key === "Tab") && wikiOpen.rows.length > 0) {
						event.preventDefault();
						pickWikiRef.current(wikiOpen.rows[Math.min(wikiActiveRef.current, wikiOpen.rows.length - 1)]!);
						return true;
					}
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						wikiDismissed.current = view.state.doc.textBetween(wikiOpen.range.from, wikiOpen.range.to);
						forceSlash((n) => n + 1);
						return true;
					}
				}
				// Ctrl/Cmd+Enter beside a link follows it, the keyboard's click.
				if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
					const beside = wikiLinkBeside(view.state.selection);
					if (beside) { event.preventDefault(); wikiRef.current?.follow(beside); return true; }
					const href = view.state.selection.empty ? sourceLinkAt(view.state.doc, view.state.selection.from) : null;
					if (href && sourceRef.current) { event.preventDefault(); emit(); sourceRef.current(href); return true; }
				}
				const slash = slashRef.current;
				if (slash && !event.isComposing) {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						const n = Math.max(1, slash.items.length);
						setSlashActive((i) => (i + (event.key === "ArrowDown" ? 1 : n - 1)) % n);
						return true;
					}
					if ((event.key === "Enter" || event.key === "Tab") && slash.items.length > 0) {
						event.preventDefault();
						pickSlashRef.current(slash.items[Math.min(slashActiveRef.current, slash.items.length - 1)]!);
						return true;
					}
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						slashDismissed.current = view.state.doc.textBetween(slash.range.from, slash.range.to);
						forceSlash((n) => n + 1);
						return true;
					}
				}
				const mod = event.metaKey || event.ctrlKey;
				if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
					event.preventDefault();
					openLinkRef.current();
					return true;
				}
				if (mod && event.shiftKey && event.key.toLowerCase() === "m") {
					event.preventDefault();
					if (editorRef.current) insertFormula(editorRef.current);
					return true;
				}
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
					event.preventDefault();
					emit();
					saveRef.current?.();
					return true;
				}
				// A selected formula opens with Enter, the keyboard path to its TeX.
				const selection = view.state.selection;
				if (event.key === "Enter" && selection instanceof NodeSelection && (selection.node.type.name === "inlineMath" || selection.node.type.name === "blockMath")) {
					event.preventDefault();
					view.nodeDOM(selection.from)?.dispatchEvent(new Event(OPEN_MATH_SOURCE_EVENT));
					return true;
				}
				return false;
			},
		},
		onCreate: ({ editor: created }) => {
			codec.settle(created.getJSON());
			statsRef.current?.(pageStats(created.state.doc, countWords));
		},
		onUpdate: () => {
			if (timer.current) clearTimeout(timer.current);
			timer.current = setTimeout(emit, CHANGE_DELAY_MS);
		},
		onBlur: () => { if (timer.current) emit(); },
	}, [extensions]);
	editorRef.current = editor;

	const [, forceSlash] = useState(0);
	const slashState = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			if (!e || !e.isEditable) return null;
			const { selection } = e.state;
			const { $from, empty } = selection;
			if (!empty || $from.parent.type.name !== "paragraph") return null;
			const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\uFFFC");
			const after = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, "\n", "\uFFFC");
			const query = slashQuery(before, after);
			if (query === null) return null;
			return { query, from: $from.start(), to: $from.pos };
		},
		equalityFn: (a, b) => a?.query === b?.query && a?.from === b?.from && a?.to === b?.to,
	});
	const slashText = slashState ? `/${slashState.query}` : null;
	if (slashText === null || (slashDismissed.current !== null && slashDismissed.current !== slashText)) slashDismissed.current = null;
	const slashOpen = !!slashState && slashDismissed.current === null;
	const slashItems = useMemo(() => (slashState ? filterSlashItems(slashState.query).filter((item) => item.id !== "image" || !!onChooseImage) : []), [slashState, onChooseImage]);
	slashRef.current = slashOpen && slashState ? { items: slashItems, range: { from: slashState.from, to: slashState.to } } : null;
	const slashActiveRef = useRef(0);
	slashActiveRef.current = slashActive;
	useEffect(() => { setSlashActive(0); }, [slashState?.query]);
	const pickSlash = (item: SlashItem) => {
		const range = slashRef.current?.range;
		if (!editor || !range) return;
		runSlashBlock(editor, item.id, range, () => onChooseImage?.());
	};
	const pickSlashRef = useRef(pickSlash);
	pickSlashRef.current = pickSlash;

	// The `[[` list: open while the caret ends an unclosed link in running text.
	const [wikiActive, setWikiActive] = useState(0);
	const wikiDismissed = useRef<string | null>(null);
	const wikiState = useEditorState({
		editor,
		selector: ({ editor: e }) => {
			if (!e || !e.isEditable) return null;
			const { $from, empty } = e.state.selection;
			if (!empty || !$from.parent.inlineContent || $from.parent.type.spec.code || $from.parent.type.name === "collapsibleSummary") return null;
			const found = wikiQuery($from.parent.textBetween(0, $from.parentOffset, "\n", "\uFFFC"));
			if (!found) return null;
			return { query: found.query, from: $from.start() + found.start, to: $from.pos };
		},
		equalityFn: (a, b) => a?.query === b?.query && a?.from === b?.from && a?.to === b?.to,
	});
	const wikiText = wikiState ? `[[${wikiState.query}` : null;
	if (wikiText === null || (wikiDismissed.current !== null && wikiDismissed.current !== wikiText)) wikiDismissed.current = null;
	const wikiOpen = Boolean(wikiState && wiki && wikiMenu && wikiDismissed.current === null);
	const wikiSource = wikiOpen ? wikiMenu!() : null;
	const wikiRows: WikiMenuRow[] = useMemo(() => {
		if (!wikiState || !wikiSource) return [];
		const typed = wikiState.query.trim();
		const items = matchMentions(wikiSource.items.filter((item) => isWikiTarget(item.name)), typed).slice(0, 8);
		const exact = items.some((item) => item.name.toLowerCase() === typed.toLowerCase());
		return [...items.map((item): WikiMenuRow => ({ kind: "item", item })), ...(typed && !exact && isWikiTarget(typed) ? [{ kind: "new", target: typed } as WikiMenuRow] : [])];
	}, [wikiState, wikiSource]);
	const wikiMenuRef = useRef<{ rows: WikiMenuRow[]; range: { from: number; to: number } } | null>(null);
	wikiMenuRef.current = wikiOpen && wikiState ? { rows: wikiRows, range: { from: wikiState.from, to: wikiState.to } } : null;
	const wikiActiveRef = useRef(0);
	wikiActiveRef.current = wikiActive;
	useEffect(() => { setWikiActive(0); }, [wikiState?.query]);
	const pickWiki = (row: WikiMenuRow) => {
		const range = wikiMenuRef.current?.range;
		if (!editor || !range) return;
		const target = row.kind === "item" ? row.item.name : row.target;
		editor.chain().focus().insertContentAt(range, { type: "wikiLink", attrs: { target } }).run();
	};
	const pickWikiRef = useRef(pickWiki);
	pickWikiRef.current = pickWiki;
	// A list that arrived after it opened, and links redrawn by the same news.
	useEffect(() => wiki?.subscribe(() => forceSlash((n) => n + 1)), [wiki]);

	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		editor.view.dispatch(editor.state.tr.setMeta(tutorHighlightsKey, highlights).setMeta("addToHistory", false));
	}, [editor, highlights]);
	useEffect(() => {
		if (!editor || editor.isDestroyed || !goneSessions) return;
		editor.view.dispatch(editor.state.tr.setMeta(sourceLinksKey, goneSessions).setMeta("addToHistory", false));
	}, [editor, goneSessions]);

	openLinkRef.current = () => {
		if (!editor || readOnly) return;
		setLinkAt(anchorBelowSelection(editor, host.current));
	};

	// Unmounting (History, a reload from outside) hands over what is still waiting;
	// TipTap destroys the editor a tick later, so it can still be read here.
	useEffect(() => () => { if (timer.current) emit(); }, [emit]);
	useImperativeHandle(handle, () => ({
		flush: () => { if (timer.current) emit(); },
		focus: () => { editorRef.current?.commands.focus(); },
		imagePosition: () => {
			const current = editorRef.current;
			return current ? afterBlock(current.state.doc, current.state.selection.from) : 0;
		},
		insertImage: (at, attrs) => {
			const current = editorRef.current;
			if (!current || current.isDestroyed) return;
			const pos = Math.min(at, current.state.doc.content.size);
			// The caret follows the image, so a next one goes after it.
			current.chain().insertContentAt(pos, { type: "paragraph", content: [{ type: "pageImage", attrs: { ...attrs, title: null } }] }).setTextSelection(pos + 2).run();
		},
		jumpToText: (quote, terms) => {
			const current = editorRef.current;
			if (!current || current.isDestroyed) return false;
			const pos = findBlockHolding(current.state.doc, quote, terms);
			if (pos === null) return false;
			const dom = current.view.nodeDOM(pos) as HTMLElement | null;
			dom?.scrollIntoView({ block: "center" });
			dom?.classList.add("lh-jump-flash");
			dom?.setAttribute("data-page-jump", "");
			window.setTimeout(() => { dom?.classList.remove("lh-jump-flash"); dom?.removeAttribute("data-page-jump"); }, 2400);
			return true;
		},
		jumpTo: (pos: number) => {
			const current = editorRef.current;
			if (!current) return;
			current.chain().focus().setTextSelection(pos + 1).run();
			(current.view.nodeDOM(pos) as HTMLElement | null)?.scrollIntoView({ block: "start" });
		},
	}), [emit]);

	return (
		<div data-page-editor="" className="contents">
			{editor && !readOnly && <PageToolbar editor={editor} onLink={() => openLinkRef.current()} tutor={tutor} onImage={onChooseImage} />}
			{editor && !readOnly && <ImageAltPopover editor={editor} host={host.current} />}
			{editor && !readOnly && scrollHost && <PageBubble editor={editor} tutor={tutor} onLink={() => openLinkRef.current()} scrollHost={scrollHost} />}
			<div ref={setHost} className="lh-page-editor-host relative min-h-0 flex-1 overflow-y-auto">
				<EditorContent editor={editor} className="min-h-full" />
				{editor && linkAt && <LinkPopover editor={editor} at={linkAt} onClose={() => setLinkAt(null)} />}
				{editor && wikiOpen && wikiSource && <WikiMenu rows={wikiRows} status={wikiSource.status ?? (wikiRows.length === 0 ? "Keep typing a page name." : null)} active={Math.min(wikiActive, Math.max(0, wikiRows.length - 1))} at={anchorBelowSelection(editor, host.current)} onPick={pickWiki} />}
				{editor && slashOpen && <SlashMenu items={slashItems} query={slashState!.query} active={Math.min(slashActive, Math.max(0, slashItems.length - 1))} at={anchorBelowSelection(editor, host.current)} onPick={pickSlash} />}
			</div>
		</div>
	);
}
