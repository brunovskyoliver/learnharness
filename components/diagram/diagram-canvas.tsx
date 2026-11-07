"use client";

/** The canvas (feature 022): the only file that imports React Flow, loaded when a
 *  diagram first shows as a canvas. The document stays the editor's; this draws it
 *  and reports what the learner did. Moving, zooming and panning by pointer or touch
 *  are React Flow's own, and each keyboard path is handled here so it joins undo. */
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
	applyNodeChanges, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Panel, Position, ReactFlow, ReactFlowProvider, useInternalNode, useReactFlow,
	type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps, type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./diagram.css";
import { Link2Icon, MaximizeIcon, MinusIcon, PlusIcon } from "lucide-react";
import { diagramNodeName, type DiagramDoc, type DiagramEdge, type DiagramNode } from "@/src/core";

export interface CanvasActions {
	setText: (id: string, text: string) => void;
	setEdgeLabel: (id: string, label: string) => void;
	move: (moves: { id: string; x: number; y: number }[]) => void;
	nudge: (id: string, dx: number, dy: number) => void;
	connect: (from: string, to: string) => void;
	removeNode: (id: string) => void;
	removeEdge: (id: string) => void;
	stroke: (points: [number, number][]) => void;
	select: (selection: { nodeId: string | null; edgeId: string | null }) => void;
	setEditing: (editing: { nodeId?: string | null; edgeId?: string | null }) => void;
}

type EditState = { nodeId: string | null; edgeId: string | null; readOnly: boolean; actions: CanvasActions };
const EditContext = createContext<EditState | null>(null);

const focusNode = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.focus();
const focusEdge = (id: string) => document.querySelector<SVGElement>(`.react-flow__edge[data-id="${CSS.escape(id)}"]`)?.focus();

const NodeText = memo(function NodeText({ node }: { node: DiagramNode }) {
	const edit = useContext(EditContext)!;
	const editing = edit.nodeId === node.id && !edit.readOnly;
	const area = useRef<HTMLTextAreaElement>(null);
	useEffect(() => {
		if (!editing) return;
		// React Flow hides a new node until it is measured, and a hidden field can't take focus.
		let frame = 0;
		let tries = 0;
		const take = () => {
			area.current?.focus({ preventScroll: true });
			if (document.activeElement === area.current) area.current?.select();
			else if (++tries < 20) frame = requestAnimationFrame(take);
		};
		take();
		return () => cancelAnimationFrame(frame);
	}, [editing]);
	const stop = () => {
		edit.actions.setEditing({ nodeId: null });
		requestAnimationFrame(() => focusNode(node.id));
	};
	return (
		<div className={`lh-diagram-box ${node.type === "sticky" ? "lh-diagram-sticky" : ""}`} data-empty={!node.text.trim() && !editing} data-testid="diagram-node" onDoubleClick={() => edit.actions.setEditing({ nodeId: node.id })}>
			<Handle type="target" position={Position.Top} />
			{editing ? (
				<textarea
					ref={area}
					aria-label={`Text of ${diagramNodeName(node)}`}
					className="nodrag nopan nowheel"
					rows={Math.max(1, node.text.split("\n").length)}
					value={node.text}
					data-testid="diagram-node-text"
					onChange={(event) => edit.actions.setText(node.id, event.target.value)}
					onBlur={() => edit.actions.setEditing({ nodeId: null })}
					onKeyDown={(event) => {
						if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
							event.preventDefault();
							event.stopPropagation();
							stop();
						} else event.stopPropagation();
					}}
				/>
			) : (node.text.trim() || "Untitled")}
			{!editing && node.links?.length ? <Link2Icon className="ms-1 inline size-3 text-faint" aria-hidden="true" data-testid="diagram-node-linked" /> : null}
			<Handle type="source" position={Position.Bottom} />
		</div>
	);
});

function TextNode({ data }: NodeProps<Node<{ node: DiagramNode }>>) {
	return <NodeText node={data.node} />;
}

function StrokeNode({ data }: NodeProps<Node<{ node: DiagramNode }>>) {
	const points = data.node.points ?? [];
	const width = Math.max(4, ...points.map((p) => p[0]));
	const height = Math.max(4, ...points.map((p) => p[1]));
	const path = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join("");
	return (
		<svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", display: "block" }} aria-hidden="true">
			<path d={path} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

type Rect = { x: number; y: number; width: number; height: number };

/** Where the line between two boxes' centres leaves `from`. The same straight edge the export draws. */
function borderPoint(from: Rect, to: Rect): [number, number] {
	const cx = from.x + from.width / 2, cy = from.y + from.height / 2;
	const dx = to.x + to.width / 2 - cx, dy = to.y + to.height / 2 - cy;
	if (dx === 0 && dy === 0) return [cx, cy];
	const scale = Math.min(dx ? from.width / 2 / Math.abs(dx) : Infinity, dy ? from.height / 2 / Math.abs(dy) : Infinity);
	return [cx + dx * scale, cy + dy * scale];
}

function LabeledEdge(props: EdgeProps<Edge<{ edge: DiagramEdge }>>) {
	const { id, source, target, sourceX, sourceY, targetX, targetY, markerEnd, data } = props;
	const edit = useContext(EditContext)!;
	const from = useInternalNode(source);
	const to = useInternalNode(target);
	const rectOf = (node: typeof from, x: number, y: number): Rect => ({ x: node?.internals.positionAbsolute.x ?? x, y: node?.internals.positionAbsolute.y ?? y, width: node?.measured.width ?? 0, height: node?.measured.height ?? 0 });
	const a = rectOf(from, sourceX, sourceY);
	const b = rectOf(to, targetX, targetY);
	const [x1, y1] = borderPoint(a, b);
	const [x2, y2] = borderPoint(b, a);
	const path = `M${x1} ${y1}L${x2} ${y2}`;
	const labelX = (x1 + x2) / 2, labelY = (y1 + y2) / 2;
	const editing = edit.edgeId === id && !edit.readOnly;
	const label = data?.edge.label ?? "";
	const stop = () => {
		edit.actions.setEditing({ edgeId: null });
		requestAnimationFrame(() => focusEdge(id));
	};
	return (
		<>
			<BaseEdge path={path} markerEnd={markerEnd} interactionWidth={24} />
			{(label || editing) && (
				<EdgeLabelRenderer>
					<div className="lh-diagram-edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }} data-testid="diagram-edge-label" onDoubleClick={() => edit.actions.setEditing({ edgeId: id })}>
						{editing ? (
							<input
								autoFocus
								aria-label="Connection label"
								value={label}
								autoComplete="off"
								data-testid="diagram-edge-label-input"
								onChange={(event) => edit.actions.setEdgeLabel(id, event.target.value)}
								onBlur={() => edit.actions.setEditing({ edgeId: null })}
								onKeyDown={(event) => {
									if (event.key === "Escape" || event.key === "Enter") {
										event.preventDefault();
										event.stopPropagation();
										stop();
									} else event.stopPropagation();
								}}
							/>
						) : label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}

const nodeTypes = { box: TextNode, sticky: TextNode, stroke: StrokeNode };
const edgeTypes = { labeled: LabeledEdge };
const MARKER = { type: MarkerType.ArrowClosed, color: "var(--faint)" };
const NUDGE = 20;
const FIT = { padding: 0.2, maxZoom: 1 };
const FIT_ALL_NODES = 12;
const REFIT_WIDTH = 80;

function toFlowNode(node: DiagramNode, prior?: Node): Node {
	const name = diagramNodeName(node);
	return {
		...prior,
		id: node.id,
		type: node.type,
		position: { x: node.x, y: node.y },
		data: { node },
		connectable: node.type !== "stroke",
		ariaLabel: node.type === "stroke" ? "Freehand stroke. Press Delete to remove." : `${name}${node.links?.length ? `, linked to ${node.links.length}` : ""}. Press Enter to edit.`,
	};
}

const toFlowEdge = (edge: DiagramEdge, doc: DiagramDoc): Edge => {
	const nameOf = (id: string) => {
		const node = doc.nodes.find((other) => other.id === id);
		return node ? diagramNodeName(node) : "Untitled";
	};
	return {
		id: edge.id, source: edge.from, target: edge.to, type: "labeled", data: { edge }, markerEnd: MARKER,
		ariaLabel: `${nameOf(edge.from)} to ${nameOf(edge.to)}${edge.label ? `: ${edge.label}` : ""}. Press Enter to label.`,
	};
};

function PenLayer({ onStroke }: { onStroke: (points: [number, number][]) => void }) {
	const flow = useReactFlow();
	const [live, setLive] = useState<{ points: [number, number][]; flow: [number, number][] } | null>(null);
	const root = useRef<HTMLDivElement>(null);
	// It holds focus so Escape reaches the editor, wherever the pointer left it.
	useEffect(() => { root.current?.focus({ preventScroll: true }); }, []);
	const at = (event: React.PointerEvent) => {
		const rect = root.current!.getBoundingClientRect();
		const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
		return { local: [event.clientX - rect.left, event.clientY - rect.top] as [number, number], flow: [position.x, position.y] as [number, number] };
	};
	return (
		<div
			ref={root}
			className="lh-diagram-pen nodrag nopan"
			data-testid="diagram-pen-layer"
			tabIndex={-1}
			role="application"
			aria-label="Drawing area. Press Escape to stop drawing."
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				const point = at(event);
				setLive({ points: [point.local], flow: [point.flow] });
			}}
			onPointerMove={(event) => {
				if (!live) return;
				const point = at(event);
				setLive({ points: [...live.points, point.local], flow: [...live.flow, point.flow] });
			}}
			onPointerUp={() => {
				if (live) onStroke(live.flow);
				setLive(null);
			}}
			onPointerCancel={() => setLive(null)}
		>
			{live && (
				<svg aria-hidden="true">
					<polyline points={live.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)}
		</div>
	);
}

const ZOOM_BUTTON = "ui-icon-button bg-paper shadow-lift text-ink hover:bg-shelf";

function ZoomControls() {
	const flow = useReactFlow();
	return (
		<Panel position="bottom-right" className="flex gap-1" aria-label="Zoom">
			<button type="button" aria-label="Zoom out" className={ZOOM_BUTTON} data-testid="diagram-zoom-out" onClick={() => void flow.zoomOut()}><MinusIcon className="ui-icon" aria-hidden="true" /></button>
			<button type="button" aria-label="Zoom in" className={ZOOM_BUTTON} data-testid="diagram-zoom-in" onClick={() => void flow.zoomIn()}><PlusIcon className="ui-icon" aria-hidden="true" /></button>
			<button type="button" aria-label="Fit the whole diagram" className={ZOOM_BUTTON} data-testid="diagram-zoom-fit" onClick={() => void flow.fitView(FIT)}><MaximizeIcon className="ui-icon" aria-hidden="true" /></button>
		</Panel>
	);
}

function CanvasInner({ doc, readOnly, drawing, editingNode, editingEdge, focusRequest, actions, label }: DiagramCanvasProps) {
	const flow = useReactFlow();
	const [nodes, setNodes] = useState<Node[]>(() => doc.nodes.map((node) => toFlowNode(node)));
	useEffect(() => {
		setNodes((prior) => {
			const old = new Map(prior.map((node) => [node.id, node]));
			return doc.nodes.map((node) => toFlowNode(node, old.get(node.id)));
		});
	}, [doc.nodes]);
	const edges = useMemo(() => doc.edges.map((edge) => toFlowEdge(edge, doc)), [doc]);
	const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current)), []);
	const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
		actions.select({ nodeId: params.nodes[0]?.id ?? null, edgeId: params.nodes.length ? null : params.edges[0]?.id ?? null });
	}, [actions]);

	// A node asked for from the toolbar or the list comes into view and takes focus.
	useEffect(() => {
		if (!focusRequest) return;
		const node = doc.nodes.find((other) => other.id === focusRequest.id);
		// Small enough to see at once: show it all, once the new node has been measured.
		const view = window.setTimeout(() => {
			if (doc.nodes.length <= FIT_ALL_NODES) void flow.fitView(FIT);
			else if (node) void flow.setCenter(node.x + 60, node.y + 20, { zoom: flow.getZoom() });
		}, 60);
		// A node being edited has its field to focus; taking focus from it would end the edit.
		const frame = editingNode === focusRequest.id ? 0 : requestAnimationFrame(() => focusNode(focusRequest.id));
		return () => { window.clearTimeout(view); cancelAnimationFrame(frame); };
	}, [focusRequest?.nonce]);

	// Full screen or a dragged pane: refit once the width has really changed.
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = box.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		let last = el.clientWidth;
		const observer = new ResizeObserver(() => {
			if (Math.abs(el.clientWidth - last) < REFIT_WIDTH) return;
			last = el.clientWidth;
			void flow.fitView(FIT);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [flow]);

	const edit = useMemo<EditState>(() => ({ nodeId: editingNode, edgeId: editingEdge, readOnly, actions }), [editingNode, editingEdge, readOnly, actions]);
	// Keyboard focus selects, so Link, Delete and Connect act on what focus is on.
	const onFocusCapture = (event: React.FocusEvent) => {
		const target = event.target as Element;
		const nodeId = target.closest(".react-flow__node")?.getAttribute("data-id");
		const edgeId = target.closest(".react-flow__edge")?.getAttribute("data-id");
		if (nodeId) actions.select({ nodeId, edgeId: null });
		else if (edgeId) actions.select({ nodeId: null, edgeId });
	};
	const onKeyDownCapture = (event: React.KeyboardEvent) => {
		if (readOnly) return;
		const target = event.target as Element;
		if (target.closest("input, textarea, select")) return;
		const nodeId = target.closest(".react-flow__node")?.getAttribute("data-id");
		if (nodeId) {
			const node = doc.nodes.find((other) => other.id === nodeId);
			const arrows: Record<string, [number, number]> = { ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE], ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0] };
			if ((event.key === "Enter" || event.key === "F2") && node?.type !== "stroke") actions.setEditing({ nodeId });
			else if (event.key === "Delete" || event.key === "Backspace") actions.removeNode(nodeId);
			else if (arrows[event.key]) actions.nudge(nodeId, arrows[event.key]![0], arrows[event.key]![1]);
			else return;
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const edgeId = target.closest(".react-flow__edge")?.getAttribute("data-id");
		if (edgeId) {
			if (event.key === "Enter" || event.key === "F2") actions.setEditing({ edgeId });
			else if (event.key === "Delete" || event.key === "Backspace") actions.removeEdge(edgeId);
			else return;
			event.preventDefault();
			event.stopPropagation();
		}
	};

	return (
		<EditContext.Provider value={edit}>
			<div ref={box} className="lh-diagram-canvas relative h-full min-h-0 w-full" data-testid="diagram-canvas" onKeyDownCapture={onKeyDownCapture} onFocusCapture={onFocusCapture}>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					nodeTypes={nodeTypes}
					edgeTypes={edgeTypes}
					onNodesChange={onNodesChange}
					onSelectionChange={onSelectionChange}
					onNodeDragStop={(_event, _node, moved) => actions.move(moved.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y })))}
					onConnect={({ source, target }) => { if (source && target) actions.connect(source, target); }}
					isValidConnection={({ source, target }) => source !== target}
					connectionMode={"loose" as never}
					aria-label={label}
					fitView
					fitViewOptions={FIT}
					minZoom={0.1}
					maxZoom={4}
					nodesDraggable={!readOnly}
					nodesConnectable={!readOnly}
					nodesFocusable
					edgesFocusable
					disableKeyboardA11y
					deleteKeyCode={null}
					zoomOnDoubleClick={false}
					proOptions={{ hideAttribution: true }}
					colorMode="dark"
				>
					<ZoomControls />
				</ReactFlow>
				{drawing && <PenLayer onStroke={actions.stroke} />}
			</div>
		</EditContext.Provider>
	);
}

export interface DiagramCanvasProps {
	doc: DiagramDoc;
	label: string;
	readOnly: boolean;
	drawing: boolean;
	editingNode: string | null;
	editingEdge: string | null;
	focusRequest: { id: string; nonce: number } | null;
	actions: CanvasActions;
}

export function DiagramCanvas(props: DiagramCanvasProps) {
	return (
		<ReactFlowProvider>
			<CanvasInner {...props} />
		</ReactFlowProvider>
	);
}
