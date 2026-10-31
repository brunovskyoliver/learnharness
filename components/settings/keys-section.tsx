"use client";
/**
 * The Keys section (wave-5 polish, 2026-09-21 — owner design): a MINIMAL
 * key-value table. Provider left, masked key right, no description hints
 * (they took too much space), the "Get a key ↗" link a tiny muted guest.
 * Clicking a writable row unfolds a paste field + Save (+ Delete for a
 * file-sourced value) beneath it; Esc or a second click folds it away.
 * The Add-provider control is the LAST ROW of the table and uses the
 * app's shared dropdown look (ProviderMenuList — fuzzy search over the
 * 33 pi-ai providers).
 *
 * Owner rulings carried in:
 *  - Env-owned rows (a real environment variable owns the name — dev
 *    .env.local or launch env) render READ-ONLY, no paste field:
 *    a paste box on a key the UI cannot make live would mislead.
 *  - OpenRouter is NOT special: one provider among 33, a row only when
 *    stored, otherwise it lives in the Add dropdown like everyone else.
 *  - Providers groups API keys, subscriptions, dictation and search.
 *    Unknown variables stay masked/read-only at the end of Model API keys.
 *
 * API: GET /api/keys (masked statuses + the providers array), PUT
 * /api/keys/:id (shape-gated 400s land inline), DELETE. Saves take
 * effect immediately. Plaintext never returns from the store.
 */

import { useEffect, useRef, useState } from "react";
import { type AuthKeyStatus } from "@/src/core";
import { SettingsFailure, SettingsGroup, SettingsRowsSkeleton } from "./controls.tsx";
import { SubscriptionConnections } from "./subscription-connections.tsx";
import { ProviderMenuList } from "./model-menu.tsx";
import { MenuShell } from "@/components/menu-shell";
import { notifySettingsSaved } from "@/components/settings-signal";

import { classifyKeys, type ProviderKeyInfo } from "./key-classification";
export { classifyKeys, type ProviderKeyInfo } from "./key-classification";

const KEY_SAVE_FAILED = "This key could not be saved. Try again.";

interface KeysResponse {
	keys: AuthKeyStatus[];
	providers?: ProviderKeyInfo[];
}

/** The minimal status line, e.g. "…ab12 · 64 chars" (" · env" marks an
 *  environment-owned value — the row itself is read-only then). Pure. */
export function keyStatusLine(status: AuthKeyStatus): string {
	if (!status.present || !status.masked) return "not set";
	const tail = status.masked.replace(/ \((\d+) chars\)$/, "");
	const chars = status.masked.match(/\((\d+) chars\)$/)?.[1] ?? "?";
	return `${tail} · ${chars}${status.source === "env" ? " · env" : ""}`;
}

/** One table row: label left, tiny docs link + status right. Writable
 *  rows click-unfold an editor beneath (owner interaction); env-owned
 *  rows are read-only (a paste box there would mislead). */
function KeyTableRow({
	label,
	docsUrl,
	status,
	expanded,
	onToggle,
	onSave,
	onDelete,
	onCancel,
	testid,
	settingsRow,
}: {
	label: string;
	/** The "Get a key ↗" target — curated keys carry one. */
	docsUrl?: string;
	status: AuthKeyStatus;
	expanded: boolean;
	onToggle: () => void;
	onSave: (value: string) => Promise<string | null>;
	onDelete?: () => Promise<string | null>;
	/** Folds the editor (owner, fix wave: the way OUT of a paste prompt
	 *  must be visible — Cancel beside Save/Delete, not only Esc). */
	onCancel: () => void;
	testid: string;
	/** The `data-settings-row` target: the key's id. */
	settingsRow: string;
}) {
	const envOwned = status.source === "env";
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function save() {
		if (!value.trim() || busy) return;
		setBusy(true);
		setError(null);
		const err = await onSave(value);
		if (err) setError(err);
		else setValue("");
		setBusy(false);
	}

	async function remove() {
		if (!onDelete || busy) return;
		setBusy(true);
		setError(null);
		const err = await onDelete();
		if (err) setError(err);
		setBusy(false);
	}
// INLINE editing (owner, fix wave: "type the keys in line — more
	// table-like"): the expanded row becomes the editor itself — label
	// left, the paste field filling the middle, Save | Cancel (| Delete)
	// right — instead of a second line beneath the row.
	if (expanded && !envOwned) {
		return (
			<div data-testid={testid} data-settings-row={settingsRow} className="scroll-mt-4 rounded-md">
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2" data-testid={`${testid}-editor`}>
					<span className="shrink-0 font-ui text-sm text-foreground">{label}</span>
					<input
						type="text"
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void save();
						}}
						placeholder="Paste key…"
						aria-label={`${label} key`}
						data-testid={`${testid}-input`}
						disabled={busy}
						autoFocus
						autoComplete="off"
						spellCheck={false}
						className="h-7 min-w-40 flex-1 basis-40 rounded-md border border-input bg-background px-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground pointer-coarse:h-11"
					/>
					<button
						type="button"
						onClick={() => void save()}
						disabled={busy || !value.trim()}
						data-testid={`${testid}-save`}
						className="shrink-0 text-sm text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline pointer-coarse:min-h-11"
					>
						Save
					</button>
					<button
						type="button"
						onClick={onCancel}
						disabled={busy}
						data-testid={`${testid}-cancel`}
						className="shrink-0 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline pointer-coarse:min-h-11"
					>
						Cancel
					</button>
					{status.present && status.source === "file" && onDelete && (
						<button
							type="button"
							onClick={() => void remove()}
							disabled={busy}
							aria-label={`Delete ${label} key`}
							data-testid={`${testid}-delete`}
							className="shrink-0 text-sm text-muted-foreground underline-offset-2 hover:text-destructive hover:underline pointer-coarse:min-h-11"
						>
							Delete
						</button>
					)}
				</div>
				{error && (
					<p role="alert" data-testid={`${testid}-error`} className="pb-2 text-sm text-destructive">
						{error}
					</p>
				)}
			</div>
		);
	}

	return (
		<div data-testid={testid} data-settings-row={settingsRow} className="scroll-mt-4 rounded-md">
			{/* Env-owned rows are read-only but WORKING keys (polish pass
			    2026-10-26): full opacity; the status line's "· env" says why
			    the row doesn't open. */}
			<div className="-mx-2 flex items-center gap-3">
				<button
					type="button"
					aria-expanded={expanded}
					data-testid={`${testid}-row`}
					onClick={() => !envOwned && onToggle()}
					className={`flex min-h-14 min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-2 text-left ${
						envOwned ? "cursor-default" : "cursor-pointer transition-colors hover:bg-accent"
					}`}
				>
					<span className="text-sm text-foreground">{label}</span>
					<span data-testid={`${testid}-status`} className="text-sm text-muted-foreground">
						{keyStatusLine(status)}
					</span>
				</button>
				{docsUrl && (
					<a
						href={docsUrl}
						target="_blank"
						rel="noreferrer"
						aria-label={`Get a ${label} key (opens in a new tab)`}
						className="mr-2 shrink-0 rounded-md text-sm text-ink-2 underline-offset-2 hover:text-foreground hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
					>
						key ↗
					</a>
				)}
			</div>
			{error && (
				<p role="alert" data-testid={`${testid}-error`} className="pb-2 text-sm text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}

/** The Add-provider control — the table's last row, the app's shared
 *  dropdown look (portaled menu, the search + arrow-walk machine). */
function AddProviderRow({
	addable,
	onPick,
}: {
	addable: ProviderKeyInfo[];
	onPick: (p: ProviderKeyInfo) => void;
}) {
	const [open, setOpen] = useState(false);
	const anchorRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (anchorRef.current?.contains(target)) return;
			if (target instanceof Element && target.closest("[data-lh-menu]")) return;
			if (target instanceof Element && target.closest('[role="dialog"]')) setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={anchorRef} data-settings-row="add-provider" className="relative scroll-mt-4 rounded-md">
			<button
				type="button"
				aria-expanded={open}
				data-testid="add-provider"
				onClick={() => setOpen((v) => !v)}
				className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-2 text-left font-ui text-sm text-ink-2 transition-colors hover:bg-accent hover:text-foreground"
			>
				<span>+ Add provider key</span>
				{addable.length > 0 && <span className="text-sm">{addable.length} available</span>}
			</button>
			{open && (
				<MenuShell
					anchorRef={anchorRef}
					testid="add-provider-menu"
					preferredSide="down"
					menuClass="flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-lg bg-popover p-2 text-sm"
				>
					{/* Close on pick (owner, fix wave): a chosen provider ends
					    the dropdown — the paste row is the next step. */}
					<ProviderMenuList
						providers={addable}
						onPick={(p) => {
							setOpen(false);
							onPick(p);
						}}
					/>
				</MenuShell>
			)}
		</div>
	);
}

export function KeysSection({
	/** A deep-linked row to unfold on arrival (zero-keys wave): the
	 *  dictation error's click lands here on DEEPGRAM_API_KEY. Followed
	 *  while mounted too — the settings dialog's while-open retarget
	 *  pattern. undefined = nothing seeded. */
	initialRow,
	rowRequest,
}: {
	initialRow?: string;
	/** Changes with each jump, so repeating one unfolds its row again. */
	rowRequest?: number;
}) {
	const [statuses, setStatuses] = useState<AuthKeyStatus[] | null>(null);
	const [providers, setProviders] = useState<ProviderKeyInfo[] | undefined>(undefined);
	const [loading, setLoading] = useState(true);
	const [loadFailed, setLoadFailed] = useState(false);
/** The unfolded row (its id), null = all folded. Seeded by the
	 *  deep-link (initialRow) and re-followed when it retargets. */
	const [openRow, setOpenRow] = useState<string | null>(initialRow ?? null);
	/** The paste editor for a freshly chosen Add-provider target. */
	const [adding, setAdding] = useState<ProviderKeyInfo | null>(null);
	const [addError, setAddError] = useState<string | null>(null);

	// Escape folds any open editor (unfolded row or the Add-provider paste)
	// WITHOUT closing the dialog. Claimed at document CAPTURE phase — the
	// only stopPropagation that outruns both the input's React handler and
	// the dialog's window-level listener.
	useEffect(() => {
		if (openRow === null && adding === null) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			setOpenRow(null);
			setAdding(null);
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => document.removeEventListener("keydown", onKeyDown, true);
	}, [openRow, adding]);

	const reload = () =>
		fetch("/api/keys")
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
			.then((body: KeysResponse) => {
				setStatuses(body.keys ?? []);
				if (body.providers) setProviders(body.providers);
				setLoadFailed(false);
			})
			// A failed refresh keeps the last good rows.
			.catch(() => setLoadFailed(true))
.finally(() => setLoading(false));

	useEffect(() => {
		void reload();
	}, []);

	// The deep-link follow: a retarget while the section is open (the
	// same while-open pattern the dialog's section nav uses) unfolds the
	// named row; a fresh mount seeds it via the useState initializer.
	useEffect(() => {
		if (initialRow !== undefined) setOpenRow(initialRow);
	}, [initialRow, rowRequest]);

	async function saveKey(id: string, value: string): Promise<string | null> {
		const res = await fetch(`/api/keys/${id}`, {
			method: "PUT",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ value }),
		}).catch(() => null);
		if (!res) return KEY_SAVE_FAILED;
		if (!res.ok) {
			const body = (await res.json().catch(() => ({}))) as { error?: string };
			// A 400 explains what is wrong with the key; anything else is ours.
			return res.status === 400 && body.error ? body.error : KEY_SAVE_FAILED;
		}
await reload();
		// The cross-surface keys signal (zero-keys wave): the zero-keys pill,
		// the setup dialog's stage advance, and any other keys reader hear
		// that a key landed — deletions included (see deleteKey below).
		notifySettingsSaved("keys");
		return null;
	}

	async function deleteKey(id: string): Promise<string | null> {
		const res = await fetch(`/api/keys/${id}`, { method: "DELETE" }).catch(() => null);
		if (!res?.ok) return "This key could not be deleted. Try again.";
		await reload();
		notifySettingsSaved("keys");
		return null;
	}

	if (loading) return <SettingsRowsSkeleton label="Loading keys…" />;
	if (statuses === null) {
		return (
			<SettingsFailure
				testid="keys-load-error"
				retryTestid="keys-load-retry"
				message="Your provider keys could not be loaded."
				onRetry={() => { setLoading(true); void reload(); }}
			/>
		);
	}
const { providerRows, toolRows, unknownRows, addable } = classifyKeys(statuses, providers);

	async function saveNewProvider(p: ProviderKeyInfo, value: string) {
		const err = await saveKey(p.envVar, value);
		if (err) setAddError(err);
		else {
			setAdding(null);
			setAddError(null);
		}
	}

	return (
		<>
			{loadFailed && <SettingsFailure testid="keys-refresh-error" message="Your provider keys could not be refreshed. This list may be out of date." onRetry={() => void reload()} />}
			<SettingsGroup label="Model API keys" testid="group-provider-keys">
				{providerRows.map((status) => (
					<KeyTableRow
						key={status.id}
						label={providers?.find((p) => p.envVar === status.id)?.label ?? status.info?.label ?? status.id}
						docsUrl={status.info?.docsUrl}
						status={status}
						expanded={openRow === status.id}
						onToggle={() => setOpenRow(openRow === status.id ? null : status.id)}
						onSave={async (v) => {
							const err = await saveKey(status.id, v);
							if (!err) setOpenRow(null); // fold on success — rest state
							return err;
						}}
						onCancel={() => setOpenRow(null)}
						onDelete={() => deleteKey(status.id)}
						testid={`key-${status.id.toLowerCase()}`}
						settingsRow={status.id}
/>
				))}
				{providers !== undefined && (
					<AddProviderRow
						addable={addable}
						onPick={(p) => {
							setAdding(p);
							setAddError(null);
						}}
					/>
				)}
				{adding && (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md py-2" data-testid={`key-${adding.id}-editor`}>
						<span className="shrink-0 font-ui text-sm text-foreground">{adding.label}</span>
						<AddProviderEditor provider={adding} onSave={(v) => void saveNewProvider(adding, v)} onCancel={() => setAdding(null)} error={addError} />
					</div>
				)}
				{unknownRows.length > 0 && <div data-testid="group-unknown-keys">
					{unknownRows.map((status) => <div key={status.id} data-testid={`unknown-${status.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2">
						<span className="font-mono text-xs text-muted-foreground">{status.id}</span>
						<span className="font-mono text-xs text-muted-foreground">{status.masked}</span>
					</div>)}
				</div>}
			</SettingsGroup>

			<SettingsGroup label="Subscriptions" testid="group-subscriptions">
				<SubscriptionConnections />
			</SettingsGroup>

			{(["Search"] as const).map((label) => <SettingsGroup key={label} label={label} testid="group-search">
				{toolRows.map((status) => (
					<KeyTableRow
						key={status.id}
						label={status.info?.label ?? status.id}
						docsUrl={status.info?.docsUrl}
						status={status}
						expanded={openRow === status.id}
						onToggle={() => setOpenRow(openRow === status.id ? null : status.id)}
						onSave={async (v) => {
							const err = await saveKey(status.id, v);
							if (!err) setOpenRow(null);
							return err;
						}}
						onCancel={() => setOpenRow(null)}
						onDelete={() => deleteKey(status.id)}
						testid={`key-${status.id.toLowerCase()}`}
						settingsRow={status.id}
/>
				))}
			</SettingsGroup>)}

		</>
	);
}

/** The paste field for a provider chosen in the Add dropdown — rendered
 *  beneath the Add row until saved or cancelled. */
function AddProviderEditor({
	provider,
	onSave,
	onCancel,
	error,
}: {
	provider: ProviderKeyInfo;
	onSave: (value: string) => void;
	onCancel: () => void;
	error: string | null;
}) {
	const [value, setValue] = useState("");
	return (
		<>
			<input
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && value.trim()) onSave(value);
				}}
				placeholder="Paste key…"
				aria-label={`${provider.label} key`}
				data-testid={`key-${provider.id}-input`}
				autoFocus
						autoComplete="off"
						spellCheck={false}
						className="h-7 min-w-40 flex-1 basis-40 rounded-md border border-input bg-background px-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground pointer-coarse:h-11"
			/>
			<button
				type="button"
				onClick={() => value.trim() && onSave(value)}
				disabled={!value.trim()}
				data-testid={`key-${provider.id}-save`}
				className="shrink-0 text-sm text-foreground underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline pointer-coarse:min-h-11"
			>
				Save
			</button>
			<button
				type="button"
				onClick={onCancel}
				data-testid={`key-${provider.id}-cancel`}
				className="shrink-0 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline pointer-coarse:min-h-11"
			>
				Cancel
			</button>
			{error && (
				<p role="alert" className="w-full pl-0 text-sm text-destructive" data-testid={`key-${provider.id}-error`}>
					{error}
				</p>
			)}
		</>
	);
}
