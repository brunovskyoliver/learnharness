"use client";

/**
 * Notebook's settings (feature 024, US8; ui-contract "Settings modal",
 * visual-reference §19): a lifted paper card over the dimmed page with a
 * nav ("Customize", "Reviewers") and option cards. Every card group is a
 * radio group (arrow keys move and choose); a change applies at once and
 * is saved to the `notebook` settings section through `updatePreferences`.
 * A save that fails says so with Try again (constitution IV). Escape, ✕ or
 * the backdrop closes it; the focus goes back where it was.
 */
import { XIcon } from "lucide-react";
import { Dialog, RadioGroup, Switch, Tabs } from "radix-ui";
import { useId, useRef, type ReactNode } from "react";
import type { NotebookAppearance, NotebookInk, NotebookLayout, NotebookLettering, NotebookPace, NotebookStartMode, NotebookTextSize } from "@/src/core";
import { ReviewersPage } from "./reviewers";
import { useArrowChoice, useNotebook, type NotebookPreferences, type SettingsTab } from "./nb-shared";

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

// ─── thumbnails (greyscale miniatures, drawn like the frame's) ──────────────

const Bar = ({ x, y, w, tone }: { x: number; y: number; w: number; tone: "text" | "head" | "note" }) => (
	<rect x={x} y={y} width={w} height={3} rx={1.5} className={`nb-thumb-${tone}`} />
);
const Tick = ({ d }: { d: string }) => <path d={d} className="nb-thumb-tick" />;

/** Where questions appear: the page column with its notes beside it. */
export function LayoutThumb({ layout }: { layout: NotebookLayout }) {
	return (
		<svg className="nb-thumb nb-thumb-layout" viewBox="0 0 158 96" aria-hidden="true" data-thumb={layout}>
			{layout === "both" && (
				<>
					<Bar x={55} y={20} w={40} tone="head" />
					<Bar x={55} y={36} w={50} tone="text" /><Bar x={55} y={44} w={46} tone="text" />
					<Bar x={55} y={60} w={58} tone="text" /><Bar x={55} y={68} w={52} tone="text" /><Bar x={55} y={76} w={40} tone="text" />
					<Tick d="M106 41 q6 -3 12 -1" /><Bar x={118} y={38} w={28} tone="note" /><Bar x={118} y={46} w={21} tone="note" />
					<Tick d="M53 69 q-6 3 -12 1" /><Bar x={11} y={68} w={28} tone="note" /><Bar x={11} y={76} w={20} tone="note" />
				</>
			)}
			{layout === "right" && (
				<>
					<Bar x={15} y={20} w={40} tone="head" />
					<Bar x={15} y={36} w={66} tone="text" /><Bar x={15} y={44} w={60} tone="text" />
					<Bar x={15} y={60} w={66} tone="text" /><Bar x={15} y={68} w={58} tone="text" /><Bar x={15} y={76} w={44} tone="text" />
					<Tick d="M84 41 q8 -3 16 -1" /><Bar x={102} y={38} w={38} tone="note" /><Bar x={102} y={46} w={30} tone="note" />
					<Tick d="M84 66 q8 -6 16 -8" /><Bar x={102} y={56} w={38} tone="note" /><Bar x={102} y={64} w={30} tone="note" />
				</>
			)}
			{layout === "marks" && (
				<>
					<Bar x={39} y={20} w={40} tone="head" />
					<Bar x={39} y={36} w={58} tone="text" /><Bar x={39} y={44} w={50} tone="text" />
					<circle cx={104} cy={45.5} r={3.6} className="nb-thumb-ring" />
					<rect x={35} y={53} width={86} height={24} rx={4} className="nb-thumb-card" />
					<Bar x={42} y={60} w={52} tone="note" /><Bar x={42} y={67} w={40} tone="note" />
					<Bar x={39} y={84} w={54} tone="text" />
				</>
			)}
		</svg>
	);
}

const THEME_INK = {
	light: { paper: "#f8f7f4", ink: "#1d1c1a", graphite: "#8e8a83", ring: "#dedbd4" },
	dark: { paper: "#1a1a19", ink: "#e9e7e2", graphite: "#a9a69e", ring: "#33322f" },
} as const;

function MiniToolbar({ theme }: { theme: "light" | "dark" }) {
	const c = THEME_INK[theme];
	return (
		<g>
			<rect x={18} y={22} width={64} height={3.5} rx={1.75} fill={c.ink} opacity={0.75} />
			<circle cx={98} cy={23.75} r={2.6} fill={c.ink} />
			<rect x={106} y={22} width={34} height={3.5} rx={1.75} fill={c.ink} opacity={0.75} />
			<rect x={18} y={33} width={44} height={3.5} rx={1.75} fill={c.graphite} opacity={0.8} />
		</g>
	);
}

/** Appearance: a mini toolbar on light paper, dark paper, or half of each. */
export function AppearanceThumb({ appearance }: { appearance: NotebookAppearance }) {
	const clip = useId().replace(/:/g, "");
	const panel = (theme: "light" | "dark") => (
		<>
			<rect x={0.5} y={0.5} width={157} height={59} rx={6} fill={THEME_INK[theme].paper} stroke={THEME_INK[theme].ring} />
			<MiniToolbar theme={theme} />
		</>
	);
	return (
		<svg className="nb-thumb nb-thumb-appearance" viewBox="0 0 158 60" aria-hidden="true" data-thumb={appearance}>
			{appearance === "system" ? (
				<>
					<defs>
						<clipPath id={`${clip}-l`}><rect x={0} y={0} width={79} height={60} /></clipPath>
						<clipPath id={`${clip}-r`}><rect x={79} y={0} width={79} height={60} /></clipPath>
					</defs>
					<g clipPath={`url(#${clip}-l)`}>{panel("light")}</g>
					<g clipPath={`url(#${clip}-r)`}>{panel("dark")}</g>
				</>
			) : panel(appearance)}
		</svg>
	);
}

// ─── building blocks ────────────────────────────────────────────────────────

/** A section: its label and a radio group of option cards. */
function CardGroup<T extends string>({ field, label, value, columns, onChange, children }: {
	field: keyof NotebookPreferences;
	label: string;
	value: T;
	columns: number;
	onChange: (value: T) => void;
	children: ReactNode;
}) {
	const id = useId();
	const arrows = useArrowChoice(value, onChange);
	return (
		<section className="nb-set-section" data-section={field}>
			<h3 id={id} className="nb-set-label">{label}</h3>
			<RadioGroup.Root
				aria-labelledby={id}
				className="nb-set-grid"
				style={{ "--cols": columns } as React.CSSProperties}
				value={value}
				onValueChange={(next) => onChange(next as T)}
				{...arrows}
				loop
				data-testid={`nb-set-${field}`}
			>
				{children}
			</RadioGroup.Root>
		</section>
	);
}

function Card({ field, value, className = "", label, children }: { field: string; value: string; className?: string; label?: string; children: ReactNode }) {
	return (
		<RadioGroup.Item value={value} className={`nb-option-card nb-set-card ${className}`} aria-label={label} data-testid={`nb-set-${field}-${value}`}>
			{children}
		</RadioGroup.Item>
	);
}

/** The Customize page: every card group, in the contract's order. */
export function CustomizePage({ preferences, failed, onChange, onRetry, title }: {
	preferences: NotebookPreferences;
	failed: boolean;
	onChange: (patch: Partial<NotebookPreferences>) => void;
	onRetry: () => void;
	/** The page's heading (the dialog's title in the modal). */
	title?: ReactNode;
}) {
	const switchId = useId();
	const hintId = useId();
	const p = preferences;
	return (
		<div className="nb-set-customize">
			{title ?? <h2 className="nb-settings-title">{SETTINGS_TITLE}</h2>}
			<CardGroup field="startMode" label={SECTION_LABELS.startMode} value={p.startMode} columns={2} onChange={(startMode) => onChange({ startMode })}>
				{START_MODES.map((o) => (
					<Card key={o.value} field="startMode" value={o.value}>
						<span className="nb-option-title">{o.title}</span>
						<span className="nb-option-description">{o.description}</span>
					</Card>
				))}
			</CardGroup>
			<p className="nb-set-hint">{START_HINT}</p>

			<div className="nb-option-card nb-set-toggle">
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

			<CardGroup field="pace" label={SECTION_LABELS.pace} value={p.pace} columns={2} onChange={(pace) => onChange({ pace })}>
				{PACES.map((o) => (
					<Card key={o.value} field="pace" value={o.value}>
						<span className="nb-option-title">{o.title}</span>
						<span className="nb-option-description">{o.description}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="layout" label={SECTION_LABELS.layout} value={p.layout} columns={3} onChange={(layout) => onChange({ layout })}>
				{LAYOUTS.map((o) => (
					<Card key={o.value} field="layout" value={o.value} className="nb-set-thumb-card">
						<span className="nb-thumb-frame"><LayoutThumb layout={o.value} /></span>
						<span className="nb-option-title">{o.title}</span>
						<span className="nb-option-description">{o.description}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="appearance" label={SECTION_LABELS.appearance} value={p.appearance} columns={3} onChange={(appearance) => onChange({ appearance })}>
				{APPEARANCES.map((o) => (
					<Card key={o.value} field="appearance" value={o.value} className="nb-set-thumb-card nb-set-appearance">
						<AppearanceThumb appearance={o.value} />
						<span className="nb-set-caption">{o.title}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="textSize" label={SECTION_LABELS.textSize} value={p.textSize} columns={3} onChange={(textSize) => onChange({ textSize })}>
				{TEXT_SIZES.map((o) => (
					<Card key={o.value} field="textSize" value={o.value} className="nb-set-sample-card" label={o.title}>
						<span className="nb-set-sample" data-size={o.value} aria-hidden="true">{TEXT_SAMPLE}</span>
						<span className="nb-set-caption">{o.title}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="lettering" label={SECTION_LABELS.lettering} value={p.lettering} columns={2} onChange={(lettering) => onChange({ lettering })}>
				{LETTERINGS.map((o) => (
					<Card key={o.value} field="lettering" value={o.value} className="nb-set-sample-card" label={`${o.title}: ${o.description}`}>
						<span className="nb-set-letter" data-lettering={o.value} aria-hidden="true">{LETTERING_SAMPLE}</span>
						<span className="nb-set-caption">{o.description}</span>
					</Card>
				))}
			</CardGroup>

			<CardGroup field="ink" label={SECTION_LABELS.ink} value={p.ink} columns={7} onChange={(ink) => onChange({ ink })}>
				{INKS.map((o) => (
					<Card key={o.value} field="ink" value={o.value} className="nb-set-swatch">
						<span className="nb-set-swatch-dot" style={{ background: inkVar(o.value) }} aria-hidden="true" />
						<span className="nb-set-swatch-name" style={{ color: inkVar(o.value) }}>{o.title}</span>
					</Card>
				))}
			</CardGroup>

			{failed && (
				<p className="nb-set-problem" role="alert" data-testid="nb-settings-problem">
					<span>{NOT_SAVED_LINE}</span>
					<button type="button" className="nb-rev-text-button nb-rev-link" data-testid="nb-settings-retry" onClick={onRetry}>Try again</button>
				</p>
			)}
		</div>
	);
}

/** The modal. `tab` null = closed. */
/** ✕ at the page's top right; it scrolls away with the page (frame sheet-10). */
const CloseButton = () => (
	<Dialog.Close className="nb-dialog-close nb-settings-close" aria-label="Close settings" data-testid="nb-settings-close">
		<XIcon aria-hidden="true" size={15} strokeWidth={1.6} />
	</Dialog.Close>
);

export function SettingsModal({ tab, onTabChange }: { tab: SettingsTab | null; onTabChange: (tab: SettingsTab | null) => void }) {
	const nb = useNotebook();
	const before = useRef<Element | null>(null);
	return (
		<Dialog.Root open={tab !== null} onOpenChange={(open) => { if (!open) onTabChange(null); }}>
			<Dialog.Portal container={nb.root ?? undefined}>
				<Dialog.Overlay className="nb-dialog-backdrop" data-testid="nb-settings-backdrop">
					<Dialog.Content
						className="nb-settings"
						data-testid="nb-settings"
						aria-describedby={undefined}
						onOpenAutoFocus={() => { before.current = document.activeElement; }}
						onCloseAutoFocus={(event) => {
							const back = before.current;
							if (back instanceof HTMLElement && back.isConnected && back !== document.body) {
								event.preventDefault();
								back.focus();
							}
						}}
					>
						<Tabs.Root className="nb-settings-body" orientation="vertical" value={tab ?? "customize"} onValueChange={(value) => onTabChange(value as SettingsTab)}>
							<Tabs.List className="nb-settings-nav" aria-label="Settings">
								<Tabs.Trigger value="customize" className="nb-settings-tab" data-testid="nb-settings-nav-customize">Customize</Tabs.Trigger>
								<Tabs.Trigger value="reviewers" className="nb-settings-tab" data-testid="nb-settings-nav-reviewers">Reviewers</Tabs.Trigger>
							</Tabs.List>
							<Tabs.Content value="customize" className="nb-settings-page" data-testid="nb-settings-customize">
								<CloseButton />
								<CustomizePage
									preferences={nb.preferences}
									failed={nb.preferencesFailed}
									onChange={(patch) => void nb.updatePreferences(patch)}
									onRetry={() => void nb.retryPreferences()}
									title={<Dialog.Title className="nb-settings-title">{SETTINGS_TITLE}</Dialog.Title>}
								/>
							</Tabs.Content>
							<Tabs.Content value="reviewers" className="nb-settings-page" data-testid="nb-settings-reviewers">
								<CloseButton />
								<Dialog.Title className="nb-sr-only">Reviewers</Dialog.Title>
								<ReviewersPage reviewers={nb.reviewers} onSave={nb.saveReviewers} />
							</Tabs.Content>
						</Tabs.Root>
					</Dialog.Content>
				</Dialog.Overlay>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
