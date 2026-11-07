"use client";

/** One diagram's editing surface (feature 022), used by the pane and by a proposal's
 *  Edit first. It owns undo and which view shows; the document leaves through
 *  `onChange`, so saving stays with whoever opened it. */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CableIcon, LayoutListIcon, Link2Icon, NetworkIcon, PenLineIcon, PlusIcon, Redo2Icon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
	addDiagramEdge, addDiagramLink, addDiagramNode, addDiagramStroke, DIAGRAM_NODE_NOUN, diagramNodeName, diagramOutlineRows, moveDiagramNode, removeDiagramEdge, removeDiagramLink, removeDiagramNode, setDiagramEdgeLabel, setDiagramNodeText,
	type DiagramDoc, type DiagramLink,
} from "@/src/core";
import type { CanvasActions } from "./diagram-canvas.tsx";
import { pushHistory, redoHistory, startHistory, undoHistory, type DiagramHistory } from "./diagram-history.ts";
import { DiagramList } from "./diagram-list.tsx";

const DiagramCanvas = dynamic(() => import("./diagram-canvas.tsx").then((m) => m.DiagramCanvas), {
	ssr: false,
	loading: () => (
		<div role="status" aria-label="Loading the canvas" className="flex flex-col gap-2 px-3 py-2">
			<Skeleton className="h-5 w-2/3 rounded-md" />
			<Skeleton className="h-40 w-full rounded-lg" />
		</div>
	),
});

const LinkDialog = dynamic(() => import("./diagram-link-dialog.tsx").then((m) => m.DiagramLinkDialog), { ssr: false });

/** Under this a canvas can't show a node and its neighbour, so the list leads. */
export const CANVAS_MIN_WIDTH = 360;
const TOOL = "shrink-0 text-ink aria-pressed:bg-shelf aria-disabled:text-faint aria-disabled:hover:bg-transparent pointer-coarse:h-11 pointer-coarse:min-w-11";

export interface DiagramEditorHandle {
	/** Lands on a search hit. False when the words are no longer in any node. */
	jumpTo: (quote: string, terms: readonly string[]) => boolean;
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number | null {
	const [width, setWidth] = useState<number | null>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? null));
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return width;
}

/** The whole diagram as one list of plain lines: the accessible outline. */
export function DiagramOutline({ doc, className, onPick }: { doc: DiagramDoc; className?: string; onPick?: (id: string) => void }) {
	const rows = diagramOutlineRows(doc);
	return (
		<section aria-label="Text outline of the diagram" data-testid="diagram-outline" className={cn("flex flex-col gap-2 text-sm", className)}>
			<h3 className="font-medium text-faint">Outline</h3>
			{rows.length === 0 && <p className="text-graphite">Nothing here yet.</p>}
			<ul className="flex flex-col gap-1.5">
				{rows.map((row) => (
					<li key={row.id}>
						{onPick
							? <button type="button" className="rounded-md text-left text-ink underline decoration-ink/40 underline-offset-[3px] [overflow-wrap:anywhere] pointer-coarse:min-h-11" onClick={() => onPick(row.id)}>{row.name}</button>
							: <span className="text-ink [overflow-wrap:anywhere]">{row.name}</span>}
						{row.to.length > 0 && (
							<ul className="ps-3 text-graphite">
								{row.to.map((to, index) => <li key={index} className="[overflow-wrap:anywhere]">{to.label ? `${to.label} → ${to.name}` : `→ ${to.name}`}</li>)}
							</ul>
						)}
						{row.links.length > 0 && <p className="ps-3 text-faint [overflow-wrap:anywhere]">Linked to {row.links.join(", ")}</p>}
					</li>
				))}
			</ul>
		</section>
	);
}

export function DiagramEditor({ doc: initial, resetKey, name, readOnly = false, showOutline = false, handle, onChange, linkDiagramOpen = false, onLinkDiagramClose }: {
	doc: DiagramDoc;
	/** Changes when the document was replaced from outside: undo starts over. */
	resetKey: string | number;
	name: string;
	readOnly?: boolean;
	showOutline?: boolean;
	handle?: React.RefObject<DiagramEditorHandle | null>;
	onChange: (doc: DiagramDoc) => void;
	/** The surface's header asks to link the whole diagram. */
	linkDiagramOpen?: boolean;
	onLinkDiagramClose?: () => void;
}) {
	const [history, setHistory] = useState<DiagramHistory>(() => startHistory(initial));
	const historyRef = useRef(history);
	const resetRef = useRef(resetKey);
	if (resetRef.current !== resetKey) {
		resetRef.current = resetKey;
		const fresh = startHistory(initial);
		historyRef.current = fresh;
		setHistory(fresh);
	}
	const doc = history.present;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const [announcement, setAnnouncement] = useState("");

	/** Every edit, undo and redo passes here: the screen and the save move together. */
	const apply = useCallback((next: DiagramHistory, words?: string) => {
		const changed = next.present !== historyRef.current.present;
		historyRef.current = next;
		setHistory(next);
		if (changed) onChangeRef.current(next.present);
		if (words) setAnnouncement(words);
	}, []);
	const edit = useCallback((change: (current: DiagramDoc) => DiagramDoc, mergeKey: string | null = null, words?: string) => {
		const current = historyRef.current;
		apply(pushHistory(current, change(current.present), mergeKey, Date.now()), words);
	}, [apply]);
	const undo = useCallback(() => {
		if (historyRef.current.past.length) apply(undoHistory(historyRef.current), "Undone");
	}, [apply]);
	const redo = useCallback(() => {
		if (historyRef.current.future.length) apply(redoHistory(historyRef.current), "Redone");
	}, [apply]);

	const root = useRef<HTMLDivElement>(null);
	const width = useWidth(root);
	// The server has no width to give, so the first paint waits for the measure.
	const [chosenView, setChosenView] = useState<"canvas" | "list" | null>(null);
	const narrow = width !== null && width < CANVAS_MIN_WIDTH;
	const view = chosenView ?? (narrow ? "list" : "canvas");
	const [selection, setSelection] = useState<{ nodeId: string | null; edgeId: string | null }>({ nodeId: null, edgeId: null });
	const [editing, setEditing] = useState<{ nodeId: string | null; edgeId: string | null }>({ nodeId: null, edgeId: null });
	const [drawing, setDrawing] = useState(false);
	const [connecting, setConnecting] = useState(false);
	const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
	const [linkTarget, setLinkTarget] = useState<string | null | "closed">("closed");
	useEffect(() => { if (linkDiagramOpen) setLinkTarget(null); }, [linkDiagramOpen]);

	const nonce = useRef(0);
	const askFocus = useCallback((id: string) => setFocusRequest({ id, nonce: ++nonce.current }), []);
	const noun = DIAGRAM_NODE_NOUN[doc.form];
	const addNode = () => {
		const made = addDiagramNode(historyRef.current.present, { type: doc.form === "whiteboard" ? "sticky" : "box" });
		edit(() => made.doc, null, `Added a ${noun}. Type its text.`);
		setSelection({ nodeId: made.id, edgeId: null });
		askFocus(made.id);
		if (view === "canvas") setEditing({ nodeId: made.id, edgeId: null });
	};
	const removeSelected = () => {
		if (selection.nodeId) {
			const node = doc.nodes.find((other) => other.id === selection.nodeId);
			edit((current) => removeDiagramNode(current, selection.nodeId!), null, node ? `Deleted ${diagramNodeName(node)}` : undefined);
		} else if (selection.edgeId) edit((current) => removeDiagramEdge(current, selection.edgeId!), null, "Deleted the connection");
		setSelection({ nodeId: null, edgeId: null });
	};

	const actions = useMemo<CanvasActions>(() => ({
		setText: (id, text) => edit((current) => setDiagramNodeText(current, id, text), `text:${id}`),
		setEdgeLabel: (id, label) => edit((current) => setDiagramEdgeLabel(current, id, label), `label:${id}`),
		move: (moves) => edit((current) => moves.reduce((next, { id, x, y }) => moveDiagramNode(next, id, x, y), current)),
		nudge: (id, dx, dy) => edit((current) => {
			const node = current.nodes.find((other) => other.id === id);
			return node ? moveDiagramNode(current, id, node.x + dx, node.y + dy) : current;
		}, `nudge:${id}`),
		connect: (from, to) => {
			const made = addDiagramEdge(historyRef.current.present, from, to);
			if (!made) return;
			edit(() => made.doc, null, "Connected");
			if (historyRef.current.present.form === "concept-map") setEditing({ nodeId: null, edgeId: made.id });
		},
		removeNode: (id) => { edit((current) => removeDiagramNode(current, id), null, "Deleted"); setSelection({ nodeId: null, edgeId: null }); },
		removeEdge: (id) => { edit((current) => removeDiagramEdge(current, id), null, "Deleted the connection"); setSelection({ nodeId: null, edgeId: null }); },
		stroke: (points) => {
			const made = addDiagramStroke(historyRef.current.present, points);
			if (made) edit(() => made.doc, null, "Added a stroke");
		},
		select: setSelection,
		setEditing: (next) => setEditing((current) => ({ nodeId: next.nodeId === undefined ? current.nodeId : next.nodeId, edgeId: next.edgeId === undefined ? current.edgeId : next.edgeId })),
	}), [edit]);

	if (handle) {
		handle.current = {
			jumpTo: (quote, terms) => {
				const fold = (text: string) => text.toLowerCase();
				const hit = doc.nodes.find((node) => node.text.trim() && terms.some((term) => fold(node.text).includes(fold(term))))
					?? doc.nodes.find((node) => node.text.trim() && fold(quote).includes(fold(node.text.trim())));
				if (!hit) return false;
				setSelection({ nodeId: hit.id, edgeId: null });
				askFocus(hit.id);
				return true;
			},
		};
	}

	const canDelete = !readOnly && Boolean(selection.nodeId || selection.edgeId);
	const canLink = !readOnly && selection.nodeId !== null && doc.nodes.find((node) => node.id === selection.nodeId)?.type !== "stroke";
	const label = width !== null && width >= 620 ? "" : "sr-only";
	const links = linkTarget === "closed" ? [] : linkTarget === null ? doc.links ?? [] : doc.nodes.find((node) => node.id === linkTarget)?.links ?? [];
	const linkName = linkTarget === null ? name : doc.nodes.find((node) => node.id === linkTarget);

	const shortcuts = (event: React.KeyboardEvent) => {
		if (!(event.metaKey || event.ctrlKey) || readOnly) return;
		const key = event.key.toLowerCase();
		if (key === "z" || key === "y") {
			event.preventDefault();
			event.stopPropagation();
			if (key === "y" || event.shiftKey) redo();
			else undo();
		}
	};
	// Escape takes the innermost layer here, then falls through to the pane.
	const escape = (event: React.KeyboardEvent) => {
		if (event.key !== "Escape") return;
		if (drawing) { setDrawing(false); event.stopPropagation(); root.current?.querySelector<HTMLElement>('[data-testid="diagram-draw"]')?.focus(); }
		else if (connecting) { setConnecting(false); event.stopPropagation(); root.current?.querySelector<HTMLElement>('[data-testid="diagram-connect"]')?.focus(); }
	};

	return (
		<div ref={root} className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDownCapture={shortcuts} onKeyDown={escape} data-testid="diagram-editor" data-view={view} data-diagram-layer={drawing || connecting || undefined}>
			<p role="status" aria-live="polite" className="sr-only" data-testid="diagram-announcement">{announcement}</p>
			{!readOnly && (
				<div role="group" aria-label="Diagram tools" className="mx-3 mb-2 flex flex-wrap items-center gap-1 rounded-lg bg-shelf p-1" data-testid="diagram-toolbar">
					<Button type="button" variant="ghost" className={TOOL} aria-disabled={history.past.length === 0} aria-keyshortcuts="Control+Z Meta+Z" aria-label="Undo" title="Undo (Ctrl or Cmd+Z)" data-testid="diagram-undo" onClick={undo}><Undo2Icon className="ui-icon" aria-hidden="true" /></Button>
					<Button type="button" variant="ghost" className={TOOL} aria-disabled={history.future.length === 0} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" aria-label="Redo" title="Redo (Ctrl or Cmd+Shift+Z)" data-testid="diagram-redo" onClick={redo}><Redo2Icon className="ui-icon" aria-hidden="true" /></Button>
					<Button type="button" variant="ghost" className={TOOL} data-testid="diagram-add-node" onClick={addNode}><PlusIcon className="ui-icon" aria-hidden="true" /><span className={label}>Add {noun}</span></Button>
					<Button type="button" variant="ghost" className={TOOL} aria-pressed={connecting} aria-expanded={connecting} data-testid="diagram-connect" onClick={() => setConnecting((open) => !open)}><CableIcon className="ui-icon" aria-hidden="true" /><span className={label}>Connect</span></Button>
					{doc.form === "whiteboard" && view === "canvas" && (
						<Button type="button" variant="ghost" className={TOOL} aria-pressed={drawing} data-testid="diagram-draw" onClick={() => setDrawing((on) => !on)}><PenLineIcon className="ui-icon" aria-hidden="true" /><span className={label}>Draw</span></Button>
					)}
					{view === "canvas" && <Button type="button" variant="ghost" className={TOOL} aria-disabled={!canLink} title={canLink ? undefined : `Select a ${noun} first`} data-testid="diagram-link" onClick={() => { if (canLink) setLinkTarget(selection.nodeId); }}><Link2Icon className="ui-icon" aria-hidden="true" /><span className={label}>Link</span></Button>}
					{view === "canvas" && <Button type="button" variant="ghost" className={TOOL} aria-disabled={!canDelete} title={canDelete ? undefined : `Select a ${noun} or connection first`} data-testid="diagram-delete" onClick={() => { if (canDelete) removeSelected(); }}><Trash2Icon className="ui-icon" aria-hidden="true" /><span className={label}>Delete</span></Button>}
					<span role="group" aria-label="View" className="ms-auto flex gap-1">
						<Button type="button" variant="ghost" className={TOOL} aria-pressed={view === "canvas"} data-testid="diagram-view-canvas" onClick={() => setChosenView("canvas")}><NetworkIcon className="ui-icon" aria-hidden="true" /><span className="sr-only">Canvas</span></Button>
						<Button type="button" variant="ghost" className={TOOL} aria-pressed={view === "list"} data-testid="diagram-view-list" onClick={() => { setDrawing(false); setChosenView("list"); }}><LayoutListIcon className="ui-icon" aria-hidden="true" /><span className="sr-only">List</span></Button>
					</span>
				</div>
			)}
			{drawing && <p role="status" className="px-3 pb-2 text-sm text-graphite">Draw on the canvas. Press Escape to stop.</p>}
			{connecting && !readOnly && (
				<ConnectForm
					doc={doc}
					fromId={selection.nodeId}
					onClose={() => setConnecting(false)}
					onAdd={(from, to, edgeLabel) => {
						const made = addDiagramEdge(historyRef.current.present, from, to, edgeLabel);
						if (!made) return;
						const nameOf = (id: string) => diagramNodeName(doc.nodes.find((node) => node.id === id)!);
						edit(() => made.doc, null, `Connected ${nameOf(from)} to ${nameOf(to)}`);
					}}
				/>
			)}
			{showOutline && <DiagramOutline doc={doc} onPick={askFocus} className="mx-3 mb-2 max-h-[40dvh] shrink-0 overflow-y-auto rounded-lg bg-shelf p-2" />}
			{view === "list" ? (
				<DiagramList
					doc={doc}
					readOnly={readOnly}
					focusRequest={focusRequest}
					onText={actions.setText}
					onLabel={actions.setEdgeLabel}
					onRemoveNode={actions.removeNode}
					onRemoveEdge={actions.removeEdge}
					onLink={(id) => setLinkTarget(id)}
				/>
			) : (
				<div className="min-h-0 flex-1">
					{doc.nodes.length === 0 && <p className="px-3 text-sm text-graphite" data-testid="diagram-empty">{doc.form === "whiteboard" ? "An empty whiteboard. Add a note or draw." : `Nothing here yet. Add a ${noun} to start.`}</p>}
					<DiagramCanvas
						doc={doc}
						label={`${name}: canvas`}
						readOnly={readOnly}
						drawing={drawing}
						editingNode={editing.nodeId}
						editingEdge={editing.edgeId}
						focusRequest={focusRequest}
						actions={actions}
					/>
				</div>
			)}
			{linkTarget !== "closed" && (
				<LinkDialog
					subject={typeof linkName === "string" ? linkName : linkName ? diagramNodeName(linkName) : name}
					links={links}
					onAdd={(link: DiagramLink) => edit((current) => addDiagramLink(current, linkTarget, link), null, "Linked")}
					onRemove={(key: string) => edit((current) => removeDiagramLink(current, linkTarget, key), null, "Link removed")}
					onClose={() => { setLinkTarget("closed"); onLinkDiagramClose?.(); }}
				/>
			)}
		</div>
	);
}

function ConnectForm({ doc, fromId, onAdd, onClose }: { doc: DiagramDoc; fromId: string | null; onAdd: (from: string, to: string, label: string) => void; onClose: () => void }) {
	const nodes = doc.nodes.filter((node) => node.type !== "stroke");
	const [chosenFrom, setFrom] = useState(fromId ?? nodes[0]?.id ?? "");
	const [chosenTo, setTo] = useState(nodes.find((node) => node.id !== (fromId ?? nodes[0]?.id))?.id ?? "");
	// An undo behind this form can take a chosen node away.
	const from = nodes.some((node) => node.id === chosenFrom) ? chosenFrom : nodes[0]?.id ?? "";
	const to = nodes.some((node) => node.id === chosenTo) ? chosenTo : nodes.find((node) => node.id !== from)?.id ?? "";
	const [label, setLabel] = useState("");
	const first = useRef<HTMLSelectElement>(null);
	useEffect(() => { first.current?.focus(); }, []);
	const CONTROL = "h-9 w-full min-w-0 rounded-md border border-rule bg-paper px-2 text-sm text-ink pointer-coarse:h-11";
	if (nodes.length < 2) {
		return (
			<div role="status" className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-shelf p-2 text-sm text-graphite" data-testid="diagram-connect-form">
				<p className="min-w-0 flex-1">A connection needs two {DIAGRAM_NODE_NOUN[doc.form]}s.</p>
				<button type="button" className="prompt-secondary" onClick={onClose}>Close</button>
			</div>
		);
	}
	const same = from === to;
	return (
		<form
			className="mx-3 mb-2 grid gap-2 rounded-lg bg-shelf p-2 text-sm sm:grid-cols-[1fr_1fr_1fr_auto]"
			data-testid="diagram-connect-form"
			aria-label="Add a connection"
			onSubmit={(event) => {
				event.preventDefault();
				if (same || !from || !to) return;
				onAdd(from, to, label.trim());
				setLabel("");
			}}
		>
			<label className="flex min-w-0 flex-col gap-1 text-graphite">From
				<select ref={first} name="from" value={from} className={CONTROL} data-testid="diagram-connect-from" onChange={(event) => setFrom(event.target.value)}>
					{nodes.map((node) => <option key={node.id} value={node.id}>{diagramNodeName(node)}</option>)}
				</select>
			</label>
			<label className="flex min-w-0 flex-col gap-1 text-graphite">To
				<select name="to" value={to} className={CONTROL} data-testid="diagram-connect-to" onChange={(event) => setTo(event.target.value)}>
					{nodes.map((node) => <option key={node.id} value={node.id}>{diagramNodeName(node)}</option>)}
				</select>
			</label>
			<label className="flex min-w-0 flex-col gap-1 text-graphite">Label
				<input name="label" value={label} autoComplete="off" placeholder="Optional…" className={CONTROL} data-testid="diagram-connect-label" onChange={(event) => setLabel(event.target.value)} />
			</label>
			<span className="flex items-end gap-1">
				<button type="submit" className="prompt-secondary" data-testid="diagram-connect-add" aria-disabled={same}>Add</button>
				<button type="button" className="prompt-secondary" onClick={onClose}>Close</button>
			</span>
			{same && <p role="status" className="text-sm text-faint sm:col-span-4">A connection joins two different {DIAGRAM_NODE_NOUN[doc.form]}s.</p>}
		</form>
	);
}

