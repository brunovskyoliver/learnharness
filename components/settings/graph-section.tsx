"use client";
/**
 * The Graph section's own rows (thin settings wave; split from the retired
 * Appearance section in feature 025, T043): the extraction master switch,
 * graph rendering and the chunk budget. The display rows follow it under
 * "Display" (graph-display-section.tsx).
 */

import {
	EXTRACTION_CHUNK_TOKENS_FLOOR,
	resolveSettings,
	type GraphSettings,
} from "@/src/core";
import { CommitInput, SettingsRow, Toggle } from "./controls.tsx";

export function GraphSection({
	graph,
	onSectionChange,
}: {
	graph: GraphSettings | undefined;
	onSectionChange: (next: GraphSettings) => void;
}) {
	// Wave 7 collapse (owner ruling 2026-09-23): the section is the MASTER
	// SWITCH — the embedding/clustering/labeling rungs are gone; clustering
	// is the free birth-session partition derived on read, labels ARE session
	// names. The chunk budget (2026-10-02) joined it as the section's second
	// and only other control: it denominates the coverage ring AND gates the
	// auto-extraction trigger (turn settle ≥ budget fires the run).
	//
	// Resolved through the SAME core resolver the server's effective
	// settings use (one source of truth, the 4096-fallback fix 2026-10-02):
	// the hint and placeholder report exactly the number the trigger waits
	// for — never a second hand-rolled default.
	const resolved = resolveSettings(graph === undefined ? null : { version: 1, graph }).graph;
	return (
		<>
			{/* EXTRACTION (renamed, owner 2026-10-06): this switch is the DATA
			    channel — the pipeline, the auditor, the prober's graph tools. It
			    was born labeled "Graph" and that label lied once the rendering
			    switch below arrived: off ≠ no graph, off = the graph stops
			    growing. The testid keeps the old name's shape (row-enabled) so
			    this stays one rename, not a test re-pin. */}
			<SettingsRow label="Extraction" hint="Off = the graph stops growing" testid="graph-row-enabled" rowId="extraction">
				<Toggle
					checked={graph?.enabled ?? true}
					label="extraction enabled"
					onChange={(on) =>
						// Compose, never replace-whole (the section PUT is, but the
					// row must not drop its sibling field — fixed with the budget
					// row's arrival: the old { enabled: on } wiped a stored budget).
						onSectionChange({ ...graph, enabled: on })
					}
				/>
			</SettingsRow>
			{/* GRAPH RENDERING (owner, 2026-10-06 — the release graph-controls
			    round): display-only. Off = the home shows the chains view
			    instead of the canvas. The ledgers, the pipeline, everything
			    data keeps working — that is the extraction switch above. */}
			<SettingsRow label="Graph rendering" hint="Off = home shows the chains view" testid="graph-row-rendering" rowId="rendering">
				<Toggle
					checked={graph?.rendering ?? true}
					label="graph rendering enabled"
					onChange={(on) => onSectionChange({ ...graph, rendering: on })}
				/>
			</SettingsRow>
			<SettingsRow
				label="Extraction chunk budget"
				hint={`${resolved.extractionChunkTokens} tok`}
				testid="graph-row-chunk-tokens" rowId="chunk-budget"
			>
				<CommitInput
					type="number"
					value={String(graph?.extractionChunkTokens ?? "")}
					placeholder={String(resolved.extractionChunkTokens)}
					ariaLabel="extraction chunk budget"
					testid="input-chunk-tokens"
					onCommit={(v) => {
						// Empty = factory default (the fix-wave discipline): absence is
						// the unset for numbers — Number("") is 0, so clamping would
						// write the floor instead of unsetting.
						if (v === "") {
							onSectionChange({ ...graph, extractionChunkTokens: undefined });
							return;
						}
						const n = Number(v);
						if (!Number.isFinite(n) || n <= 0) return; // bad input: no write
						// Mirror the server sanitize exactly: floor only (cost
						// protection), no ceiling — a big budget is the user's call.
						onSectionChange({
							...graph,
							extractionChunkTokens: Math.max(EXTRACTION_CHUNK_TOKENS_FLOOR, Math.round(n)),
						});
					}}
				/>
			</SettingsRow>
		</>
	);
}