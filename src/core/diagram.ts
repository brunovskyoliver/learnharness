/**
 * Diagrams (feature 022, specs/022-diagrams). Pure: the document, its limits,
 * the edits an editor makes, the comparison a proposal shows and the text the
 * rest of the app reads. Nothing here touches the filesystem or the graph.
 *
 * A diagram is schema-versioned JSON stored the way a page is. A newer schema
 * is refused and never rewritten. Learner text is data everywhere: it reaches
 * the outline as plain lines and the SVG only through `escapeXml`.
 */

export const DIAGRAM_SCHEMA = 1;
export const DIAGRAM_MAX_NODES = 2000;
export const DIAGRAM_MAX_EDGES = 5000;
export const DIAGRAM_TEXT_MAX = 2000;
export const DIAGRAM_STROKE_POINTS_MAX = 2000;
export const DIAGRAM_LINKS_MAX = 40;
export const DIAGRAM_SUMMARY_MAX = 2000;
export const DIAGRAM_PROPOSAL_MAX_NODES = 200;

export type DiagramForm = "diagram" | "concept-map" | "whiteboard";
export const DIAGRAM_FORMS: readonly DiagramForm[] = ["diagram", "concept-map", "whiteboard"];
export const DIAGRAM_FORM_LABEL: Record<DiagramForm, string> = { diagram: "Diagram", "concept-map": "Concept map", whiteboard: "Whiteboard" };
export const DIAGRAM_FORM_HINT: Record<DiagramForm, string> = {
	diagram: "Boxes and arrows, for a process or a structure.",
	"concept-map": "Ideas joined by labelled relations.",
	whiteboard: "Sticky notes and freehand drawing.",
};
export const DIAGRAM_NODE_NOUN: Record<DiagramForm, string> = { diagram: "node", "concept-map": "idea", whiteboard: "note" };

/** A link names its target the way the rest of the app does: a note by its written
 *  name, resolved by wiki-link rules, so a rename keeps it and a dangling one is honest. */
export type DiagramLink =
	| { kind: "note"; target: string }
	| { kind: "lesson"; chatId: string; messageId: string | null; title: string }
	| { kind: "idea"; nodeId: string; name: string };

export type DiagramNodeType = "box" | "sticky" | "stroke";

export interface DiagramNode {
	id: string;
	type: DiagramNodeType;
	x: number;
	y: number;
	text: string;
	/** Strokes only: points relative to x and y. */
	points?: [number, number][];
	links?: DiagramLink[];
}

export interface DiagramEdge { id: string; from: string; to: string; label: string }

export interface DiagramDoc {
	schema: number;
	form: DiagramForm;
	nodes: DiagramNode[];
	edges: DiagramEdge[];
	/** Links of the whole diagram. */
	links?: DiagramLink[];
}

export type DiagramRefusalCode = "future_schema" | "damaged";
export type DiagramParse = { ok: true; doc: DiagramDoc } | { ok: false; code: DiagramRefusalCode; message: string };

export const DIAGRAM_FUTURE_MESSAGE = "This diagram was saved by a newer version of the app, so it can't be opened or changed here.";
export const DIAGRAM_DAMAGED_MESSAGE = "This diagram's saved data could not be read.";
const damaged: DiagramParse = { ok: false, code: "damaged", message: DIAGRAM_DAMAGED_MESSAGE };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCoordinate = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e7;
const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 80 && !/[\x00-\x1f\x7f]/.test(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length <= DIAGRAM_TEXT_MAX;

function cleanLink(raw: unknown): DiagramLink | null {
	if (!isRecord(raw)) return null;
	if (raw.kind === "note" && typeof raw.target === "string" && raw.target.trim() && raw.target.length <= 200 && !/[[\]|\n]/.test(raw.target)) return { kind: "note", target: raw.target };
	if (raw.kind === "lesson" && isId(raw.chatId) && (raw.messageId === null || isId(raw.messageId)) && isText(raw.title)) return { kind: "lesson", chatId: raw.chatId, messageId: raw.messageId, title: raw.title };
	if (raw.kind === "idea" && isId(raw.nodeId) && isText(raw.name)) return { kind: "idea", nodeId: raw.nodeId, name: raw.name };
	return null;
}

function cleanLinks(raw: unknown): DiagramLink[] | null | undefined {
	if (raw === undefined) return undefined;
	if (!Array.isArray(raw) || raw.length > DIAGRAM_LINKS_MAX) return null;
	const links: DiagramLink[] = [];
	for (const entry of raw) {
		const link = cleanLink(entry);
		if (!link) return null;
		links.push(link);
	}
	return links;
}

function cleanNode(raw: unknown): DiagramNode | null {
	if (!isRecord(raw) || !isId(raw.id) || !isCoordinate(raw.x) || !isCoordinate(raw.y) || !isText(raw.text)) return null;
	if (raw.type !== "box" && raw.type !== "sticky" && raw.type !== "stroke") return null;
	const links = cleanLinks(raw.links);
	if (links === null) return null;
	const node: DiagramNode = { id: raw.id, type: raw.type, x: raw.x, y: raw.y, text: raw.text };
	if (raw.type === "stroke") {
		if (!Array.isArray(raw.points) || raw.points.length < 1 || raw.points.length > DIAGRAM_STROKE_POINTS_MAX) return null;
		if (!raw.points.every((point) => Array.isArray(point) && point.length === 2 && isCoordinate(point[0]) && isCoordinate(point[1]))) return null;
		node.points = raw.points as [number, number][];
	}
	if (links?.length) node.links = links;
	return node;
}

/** The one reader. A newer schema is refused before anything else looks at it. */
export function validateDiagram(raw: unknown): DiagramParse {
	if (!isRecord(raw) || typeof raw.schema !== "number" || !Number.isInteger(raw.schema) || raw.schema < 1) return damaged;
	if (raw.schema > DIAGRAM_SCHEMA) return { ok: false, code: "future_schema", message: DIAGRAM_FUTURE_MESSAGE };
	if (!DIAGRAM_FORMS.includes(raw.form as DiagramForm) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return damaged;
	if (raw.nodes.length > DIAGRAM_MAX_NODES || raw.edges.length > DIAGRAM_MAX_EDGES) return damaged;
	const nodes: DiagramNode[] = [];
	const ids = new Set<string>();
	for (const entry of raw.nodes) {
		const node = cleanNode(entry);
		if (!node || ids.has(node.id)) return damaged;
		ids.add(node.id);
		nodes.push(node);
	}
	const edges: DiagramEdge[] = [];
	const edgeIds = new Set<string>();
	for (const entry of raw.edges) {
		if (!isRecord(entry) || !isId(entry.id) || edgeIds.has(entry.id) || !isId(entry.from) || !isId(entry.to) || !isText(entry.label)) return damaged;
		if (!ids.has(entry.from) || !ids.has(entry.to)) return damaged;
		edgeIds.add(entry.id);
		edges.push({ id: entry.id, from: entry.from, to: entry.to, label: entry.label });
	}
	const links = cleanLinks(raw.links);
	if (links === null) return damaged;
	return { ok: true, doc: { schema: raw.schema, form: raw.form as DiagramForm, nodes, edges, ...(links?.length ? { links } : {}) } };
}

export function parseDiagram(content: string): DiagramParse {
	let raw: unknown;
	try { raw = JSON.parse(content); } catch { return damaged; }
	return validateDiagram(raw);
}

/** The stored form. Both sides use it, so what a tab sent equals what it reads back. */
export const serializeDiagram = (doc: DiagramDoc): string => JSON.stringify(doc);

const STARTER_TEXT: Record<DiagramForm, string> = { diagram: "Start here", "concept-map": "Main idea", whiteboard: "" };

/** A new diagram. A whiteboard starts empty; the others start with one node to edit. */
export function blankDiagram(form: DiagramForm): DiagramDoc {
	return {
		schema: DIAGRAM_SCHEMA,
		form,
		nodes: form === "whiteboard" ? [] : [{ id: "n1", type: "box", x: 0, y: 0, text: STARTER_TEXT[form] }],
		edges: [],
	};
}

// ── Edits. Each returns a new document; the input is never changed. ──

const NODE_GAP_X = 260;
const NODE_GAP_Y = 140;

/** The next id not used by anything in the document. Deterministic, so edits are testable. */
export function nextDiagramId(doc: DiagramDoc, prefix: "n" | "e"): string {
	const used = new Set(prefix === "n" ? doc.nodes.map((node) => node.id) : doc.edges.map((edge) => edge.id));
	for (let n = used.size + 1; ; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
}

/** A free grid slot right of what is there, so a keyboard add never lands on a node. */
export function freeDiagramSpot(doc: DiagramDoc): { x: number; y: number } {
	const taken = new Set(doc.nodes.map((node) => `${Math.round(node.x / NODE_GAP_X)},${Math.round(node.y / NODE_GAP_Y)}`));
	for (let row = 0; ; row++) {
		for (let column = 0; column < 4; column++) if (!taken.has(`${column},${row}`)) return { x: column * NODE_GAP_X, y: row * NODE_GAP_Y };
	}
}

export function addDiagramNode(doc: DiagramDoc, input: { type: "box" | "sticky"; text?: string; x?: number; y?: number }): { doc: DiagramDoc; id: string } {
	const id = nextDiagramId(doc, "n");
	const spot = input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : freeDiagramSpot(doc);
	return { id, doc: { ...doc, nodes: [...doc.nodes, { id, type: input.type, ...spot, text: input.text ?? "" }] } };
}

/** Whole coordinates only, and few enough points to stay under the page limit. */
export function simplifyStroke(points: readonly (readonly [number, number])[]): [number, number][] {
	const kept: [number, number][] = [];
	for (const [x, y] of points) {
		const last = kept.at(-1);
		if (!last || Math.hypot(last[0] - x, last[1] - y) >= 3) kept.push([Math.round(x), Math.round(y)]);
	}
	if (kept.length <= DIAGRAM_STROKE_POINTS_MAX) return kept;
	const step = kept.length / DIAGRAM_STROKE_POINTS_MAX;
	return Array.from({ length: DIAGRAM_STROKE_POINTS_MAX }, (_, i) => kept[Math.floor(i * step)]!);
}

/** A freehand stroke from absolute points, stored relative to its top left. */
export function addDiagramStroke(doc: DiagramDoc, absolute: readonly (readonly [number, number])[]): { doc: DiagramDoc; id: string } | null {
	const points = simplifyStroke(absolute);
	if (points.length < 2) return null;
	const x = Math.min(...points.map((p) => p[0]));
	const y = Math.min(...points.map((p) => p[1]));
	const id = nextDiagramId(doc, "n");
	return { id, doc: { ...doc, nodes: [...doc.nodes, { id, type: "stroke", x, y, text: "", points: points.map(([px, py]) => [px - x, py - y]) }] } };
}

const mapNode = (doc: DiagramDoc, id: string, change: (node: DiagramNode) => DiagramNode): DiagramDoc => ({ ...doc, nodes: doc.nodes.map((node) => (node.id === id ? change(node) : node)) });

export const setDiagramNodeText = (doc: DiagramDoc, id: string, text: string): DiagramDoc => mapNode(doc, id, (node) => ({ ...node, text: text.slice(0, DIAGRAM_TEXT_MAX) }));
export const moveDiagramNode = (doc: DiagramDoc, id: string, x: number, y: number): DiagramDoc => mapNode(doc, id, (node) => ({ ...node, x: Math.round(x), y: Math.round(y) }));
export const removeDiagramNode = (doc: DiagramDoc, id: string): DiagramDoc => ({
	...doc,
	nodes: doc.nodes.filter((node) => node.id !== id),
	edges: doc.edges.filter((edge) => edge.from !== id && edge.to !== id),
});

export function addDiagramEdge(doc: DiagramDoc, from: string, to: string, label = ""): { doc: DiagramDoc; id: string } | null {
	if (from === to || !doc.nodes.some((node) => node.id === from) || !doc.nodes.some((node) => node.id === to)) return null;
	const id = nextDiagramId(doc, "e");
	return { id, doc: { ...doc, edges: [...doc.edges, { id, from, to, label: label.slice(0, DIAGRAM_TEXT_MAX) }] } };
}
export const setDiagramEdgeLabel = (doc: DiagramDoc, id: string, label: string): DiagramDoc => ({ ...doc, edges: doc.edges.map((edge) => (edge.id === id ? { ...edge, label: label.slice(0, DIAGRAM_TEXT_MAX) } : edge)) });
export const removeDiagramEdge = (doc: DiagramDoc, id: string): DiagramDoc => ({ ...doc, edges: doc.edges.filter((edge) => edge.id !== id) });

export const diagramLinkKey = (link: DiagramLink): string => (link.kind === "note" ? `note:${link.target.trim().toLowerCase()}` : link.kind === "lesson" ? `lesson:${link.chatId}:${link.messageId ?? ""}` : `idea:${link.nodeId}`);

/** Null target is the whole diagram. Adding a link already there changes nothing. */
export function addDiagramLink(doc: DiagramDoc, nodeId: string | null, link: DiagramLink): DiagramDoc {
	const add = (links: readonly DiagramLink[] = []) => (links.some((other) => diagramLinkKey(other) === diagramLinkKey(link)) ? [...links] : [...links, link]);
	if (nodeId === null) return { ...doc, links: add(doc.links) };
	return mapNode(doc, nodeId, (node) => ({ ...node, links: add(node.links) }));
}

export function removeDiagramLink(doc: DiagramDoc, nodeId: string | null, key: string): DiagramDoc {
	const drop = <T extends { links?: DiagramLink[] }>(target: T): T => {
		const { links, ...rest } = target;
		const kept = (links ?? []).filter((link) => diagramLinkKey(link) !== key);
		return (kept.length ? { ...rest, links: kept } : rest) as T;
	};
	return nodeId === null ? drop(doc) : mapNode(doc, nodeId, drop);
}

// ── Text the rest of the app reads ──

export const diagramNodeName = (node: Pick<DiagramNode, "text" | "type">): string => (node.type === "stroke" ? "Freehand stroke" : node.text.trim().replace(/\s+/g, " ") || "Untitled");

const oneLine = (text: string) => text.trim().replace(/\s+/g, " ");

function linkWords(link: DiagramLink): string {
	if (link.kind === "note") return `[[${link.target}]]`;
	if (link.kind === "lesson") return `Lesson: ${oneLine(link.title)}`;
	return `Idea: ${oneLine(link.name)}`;
}

export interface DiagramOutlineRow { id: string; name: string; links: string[]; to: { name: string; label: string }[] }

/** Every node with what leaves it: the accessible outline's rows. */
export function diagramOutlineRows(doc: DiagramDoc): DiagramOutlineRow[] {
	const names = new Map(doc.nodes.map((node) => [node.id, diagramNodeName(node)]));
	return doc.nodes.map((node) => ({
		id: node.id,
		name: names.get(node.id)!,
		links: (node.links ?? []).map(linkWords),
		to: doc.edges.filter((edge) => edge.from === node.id).map((edge) => ({ name: names.get(edge.to) ?? "Untitled", label: oneLine(edge.label) })),
	}));
}

/** What `@` references and full-text search read: labels and relations in plain
 *  lines. It never holds ids or coordinates. Blocks are blank-line separated, which
 *  is how the index cuts passages, and one node is one block so a hit can land on it. */
export function diagramOutline(doc: DiagramDoc): string {
	const words = doc.nodes.filter((node) => node.type !== "stroke");
	const strokes = doc.nodes.length - words.length;
	const blocks = [`${DIAGRAM_FORM_LABEL[doc.form] ?? "Diagram"}: ${words.length} ${words.length === 1 ? "node" : "nodes"}, ${doc.edges.length} ${doc.edges.length === 1 ? "connection" : "connections"}${strokes ? `, ${strokes} freehand ${strokes === 1 ? "stroke" : "strokes"}` : ""}.`];
	for (const row of diagramOutlineRows({ ...doc, nodes: words })) {
		const lines = [row.name, ...row.to.map(({ name, label }) => (label ? `${row.name} ${label} ${name}.` : `${row.name} connects to ${name}.`))];
		if (row.links.length) lines.push(`Linked to ${row.links.join(", ")}.`);
		blocks.push(lines.join("\n"));
	}
	if (doc.links?.length) blocks.push(`The whole diagram is linked to ${doc.links.map(linkWords).join(", ")}.`);
	return blocks.join("\n\n");
}

/** What the agent reads through library_read: the same content with the ids it must
 *  repeat in a proposal. The caller wraps it as Library material. */
export function diagramAgentText(doc: DiagramDoc): string {
	const lines = [`form: ${doc.form}`, "nodes:"];
	for (const node of doc.nodes) {
		if (node.type === "stroke") continue;
		const links = (node.links ?? []).map(linkWords).join(", ");
		lines.push(`- ${node.id} (${node.type}): ${oneLine(node.text) || "Untitled"}${links ? ` · linked to ${links}` : ""}`);
	}
	lines.push("edges:");
	for (const edge of doc.edges) lines.push(`- ${edge.id}: ${edge.from} -> ${edge.to}${edge.label ? `: ${oneLine(edge.label)}` : ""}`);
	const strokes = doc.nodes.filter((node) => node.type === "stroke").length;
	if (strokes) lines.push(`${strokes} freehand strokes, kept as they are.`);
	return lines.join("\n");
}

/** What the link scanners read (feature 016's scanWikiLinks and scanSourceRefs). Only
 *  stored links make tokens: brackets typed into a label go, so `[[x]]` in a label is
 *  words, not a link, and it can't forge a source reference either. */
export function diagramScanText(doc: DiagramDoc): string {
	const plain = (text: string) => oneLine(text).replace(/[[\]()]/g, " ");
	const token = (link: DiagramLink) => {
		if (link.kind === "note") return `[[${link.target}]]`;
		if (link.kind === "lesson") return `[Lesson: ${plain(link.title)}](/chat/${encodeURIComponent(link.chatId)}${link.messageId ? `#message-${encodeURIComponent(link.messageId)}` : ""})`;
		return "";
	};
	const lines: string[] = [];
	for (const node of doc.nodes) {
		if (node.type === "stroke") continue;
		const tokens = (node.links ?? []).map(token).filter(Boolean);
		lines.push(`${plain(node.text)}${tokens.length ? ` ${tokens.join(" ")}` : ""}`);
	}
	for (const edge of doc.edges) if (edge.label.trim()) lines.push(plain(edge.label));
	for (const link of doc.links ?? []) {
		const made = token(link);
		if (made) lines.push(made);
	}
	return lines.join("\n");
}

/** Every idea a diagram links to, first-seen. Read-only: an id and the name it had. */
export function diagramIdeaLinks(doc: DiagramDoc): { nodeId: string; name: string }[] {
	const found = new Map<string, string>();
	for (const link of [...doc.nodes.flatMap((node) => node.links ?? []), ...(doc.links ?? [])]) {
		if (link.kind === "idea" && !found.has(link.nodeId)) found.set(link.nodeId, link.name);
	}
	return [...found].map(([nodeId, name]) => ({ nodeId, name }));
}

// ── Comparing, for a proposal and for History ──

export interface DiagramNodeChange { id: string; before: string; after: string; what: ("text" | "position" | "links" | "type")[] }
export interface DiagramEdgeRow { id: string; from: string; to: string; label: string }
export interface DiagramEdgeChange { id: string; before: DiagramEdgeRow; after: DiagramEdgeRow }
export interface DiagramDiff {
	nodes: { added: { id: string; name: string }[]; removed: { id: string; name: string }[]; changed: DiagramNodeChange[] };
	edges: { added: DiagramEdgeRow[]; removed: DiagramEdgeRow[]; changed: DiagramEdgeChange[] };
	links: { added: string[]; removed: string[] };
	formChanged: boolean;
	empty: boolean;
}

const EMPTY_DOC: DiagramDoc = { schema: DIAGRAM_SCHEMA, form: "diagram", nodes: [], edges: [] };
const sameLinks = (a: readonly DiagramLink[] = [], b: readonly DiagramLink[] = []) => a.map(diagramLinkKey).sort().join("\n") === b.map(diagramLinkKey).sort().join("\n");
const samePoints = (a?: readonly (readonly number[])[], b?: readonly (readonly number[])[]) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** `before` null is a new diagram: everything is added. */
export function diffDiagrams(before: DiagramDoc | null, after: DiagramDoc): DiagramDiff {
	const old = before ?? { ...EMPTY_DOC, form: after.form };
	const oldNodes = new Map(old.nodes.map((node) => [node.id, node]));
	const newNodes = new Map(after.nodes.map((node) => [node.id, node]));
	const nameIn = (doc: DiagramDoc, id: string) => {
		const node = doc.nodes.find((other) => other.id === id);
		return node ? diagramNodeName(node) : "Untitled";
	};
	const added = after.nodes.filter((node) => !oldNodes.has(node.id)).map((node) => ({ id: node.id, name: diagramNodeName(node) }));
	const removed = old.nodes.filter((node) => !newNodes.has(node.id)).map((node) => ({ id: node.id, name: diagramNodeName(node) }));
	const changed: DiagramNodeChange[] = [];
	for (const node of after.nodes) {
		const prior = oldNodes.get(node.id);
		if (!prior) continue;
		const what: DiagramNodeChange["what"] = [];
		if (prior.type !== node.type) what.push("type");
		if (prior.text !== node.text || !samePoints(prior.points, node.points)) what.push("text");
		if (prior.x !== node.x || prior.y !== node.y) what.push("position");
		if (!sameLinks(prior.links, node.links)) what.push("links");
		if (what.length) changed.push({ id: node.id, before: diagramNodeName(prior), after: diagramNodeName(node), what });
	}
	const row = (doc: DiagramDoc, edge: DiagramEdge): DiagramEdgeRow => ({ id: edge.id, from: nameIn(doc, edge.from), to: nameIn(doc, edge.to), label: edge.label });
	const oldEdges = new Map(old.edges.map((edge) => [edge.id, edge]));
	const newEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
	const edgesAdded = after.edges.filter((edge) => !oldEdges.has(edge.id)).map((edge) => row(after, edge));
	const edgesRemoved = old.edges.filter((edge) => !newEdges.has(edge.id)).map((edge) => row(old, edge));
	const edgesChanged: DiagramEdgeChange[] = [];
	for (const edge of after.edges) {
		const prior = oldEdges.get(edge.id);
		if (prior && (prior.from !== edge.from || prior.to !== edge.to || prior.label !== edge.label)) edgesChanged.push({ id: edge.id, before: row(old, prior), after: row(after, edge) });
	}
	const oldLinks = new Map((old.links ?? []).map((link) => [diagramLinkKey(link), linkWords(link)]));
	const newLinks = new Map((after.links ?? []).map((link) => [diagramLinkKey(link), linkWords(link)]));
	const linksAdded = [...newLinks].filter(([key]) => !oldLinks.has(key)).map(([, words]) => words);
	const linksRemoved = [...oldLinks].filter(([key]) => !newLinks.has(key)).map(([, words]) => words);
	const formChanged = Boolean(before) && before!.form !== after.form;
	return {
		nodes: { added, removed, changed },
		edges: { added: edgesAdded, removed: edgesRemoved, changed: edgesChanged },
		links: { added: linksAdded, removed: linksRemoved },
		formChanged,
		empty: !formChanged && !added.length && !removed.length && !changed.length && !edgesAdded.length && !edgesRemoved.length && !edgesChanged.length && !linksAdded.length && !linksRemoved.length,
	};
}

// ── Proposals ──

export type DiagramProposalStatus = "pending" | "approved" | "rejected";

export interface DiagramProposal {
	id: string;
	/** Null when approving makes a new diagram. */
	diagramId: string | null;
	name: string;
	summary: string;
	baseVersion: number | null;
	doc: DiagramDoc;
	status: DiagramProposalStatus;
	/** The learner changed it through Edit first. */
	edited?: boolean;
	chatId?: string;
	toolCallId?: string;
	createdAt: string;
	resolvedAt?: string;
	/** The version an approval made. */
	version?: number;
	/** The diagram an approval made or changed. */
	resultId?: string;
}

/** What the agent sends: the whole wanted set of nodes and edges. */
export interface DiagramProposalInput {
	form?: DiagramForm;
	nodes: { id?: string; text: string; type?: "box" | "sticky"; links?: string[] }[];
	edges: { from: string; to: string; label?: string }[];
}

/** Rows of a layered layout: a node sits one row below whatever points to it. */
function layerOf(ids: readonly string[], edges: readonly { from: string; to: string }[]): Map<string, number> {
	const layer = new Map(ids.map((id) => [id, 0]));
	for (let round = 0; round < ids.length; round++) {
		let moved = false;
		for (const { from, to } of edges) {
			const next = (layer.get(from) ?? 0) + 1;
			if ((layer.get(to) ?? 0) < next && next < ids.length) { layer.set(to, next); moved = true; }
		}
		if (!moved) break;
	}
	return layer;
}

/** Builds the proposed document against the current one. Nodes it names by id keep
 *  their place and links; nodes it leaves out are removed, except freehand strokes,
 *  which it can't see or change. Edges may name a node by id or exact text. */
export function buildProposalDoc(base: DiagramDoc | null, input: DiagramProposalInput): { doc: DiagramDoc } | { error: string } {
	if (input.nodes.length === 0) return { error: "A proposal needs at least one node." };
	if (input.nodes.length > DIAGRAM_PROPOSAL_MAX_NODES) return { error: `A proposal can hold at most ${DIAGRAM_PROPOSAL_MAX_NODES} nodes.` };
	const form = input.form ?? base?.form ?? "diagram";
	const prior = new Map((base?.nodes ?? []).map((node) => [node.id, node]));
	const strokes = (base?.nodes ?? []).filter((node) => node.type === "stroke");
	const usedIds = new Set<string>([...prior.keys()]);
	let counter = usedIds.size;
	const freshId = (prefix: string) => {
		do counter++; while (usedIds.has(`${prefix}${counter}`));
		usedIds.add(`${prefix}${counter}`);
		return `${prefix}${counter}`;
	};
	const claimed = new Set<string>();
	const made: DiagramNode[] = [];
	const refs = new Map<string, string>();
	for (const raw of input.nodes) {
		const text = raw.text.trim();
		if (!text || text.length > DIAGRAM_TEXT_MAX) return { error: `Every node needs text of at most ${DIAGRAM_TEXT_MAX} characters.` };
		const keeps = raw.id && !claimed.has(raw.id) && prior.get(raw.id)?.type !== "stroke" ? prior.get(raw.id) : undefined;
		if (raw.id && !keeps && prior.has(raw.id)) return { error: `Node ${raw.id} is a freehand stroke or named twice.` };
		const id = keeps?.id ?? freshId("n");
		claimed.add(id);
		const type = raw.type ?? keeps?.type ?? (form === "whiteboard" ? "sticky" : "box");
		const links: DiagramLink[] = raw.links === undefined ? keeps?.links ?? [] : [];
		for (const target of raw.links ?? []) {
			const link = cleanLink({ kind: "note", target });
			if (!link) return { error: `${target} can't be a link target.` };
			links.push(link);
		}
		made.push({ id, type: type as "box" | "sticky", x: keeps?.x ?? Number.NaN, y: keeps?.y ?? Number.NaN, text, ...(links.length ? { links } : {}) });
		if (raw.id) refs.set(raw.id, id);
		if (!refs.has(text)) refs.set(text, id);
	}
	const edges: DiagramEdge[] = [];
	const keptEdges = new Map((base?.edges ?? []).map((edge) => [`${edge.from}\n${edge.to}`, edge]));
	const edgeIds = new Set((base?.edges ?? []).map((edge) => edge.id));
	let edgeCounter = edgeIds.size;
	for (const raw of input.edges) {
		const from = refs.get(raw.from) ?? refs.get(raw.from.trim());
		const to = refs.get(raw.to) ?? refs.get(raw.to.trim());
		if (!from || !to) return { error: `An edge names ${!from ? raw.from : raw.to}, which isn't one of the proposal's nodes.` };
		if (from === to) return { error: `An edge can't join ${raw.from} to itself.` };
		const label = (raw.label ?? "").trim();
		if (label.length > DIAGRAM_TEXT_MAX) return { error: `An edge label can be at most ${DIAGRAM_TEXT_MAX} characters.` };
		const kept = keptEdges.get(`${from}\n${to}`);
		if (kept) { keptEdges.delete(`${from}\n${to}`); edges.push({ ...kept, label }); continue; }
		let id: string;
		do id = `e${++edgeCounter}`; while (edgeIds.has(id));
		edgeIds.add(id);
		edges.push({ id, from, to, label });
	}
	// New nodes go in free cells of a layered grid, below everything that stays put.
	const layers = layerOf(made.map((node) => node.id), edges);
	const placedRows = made.filter((node) => Number.isFinite(node.y)).map((node) => node.y);
	const top = placedRows.length ? Math.max(...placedRows) + NODE_GAP_Y : 0;
	const inRow = new Map<number, number>();
	const nodes = made.map((node) => {
		if (Number.isFinite(node.x)) return node;
		const row = layers.get(node.id) ?? 0;
		const column = inRow.get(row) ?? 0;
		inRow.set(row, column + 1);
		return { ...node, x: column * NODE_GAP_X, y: top + row * NODE_GAP_Y };
	});
	const doc: DiagramDoc = { schema: DIAGRAM_SCHEMA, form, nodes: [...nodes, ...strokes], edges, ...(base?.links?.length ? { links: base.links } : {}) };
	const checked = validateDiagram(doc);
	return checked.ok ? { doc: checked.doc } : { error: checked.message };
}
