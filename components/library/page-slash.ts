/** The slash menu's pure parts (feature 010, US1): when "/" at the start of an
 *  empty line opens it, and which blocks a query keeps. The editor runs the
 *  commands; nothing here touches the DOM. */

export type SlashBlock =
	| "heading1" | "heading2" | "heading3"
	| "bulletList" | "orderedList" | "taskList"
	| "blockquote" | "codeBlock" | "blockMath" | "table" | "image" | "divider";

export interface SlashItem { id: SlashBlock; label: string }

/** Order and names per contracts/ui-contract.md. */
export const SLASH_ITEMS: readonly SlashItem[] = [
	{ id: "heading1", label: "Heading 1" },
	{ id: "heading2", label: "Heading 2" },
	{ id: "heading3", label: "Heading 3" },
	{ id: "bulletList", label: "Bulleted list" },
	{ id: "orderedList", label: "Numbered list" },
	{ id: "taskList", label: "Checklist" },
	{ id: "blockquote", label: "Quote" },
	{ id: "codeBlock", label: "Code block" },
	{ id: "blockMath", label: "Formula block" },
	{ id: "table", label: "Table" },
	{ id: "image", label: "Image" },
	{ id: "divider", label: "Divider" },
];

const MAX_QUERY = 24;

/** The query when a paragraph holds only "/" and what follows it, up to the
 *  caret, with nothing after the caret. Null otherwise. */
export function slashQuery(before: string, after: string): string | null {
	if (after.length > 0 || !before.startsWith("/")) return null;
	const query = before.slice(1);
	if (query.length > MAX_QUERY || /[\n/]/.test(query) || query.startsWith(" ")) return null;
	return query;
}

/** Items whose label has a word starting with the query, in menu order. */
export function filterSlashItems(query: string, items: readonly SlashItem[] = SLASH_ITEMS): SlashItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...items];
	return items.filter((item) => {
		const label = item.label.toLowerCase();
		return label.startsWith(q) || label.split(/\s+/).some((word) => word.startsWith(q));
	});
}

export const slashEmptyText = (query: string) => `No block matches "${query}"`;
