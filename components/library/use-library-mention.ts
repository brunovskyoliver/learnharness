"use client";

import dynamic from "next/dynamic";
import { createElement, Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { hasMentionTrigger, matchMentions, mentionQuery, parseReferences, type LibraryItem } from "@/src/core";
import type { CreateMentionPage } from "./mention-menu.tsx";

/**
 * The @ list for one text field (feature 009, contracts/ui-contract.md). The
 * list only inserts `@name` into the field's text: the server reads references
 * from the text it receives, so drafts, retries and steers need no new state.
 * This file stays small because the composer's in the startup graph. The menu
 * loads on the first trigger and the list is fetched then, not at startup. The
 * "New page" row's create and pane open live in the menu for the same reason.
 */
const MentionMenu = dynamic(() => import("./mention-menu.tsx").then((m) => m.MentionMenu), { ssr: false });

export type MentionKeyAction = "next" | "previous" | "insert" | "close" | null;

/** What one key does. Null falls through to the field's own behavior. */
export function mentionKeyAction(state: {
	key: string;
	open: boolean;
	/** A row is active. With no match none is until an arrow reaches "New page". */
	hasActive: boolean;
	composing: boolean;
	shiftKey?: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
}): MentionKeyAction {
	if (state.composing || !state.open) return null;
	if (state.key === "Escape") return "close";
	if (state.key === "ArrowDown") return "next";
	if (state.key === "ArrowUp") return "previous";
	if (!state.hasActive) return null;
	const modified = state.shiftKey || state.metaKey || state.ctrlKey || state.altKey;
	if ((state.key === "Enter" || state.key === "Tab") && !modified) return "insert";
	return null;
}

export type MentionStatus = "idle" | "loading" | "ready" | "failed";

/** A row of matches, or the "New page" row, which stays chosen as matches load. */
export type MentionCursor = number | "new-page";

/** The active row: "New page" sits after the matches; -1 means none. */
export function activeMentionRow(cursor: MentionCursor, optionCount: number): number {
	if (cursor === "new-page") return optionCount;
	return optionCount === 0 ? -1 : Math.min(cursor, optionCount - 1);
}

/** Arrows cycle through the matches and "New page". With no match, they step
 *  between no row and "New page", so Enter keeps the field's normal action
 *  until the learner asks for the row. */
export function moveMentionCursor(active: number, optionCount: number, step: 1 | -1): MentionCursor {
	if (optionCount === 0) return active < 0 ? "new-page" : 0;
	const next = (active + step + optionCount + 1) % (optionCount + 1);
	return next === optionCount ? "new-page" : next;
}

/** The reference, replacing the token if it is still where it was. If the draft
 *  moved on while the page was being created, it goes at the end: nothing typed
 *  is ever lost. */
export function placeNewPageReference(current: string, token: { start: number; text: string }, name: string): { value: string; start: number; caret: number } {
	const inserted = `@${name} `;
	if (current.slice(token.start, token.start + token.text.length) === token.text) {
		return { value: current.slice(0, token.start) + inserted + current.slice(token.start + token.text.length), start: token.start, caret: token.start + inserted.length };
	}
	const start = current.length + (!current || /\s$/.test(current) ? 0 : 1);
	return { value: current.padEnd(start, " ") + inserted, start, caret: start + inserted.length };
}

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
	const [cursor, setCursor] = useState<MentionCursor>(0);
	const [refusal, setRefusal] = useState<string | null>(null);
	const pendingCaret = useRef<number | null>(null);
	const createPageRef = useRef<CreateMentionPage | null>(null);
	const creating = useRef(false);
	// A page is created over a network request; the draft may move meanwhile.
	const latest = useRef({ value, onValueChange });
	latest.current = { value, onValueChange };

	const names = useMemo(() => items?.map((item) => item.name) ?? [], [items]);
	const token = caret === null || composing ? null : mentionQuery(value, Math.min(caret, value.length), names);
	const open = token !== null && closedAt !== token.start;
	const query = open ? token.query : null;
	const options = useMemo(() => (query !== null && items ? matchMentions(items, query) : []), [query, items]);
	const activeIndex = activeMentionRow(cursor, options.length);

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
	useEffect(() => { setCursor(0); }, [start, token?.query]);
	useEffect(() => { if (start === null) setClosedAt(null); }, [start]);
	// A refusal lasts until the learner carries on with the draft.
	useEffect(() => { setRefusal(null); }, [value]);

	const insert = useCallback((item: Pick<LibraryItem, "name">) => {
		if (!token || caret === null) return;
		const inserted = `@${item.name} `;
		pendingCaret.current = token.start + inserted.length;
		setClosedAt(token.start);
		onValueChange(value.slice(0, token.start) + inserted + value.slice(caret));
	}, [token, caret, value, onValueChange]);

	const createPage = useCallback(async () => {
		const create = createPageRef.current;
		if (!token || caret === null || !create || creating.current) return;
		creating.current = true;
		const at = { start: token.start, text: value.slice(token.start, caret) };
		setRefusal(null);
		setClosedAt(token.start);
		const result = await create();
		creating.current = false;
		if ("error" in result) {
			setRefusal(result.error);
			setCursor(0);
			setClosedAt((closed) => (closed === at.start ? null : closed));
			return;
		}
		const current = latest.current.value;
		const placed = placeNewPageReference(current, at, result.item.name);
		pendingCaret.current = current === value ? placed.caret : placed.value.length;
		setClosedAt(placed.start);
		// In the list now, so the token reads as a reference straight away.
		setItems((list) => [...(list ?? []), result.item]);
		latest.current.onValueChange(placed.value);
	}, [token, caret, value]);

	/** Runs before the field's own handler. True means the key was taken. */
	const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
		const action = mentionKeyAction({
			key: event.key,
			open,
			hasActive: activeIndex >= 0,
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
		else if (action === "insert") {
			if (activeIndex === options.length) void createPage();
			else insert(options[activeIndex]!);
		} else setCursor(moveMentionCursor(activeIndex, options.length, action === "next" ? 1 : -1));
		return true;
	}, [open, options, composing, token, insert, createPage, activeIndex]);

	const readCaret = (event: { currentTarget: HTMLTextAreaElement }) => setCaret(event.currentTarget.selectionStart);
	const inputProps = {
		role: "combobox" as const,
		"aria-autocomplete": "list" as const,
		"aria-expanded": open,
		"aria-controls": open ? listId : undefined,
		"aria-activedescendant": open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined,
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
		? createElement(MentionMenu, { listId, status, hasItems: (items?.length ?? 0) > 0, options, activeIndex, onPick: insert, onNewPage: () => void createPage(), createPageRef })
		: null;

	/** Pre-send line: only names, since the mode is decided at send. */
	const attaching = useMemo(() => (items && hasTrigger ? parseReferences(value, items).map((item) => item.name) : []), [items, value, hasTrigger]);
	const line: ReactNode = createElement(
		Fragment,
		null,
		refusal ? createElement("div", { role: "alert", "data-testid": "mention-new-page-refusal", className: "px-4 pb-1 text-sm [overflow-wrap:anywhere]" }, createElement("span", { className: "font-medium text-foreground" }, "New page"), createElement("span", { className: "text-destructive" }, ` · ${refusal}`)) : null,
		attaching.length > 0
			? createElement("div", { "data-testid": "attaching-line", className: "px-4 pb-1 text-sm text-muted-foreground [overflow-wrap:anywhere]" }, `Attaching ${attaching.join(", ")}`)
			: null,
	);

	return { ref, inputProps, onKeyDown, menu, line };
}
