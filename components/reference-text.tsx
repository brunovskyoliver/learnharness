"use client";

/**
 * Text the learner sent, with its references drawn as chips (feature 027,
 * research R6, ui-contract §2). The chips come from the references the server
 * attached at send, found by the server's own rules (`referenceSpans`), so a
 * chip covers exactly what was attached; reference-catalog says what each
 * item is now. A selection-action form reads LEAD words, one chip carrying
 * the passage, then its tail words; the quoted lines are not shown again.
 * Copy gives back the exact characters (each chip's `data-source`).
 */
import { useMemo, type ClipboardEvent, type ReactNode } from "react";
import { ReferenceChip } from "@/components/reference-chip";
import { useReferenceCatalog, type ItemStatus } from "@/components/reference-catalog";
import { chipTargets, itemPlace, KIND_LABEL, referenceForms, referenceSpans, type ChipInput, type LibraryFolder, type LibraryItem, type LibraryReference, type LibraryTombstone, type ReferenceForm } from "@/src/core";

type Entry = LibraryItem | LibraryTombstone;

/** What the recogniser matches a reference by: the name it was sent with, a
 *  mirrored item's Library path (live: from the item; removed: the paths the
 *  server kept), so `@{linked folder}/{repo path}` is one chip (R15). */
export function sentEntries(references: readonly LibraryReference[], statuses: Map<string, ItemStatus> | null): Entry[] {
	const entries: Entry[] = [];
	for (const reference of references) {
		const status = statuses?.get(reference.itemId);
		const sent: LibraryTombstone = { id: reference.itemId, name: reference.name, kind: reference.kind, deletedAt: "" };
		if (status?.item?.mirror) entries.push(status.item);
		else if (status?.paths && status.paths.length > 0) for (const path of status.paths) entries.push({ ...sent, name: path });
		else entries.push(sent);
	}
	return entries;
}

/** One chip's input from its form, the reference it was sent with and the item's state now. */
function chipInput(form: ReferenceForm<Entry>, reference: LibraryReference | undefined, status: ItemStatus | undefined, folders: readonly LibraryFolder[]): ChipInput {
	const state = status?.state ?? "unknown";
	const item = status?.item;
	return {
		itemId: form.itemId,
		state,
		// Live: the current display name; otherwise the name it was sent with.
		name: item?.name ?? reference?.name ?? KIND_LABEL.pdf,
		kind: item?.kind ?? reference?.kind ?? "pdf",
		...(form.page !== undefined ? { page: form.page } : {}),
		...(form.quote ? { quote: form.quote } : {}),
		...(status?.trashEntryId ? { trashEntryId: status.trashEntryId } : {}),
		...(item ? itemPlace(item, folders) : {}),
	};
}

/** Where the chip's own words end: after the name, or after ", page {n}". The
 *  rest of the form's first line is its tail, shown as text after the chip. */
function headEnd(text: string, form: ReferenceForm<Entry>): number {
	if (!form.span) return form.range[1];
	if (form.quote === undefined) return form.span.end;
	const page = /^, page \d+/.exec(text.slice(form.span.end));
	return form.span.end + (page ? page[0].length : 0);
}

/** The clipboard text of the selection inside `root`: each chip, whole or in
 *  part, becomes the characters it stands for. */
export function copySource(event: ClipboardEvent<HTMLElement>) {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
	const range = selection.getRangeAt(0);
	const root = event.currentTarget;
	if (!root.contains(range.commonAncestorContainer) && !range.intersectsNode(root)) return;
	const fragment = range.cloneContents();
	if (!fragment.querySelector("[data-source]")) return;
	for (const element of [...fragment.querySelectorAll<HTMLElement>("[data-source]")]) {
		if (element.parentElement?.closest("[data-source]")) continue;
		element.replaceWith(document.createTextNode(element.dataset.source ?? ""));
	}
	event.preventDefault();
	event.clipboardData.setData("text/plain", fragment.textContent ?? "");
}

export function ReferenceText({ text, references, messageId }: { text: string; references: readonly LibraryReference[]; messageId: string }) {
	// Passages on their own name their item by id; it may not be among the references.
	const passageIds = useMemo(() => [...text.matchAll(/<library_passage item="([^"]*)"/g)].map((m) => m[1]!.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")), [text]);
	const queries = useMemo(() => {
		const seen = new Map<string, boolean>();
		for (const reference of references) seen.set(reference.itemId, Boolean(reference.fromRepo));
		for (const id of passageIds) if (!seen.has(id)) seen.set(id, false);
		return [...seen].map(([itemId, fromRepo]) => (fromRepo ? { itemId, fromRepo } : { itemId }));
	}, [references, passageIds]);
	const { statuses, folders } = useReferenceCatalog(queries);
	const pieces = useMemo((): ReactNode[] => {
		const entries = sentEntries(references, statuses);
		const forms = referenceForms(text, referenceSpans(text, entries, folders));
		if (forms.length === 0) return [text];
		const byId = new Map(references.map((reference) => [reference.itemId, reference]));
		const targets = chipTargets(forms.map((form) => chipInput(form, byId.get(form.itemId), statuses?.get(form.itemId), folders)));
		const out: ReactNode[] = [];
		let at = 0;
		forms.forEach((form, index) => {
			const [start, end] = form.range;
			if (start < at) return;
			if (start > at) out.push(text.slice(at, start));
			const head = headEnd(text, form);
			out.push(<ReferenceChip key={`chip-${index}`} target={targets[index]!} chipId={`${messageId}:${index}`} source={text.slice(start, head)} />);
			if (head < end) {
				// The tail words of the form's first line, then the passage, carried by the chip.
				const lineEnd = text.indexOf("\n", head);
				const tailEnd = lineEnd === -1 || lineEnd > end ? end : lineEnd;
				if (tailEnd > head) out.push(text.slice(head, tailEnd));
				if (end > tailEnd) out.push(<span key={`body-${index}`} hidden data-source={text.slice(tailEnd, end)} />);
			}
			at = end;
		});
		if (at < text.length) out.push(text.slice(at));
		return out;
	}, [text, references, statuses, folders, messageId]);
	return <>{pieces}</>;
}
