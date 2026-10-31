/** The pane's states (T052). The editor itself runs in the browser check. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SAVE_STATE_LABEL, type SaveStatus } from "../components/library/page-draft.ts";
import { pageEditorAttributes } from "../components/library/page-editor.tsx";
import { versionLabel } from "../components/library/page-history.tsx";
import { ConflictLine, PaneHeader, SaveState } from "../components/library/page-pane.tsx";

const noop = () => {};

describe("the page pane", () => {
	it("words each save state as the contract does", () => {
		const expected: Record<SaveStatus, string> = {
			saved: "Saved", saving: "Saving…", "draft-saved": "Draft saved", failed: "Not saved. Your text is kept in this browser.",
		};
		for (const status of Object.keys(expected) as SaveStatus[]) {
			assert.equal(SAVE_STATE_LABEL[status], expected[status]);
			const html = renderToStaticMarkup(<SaveState state={{ status }} onRetry={noop} />);
			assert.ok(html.includes(expected[status]));
			assert.equal(html.includes("Try again"), status === "failed");
		}
	});
	it("words the conflict line and offers both actions", () => {
		assert.ok(!renderToStaticMarkup(<SaveState state={{ status: "failed" }} canRetry={false} onRetry={noop} />).includes("Try again"), "a conflict is answered by its own actions");
		const html = renderToStaticMarkup(<ConflictLine onKeepMine={noop} onUseLatest={noop} />);
		for (const text of ["This page changed elsewhere. Your text is safe here.", "Keep mine", "Use latest"]) assert.ok(html.includes(text), text);
		assert.ok(html.includes('role="status"'));
	});
	it("phones get Back to chat, wide screens a named close", () => {
		const phone = renderToStaticMarkup(<PaneHeader phone name="n" onClose={noop} closeLabel="Close n" />);
		assert.ok(phone.includes("Back to chat") && !phone.includes('aria-label="Close n"'));
		const wide = renderToStaticMarkup(<PaneHeader phone={false} name="n" onClose={noop} closeLabel="Close n" />);
		assert.ok(!wide.includes("Back to chat") && wide.includes('aria-label="Close n"'));
	});
	it("History rows read Version, author and time", () => {
		assert.match(versionLabel({ n: 3, author: "learner", at: "2026-10-30T10:00:00Z" }), /^Version 3 · You · /);
		assert.match(versionLabel({ n: 4, author: "agent", at: "2026-10-30T10:00:00Z" }), /^Version 4 · Agent · /);
	});
	it("the editor has an accessible name, and CSS gives it visible focus", () => {
		const attrs = pageEditorAttributes("Page Week 3");
		assert.equal(attrs["aria-label"], "Page Week 3");
		assert.equal(attrs.role, "textbox");
		assert.equal(attrs["aria-multiline"], "true");
		const css = fs.readFileSync("app/globals.css", "utf8");
		assert.match(css, /\.lh-page-editor:focus-visible \{ outline: 1px solid var\(--ring\)/);
	});
});
