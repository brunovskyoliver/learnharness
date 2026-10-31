"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PageVersion } from "@/src/core";
import { compareTexts, type CompareRow } from "./page-blocks.ts";

const PagePreview = dynamic(() => import("./page-preview.tsx").then((m) => m.PagePreview), { ssr: false });

/** `Version {n} · {You | Agent} · {time}`, then the tutor-undo note and the learner's name for it. */
export function versionLabel(version: Pick<PageVersion, "n" | "author" | "at"> & Partial<Pick<PageVersion, "cause" | "name">>): string {
	const time = new Date(version.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
	const undo = version.cause === "undo-agent" ? " · Undid the tutor's edit" : "";
	const name = version.name ? ` · ${version.name}` : "";
	return `Version ${version.n} · ${version.author === "agent" ? "Agent" : "You"} · ${time}${undo}${name}`;
}

/** Rows for the Changes view: unchanged runs fold into one count. */
export type ChangeViewRow = { kind: "added" | "removed"; markdown: string } | { kind: "same"; count: number };
export function changeViewRows(rows: readonly CompareRow[]): ChangeViewRow[] {
	const out: ChangeViewRow[] = [];
	for (const row of rows) {
		const last = out.at(-1);
		if (row.kind === "same") {
			if (last?.kind === "same") last.count++;
			else out.push({ kind: "same", count: 1 });
		} else out.push({ kind: row.kind, markdown: row.markdown });
	}
	return out;
}

const unchangedText = (count: number) => `${count} unchanged ${count === 1 ? "block" : "blocks"}`;

/** Added and removed blocks, each with its word (contracts/ui-contract.md, History). */
export function VersionChanges({ n, before, after }: { n: number; before: string | null; after: string }) {
	const rows = compareTexts(before ?? "", after);
	return (
		<div className="flex flex-col gap-2" data-testid="page-version-changes">
			<p className="text-sm text-ink-2">{n === 1 ? "Version 1, the first version" : `Version ${n} compared with version ${n - 1}`}</p>
			{rows === null ? (
				<p className="text-sm text-ink-2">Too long to compare. Use Full text.</p>
			) : (
				<div className="flex flex-col gap-1 rounded-[10px] bg-card px-3 py-2 text-base">
					{changeViewRows(rows).map((row, i) => row.kind === "same" ? (
						<p key={i} className="text-sm text-muted-foreground">{unchangedText(row.count)}</p>
					) : (
						<div key={i} className="flex min-w-0 items-baseline gap-2" data-change={row.kind}>
							<span className={cn("shrink-0 font-mono text-xs", row.kind === "added" ? "text-success" : "text-destructive")}>{row.kind}</span>
							<span className={cn("min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]", row.kind === "removed" && "text-ink-2 line-through")}>{row.markdown}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/** Name, rename or clear a version's name; adds no version. */
function NameField({ id, version, onNamed }: { id: string; version: PageVersion; onNamed: (next: PageVersion) => void }) {
	const fieldId = useId();
	const [value, setValue] = useState(version.name ?? "");
	const [error, setError] = useState<string | null>(null);
	const send = async (name: string | null) => {
		setError(null);
		try {
			const response = await fetch(`/api/library/pages/${encodeURIComponent(id)}/versions/${version.n}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
			const body = await response.json().catch(() => ({})) as { version?: PageVersion; error?: string };
			if (!response.ok || !body.version) { setError(body.error ?? "The name could not be saved."); return; }
			onNamed(body.version);
		} catch {
			setError("The name could not be saved. Check your connection and try again.");
		}
	};
	return (
		<form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void send(value.trim() || null); }} data-testid="page-version-name-form">
			<span className="flex min-w-0 flex-[1_1_12rem] flex-col gap-1">
				<label htmlFor={fieldId} className="text-sm font-medium text-ink-2">Version name</label>
				<input
					id={fieldId}
					autoFocus
					value={value}
					maxLength={80}
					onChange={(event) => setValue(event.currentTarget.value)}
					aria-invalid={error ? true : undefined}
					autoComplete="off"
					data-testid="page-version-name-input"
					className="h-8 w-full rounded-[6px] border border-input bg-transparent px-2 text-base text-foreground pointer-coarse:h-11"
				/>
			</span>
			<button type="submit" className="prompt-secondary">Save</button>
			{version.name && <button type="button" className="prompt-secondary" onClick={() => void send(null)}>Clear name</button>}
			{error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
		</form>
	);
}

/** The version list and a read-only preview. Restoring adds a version. The
 *  list arrives newest first, a page at a time. */
export function PageHistory({ id, onRestore, canRestore }: { id: string; onRestore: (n: number) => Promise<string | null>; canRestore: boolean }) {
	const [versions, setVersions] = useState<PageVersion[] | null>(null);
	const [more, setMore] = useState(false);
	const [failed, setFailed] = useState(false);
	const [earlierFailed, setEarlierFailed] = useState(false);
	const [loadingEarlier, setLoadingEarlier] = useState(false);
	const [selected, setSelected] = useState<number | null>(null);
	const [content, setContent] = useState<string | null>(null);
	const [previous, setPrevious] = useState<string | null>(null);
	const [view, setView] = useState<"changes" | "full">("changes");
	const [naming, setNaming] = useState(false);
	const [copied, setCopied] = useState(false);
	const [previewFailed, setPreviewFailed] = useState(false);
	const [previewTry, setPreviewTry] = useState(0);
	const [restoring, setRestoring] = useState(false);
	const [restoreError, setRestoreError] = useState<string | null>(null);
	const fetchPage = useCallback(async (before: number | null) => {
		const query = before === null ? "" : `?before=${before}`;
		const response = await fetch(`/api/library/pages/${encodeURIComponent(id)}/versions${query}`, { cache: "no-store" });
		if (!response.ok) throw new Error(String(response.status));
		return await response.json() as { versions: PageVersion[]; more?: boolean };
	}, [id]);
	const load = useCallback(async () => {
		setFailed(false);
		try {
			const body = await fetchPage(null);
			setVersions(body.versions);
			setMore(!!body.more);
			setSelected((current) => current ?? body.versions[0]?.n ?? null);
		} catch {
			setFailed(true);
		}
	}, [fetchPage]);
	const loadEarlier = async () => {
		const oldest = versions?.at(-1)?.n;
		if (oldest === undefined) return;
		setEarlierFailed(false);
		setLoadingEarlier(true);
		try {
			const body = await fetchPage(oldest);
			setVersions((current) => [...(current ?? []), ...body.versions.filter((v) => v.n < oldest)]);
			setMore(!!body.more);
		} catch {
			setEarlierFailed(true);
		} finally {
			setLoadingEarlier(false);
		}
	};
	useEffect(() => { void load(); }, [load]);
	useEffect(() => {
		if (selected === null) return;
		let live = true;
		setContent(null);
		setPrevious(null);
		setPreviewFailed(false);
		setRestoreError(null);
		setNaming(false);
		setCopied(false);
		const text = (n: number) => fetch(`/api/library/pages/${encodeURIComponent(id)}/versions/${n}`, { cache: "no-store" })
			.then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
			.then((body: { content: string }) => body.content);
		void Promise.all([text(selected), selected > 1 ? text(selected - 1) : Promise.resolve(null)])
			.then(([current, before]) => { if (live) { setContent(current); setPrevious(before); } })
			.catch(() => { if (live) setPreviewFailed(true); });
		return () => { live = false; };
	}, [id, selected, previewTry]);

	if (failed) {
		return (
			<div role="status" className="flex flex-wrap items-center gap-2 px-3 text-sm text-ink-2">
				<p>The history could not be loaded.</p>
				<button type="button" className="prompt-secondary" onClick={() => void load()}>Try again</button>
			</div>
		);
	}
	if (!versions) {
		return (
			<div role="status" aria-label="Loading history" className="flex flex-col gap-1 px-3">
				<Skeleton className="h-9 w-full rounded-md" />
				<Skeleton className="h-9 w-full rounded-md" />
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3" data-testid="page-history">
			<ul className="flex shrink-0 flex-col gap-0.5">
				{versions.map((version) => (
					<li key={version.n}>
						<button
							type="button"
							aria-current={selected === version.n ? "true" : undefined}
							onClick={() => setSelected(version.n)}
							suppressHydrationWarning
							className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-accent pointer-coarse:min-h-11", selected === version.n && "bg-accent text-foreground")}
						>{versionLabel(version)}</button>
					</li>
				))}
			</ul>
			{more && (
				<button type="button" className="prompt-secondary w-fit" disabled={loadingEarlier} onClick={() => void loadEarlier()} data-testid="page-history-earlier">Show earlier versions</button>
			)}
			{earlierFailed && (
				<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
					<p>The history could not be loaded.</p>
					<button type="button" className="prompt-secondary" onClick={() => void loadEarlier()}>Try again</button>
				</div>
			)}
			{selected !== null && (
				previewFailed ? (
					<div role="status" className="flex flex-wrap items-center gap-2 text-sm text-ink-2" data-testid="page-version-failed">
						<p>Version {selected} could not be loaded.</p>
						<button type="button" className="prompt-secondary" onClick={() => setPreviewTry((n) => n + 1)}>Try again</button>
					</div>
				) : (
					<>
						<Button
							type="button"
							disabled={!canRestore || restoring || content === null}
							className="w-fit bg-accent text-foreground hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:h-11"
							data-testid="page-restore"
							onClick={() => {
								setRestoring(true);
								setRestoreError(null);
								void onRestore(selected).then(setRestoreError, () => setRestoreError(`Version ${selected} could not be restored. Your text is kept.`)).finally(() => setRestoring(false));
							}}
						>Restore this version</Button>
						{restoreError && <p role="alert" className="text-sm text-destructive" data-testid="page-restore-error">{restoreError}</p>}
						<div className="flex flex-wrap items-center gap-2">
							<button type="button" className="prompt-secondary" disabled={content === null} data-testid="page-copy-version" onClick={() => {
								if (content === null) return;
								void navigator.clipboard.writeText(content).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }, () => {});
							}}>{copied ? "Copied" : "Copy this version"}</button>
							<button type="button" className="prompt-secondary" aria-expanded={naming} onClick={() => setNaming((open) => !open)} data-testid="page-name-version">
								{versions.find((v) => v.n === selected)?.name ? "Rename" : "Name this version"}
							</button>
							<span className="min-w-0 flex-1" />
							<div role="group" aria-label="View" className="flex gap-1">
								<button type="button" aria-pressed={view === "changes"} onClick={() => setView("changes")} className="h-8 rounded-[6px] px-2 text-sm text-ink-2 hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground pointer-coarse:min-h-11" data-testid="page-view-changes">Changes</button>
								<button type="button" aria-pressed={view === "full"} onClick={() => setView("full")} className="h-8 rounded-[6px] px-2 text-sm text-ink-2 hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground pointer-coarse:min-h-11" data-testid="page-view-full">Full text</button>
							</div>
						</div>
						{naming && (() => {
							const version = versions.find((v) => v.n === selected);
							return version ? (
								<NameField key={version.n} id={id} version={version} onNamed={(next) => {
									setVersions((list) => list?.map((v) => (v.n === next.n ? next : v)) ?? list);
									setNaming(false);
								}} />
							) : null;
						})()}
						{content === null ? <Skeleton className="h-24 w-full rounded-[10px]" /> : view === "changes" ? <VersionChanges n={selected} before={previous} after={content} /> : <PagePreview content={content} />}
					</>
				)
			)}
		</div>
	);
}
