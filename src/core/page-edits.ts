/** Pure find and replace for page_revise (contracts/agent-tools.md). Every find
 *  must match exactly once, against the text as the earlier edits left it. */
export interface PageEdit { find: string; replace: string }

export function applyPageEdits(text: string, edits: readonly PageEdit[]): string | { refused: string } {
	let current = text;
	for (const { find, replace } of edits) {
		if (!find) return { refused: "An edit has an empty find, so nothing was changed." };
		const first = current.indexOf(find);
		if (first < 0) return { refused: `This find matches nothing, so nothing was changed: ${find}` };
		if (current.indexOf(find, first + 1) >= 0) return { refused: `This find matches more than once, so nothing was changed: ${find}` };
		current = current.slice(0, first) + replace + current.slice(first + find.length);
	}
	return current;
}
