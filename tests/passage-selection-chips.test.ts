import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";

// Feature 027 (FR-002): saving tutor prose to a page keeps the text a chip stands for.

const { document, HTMLElement } = parseHTML("<html><body></body></html>");
Object.assign(globalThis, { HTMLElement });
const { walk, tidySegments } = await import("../components/passage-selection.ts");
const { passageMarkdown } = await import("../src/core/index.ts");

describe("a saved passage across chips", () => {
	it("takes each chip's source, not its drawn name and hint", () => {
		const root = document.createElement("div");
		root.innerHTML = '<p>See <a data-testid="ref-chip" data-source="Notes.pdf, p. 3" href="/library?item=a&amp;page=3"><svg></svg><span>Notes.pdf</span><span> · p. 3</span></a> and <a data-testid="ref-chip" data-source="@Untitled note" href="/library?item=b"><span>Untitled note</span></a>.</p>';
		const segments: Parameters<typeof tidySegments>[0][number][] = [];
		walk(root, segments);
		assert.equal(passageMarkdown(tidySegments(segments)), "See Notes.pdf, p. 3 and @Untitled note.");
	});
});
