/** React Flow for demo-kit flow panels, bundled as public/demo-kit/flow.js.
 *  The runtime computes positions; this draws themed nodes and edges and
 *  re-renders on each update. Wheel zoom is off so the lesson keeps
 *  scrolling over the demo. */

import { createRoot } from "react-dom/client";
import { Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Theme {
	surface: string;
	surface2: string;
	border: string;
	text: string;
	muted: string;
	series: string[];
	font: string;
}
interface FlowProps {
	direction: "LR" | "TB";
	theme: Theme;
	nodes: { id: string; label: string; value?: string; highlight: boolean; position: { x: number; y: number } }[];
	edges: { from: string; to: string; label?: string; highlight: boolean }[];
}
type KitNodeData = { label: string; value?: string; highlight: boolean; theme: Theme; direction: "LR" | "TB" };

function KitNode({ data }: NodeProps<Node<KitNodeData>>) {
	const { theme, highlight, direction } = data;
	const accent = theme.series[0]!;
	return (
		<div
			style={{
				minWidth: 120,
				padding: "6px 12px",
				borderRadius: 8,
				border: `1px solid ${highlight ? accent : theme.border}`,
				background: highlight ? theme.surface2 : theme.surface,
				color: theme.text,
				font: `max(13px, calc(var(--lh-demo-size, 17px) * .85)) ${theme.font}`,
				textAlign: "center",
				boxShadow: highlight ? `0 0 0 2px ${accent}33` : undefined,
			}}
		>
			<Handle type="target" position={direction === "LR" ? Position.Left : Position.Top} style={{ opacity: 0 }} />
			<div>{data.label}</div>
			{data.value !== undefined && (
				<div style={{ marginTop: 2, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: highlight ? accent : theme.text }}>{data.value}</div>
			)}
			<Handle type="source" position={direction === "LR" ? Position.Right : Position.Bottom} style={{ opacity: 0 }} />
		</div>
	);
}

const nodeTypes = { kit: KitNode };

function Flow({ direction, theme, nodes, edges }: FlowProps) {
	const accent = theme.series[0]!;
	const rfNodes: Node<KitNodeData>[] = nodes.map((n) => ({
		id: n.id,
		type: "kit",
		position: n.position,
		data: { label: n.label, value: n.value, highlight: n.highlight, theme, direction },
		draggable: false,
		connectable: false,
	}));
	const rfEdges: Edge[] = edges.map((e, i) => {
		const color = e.highlight ? accent : theme.muted;
		return {
			id: `e${i}-${e.from}-${e.to}`,
			source: e.from,
			target: e.to,
			label: e.label,
			animated: e.highlight,
			style: { stroke: color, strokeWidth: e.highlight ? 2 : 1.25 },
			markerEnd: { type: MarkerType.ArrowClosed, color },
			labelStyle: { fill: theme.text, fontFamily: theme.font, fontSize: 12 },
			labelBgStyle: { fill: theme.surface },
		};
	});
	return (
		<ReactFlow
			nodes={rfNodes}
			edges={rfEdges}
			nodeTypes={nodeTypes}
			fitView
			// Text stays readable: never shrink below 90%; wide graphs pan instead.
			fitViewOptions={{ padding: 0.15, minZoom: 0.9, maxZoom: 1.2 }}
			minZoom={0.5}
			proOptions={{ hideAttribution: true }}
			zoomOnScroll={false}
			panOnScroll={false}
			preventScrolling={false}
			nodesDraggable={false}
			nodesConnectable={false}
			elementsSelectable={false}
			colorMode="dark"
			style={{ background: "transparent" }}
		/>
	);
}

const api = {
	render(el: HTMLElement, props: FlowProps) {
		const root = createRoot(el);
		root.render(<Flow {...props} />);
		return { update: (next: FlowProps) => root.render(<Flow {...next} />) };
	},
};
// The runtime (runtime.ts) declares window.LHFlow loosely; this is its implementation.
Object.assign(window, { LHFlow: api });
