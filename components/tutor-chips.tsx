"use client";

/**
 * Chips in the tutor's replies (feature 027, US3, research R7). Links the tutor
 * writes to a Library item (`/library?item=…`) and `@name` tokens that resolve
 * by the server's rules (rewritten into such links by `chipMarkdown`) render as
 * the same chip sent messages use, opening like them (R9). Nothing else in a
 * reply changes: other links render as Streamdown draws them.
 *
 * Until the Library list arrives (or when it can't be read) the reply renders as
 * before: `@name` as text, links as links (ui-contract §6). Presentation only:
 * the stored reply is untouched, and each chip's `data-source` is what its text
 * rendered as before, so copy gives the same text (T058).
 *
 * The `a` override is one stable component reading a context, so Streamdown's
 * block memo never holds a stale component; the context carries the states.
 */
import { createContext, isValidElement, useCallback, useContext, useLayoutEffect, useMemo, type AnchorHTMLAttributes, type ReactNode, type RefObject } from "react";
import { ReferenceChip } from "@/components/reference-chip";
import { useLiveLibrary, useReferenceCatalog, type ItemStatus, type LiveLibrary } from "@/components/reference-catalog";
import { mdComponents } from "@/components/md-blocks";
import { cn } from "@/lib/utils";
import { CHIP_LINK_TITLE, chipMarkdown, chipTarget, isTombstone, itemPlace, nameKey, parseLibraryHref, type ChipInput, type LibraryHref, type LibraryKind } from "@/src/core";

interface TutorChips {
	list: LiveLibrary;
	statuses: Map<string, ItemStatus>;
	/** Display names that two different items in this reply share (analyze M2). */
	shared: ReadonlySet<string>;
}

const TutorChipsContext = createContext<TutorChips | null>(null);

const LIBRARY_LINK = /(?:https?:\/\/[^\s/()]+)?\/library\?item=[^\s)"'>]+/g;
const origin = () => (typeof location === "undefined" ? undefined : location.origin);

/** Every Library address a reply's Markdown links to, parsed. */
function libraryLinks(markdown: string): LibraryHref[] {
	const out: LibraryHref[] = [];
	for (const [href] of markdown.matchAll(LIBRARY_LINK)) {
		const parsed = parseLibraryHref(href, origin());
		if (parsed) out.push(parsed);
	}
	return out;
}

const plainText = (node: ReactNode): string => {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(plainText).join("");
	if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
	return "";
};

/** What a chip for `href` shows: the item's state now, its current name (the
 *  name as written when it's gone), kind and place. */
function chipInput(href: LibraryHref, written: string, chips: TutorChips): ChipInput {
	const status = chips.statuses.get(href.itemId);
	const item = status?.item;
	const tombstone = chips.list.entries.find((entry) => entry.id === href.itemId && isTombstone(entry));
	// A removed file's paths: its display name is the file name, as for a live one.
	const goneName = tombstone && (status?.state === "removed" ? tombstone.name.split("/").at(-1)! : tombstone.name);
	const kind: LibraryKind = item?.kind ?? tombstone?.kind ?? (href.page !== undefined ? "pdf" : "other");
	return {
		itemId: href.itemId,
		state: status?.state ?? "unknown",
		name: item?.name ?? goneName ?? written,
		kind,
		...(href.page !== undefined ? { page: href.page } : {}),
		...(href.quote ? { quote: href.quote } : {}),
		...(status?.trashEntryId ? { trashEntryId: status.trashEntryId } : {}),
		...(item ? itemPlace(item, chips.list.folders) : {}),
	};
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown };

/** Streamdown's own link (streamdown@2.5, linkSafety off) in paper ink, for every other address. */
function PlainLink({ children, className, href, node: _node, ...props }: LinkProps) {
	return (
		<a className={cn("wrap-anywhere font-medium text-ink underline", className)} data-streamdown="link" href={href} rel="noreferrer" target="_blank" {...props}>
			{children}
		</a>
	);
}

function TutorLink(props: LinkProps) {
	const chips = useContext(TutorChipsContext);
	const parsed = chips && props.href ? parseLibraryHref(props.href, origin()) : null;
	if (!chips || !parsed) {
		// A chipped `@name` drawn before its chip can be: plain text, as it was written.
		if (props.title === CHIP_LINK_TITLE) return <>{props.children}</>;
		return <PlainLink {...props} />;
	}
	const written = plainText(props.children);
	const fallback = props.title === CHIP_LINK_TITLE ? written.replace(/^@/, "") : written;
	const input = chipInput(parsed, fallback, chips);
	return <ReferenceChip target={chipTarget(input, chips.shared.has(nameKey(input.name)))} source={written} citation />;
}

/** The tutor's Markdown components: the shared blocks and the chip link. */
export const tutorComponents = { ...mdComponents, a: TutorLink };

/** Numbers the reply's chips in document order (`{messageId}:t{part}-{n}`), the
 *  key a chip's return point names (R9). Streamdown may draw its blocks after
 *  this component renders, so the numbering follows the reply's own changes. */
function useChipKeys(root: RefObject<HTMLElement | null>, scope: string | undefined) {
	useLayoutEffect(() => {
		const element = root.current;
		if (!scope || !element) return;
		const number = () => element.querySelectorAll<HTMLElement>('[data-testid="ref-chip"]').forEach((chip, n) => {
			const key = `${scope}-${n}`;
			if (chip.dataset.refChip !== key) chip.dataset.refChip = key;
		});
		number();
		const observer = new MutationObserver(number);
		observer.observe(element, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [root, scope]);
}

/** A tutor reply's chips: the Markdown to render (with resolving `@name`s as
 *  links once the list is in), the provider for its links, and whether chips
 *  are drawn (`lh-refs-ready`, which also makes Streamdown re-render its blocks). */
export function useTutorChips(source: string, root: RefObject<HTMLElement | null>, scope: string | undefined) {
	const names = source.includes("@") || source.includes("/library?item=");
	const list = useLiveLibrary(names);
	const prepare = useCallback((markdown: string) => (list ? chipMarkdown(markdown, list) : markdown), [list]);
	const prepared = prepare(source);
	const links = useMemo(() => (list ? libraryLinks(prepared) : []), [list, prepared]);
	const queries = useMemo(() => links.map(({ itemId }) => ({ itemId })), [links]);
	const { statuses } = useReferenceCatalog(queries);
	const value = useMemo((): TutorChips | null => {
		if (!list || !statuses || links.length === 0) return null;
		// The list couldn't be read for these: the reply stays as it was.
		if ([...statuses.values()].every((status) => status.state === "unknown")) return null;
		const ids = new Map<string, Set<string>>();
		const probe: TutorChips = { list, statuses, shared: new Set() };
		for (const href of links) {
			const key = nameKey(chipInput(href, "", probe).name);
			ids.set(key, (ids.get(key) ?? new Set()).add(href.itemId));
		}
		return { ...probe, shared: new Set([...ids].filter(([, set]) => set.size > 1).map(([key]) => key)) };
	}, [list, statuses, links]);
	useChipKeys(root, scope);
	return { prepare: value ? prepare : undefined, value, ready: value !== null };
}

export function TutorChipsProvider({ value, children }: { value: TutorChips | null; children: ReactNode }) {
	return <TutorChipsContext.Provider value={value}>{children}</TutorChipsContext.Provider>;
}
