"use client";

/**
 * Notebook's settings pages (feature 024, US8; ui-contract "Settings modal",
 * visual-reference §19), shown in the one settings modal both modes share
 * (feature 025, T040-T041: components/settings/settings-dialog-content.tsx on
 * components/paper/settings-shell.tsx). Customize holds the shared Appearance
 * first (theme, text size, lettering, AI ink: both modes follow them), then
 * Notebook's own options under "In Notebook". Every card group is a radio
 * group (arrow keys move and choose); a change applies at once and is saved
 * to the `notebook` settings section. A save that fails says so with Try
 * again, pinned at the top of the page (constitution IV).
 */
import { Switch } from "radix-ui";
import { useId, type ReactNode } from "react";
import type { NotebookAppearance, NotebookInk, NotebookLayout, NotebookLettering, NotebookPace, NotebookStartMode, NotebookTextSize } from "@/src/core";
import { AppearanceThumb, LayoutThumb, OptionCard as Card, OptionCardGroup as CardGroup } from "@/components/paper/option-cards";
import { SettingsTitle } from "@/components/paper/settings-shell";
import type { NotebookPreferences } from "./nb-shared";

export { AppearanceThumb, LayoutThumb } from "@/components/paper/option-cards";

// ─── the words (ui-contract "Settings modal") ───────────────────────────────

export const SETTINGS_TITLE = "Customize";
export const START_MODES: readonly { value: NotebookStartMode; title: string; description: string }[] = [
	{ value: "thinks", title: "Thinks with you", description: "Reads along and speaks up when a line deserves a second look." },
	{ value: "ask", title: "When you ask", description: "Stays quiet until you select something or open the chat." },
];
export const START_HINT = "Each note can change on its own, from the row above its title.";
export const POINTER_INK = { title: "Ink from the pointer", description: "Now and then a drop of ink falls where you move the pointer, then dries." };
export const PACES: readonly { value: NotebookPace; title: string; description: string }[] = [
	{ value: "regular", title: "Regular", description: "Reads a moment after you stop typing." },
	{ value: "slow", title: "Slow", description: "Waits about twice as long, for when you think between lines." },
];
export const LAYOUTS: readonly { value: NotebookLayout; title: string; description: string }[] = [
	{ value: "both", title: "Both margins", description: "Your words in the middle, questions on both sides." },
	{ value: "right", title: "Right margin", description: "Every question in one column beside your words." },
	{ value: "marks", title: "Marks only", description: "A small ? after the passage. Open it when you want." },
];
export const APPEARANCES: readonly { value: NotebookAppearance; title: string }[] = [
	{ value: "system", title: "System" },
	{ value: "light", title: "Light" },
	{ value: "dark", title: "Dark" },
];
export const TEXT_SAMPLE = "A thought.";
export const TEXT_SIZES: readonly { value: NotebookTextSize; title: string }[] = [
	{ value: "small", title: "Small" },
	{ value: "default", title: "Default" },
	{ value: "large", title: "Large" },
];
export const LETTERING_SAMPLE = "Does this hold?";
export const LETTERINGS: readonly { value: NotebookLettering; title: string; description: string }[] = [
	{ value: "serif", title: "Serif", description: "Its own hand" },
	{ value: "plain", title: "Plain", description: "Same as yours" },
];
export const INKS: readonly { value: NotebookInk; title: string }[] = [
	{ value: "ink", title: "Ink" },
	{ value: "blue", title: "Blue" },
	{ value: "green", title: "Green" },
	{ value: "red", title: "Red" },
	{ value: "purple", title: "Purple" },
	{ value: "brown", title: "Brown" },
	{ value: "orange", title: "Orange" },
];
export const SECTION_LABELS = {
	startMode: "New notes start in",
	pace: "Reading pace",
	layout: "Where questions appear",
	appearance: "Appearance",
	textSize: "Text size",
	lettering: "Lettering",
	ink: "Ink colour",
} as const;
export const NOT_SAVED_LINE = "That change wasn’t saved. It holds here until you reload.";

/** The swatch colour of an AI ink (follows the theme's tokens). */
const inkVar = (ink: NotebookInk) => (ink === "ink" ? "var(--riddle-ink)" : `var(--text-${ink})`);

/** The small label over Notebook's own options (feature 025). */
export const IN_NOTEBOOK_LABEL = "In Notebook";

/** The Customize page: the shared Appearance, then Notebook's own options. */
export function CustomizePage({ preferences, failed, onChange, onRetry, title, alert }: {
	preferences: NotebookPreferences;
	failed: boolean;
	onChange: (patch: Partial<NotebookPreferences>) => void;
	onRetry: () => void;
	/** The page's heading (the dialog's title in the modal). */
	title?: ReactNode;
	/** Another page's failed save, pinned here too (the settings modal). */
	alert?: ReactNode;
}) {
	const switchId = useId();
	const hintId = useId();
	const p = preferences;
	return (
		<div className="nb-set-customize">
			{title ?? <SettingsTitle>{SETTINGS_TITLE}</SettingsTitle>}
			{alert}
			{failed && (
				<p className="nb-set-problem" role="alert" data-testid="nb-settings-problem">
					<span>{NOT_SAVED_LINE}</span>
					<button type="button" className="nb-rev-text-button nb-rev-link" data-testid="nb-settings-retry" onClick={onRetry}>Try again</button>
				</p>
			)}

			<CardGroup field="appearance" rowId="theme" label={SECTION_LABELS.appearance} value={p.appearance} columns={3} onChange={(appearance) => onChange({ appearance })}>
				{APPEARANCES.map((o) => (
					<Card key={o.value} field="appearance" value={o.value} className="nb-set-thumb-card nb-set-appearance">
						<AppearanceThumb appearance={o.value} />
						<span className="nb-set-caption">{o.title}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="textSize" rowId="text-size" label={SECTION_LABELS.textSize} value={p.textSize} columns={3} onChange={(textSize) => onChange({ textSize })}>
				{TEXT_SIZES.map((o) => (
					<Card key={o.value} field="textSize" value={o.value} className="nb-set-sample-card" label={o.title}>
						<span className="nb-set-sample" data-size={o.value} aria-hidden="true">{TEXT_SAMPLE}</span>
						<span className="nb-set-caption">{o.title}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="lettering" rowId="lettering" label={SECTION_LABELS.lettering} value={p.lettering} columns={2} onChange={(lettering) => onChange({ lettering })}>
				{LETTERINGS.map((o) => (
					<Card key={o.value} field="lettering" value={o.value} className="nb-set-sample-card" label={`${o.title}: ${o.description}`}>
						<span className="nb-set-letter" data-lettering={o.value} aria-hidden="true">{LETTERING_SAMPLE}</span>
						<span className="nb-set-caption">{o.description}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="ink" rowId="ink" label={SECTION_LABELS.ink} value={p.ink} columns={7} onChange={(ink) => onChange({ ink })}>
				{INKS.map((o) => (
					<Card key={o.value} field="ink" value={o.value} className="nb-set-swatch">
						<span className="nb-set-swatch-dot" style={{ background: inkVar(o.value) }} aria-hidden="true" />
						<span className="nb-set-swatch-name" style={{ color: inkVar(o.value) }}>{o.title}</span>
					</Card>
				))}
			</CardGroup>

			<p className="nb-set-mode-label" data-testid="nb-set-in-notebook">{IN_NOTEBOOK_LABEL}</p>

			<CardGroup field="startMode" rowId="start-mode" label={SECTION_LABELS.startMode} value={p.startMode} columns={2} onChange={(startMode) => onChange({ startMode })}>
				{START_MODES.map((o) => (
					<Card key={o.value} field="startMode" value={o.value}>
						<span className="nb-option-title">{o.title}</span>
						<span className="nb-option-description">{o.description}</span>
					</Card>
				))}
			</CardGroup>
			<p className="nb-set-hint">{START_HINT}</p>

			<div className="nb-option-card nb-set-toggle" data-settings-row="pointer-ink">
				<label htmlFor={switchId} className="nb-set-toggle-text">
					<span className="nb-option-title">{POINTER_INK.title}</span>
					<span id={hintId} className="nb-option-description">{POINTER_INK.description}</span>
				</label>
				<Switch.Root
					id={switchId}
					className="nb-switch"
					checked={p.pointerInk}
					onCheckedChange={(pointerInk) => onChange({ pointerInk })}
					aria-describedby={hintId}
					data-testid="nb-set-pointerInk"
				>
					<Switch.Thumb className="nb-switch-thumb" />
				</Switch.Root>
			</div>

			<CardGroup field="pace" rowId="pace" label={SECTION_LABELS.pace} value={p.pace} columns={2} onChange={(pace) => onChange({ pace })}>
				{PACES.map((o) => (
					<Card key={o.value} field="pace" value={o.value}>
						<span className="nb-option-title">{o.title}</span>
						<span className="nb-option-description">{o.description}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="layout" rowId="layout" label={SECTION_LABELS.layout} value={p.layout} columns={3} onChange={(layout) => onChange({ layout })}>
				{LAYOUTS.map((o) => (
					<Card key={o.value} field="layout" value={o.value} className="nb-set-thumb-card">
						<span className="nb-thumb-frame"><LayoutThumb layout={o.value} /></span>
						<span className="nb-option-title">{o.title}</span>
						<span className="nb-option-description">{o.description}</span>
					</Card>
				))}
			</CardGroup>
		</div>
	);
}
