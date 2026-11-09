"use client";

/** The list form of a diagram (feature 022): the same document as fields. It is the
 *  default where a canvas can't work, the screen-reader path anywhere, and it loads
 *  no React Flow. Every action here is one of the editor's, so undo covers it. */
import { useEffect, useRef } from "react";
import { Link2Icon, Trash2Icon } from "lucide-react";
import { DIAGRAM_NODE_NOUN, diagramNodeName, type DiagramDoc } from "@/src/core";

const FIELD = "w-full min-w-0 rounded-md border border-edge bg-transparent px-2 py-1.5 text-sm text-ink pointer-coarse:min-h-11";
const ICON = "lh-tool";

export function DiagramList({ doc, readOnly, focusRequest, onText, onLabel, onRemoveNode, onRemoveEdge, onLink }: {
	doc: DiagramDoc;
	readOnly: boolean;
	focusRequest: { id: string; nonce: number } | null;
	onText: (id: string, text: string) => void;
	onLabel: (id: string, label: string) => void;
	onRemoveNode: (id: string) => void;
	onRemoveEdge: (id: string) => void;
	onLink: (id: string) => void;
}) {
	const root = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!focusRequest) return;
		root.current?.querySelector<HTMLElement>(`[data-list-node="${CSS.escape(focusRequest.id)}"]`)?.focus();
	}, [focusRequest]);
	const noun = DIAGRAM_NODE_NOUN[doc.form];
	const names = new Map(doc.nodes.map((node) => [node.id, diagramNodeName(node)]));
	return (
		<div ref={root} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6" data-testid="diagram-list">
			<section aria-label={`${noun}s`} className="flex flex-col gap-2">
				<h3 className="text-xs font-medium text-faint">{noun[0]!.toUpperCase()}{noun.slice(1)}s</h3>
				{doc.nodes.length === 0 && <p className="text-md text-faint">Nothing here yet. Add a {noun} to start.</p>}
				<ul className="flex flex-col gap-2">
					{doc.nodes.map((node, index) => (
						<li key={node.id} className="flex items-center gap-1 [content-visibility:auto] [contain-intrinsic-size:auto_44px]" data-testid="diagram-list-node">
							{node.type === "stroke" ? (
								<span tabIndex={-1} data-list-node={node.id} className="min-w-0 flex-1 px-2 py-1.5 text-sm text-graphite">Freehand stroke</span>
							) : (
								<textarea
									data-list-node={node.id}
									rows={1}
									aria-label={`${noun} ${index + 1} text`}
									readOnly={readOnly}
									value={node.text}
									placeholder="Untitled…"
									data-testid="diagram-list-text"
									className={`${FIELD} resize-none`}
									onChange={(event) => onText(node.id, event.target.value)}
								/>
							)}
							{!readOnly && node.type !== "stroke" && (
								<button type="button" aria-label={`Link ${diagramNodeName(node)}`} className={ICON} onClick={() => onLink(node.id)}><Link2Icon aria-hidden="true" />{node.links?.length ? <span className="sr-only">, {node.links.length} linked</span> : null}</button>
							)}
							{!readOnly && <button type="button" aria-label={`Delete ${diagramNodeName(node)}`} className={ICON} onClick={() => onRemoveNode(node.id)}><Trash2Icon aria-hidden="true" /></button>}
						</li>
					))}
				</ul>
			</section>
			<section aria-label="Connections" className="flex flex-col gap-2">
				<h3 className="text-xs font-medium text-faint">Connections</h3>
				{doc.edges.length === 0 && <p className="text-sm text-graphite">No connections yet.</p>}
				<ul className="flex flex-col gap-2">
					{doc.edges.map((edge) => (
						<li key={edge.id} className="flex flex-col gap-1" data-testid="diagram-list-edge">
							<span className="text-sm text-graphite [overflow-wrap:anywhere]">{names.get(edge.from)} → {names.get(edge.to)}</span>
							<span className="flex items-center gap-1">
								<input aria-label={`Label from ${names.get(edge.from)} to ${names.get(edge.to)}`} readOnly={readOnly} autoComplete="off" value={edge.label} placeholder="Label…" className={FIELD} onChange={(event) => onLabel(edge.id, event.target.value)} />
								{!readOnly && <button type="button" aria-label={`Delete connection from ${names.get(edge.from)} to ${names.get(edge.to)}`} className={ICON} onClick={() => onRemoveEdge(edge.id)}><Trash2Icon aria-hidden="true" /></button>}
							</span>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
