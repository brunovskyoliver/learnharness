"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftIcon, HistoryIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspacePane } from "@/components/workspace-pane";
import { isUnsent, SAVE_STATE_LABEL, type PageDraftState } from "./page-draft.ts";
import type { PageEditorHandle } from "./page-editor.tsx";
import { PageHistory } from "./page-history.tsx";
import type { PagePaneApi, PaneItem } from "./page-pane-context.tsx";
import { ReadOnlyView } from "./read-only-view.tsx";
import { usePageDraft } from "./use-page-draft.ts";

const PageEditor = dynamic(() => import("./page-editor.tsx").then((m) => m.PageEditor), {
	ssr: false,
	loading: () => <EditorLoading />,
});

const PHONE_QUERY = "(max-width: 767.98px)";
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
const AGENT_UPDATE_MS = 4000;

function EditorLoading() {
	return (
		<div role="status" aria-label="Loading the page" className="flex flex-col gap-2 px-3 py-2">
			<Skeleton className="h-5 w-2/3 rounded-md" />
			<Skeleton className="h-5 w-full rounded-md" />
			<Skeleton className="h-5 w-5/6 rounded-md" />
		</div>
	);
}

function usePhone(): boolean {
	const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
	useEffect(() => {
		const query = window.matchMedia(PHONE_QUERY);
		const onChange = () => setPhone(query.matches);
		query.addEventListener("change", onChange);
		return () => query.removeEventListener("change", onChange);
	}, []);
	return phone;
}

/** On phones the layer follows the visual viewport, so the keyboard never covers
 *  the caret, and focus stays inside it. */
function usePhoneLayer(active: boolean, root: React.RefObject<HTMLElement | null>) {
	useEffect(() => {
		if (!active) return;
		const opener = document.activeElement as HTMLElement | null;
		const view = window.visualViewport;
		const fit = () => root.current?.style.setProperty("--lh-page-vh", `${view?.height ?? window.innerHeight}px`);
		fit();
		view?.addEventListener("resize", fit);
		root.current?.querySelector<HTMLElement>('[data-testid="page-back"]')?.focus();
		const contain = (event: KeyboardEvent) => {
			if (event.key !== "Tab" || !root.current) return;
			const focusable = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
			if (focusable.length === 0) return;
			const first = focusable[0]!, last = focusable.at(-1)!;
			const inside = root.current.contains(document.activeElement);
			if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
		};
		document.addEventListener("keydown", contain);
		return () => {
			view?.removeEventListener("resize", fit);
			document.removeEventListener("keydown", contain);
			if (opener?.isConnected) opener.focus();
		};
	}, [active, root]);
}

/** Desktop Escape: back to what the learner was reading. */
function focusTranscript() {
	const target = document.querySelector<HTMLElement>('[data-chat-id] [role="log"], [data-testid="library-search"]');
	if (!target) return;
	if (target.getAttribute("role") === "log" && !target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
	target.focus();
}

export function SaveState({ state, onRetry, canRetry = true }: { state: Pick<PageDraftState, "status">; onRetry: () => void; canRetry?: boolean }) {
	return (
		<span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-muted-foreground" data-testid="page-save-state">
			{SAVE_STATE_LABEL[state.status]}
			{state.status === "failed" && canRetry && <button type="button" className="prompt-secondary" onClick={onRetry} data-testid="page-retry">Try again</button>}
		</span>
	);
}

export function ConflictLine({ onKeepMine, onUseLatest }: { onKeepMine: () => void; onUseLatest: () => void }) {
	return (
		<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-ink-2" data-testid="page-conflict">
			<p>This page changed elsewhere. Your text is safe here.</p>
			<button type="button" className="prompt-secondary" onClick={onKeepMine} data-testid="page-keep-mine">Keep mine</button>
			<button type="button" className="prompt-secondary" onClick={onUseLatest} data-testid="page-use-latest">Use latest</button>
		</div>
	);
}

/** The page left the Library while open: say so, and let unsaved text be copied out. */
export function DeletedLine({ name, text }: { name: string; text: string | null }) {
	const [copied, setCopied] = useState(false);
	return (
		<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-ink-2" data-testid="page-deleted">
			<p>{name} was deleted.</p>
			{text !== null && (
				<button
					type="button"
					className="prompt-secondary"
					data-testid="page-copy-text"
					onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true), () => {})}
				>{copied ? "Copied" : "Copy text"}</button>
			)}
		</div>
	);
}

function PageName({ item, pane }: { item: PaneItem; pane: PagePaneApi }) {
	const [renaming, setRenaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const commit = async (raw: string) => {
		const name = raw.trim();
		if (!name || name === item.name) { setRenaming(false); setError(null); return; }
		try {
			const response = await fetch(`/api/library/items/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
			if (!response.ok) {
				const body = await response.json().catch(() => ({})) as { error?: string };
				setError(body.error ?? `${item.name} could not be renamed.`);
				return;
			}
			pane.update({ ...item, name });
			setRenaming(false);
			setError(null);
		} catch {
			setError(`${item.name} could not be renamed. Check your connection and try again.`);
		}
	};
	if (!renaming) {
		return <button type="button" aria-label={`Rename ${item.name}`} data-testid="page-name" className="min-w-0 truncate rounded-md text-left text-base font-medium hover:bg-accent pointer-coarse:min-h-11" onClick={() => setRenaming(true)}>{item.name}</button>;
	}
	return (
		<span className="flex min-w-0 flex-col">
			<input
				autoFocus
				defaultValue={item.name}
				aria-label={`Rename ${item.name}`}
				aria-invalid={error ? true : undefined}
				autoComplete="off"
				spellCheck={false}
				data-testid="page-name-input"
				onFocus={(event) => event.currentTarget.select()}
				onBlur={(event) => void commit(event.currentTarget.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") { event.preventDefault(); void commit(event.currentTarget.value); }
					if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenaming(false); setError(null); }
				}}
				className="h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-base text-foreground pointer-coarse:h-11"
			/>
			{error && <span role="alert" className="text-sm text-destructive">{error}</span>}
		</span>
	);
}

/** The header, pure for render tests. */
export function PaneHeader({ phone, name, status, actions, onClose, closeLabel }: { phone: boolean; name: ReactNode; status?: ReactNode; actions?: ReactNode; onClose: () => void; closeLabel: string }) {
	return (
		<div className="flex min-h-13 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1">
			{phone && (
				<Button type="button" variant="ghost" className="-ml-2 shrink-0 pointer-coarse:h-11" onClick={onClose} data-testid="page-back">
					<ArrowLeftIcon className="ui-icon" aria-hidden="true" />
					Back to chat
				</Button>
			)}
			<div className="flex min-w-0 flex-1 flex-col">
				{name}
				{status}
			</div>
			{actions}
			{!phone && (
				<button type="button" aria-label={closeLabel} onClick={onClose} data-testid="page-close" className="ui-icon-button text-muted-foreground hover:bg-accent hover:text-foreground">
					<XIcon className="ui-icon" />
				</button>
			)}
		</div>
	);
}

function PageSurface({ item, pane, phone }: { item: PaneItem; pane: PagePaneApi; phone: boolean }) {
	const { controller, state, loadFailed, retryLoad, flush } = usePageDraft(item.id);
	const [history, setHistory] = useState(!!item.history);
	useEffect(() => { if (item.history) setHistory(true); }, [item.history, pane.openCount]);
	const editor = useRef<PageEditorHandle>(null);
	flush.current = () => editor.current?.flush();
	const root = useRef<HTMLElement | null>(null);
	usePhoneLayer(phone, root);

	useEffect(() => {
		if (state.agentUpdate === null) return;
		const timer = window.setTimeout(() => controller.seenAgentUpdate(), AGENT_UPDATE_MS);
		return () => window.clearTimeout(timer);
	}, [state.agentUpdate, controller]);

	const save = () => {
		editor.current?.flush();
		void controller.commit("save");
	};
	const close = () => {
		editor.current?.flush();
		pane.close();
	};
	const restore = async (n: number): Promise<string | null> => {
		editor.current?.flush();
		const outcome = await controller.restore(n);
		if (outcome === "restored") { setHistory(false); return null; }
		if (outcome === "not-saved") return `Your text could not be saved, so version ${n} was not restored.`;
		if (outcome === "failed") return `Version ${n} could not be restored. Your text is kept.`;
		return null;
	};

	return (
		<WorkspacePane
			label={`Page ${item.name}`}
			resizeLabel="Resize page panel"
			testId="page-pane"
			className="page-workspace"
			rootRef={root}
			onKeyDownCapture={(event) => {
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
					event.preventDefault();
					event.stopPropagation();
					save();
				}
			}}
			onKeyDown={(event) => {
				if (event.key !== "Escape" || !event.currentTarget.contains(event.target as Node)) return;
				event.preventDefault();
				event.stopPropagation();
				if (phone) close();
				else focusTranscript();
			}}
		>
			{(dragging) => (
				<>
					<PaneHeader
						phone={phone}
						closeLabel={`Close ${item.name}`}
						onClose={close}
						name={<PageName item={item} pane={pane} />}
						status={state.loaded && !state.deleted ? <SaveState state={state} canRetry={!state.conflict} onRetry={() => void controller.retry()} /> : undefined}
						actions={state.deleted ? undefined : (
							<Button type="button" variant="ghost" aria-pressed={history} className="shrink-0 pointer-coarse:h-11" onClick={() => setHistory((open) => !open)} data-testid="page-history-toggle">
								<HistoryIcon className="ui-icon" aria-hidden="true" />
								History
							</Button>
						)}
					/>
					{state.deleted && <DeletedLine name={item.name} text={isUnsent(state) ? state.text : null} />}
					{state.conflict && <ConflictLine onKeepMine={() => void controller.keepMine()} onUseLatest={() => void controller.useLatest()} />}
					<p role="status" aria-live="polite" className="px-3 text-sm text-ink-2 empty:hidden" data-testid="page-agent-update">
						{state.agentUpdate !== null ? `Updated by the agent · version ${state.agentUpdate}` : ""}
					</p>
					<div className={`flex min-h-0 flex-1 flex-col ${dragging ? "pointer-events-none" : ""}`}>
						{loadFailed ? (
							<div role="status" className="flex flex-wrap items-center gap-2 px-3 text-sm text-ink-2">
								<p>{item.name} could not be loaded.</p>
								<button type="button" className="prompt-secondary" onClick={retryLoad}>Try again</button>
							</div>
						) : !state.loaded ? (
							<EditorLoading />
						) : history && !state.deleted ? (
							<PageHistory id={item.id} onRestore={restore} canRestore={!state.conflict} />
						) : (
							<PageEditor
								key={`${state.loadKey}${state.deleted ? "-deleted" : ""}`}
								handle={editor}
								readOnly={state.deleted}
								value={state.text}
								ariaLabel={`Page ${item.name}`}
								onChange={(text) => controller.edit(text)}
								onSaveShortcut={save}
							/>
						)}
					</div>
				</>
			)}
		</WorkspacePane>
	);
}

function ReadOnlySurface({ item, pane, phone }: { item: PaneItem; pane: PagePaneApi; phone: boolean }) {
	const root = useRef<HTMLElement | null>(null);
	usePhoneLayer(phone, root);
	return (
		<WorkspacePane
			label={item.name}
			resizeLabel="Resize page panel"
			testId="page-pane"
			className="page-workspace"
			rootRef={root}
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				if (phone) pane.close();
				else focusTranscript();
			}}
		>
			{() => (
				<>
					<PaneHeader phone={phone} closeLabel={`Close ${item.name}`} onClose={pane.close} name={<span className="min-w-0 truncate text-base font-medium">{item.name}</span>} />
					<ReadOnlyView item={item} />
				</>
			)}
		</WorkspacePane>
	);
}

/** A page or a read-only original, beside the chat or the Library list. */
export function PagePane({ item, pane }: { item: PaneItem; pane: PagePaneApi }) {
	const phone = usePhone();
	return item.kind === "page"
		? <PageSurface item={item} pane={pane} phone={phone} />
		: <ReadOnlySurface item={item} pane={pane} phone={phone} />;
}
