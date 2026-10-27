"use client";

import { Suspense, useEffect, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { latestTree } from "@/components/plan-tree";
import type { PlanBlock as FullPlanBlock, PlanPopup as FullPlanPopup } from "@/components/plan-block";

type BlockProps = ComponentProps<typeof FullPlanBlock>;
type PopupProps = ComponentProps<typeof FullPlanPopup>;
type ReadablePlan = {
	nodes: { id: string; title: string; status?: string }[];
	edges: { from: string; to: string }[];
};

/** Keep the authored nodes and prerequisites readable even when a graph
 * chunk cannot load. No import retry is offered: Turbopack caches failures. */
function PlanText({ plan }: { plan: ReadablePlan | null }) {
	if (!plan?.nodes.length) return <p>No plan yet.</p>;
	const titles = new Map(plan.nodes.map((node) => [node.id, node.title]));
	return (
		<ul className="space-y-2">
			{plan.nodes.map((node) => {
				const prerequisites = plan.edges.filter((edge) => edge.to === node.id)
					.map((edge) => titles.get(edge.from) ?? edge.from);
				return <li key={node.id}>
					<span>{node.title}</span>
					{node.status && <span className="text-muted-foreground"> · {node.status}</span>}
					{prerequisites.length > 0 && <p className="text-muted-foreground">After: {prerequisites.join(", ")}</p>}
				</li>;
			})}
		</ul>
	);
}

function BlockFallback({ data, onOpen, failed = false }: BlockProps & { failed?: boolean }) {
	return (
		<div className="space-y-2 text-sm" data-testid="plan-block-fallback">
			<p role={failed ? "alert" : "status"} className="text-muted-foreground">
				{failed ? "The plan diagram could not load. Your plan is shown below." : "Loading plan diagram…"}
			</p>
			<PlanText plan={data} />
			<button type="button" onClick={onOpen} className="underline underline-offset-4">Open the full plan</button>
		</div>
	);
}

function PopupFallback({ messages, onClose, failed = false }: PopupProps & { failed?: boolean }) {
	useEffect(() => {
		const dismiss = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			onClose();
		};
		document.addEventListener("keydown", dismiss);
		return () => document.removeEventListener("keydown", dismiss);
	}, [onClose]);
	return (
		<div role="dialog" aria-modal="true" aria-label="The full plan" data-testid="plan-popup-fallback"
			className="absolute inset-0 z-40 flex flex-col bg-background/80 p-4 backdrop-blur-sm"
			onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="text-sm font-medium">Plan</span>
				<button type="button" onClick={onClose} className="min-h-11 rounded-lg px-3 hover:bg-accent">Close</button>
			</div>
			<div className="min-h-0 flex-1 overflow-auto rounded-xl bg-background p-4 text-sm">
				<p role={failed ? "alert" : "status"} className="mb-4 text-muted-foreground">
					{failed ? "The plan diagram could not load. Your plan is shown below." : "Loading plan diagram…"}
				</p>
				<PlanText plan={latestTree(messages)} />
			</div>
		</div>
	);
}

// Keep SSR enabled: an existing plan still produces its SVG on the server
// and preloads this chunk. Plan-free conversations do not need the engine.
const DiagramBlock = dynamic(() => import("@/components/plan-block")
	.then((module) => module.PlanBlock)
	.catch(() => function FailedBlock(props: BlockProps) { return <BlockFallback {...props} failed />; }));
const DiagramPopup = dynamic(() => import("@/components/plan-block")
	.then((module) => module.PlanPopup)
	.catch(() => function FailedPopup(props: PopupProps) { return <PopupFallback {...props} failed />; }));

export function PlanBlock(props: BlockProps) {
	return <Suspense fallback={<BlockFallback {...props} />}><DiagramBlock {...props} /></Suspense>;
}

export function PlanPopup(props: PopupProps) {
	return <Suspense fallback={<PopupFallback {...props} />}><DiagramPopup {...props} /></Suspense>;
}
