/** Feature 025 phase 7: the Library, page pane and reader in the paper language, on
 *  Notebook's shared parts (selection card actions, export, toolbar register). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeBar, ConflictLine, PaneHeader } from "../components/library/page-pane.tsx";
import { DESTRUCTIVE_BUTTON } from "../components/library/delete-item-dialog.tsx";
import { LibraryTrash } from "../components/library/library-trash.tsx";
import { SelectionAction } from "../components/paper/selection-action.tsx";
import * as paperExport from "../components/paper/export.ts";
import * as nbActions from "../components/notebook/nb-actions.ts";

const noop = () => {};

describe("phase 7 paper look", () => {
	it("a selection card action is the label in the voice, with its test id and no hint unless given", () => {
		const html = renderToStaticMarkup(<SelectionAction label="Quiz me on this" testId="page-tutor-quiz" onRun={noop} />);
		assert.ok(html.includes('class="nb-sel-action"'), html);
		assert.ok(html.includes('data-testid="page-tutor-quiz"'));
		assert.ok(html.includes('<span class="nb-sel-label nb-voice">Quiz me on this</span>'), html);
		assert.ok(!html.includes("nb-sel-hint"));
		const hinted = renderToStaticMarkup(<SelectionAction label="Think about this" hint="Ctrl+↵" testId="nb-sel-think" keyShortcuts="Control+Enter" onRun={noop} />);
		assert.ok(hinted.includes('aria-keyshortcuts="Control+Enter"') && hinted.includes("nb-sel-hint"), hinted);
	});

	it("Notebook's export helpers are the shared ones", () => {
		assert.equal(nbActions.exportNote, paperExport.exportNote);
		assert.equal(nbActions.readExportChoice, paperExport.readExportChoice);
		assert.equal(nbActions.writeExportChoice, paperExport.writeExportChoice);
		assert.equal(nbActions.dispositionName(`attachment; filename*=UTF-8''Caf%C3%A9.md`, "x"), "Café.md");
	});

	it("the pane header's tools are in the toolbar register and keep their names", () => {
		const html = renderToStaticMarkup(<PaneHeader phone={false} name="n" onClose={noop} closeLabel="Close n" actions={<button type="button" className="lh-tool">Outline</button>} />);
		assert.ok(html.includes('aria-label="Close n"') && html.includes('data-testid="page-close"'));
		assert.ok(html.includes('class="lh-tool -mr-1.5"'), html);
		assert.ok(html.includes('class="lh-tools'), "the actions sit in one tools row");
	});

	it("lines are text actions; the change bar's Done is the one ink pill", () => {
		const conflict = renderToStaticMarkup(<ConflictLine onKeepMine={noop} onUseLatest={noop} />);
		assert.equal((conflict.match(/class="lh-text-action"/g) ?? []).length, 2, conflict);
		const bar = renderToStaticMarkup(<ChangeBar text="The tutor changed 2 places · version 3" onPrevious={noop} onNext={noop} onUndo={noop} onDone={noop} busy={false} />);
		assert.ok(bar.includes("lh-line-card"), bar);
		assert.ok(/class="nb-pill"[^>]*data-testid="page-changes-done"/.test(bar), bar);
		assert.ok(!bar.includes("prompt-primary") && !bar.includes("prompt-secondary"));
	});

	it("a destructive confirm is the red pill; trash rows are quiet rows", () => {
		assert.equal(DESTRUCTIVE_BUTTON, "nb-pill lh-pill-danger");
		const trash = renderToStaticMarkup(<LibraryTrash entries={[{ id: "t1", kind: "page", name: "Old", trashedAt: "2026-11-07T00:00:00.000Z", items: ["i1"], folders: [] } as never]} failed={false} failure={null} onRetry={noop} onRestore={noop} onPurge={noop} />);
		assert.ok(trash.includes('class="lh-row') && trash.includes('aria-label="Restore Old"') && trash.includes('aria-label="Delete Old for good"'), trash);
	});
});
