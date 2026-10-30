"use client";

import dynamic from "next/dynamic";
import { createElement, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { hasMentionTrigger, matchMentions, mentionQuery, parseReferences, type LibraryItem } from "@/src/core";

/**
 * The @ list for one text field (feature 009, contracts/ui-contract.md). The
 * list only inserts `@name` into the field's text: the server reads references
 * from the text it receives, so drafts, retries and steers need no new state.
 * This file stays small because the composer's in the startup graph. The menu
 * loads on the first trigger and the list is fetched then, not at startup.
 */
const MentionMenu = dynamic(() => import("./mention-menu.tsx").then((m) => m.MentionMenu), { ssr: false });

export type MentionKeyAction = "next" | "previous" | "insert" | "close" | null;

/** What one key does. Null falls through to the field's own behavior. */
export function mentionKeyAction(state: {
	key: string;
	open: boolean;
	hasOptions: boolean;
	composing: boolean;
	shiftKey?: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
}): MentionKeyAction {
	if (state.composing || !state.open) return null;
	if (state.key === "Escape") return "close";
	if (!state.hasOptions) return null;
	if (state.key === "ArrowDown") return "next";
	if (state.key === "ArrowUp") return "previous";
	const modified = state.shiftKey || state.metaKey || state.ctrlKey || state.altKey;
	if ((state.key === "Enter" || state.key === "Tab") && !modified) return "insert";
	return null;
}

export type MentionStatus = "idle" | "loading" | "ready" | "failed";

export function useLibraryMention({ value, onValueChange, inputRef }: {
	value: string;
	onValueChange: (next: string) => void;
	inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
	const ownRef = useRef<HTMLTextAreaElement | null>(null);
	const ref = inputRef ?? ownRef;
	const listId = useId();
	const [items, setItems] = useState<LibraryItem[] | null>(null);
	const [status, setStatus] = useState<MentionStatus>("idle");
	const [caret, setCaret] = useState<number | null>(null);
	const [composing, setComposing] = useState(false);
	const [closedAt, setClosedAt] = useState<number | null>(null);
	const [activeIndex, setActiveIndex] = useState(0);
	const pendingCaret = useRef<number | null>(null);

	const names = useMemo(() => items?.map((item) => item.name) ?? [], [items]);
	const token = caret === null || composing ? null : mentionQuery(value, Math.min(caret, value.length), names);
	const open = token !== null && closedAt !== token.start;
	const query = open ? token.query : null;
	const options = useMemo(() => (query !== null && items ? matchMentions(items, query) : []), [query, items]);

	const load = useCallback(async () => {
		setStatus((current) => (current === "ready" ? current : "loading"));
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setItems(((await response.json()) as { items: LibraryItem[] }).items);
			setStatus("ready");
		} catch {
			// A failed refresh keeps the last good list.
			setStatus((current) => (current === "ready" ? current : "failed"));
		}
	}, []);

	// The list refreshes each time it opens. A restored draft with a token also
	// needs it, for the pre-send line.
	useEffect(() => { if (open) void load(); }, [open, load]);
	const hasTrigger = hasMentionTrigger(value);
	useEffect(() => { if (hasTrigger && status === "idle") void load(); }, [hasTrigger, status, load]);

	useEffect(() => {
		const field = ref.current;
		if (!field) return;
		if (pendingCaret.current !== null) {
			field.setSelectionRange(pendingCaret.current, pendingCaret.current);
			setCaret(pendingCaret.current);
			pendingCaret.current = null;
		} else if (document.activeElement === field) {
			setCaret(field.selectionStart);
		}
	}, [value, ref]);

	// A new token starts fresh; leaving the token forgets an Escape.
	const start = token?.start ?? null;
	useEffect(() => { setActiveIndex(0); }, [start, token?.query]);
	useEffect(() => { if (start === null) setClosedAt(null); }, [start]);

	const insert = useCallback((item: Pick<LibraryItem, "name">) => {
		if (!token || caret === null) return;
		const inserted = `@${item.name} `;
		pendingCaret.current = token.start + inserted.length;
		setClosedAt(token.start);
		onValueChange(value.slice(0, token.start) + inserted + value.slice(caret));
	}, [token, caret, value, onValueChange]);

	/** Runs before the field's own handler. True means the key was taken. */
	const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
		const action = mentionKeyAction({
			key: event.key,
			open,
			hasOptions: options.length > 0,
			composing: composing || event.nativeEvent.isComposing,
			shiftKey: event.shiftKey,
			metaKey: event.metaKey,
			ctrlKey: event.ctrlKey,
			altKey: event.altKey,
		});
		if (!action) return false;
		event.preventDefault();
		event.stopPropagation();
		// Some keyboard chains listen on document, where React's root also is.
		event.nativeEvent.stopImmediatePropagation();
		if (action === "close") setClosedAt(token!.start);
		else if (action === "insert") insert(options[activeIndex] ?? options[0]!);
		else setActiveIndex((index) => (index + (action === "next" ? 1 : options.length - 1)) % options.length);
		return true;
	}, [open, options, composing, token, insert, activeIndex]);

	const readCaret = (event: { currentTarget: HTMLTextAreaElement }) => setCaret(event.currentTarget.selectionStart);
	const inputProps = {
		role: "combobox" as const,
		"aria-autocomplete": "list" as const,
		"aria-expanded": open,
		"aria-controls": open ? listId : undefined,
		"aria-activedescendant": open && options.length > 0 ? `${listId}-${activeIndex}` : undefined,
		// In the same batch as the field's onChange, so a key right after typing
		// never acts on the previous query.
		onInput: readCaret,
		onSelect: readCaret,
		onFocus: readCaret,
		onBlur: () => setCaret(null),
		onCompositionStart: () => setComposing(true),
		onCompositionEnd: (event: { currentTarget: HTMLTextAreaElement }) => { setComposing(false); readCaret(event); },
	};

	const menu: ReactNode = open
		? createElement(MentionMenu, { listId, status, hasItems: (items?.length ?? 0) > 0, options, activeIndex, onPick: insert })
		: null;

	/** Pre-send line: only names, since the mode is decided at send. */
	const attaching = useMemo(() => (items && hasTrigger ? parseReferences(value, items).map((item) => item.name) : []), [items, value, hasTrigger]);
	const line: ReactNode = attaching.length > 0
		? createElement("div", { "data-testid": "attaching-line", className: "px-4 pb-1 text-sm text-muted-foreground [overflow-wrap:anywhere]" }, `Attaching ${attaching.join(", ")}`)
		: null;

	return { ref, inputProps, onKeyDown, menu, line };
}
