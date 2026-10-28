"use client";

import type { ArtifactPartProps, LhViewPart } from "@/src/core";
import { DemoOutputCard } from "@/components/artifacts/demo-card";
import { plotArtifactOf } from "@/components/artifacts/demo-panel-context";
import { ToolCallCard } from "@/components/artifacts/tool-call-card";

/** Quick plots (feature 005): a checked plot renders as the demo artifact
 *  (side panel, expand, download, invert — the invert persists on the
 *  plot's toolResult via the artifact-ui route). Anything else — a failed
 *  check, invalid input, a plot still settling — is the quiet tool card;
 *  the agent explains a failure in words. */
export function PlotCard({ part }: ArtifactPartProps) {
	const plot = part as LhViewPart;
	const artifact = plotArtifactOf(plot);
	if (!artifact) return <ToolCallCard part={part} />;
	return <DemoOutputCard output={{ title: artifact.title, html: artifact.html, tested: true }} messageId={plot.resultMessageId} initialInverted={artifact.inverted} />;
}
