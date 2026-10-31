/** Features 016-018: what the connections panel, session notes and bubble wording
 *  render, on the server, for each state. The behaviour runs in scripts/check-notes-ui.mjs. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { wikiLinkView } from "../components/library/page-note-views.ts";
import { TUTOR_ACTION_LABEL, TUTOR_ACTIONS } from "../components/library/page-tutor-actions.ts";
import { SessionNotesBody } from "../components/workspace/context-pane.tsx";
import { NoteConnectionsBody, type NoteConnections } from "../components/workspace/note-connections.tsx";
import { paletteActions } from "../src/core/index.ts";

const noop = () => {};
const empty: NoteConnections = { links: [], backlinks: [], related: [], sources: [], sessions: [], graph: [] };
const body = (data: NoteConnections) => renderToStaticMarkup(<NoteConnectionsBody data={data} onOpenPage={noop} onFollowLink={noop} onSource={noop} />);

describe("the connections panel", () => {
	it("says what's empty in each section, without a picture", () => {
		const html = body(empty);
		for (const text of ["No page links here yet.", "Type [[ in the text to link a page.", "Nothing related yet.", "No lesson is tied to this page.", "No graph idea relates to this page yet."]) assert.ok(html.includes(text), text);
		assert.ok(!html.includes("<img"));
	});
	it("names a link's state in words, not only in style", () => {
		const html = body({
			...empty,
			links: [
				{ target: "Old", resolution: { state: "live", id: "a", name: "New", kind: "page" } },
				{ target: "Nope", resolution: { state: "missing" } },
				{ target: "Gone", resolution: { state: "deleted", id: "g", name: "Gone", kind: "page" } },
			],
		});
		for (const text of ["New", "Written as Old", "No such page yet", "Deleted from your Library"]) assert.ok(html.includes(text), text);
	});
	it("a gone session keeps the sentence and offers no jump", () => {
		const html = body({ ...empty, sources: [{ chatId: "c", messageId: "m", title: null, gone: true, href: "/chat/c#message-m" }], sessions: [{ chatId: "c", title: null, gone: true, href: "/chat/c" }] });
		assert.ok(html.includes("its source is gone"));
		assert.ok(!html.includes('data-testid="note-source"') && !html.includes('data-testid="note-session"'));
	});
	it("a live source offers the jump, and graph rows read their statement", () => {
		const html = body({ ...empty, sources: [{ chatId: "c", messageId: "m", title: "Waves", gone: false, href: "/chat/c#message-m" }], graph: [{ id: "n", name: "Eigen", statement: "A true statement.", reason: "source", href: null }] });
		assert.ok(html.includes("Saved passage · jump to it") && html.includes("A true statement."));
	});
});

describe("a wiki link's reading", () => {
	it("shows the current name, says when it can't, and never claims a verdict it hasn't got", () => {
		assert.deepEqual(wikiLinkView("Old", { state: "live", name: "New" }), { text: "New", name: "Open New", state: "live" });
		assert.deepEqual(wikiLinkView("Nope", { state: "missing" }), { text: "Nope", name: "Nope, no such page yet", state: "missing" });
		assert.deepEqual(wikiLinkView("Gone", { state: "deleted" }), { text: "Gone", name: "Gone, deleted from your Library", state: "deleted" });
		assert.equal(wikiLinkView("x", null).state, "unknown");
	});
});

describe("session notes", () => {
	const props = { failed: false, canMakeNotes: true, busy: false, error: null, onOpen: noop, onStudyNotes: noop, onRetry: noop };
	it("loading, empty, failed and listed are distinct", () => {
		assert.ok(renderToStaticMarkup(<SessionNotesBody {...props} pages={null} />).includes("Loading notes"));
		assert.ok(renderToStaticMarkup(<SessionNotesBody {...props} pages={[]} />).includes("No page is tied to this session yet."));
		assert.ok(renderToStaticMarkup(<SessionNotesBody {...props} pages={null} failed />).includes("Notes could not be loaded."));
		const listed = renderToStaticMarkup(<SessionNotesBody {...props} pages={[{ id: "a", name: "Reading", kind: "page", size: 1, passages: 1 }]} />);
		assert.ok(listed.includes("Reading") && listed.includes("1 saved passage"));
	});
	it("offers study notes on a lesson only, and reports a refusal", () => {
		assert.ok(renderToStaticMarkup(<SessionNotesBody {...props} pages={[]} />).includes("Turn this lesson into study notes"));
		assert.ok(!renderToStaticMarkup(<SessionNotesBody {...props} canMakeNotes={false} pages={[]} />).includes("Turn this lesson"));
		assert.ok(renderToStaticMarkup(<SessionNotesBody {...props} pages={[]} error="Nothing yet." />).includes('role="alert"'));
	});
	it("the palette offers both actions only where they can answer", () => {
		const labels = (session: boolean, lesson: boolean) => paletteActions(session, lesson).map((entry) => entry.label);
		assert.ok(labels(true, true).includes("Turn this lesson into study notes"));
		assert.ok(!labels(true, false).includes("Turn this lesson into study notes"), "not in practice");
		assert.ok(labels(true, false).includes("Save the selected text to a page"));
		assert.ok(!labels(false, false).includes("Save the selected text to a page"));
	});
});

describe("the bubble", () => {
	it("lists the actions in order", () => {
		assert.deepEqual(TUTOR_ACTIONS.map((action) => TUTOR_ACTION_LABEL[action]), ["Explain", "Simpler", "Summarize", "Rewrite", "Expand", "Challenge", "Quiz me on this", "Generate questions", "Ask…"]);
	});
});
