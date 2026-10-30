"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	ARROW_LENGTH_LADDER,
	CHARGE_RANGE,
	CLUSTER_LABEL_SIZE_LADDER,
	CLUSTER_PULL_RANGE,
	DEPTH_BASE_RADIUS_RANGE,
	DEPTH_SPACING_RANGE,
	DEPTH_STRENGTH_RANGE,
	DEFAULT_RENDER_SETTINGS,
	EDGE_WIDTH_LADDER,
	GRAVITY_RANGE,
	LABEL_SIZE_LADDER,
	LABEL_ZOOM_LADDER,
	LINK_DISTANCE_RANGE,
	LINK_STRENGTH_RANGE,
	NODE_SIZE_LADDER,
	REGION_BITMAP_OPTIONS,
	REGION_BLUR_LADDER,
	REGION_DILATION_LADDER,
	REGION_EDGE_ALPHA_LADDER,
	VELOCITY_DECAY_RANGE,
	fromLadderPosition,
	fromOffSliderPosition,
	fromSliderPosition,
	labelZoomDisplay,
	sanitizeRenderSettings,
	toLadderPosition,
	toOffSliderPosition,
	toSliderPosition,
	type GraphRenderSettings,
} from "@/src/core";
import { cn } from "@/lib/utils";
import { notifySettingsSaved } from "@/components/settings-signal";
import { SettingsFailure } from "./controls.tsx";
import { displayRowId } from "./settings-index";

/**
 * Settings → Graph → Display (feature 002): the graph's display controls,
 * moved here from the gear that floated over the graph. Server-persisted
 * in data/render-settings.json via /api/graph/render-settings (a separate
 * store from the settings record); each save fires the "graph" settings
 * signal so the live graph re-reads without a reload.
 */
export function GraphDisplaySection() {
	const [settings, setSettings] = useState<GraphRenderSettings | null>(null);
	const [loadError, setLoadError] = useState(false);
	const [saveError, setSaveError] = useState(false);
	const [saveRequest, setSaveRequest] = useState(0);
	const [loadRequest, setLoadRequest] = useState(0);
// True once the user has moved a control: the server copy must never
	// clobber a (possibly newer) local change.
	const userTouched = useRef(false);
	useEffect(() => {
		setLoadError(false);
		fetch("/api/graph/render-settings")
.then((res) => (res.ok ? (res.json() as Promise<unknown>) : Promise.reject(new Error(`HTTP ${res.status}`))))
			.then((raw) => {
				if (!userTouched.current) setSettings(sanitizeRenderSettings(raw));
			})
			.catch(() => {
				setLoadError(true);
				if (!userTouched.current) setSettings(DEFAULT_RENDER_SETTINGS);
			});
	}, [loadRequest]);
	// Saves are debounced (sliders fire per step); the last value wins.
	useEffect(() => {
		if (!settings || !userTouched.current) return;
		const id = setTimeout(() => {
			fetch("/api/graph/render-settings", {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(settings),
			})
				.then((res) => {
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					setSaveError(false);
					notifySettingsSaved("graph");
				})
				.catch(() => setSaveError(true));
		}, 400);
		return () => clearTimeout(id);
	}, [settings, saveRequest]);
	const changeSettings = useCallback((update: (cur: GraphRenderSettings) => GraphRenderSettings) => {
		userTouched.current = true;
		setSettings((cur) => update(cur ?? DEFAULT_RENDER_SETTINGS));
	}, []);
	if (!settings) return <p role="status" className="text-sm text-muted-foreground">Loading display settings…</p>;
	return (
		<div data-testid="graph-display-settings" className="flex flex-col gap-3">
			{loadError && <SettingsFailure testid="graph-display-load-error" message="Could not load the saved display settings. Showing the defaults." onRetry={() => setLoadRequest((request) => request + 1)} />}
			{saveError && <SettingsFailure testid="graph-display-save-error" message="Could not save the display settings." onRetry={() => setSaveRequest((request) => request + 1)} />}
			<GraphDisplayControls settings={settings} changeSettings={changeSettings} />
		</div>
	);
}

/** Compact size display for the log sliders: "2", "1.6", "0.75". */
function sizeDisplay(v: number): string {
	return `${v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100}`;
}

/** One labeled range row. */
function SettingSlider({
	label,
	min,
	max,
	step,
	value,
	display,
	onChange,
	disabled,
}: {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	/** Value display override (e.g. "1.5×" for zoom) — defaults to the raw number. */
	display?: string;
	onChange: (v: number) => void;
	/** Unavailable (owner, 2026-10-30): children use the muted ink and lock
	 *  when their parent toggle or mode is off, with no opacity. */
	disabled?: boolean;
}) {
	return (
		<label data-settings-row={displayRowId(label)} className="flex scroll-mt-4 flex-col gap-1 rounded-md">
			<span className={cn("flex items-center justify-between text-sm", disabled ? "text-muted-foreground" : "text-ink-2")}>
				{label}
				<span className="tabular-nums">{display ?? value}</span>
			</span>
			<input
				type="range"
				min={min}
				max={max}
				step={step}
				value={value}
				disabled={disabled}
				onChange={(e) => onChange(Number(e.target.value))}
				className={cn("h-1.5 w-full accent-ink-2 pointer-coarse:h-11", disabled && "cursor-not-allowed accent-muted-foreground")}
			/>
		</label>
	);
}

/** The display controls (the old gear panel's body, unchanged in behavior). */
export function GraphDisplayControls({
	settings,
	changeSettings,
}: {
	settings: GraphRenderSettings;
	changeSettings: (update: (cur: GraphRenderSettings) => GraphRenderSettings) => void;
}) {
	const regionTuning = settings.regions;
	const physicsTuning = settings.physics;
	return (
		<>
			{/* Size/zoom/region sliders: LADDER-mapped 0-100, step 10 (11
			    stops, every DEFAULT dead-center at 50, every value a nice
			    number — src/core/render-settings.ts). Physics keeps the
			    fine-grained log sliders (step 5). */}
			<SettingSlider
				label="Node size"
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(settings.nodeSize, NODE_SIZE_LADDER)}
				display={sizeDisplay(settings.nodeSize)}
				onChange={(p) =>
					changeSettings((cur) => ({ ...cur, nodeSize: fromLadderPosition(p, NODE_SIZE_LADDER) }))}
			/>
			<SettingSlider
				label="Edge width"
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(settings.edgeWidth, EDGE_WIDTH_LADDER)}
				display={sizeDisplay(settings.edgeWidth)}
				onChange={(p) =>
					changeSettings((cur) => ({ ...cur, edgeWidth: fromLadderPosition(p, EDGE_WIDTH_LADDER) }))}
			/>
			<SettingSlider
				label="Arrowhead size"
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(settings.arrowLength, ARROW_LENGTH_LADDER)}
				display={sizeDisplay(settings.arrowLength)}
				onChange={(p) =>
					changeSettings((cur) => ({ ...cur, arrowLength: fromLadderPosition(p, ARROW_LENGTH_LADDER) }))}
			/>
			<SettingSlider
				label="Label size"
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(settings.labelSize, LABEL_SIZE_LADDER)}
				display={sizeDisplay(settings.labelSize)}
				onChange={(p) =>
					changeSettings((cur) => ({ ...cur, labelSize: fromLadderPosition(p, LABEL_SIZE_LADDER) }))}
			/>
			{/* Display is absolute (ratio / 0.5): "1×" is the default, dead-center (owner, 2026-10-07). */}
			<SettingSlider
				label="Labels until zoom"
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(settings.labelZoom, LABEL_ZOOM_LADDER)}
				display={labelZoomDisplay(settings.labelZoom)}
				onChange={(p) =>
					changeSettings((cur) => ({ ...cur, labelZoom: fromLadderPosition(p, LABEL_ZOOM_LADDER) }))}
			/>
			{/* Regions: the blurred cluster tints. Sliders + a fixed-set
		    dropdown for the bitmap resolution (it's a discrete
		    choice, not a free number). Server-persisted like the
		    sizes; every range end was sweep-validated on the real
		    graph. The enable switch is a COMPUTE switch: off skips
		    the whole build (splat/blur/readback/blit), not just
		    the paint. */}
		<div className="mt-3 flex flex-col gap-3">
			<h4 className="text-sm font-medium text-foreground">
				Regions
			</h4>
			<label data-settings-row={displayRowId("Background colors")} className="flex scroll-mt-4 cursor-pointer items-center justify-between rounded-md text-sm text-ink-2 pointer-coarse:min-h-11">
				<span>Background colors</span>
				<input
					type="checkbox"
					checked={settings.regions.enabled}
					onChange={(e) =>
						changeSettings((cur) => ({
							...cur,
							regions: { ...cur.regions, enabled: e.target.checked },
						}))}
						className="accent-primary"
				/>
			</label>
			<SettingSlider
				label="Dilation"
				disabled={!regionTuning.enabled}
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(regionTuning.dilation, REGION_DILATION_LADDER)}
				display={sizeDisplay(regionTuning.dilation)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						regions: { ...cur.regions, dilation: fromLadderPosition(p, REGION_DILATION_LADDER) },
					}))}
			/>
			<SettingSlider
				label="Blur"
				disabled={!regionTuning.enabled}
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(regionTuning.blur, REGION_BLUR_LADDER)}
				display={sizeDisplay(regionTuning.blur)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						regions: { ...cur.regions, blur: fromLadderPosition(p, REGION_BLUR_LADDER) },
					}))
				}
			/>
			<SettingSlider
				label="Edge alpha"
				disabled={!regionTuning.enabled}
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(regionTuning.edgeAlpha, REGION_EDGE_ALPHA_LADDER)}
				display={sizeDisplay(regionTuning.edgeAlpha)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						regions: { ...cur.regions, edgeAlpha: fromLadderPosition(p, REGION_EDGE_ALPHA_LADDER) },
					}))}
			/>
			<label
				data-settings-row={displayRowId("Bitmap resolution")}
				className={cn("flex scroll-mt-4 items-center justify-between gap-2 rounded-md text-sm", regionTuning.enabled ? "text-ink-2" : "text-muted-foreground")}
			>
				<span>Bitmap resolution</span>
				<select
					disabled={!regionTuning.enabled}
					className={cn("rounded-md border border-input bg-background px-1.5 py-0.5 text-sm tabular-nums pointer-coarse:min-h-11", regionTuning.enabled ? "text-foreground" : "cursor-not-allowed text-muted-foreground")}
					value={regionTuning.bitmap}
					onChange={(e) =>
						changeSettings((cur) => ({
							...cur,
							regions: { ...cur.regions, bitmap: Number(e.target.value) },
						}))
					}
				>
					{REGION_BITMAP_OPTIONS.map((o) => (
						<option key={o} value={o}>
							{o}
						</option>
					))}
				</select>
			</label>
			{/* Cluster labels moved here 2026-09-16 (user: cluster
			    stuff lives in the regions section). Decoupled from
			    the Background colors switch above — labels follow
			    their own clusterLabels toggle. Size is screen px
			    (constant at any zoom, unlike node labels). */}
			<label data-settings-row={displayRowId("Cluster labels")} className="flex scroll-mt-4 cursor-pointer items-center justify-between rounded-md text-sm text-ink-2 pointer-coarse:min-h-11">
				<span>Cluster labels</span>
				<input
					type="checkbox"
					checked={settings.clusterLabels}
					onChange={(e) => changeSettings((cur) => ({ ...cur, clusterLabels: e.target.checked }))}
					className="accent-primary"
				/>
			</label>
			<SettingSlider
				label="Cluster label size"
				disabled={!settings.clusterLabels}
				min={0}
				max={100}
				step={10}
				value={toLadderPosition(settings.clusterLabelSize, CLUSTER_LABEL_SIZE_LADDER)}
				display={sizeDisplay(settings.clusterLabelSize)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						clusterLabelSize: fromLadderPosition(p, CLUSTER_LABEL_SIZE_LADDER),
					}))}
			/>
		</div>
		{/* Physics: the live sim's forces. Every value feeds the SAME
		    engine the server settle runs (createGraphSimulation);
		    changing one rebuilds the sim from the current positions —
		    drag mid-settle re-anneals, pins survive. Sliders over
		    sweep-validated ranges (src/core/render-settings.ts):
		    range ends and all four corners settle cleanly — no NaN,
		    no explosion, no non-settle. Repulsion is displayed as
		    the negative it is; cluster pull's far left = off.
		    Order (user 2026-09-17): general forces first; depth
		    anchor + its gray-out-able controls last. */}
		<div className="mt-3 flex flex-col gap-3">
			<h4 className="text-sm font-medium text-foreground">
				Physics
			</h4>
			<SettingSlider
				label="Node repulsion"
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(-physicsTuning.chargeStrength, -CHARGE_RANGE.max, -CHARGE_RANGE.min)}
				display={`-${Math.round(-physicsTuning.chargeStrength)}`}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, chargeStrength: -fromSliderPosition(p, -CHARGE_RANGE.max, -CHARGE_RANGE.min) },
					}))}
			/>
			<SettingSlider
				label="Edge attraction"
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.linkStrength, LINK_STRENGTH_RANGE.min, LINK_STRENGTH_RANGE.max)}
				display={sizeDisplay(physicsTuning.linkStrength)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, linkStrength: fromSliderPosition(p, LINK_STRENGTH_RANGE.min, LINK_STRENGTH_RANGE.max) },
					}))}
			/>
			<SettingSlider
				label="Edge length"
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.linkDistance, LINK_DISTANCE_RANGE.min, LINK_DISTANCE_RANGE.max)}
				display={sizeDisplay(physicsTuning.linkDistance)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, linkDistance: fromSliderPosition(p, LINK_DISTANCE_RANGE.min, LINK_DISTANCE_RANGE.max) },
					}))}
			/>
			<SettingSlider
				label="Central pull"
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.gravity, GRAVITY_RANGE.min, GRAVITY_RANGE.max)}
				display={sizeDisplay(physicsTuning.gravity)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, gravity: fromSliderPosition(p, GRAVITY_RANGE.min, GRAVITY_RANGE.max) },
					}))}
			/>
			<SettingSlider
				label="Cluster pull"
				min={0}
				max={100}
				step={5}
				value={toOffSliderPosition(physicsTuning.clusterPull, CLUSTER_PULL_RANGE.min, CLUSTER_PULL_RANGE.max)}
				display={physicsTuning.clusterPull <= 0 ? "off" : sizeDisplay(physicsTuning.clusterPull)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, clusterPull: fromOffSliderPosition(p, CLUSTER_PULL_RANGE.min, CLUSTER_PULL_RANGE.max) },
					}))}
			/>
			<SettingSlider
				label="Friction"
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.velocityDecay, VELOCITY_DECAY_RANGE.min, VELOCITY_DECAY_RANGE.max)}
				display={sizeDisplay(physicsTuning.velocityDecay)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, velocityDecay: fromSliderPosition(p, VELOCITY_DECAY_RANGE.min, VELOCITY_DECAY_RANGE.max) },
					}))}
			/>
			{/* Depth anchor LAST (user 2026-09-17): general
			    forces first, then the mode + its conditional
			    controls at the very bottom — the grayed group reads
			    as a self-contained sub-section. */}
			<label data-settings-row={displayRowId("Depth anchor")} className="flex scroll-mt-4 items-center justify-between gap-2 rounded-md text-sm text-ink-2">
				Depth anchor
				<select
					className="rounded-md border border-input bg-background px-1 py-0.5 text-sm text-foreground pointer-coarse:min-h-11"
					value={physicsTuning.depthMode}
					onChange={(e) =>
						changeSettings((cur) => ({
							...cur,
							physics: { ...cur.physics, depthMode: e.target.value as GraphRenderSettings["physics"]["depthMode"] },
						}))
					}
				>
					<option value="off">Off</option>
					<option value="vertical">Vertical (up)</option>
					<option value="radial">Radial (outward)</option>
				</select>
			</label>
			<SettingSlider
				label="Depth strength"
				disabled={physicsTuning.depthMode === "off"}
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.depthStrength, DEPTH_STRENGTH_RANGE.min, DEPTH_STRENGTH_RANGE.max)}
				display={sizeDisplay(physicsTuning.depthStrength)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, depthStrength: fromSliderPosition(p, DEPTH_STRENGTH_RANGE.min, DEPTH_STRENGTH_RANGE.max) },
					}))}
			/>
			<SettingSlider
				label="Depth spacing"
				disabled={physicsTuning.depthMode === "off"}
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.depthSpacing, DEPTH_SPACING_RANGE.min, DEPTH_SPACING_RANGE.max)}
				display={sizeDisplay(physicsTuning.depthSpacing)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, depthSpacing: fromSliderPosition(p, DEPTH_SPACING_RANGE.min, DEPTH_SPACING_RANGE.max) },
					}))}
			/>
			<SettingSlider
				label="Base ring radius"
				disabled={physicsTuning.depthMode !== "radial"}
				min={0}
				max={100}
				step={5}
				value={toSliderPosition(physicsTuning.depthBaseRadius, DEPTH_BASE_RADIUS_RANGE.min, DEPTH_BASE_RADIUS_RANGE.max)}
				display={sizeDisplay(physicsTuning.depthBaseRadius)}
				onChange={(p) =>
					changeSettings((cur) => ({
						...cur,
						physics: { ...cur.physics, depthBaseRadius: fromSliderPosition(p, DEPTH_BASE_RADIUS_RANGE.min, DEPTH_BASE_RADIUS_RANGE.max) },
					}))}
			/>
		</div>
		</>
	);
}
