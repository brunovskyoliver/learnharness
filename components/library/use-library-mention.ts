"use client";

import dynamic from "next/dynamic";
import { createElement, Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { folderPathLabel, hasMentionTrigger, isTombstone, matchMentions, mentionName, mentionQuery, parseReferences, type LibraryFolder, type LibraryItem, type LibraryKind, type LibraryTombstone } from "@/src/core";
import type { CreateMentionPage, MentionItem } from "./mention-menu.tsx";

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

/** A name the server still resolves for an item that isn't live (feature 027,
 *  analyze M1): one in the Trash or deleted for good, or a file removed from its
 *  repo by one of the paths it was named by. The composer draws it faint. */
export interface GoneName { id: string; name: string; kind: LibraryKind; removed?: true }

/** What the composer's chips are found by: the list the @ list loaded, and the
 *  gone names, as tombstones the recogniser ranks below every live name. */
export interface MentionCatalog {
	entries: (LibraryItem | LibraryTombstone)[];
	folders: LibraryFolder[];
	/** Ids that left their repo (feature 026), drawn "removed" rather than "deleted". */
	removedIds: ReadonlySet<string>;
}

type ListBody = { items: LibraryItem[]; folders?: LibraryFolder[]; gone?: { id: string; name: string; kind: LibraryKind }[]; removed?: { id: string; kind?: LibraryKind; names: string[] }[] };

/** The gone names in a list response. A removed file without a known kind reads as a text file. */
export function goneNames(body: Pick<ListBody, "gone" | "removed">): GoneName[] {
	return [
		...(body.gone ?? []),
		...(body.removed ?? []).flatMap((entry) => entry.names.map((name): GoneName => ({ id: entry.id, name, kind: entry.kind ?? "text", removed: true }))),
	];
}

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

/** Owner, 2026-11-08: the composer says before send when a name reaches an
 *  item that is gone (in the Trash, deleted for good, or removed from its repo). */
export const goneLine = (name: string, removed: boolean): string => (removed ? `${name} was removed from the repo` : `${name} is no longer in your Library`);

/** The names the "Attaching" line lists, and one line per gone item, in text order. */
export function attachingLines(found: readonly (LibraryItem | LibraryTombstone)[], removedIds: ReadonlySet<string>): { attaching: string[]; gone: string[] } {
	const attaching: string[] = [];
	const gone: string[] = [];
	for (const entry of found) {
		if (isTombstone(entry)) gone.push(goneLine(entry.name, removedIds.has(entry.id)));
		else attaching.push(entry.name);
	}
	return { attaching, gone };
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
	const [folders, setFolders] = useState<LibraryFolder[]>([]);
	const [gone, setGone] = useState<GoneName[]>([]);
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

	// A mirrored item is reached by its Library path (feature 026, R13); its row
	// still shows the file name, with the folder path as its meta.
	const entries = useMemo((): MentionItem[] | null => items?.map((item) => {
		if (!item.mirror) return item;
		return { ...item, mention: mentionName(item, folders), place: folderPathLabel(item.folderId, folders) };
	}) ?? null, [items, folders]);
	const names = useMemo(() => entries?.map((item) => item.mention ?? item.name) ?? [], [entries]);
	const token = caret === null || composing ? null : mentionQuery(value, Math.min(caret, value.length), names);
	const open = token !== null && closedAt !== token.start;
	const query = open ? token.query : null;
	const options = useMemo(() => (query !== null && entries ? matchMentions(entries.map((item) => ({ item, name: item.mention ?? item.name })), query).map((row) => row.item) : []), [query, entries]);
	const activeIndex = activeMentionRow(cursor, options.length);

	const load = useCallback(async () => {
		setStatus((current) => (current === "ready" ? current : "loading"));
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = (await response.json()) as ListBody;
			setItems(body.items);
			setFolders(body.folders ?? []);
			setGone(goneNames(body));
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

	const insert = useCallback((item: Pick<MentionItem, "name" | "mention">) => {
		if (!token || caret === null) return;
		const inserted = `@${item.mention ?? item.name} `;
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

	/** The loaded list for the field's chips (feature 027, T036): nothing is
	 *  fetched for it, so it is null until a trigger loads the @ list. */
	const catalog = useMemo((): MentionCatalog | null => items && {
		entries: [...items, ...gone.map(({ id, name, kind }): LibraryTombstone => ({ id, name, kind, deletedAt: "" }))],
		folders,
		removedIds: new Set(gone.filter((g) => g.removed).map((g) => g.id)),
	}, [items, gone, folders]);

	/** Pre-send lines: only names, since the mode is decided at send. A name
	 *  that reaches a gone item gets its own faint line; it never blocks sending. */
	const found = useMemo(() => attachingLines(catalog && hasTrigger ? parseReferences(value, catalog.entries, folders) : [], catalog?.removedIds ?? new Set()), [catalog, folders, value, hasTrigger]);
	const line: ReactNode = createElement(
		Fragment,
		null,
		refusal ? createElement("div", { role: "alert", "data-testid": "mention-new-page-refusal", className: "px-4 pb-1 text-sm [overflow-wrap:anywhere]" }, createElement("span", { className: "font-medium text-ink" }, "New page"), createElement("span", { className: "text-red" }, ` · ${refusal}`)) : null,
		found.attaching.length > 0
			? createElement("div", { "data-testid": "attaching-line", className: "px-4 pb-1 text-sm text-faint [overflow-wrap:anywhere]" }, `Attaching ${found.attaching.join(", ")}`)
			: null,
		...found.gone.map((text, index) => createElement("div", { key: `gone-${index}`, "data-testid": "attaching-gone-line", className: "px-4 pb-1 text-sm text-faint [overflow-wrap:anywhere]" }, text)),
	);

	return { ref, inputProps, onKeyDown, menu, line, catalog };
}
