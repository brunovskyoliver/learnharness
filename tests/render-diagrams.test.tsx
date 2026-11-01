/** Diagram surfaces rendered on the server (feature 022): no React Flow, no markup from
 *  learner text, loading and states in words. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { renderToString as render } from "react-dom/server";
import { DiagramDiffView } from "../components/diagram/diagram-diff.tsx";
import { DiagramEditor, DiagramOutline } from "../components/diagram/diagram-editor.tsx";
import { DiagramList } from "../components/diagram/diagram-list.tsx";
import { NoteConnectionsBody } from "../components/workspace/note-connections.tsx";
import { blankDiagram, diffDiagrams, pageRowHeadline, type DiagramDoc } from "../src/core/index.ts";

const evil = "<img src=x onerror=alert(1)>";
const doc: DiagramDoc = {
	schema: 1, form: "concept-map",
	nodes: [{ id: "n1", type: "box", x: 0, y: 0, text: evil, links: [{ kind: "note", target: "Waves" }] }, { id: "n2", type: "box", x: 200, y: 0, text: "Frequency" }, { id: "n3", type: "stroke", x: 0, y: 0, text: "", points: [[0, 0], [5, 5]] }],
	edges: [{ id: "e1", from: "n1", to: "n2", label: "has a" }],
};
const noop = () => {};
/** Without React's text-boundary comments, so sentences read whole. */
const renderToString = (element: React.ReactElement) => render(element).replace(/<!-- -->/g, "");

describe("diagram surfaces", () => {
	it("the outline names nodes, relations and links, and escapes labels", () => {
		const html = renderToString(<DiagramOutline doc={doc} />);
		assert.match(html, /aria-label="Text outline of the diagram"/);
		assert.match(html, /has a → Frequency/);
		assert.match(html, /\[\[Waves\]\]/);
		assert.match(html, /Freehand stroke/);
		assert.ok(!html.includes("<img"), "a label is never markup");
	});

	it("the list labels every field and every action", () => {
		const html = renderToString(<DiagramList doc={doc} readOnly={false} focusRequest={null} onText={noop} onLabel={noop} onRemoveNode={noop} onRemoveEdge={noop} onLink={noop} />);
		assert.match(html, /aria-label="idea 1 text"/);
		assert.match(html, /aria-label="Delete Frequency"/);
		assert.match(html, /aria-label="Label from .* to Frequency"/);
		assert.ok(!html.includes("<img"));
		assert.match(renderToString(<DiagramList doc={blankDiagram("whiteboard")} readOnly={false} focusRequest={null} onText={noop} onLabel={noop} onRemoveNode={noop} onRemoveEdge={noop} onLink={noop} />), /Nothing here yet/);
	});

	it("the comparison says each change in words, with no markup", () => {
		const html = renderToString(<DiagramDiffView diff={diffDiagrams(null, doc)} />);
		assert.match(html, /Added nodes \(3\)/);
		assert.match(html, /Added connections \(1\)/);
		assert.ok(!html.includes("<img"));
		assert.match(renderToString(<DiagramDiffView diff={diffDiagrams(doc, doc)} />), /No changes/);
	});

	it("the editor renders its tools and a canvas loading state, with no canvas", () => {
		const html = renderToString(<DiagramEditor doc={doc} resetKey={1} name="Map" onChange={noop} />);
		for (const id of ["diagram-undo", "diagram-redo", "diagram-add-node", "diagram-connect", "diagram-view-list"]) assert.ok(html.includes(`data-testid="${id}"`), id);
		assert.match(html, /Add idea/);
		assert.ok(!html.includes("react-flow"), "React Flow stays out until the client asks for it");
		assert.equal(renderToString(<DiagramEditor doc={doc} resetKey={1} name="Map" readOnly onChange={noop} />).includes("diagram-toolbar"), false);
	});

	it("only the canvas file imports React Flow, and it is imported dynamically", () => {
		const root = path.resolve(import.meta.dirname, "../components/diagram");
		for (const name of ["diagram-editor.tsx", "diagram-surface.tsx", "diagram-list.tsx", "diagram-proposal-dialog.tsx", "new-diagram-dialog.tsx", "diagram-proposals-line.tsx"]) {
			assert.doesNotMatch(readFileSync(path.join(root, name), "utf8"), /from "@xyflow\/react"/, name);
		}
		assert.match(readFileSync(path.join(root, "diagram-editor.tsx"), "utf8"), /dynamic\(\(\) => import\("\.\/diagram-canvas\.tsx"\)/);
		assert.match(readFileSync(path.resolve(root, "../library/page-pane.tsx"), "utf8"), /dynamic\(\(\) => import\("@\/components\/diagram\/diagram-surface\.tsx"\)/);
	});

	it("the Links panel speaks of a diagram, and lists one by kind", () => {
		const data = { links: [], backlinks: [{ id: "d", name: "Map", count: 1, snippet: "Wave", kind: "diagram" as const }], related: [], sources: [], sessions: [], graph: [{ id: "x", name: "Old", statement: "This idea is no longer in your graph.", reason: "linked" as const, href: null, gone: true }] };
		const html = renderToString(<NoteConnectionsBody data={data} subject="diagram" onOpenPage={noop} onFollowLink={noop} onSource={noop} />);
		assert.match(html, /Links from this diagram/);
		assert.match(html, /Diagram · Wave/);
		assert.match(html, /no longer in your graph/);
	});

	it("a proposal's row says it is waiting", () => {
		assert.equal(pageRowHeadline("diagram_propose", { outcome: "proposed", proposalId: "p", itemId: null, name: "Map" }), "Diagram · proposed Map, waiting for your approval");
		assert.equal(pageRowHeadline("diagram_propose", { outcome: "failed", reason: "x" }), "Diagram · proposal failed");
	});
});
