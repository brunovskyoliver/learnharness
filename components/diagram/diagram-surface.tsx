"use client";

/** A diagram in the right pane, in its tab, and full screen (feature 022). It keeps
 *  the page's own draft controller for autosave and conflicts, and adds what a
 *  diagram needs. This file holds no React Flow: the canvas loads when it first shows. */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, HistoryIcon, Link2Icon, ListTreeIcon, Maximize2Icon, Minimize2Icon, SparklesIcon } from "lucide-react";
import { ChatActionsContext } from "@/components/chat-actions-context.ts";
import { PaneHeader, PageName, SaveState, usePhoneLayer, focusTranscript, EditorLoading } from "@/components/library/page-pane";
import type { PagePaneApi, PaneItem } from "@/components/library/page-pane-context";
import { jumpToSource } from "@/components/library/use-note-links.ts";
import { usePageDraft } from "@/components/library/use-page-draft";
import { useServerEvent } from "@/components/server-events";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NoteConnectionsPanel } from "@/components/workspace/note-connections";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { WorkspacePane } from "@/components/workspace-pane";
import { parseDiagram, serializeDiagram, type DiagramDoc, type LibraryItem, type LibraryKind, type NoteLinkRow } from "@/src/core";
import { fetchDiagramApi } from "./diagram-api.ts";
import { DiagramEditor, type DiagramEditorHandle } from "./diagram-editor.tsx";
import { exportDiagram, type DiagramExportFormat } from "./diagram-export.ts";
import { DiagramVersions } from "./diagram-versions.tsx";

const ProposalDialog = dynamic(() => import("./diagram-proposal-dialog.tsx").then((m) => m.DiagramProposalDialog), { ssr: false });

const EXPORT_ROW = "flex min-h-9 w-full items-center rounded-[6px] px-2 text-left text-sm text-foreground hover:bg-card pointer-coarse:min-h-11";
const HEADER_TOOL = "shrink-0 aria-pressed:bg-accent aria-pressed:text-foreground pointer-coarse:h-11 pointer-coarse:min-w-11";

export function DiagramSurface({ item, pane, phone }: { item: PaneItem; pane: PagePaneApi; phone: boolean }) {
	const [refusedMessage, setRefusedMessage] = useState<string | null>(null);
	const [api] = useState(() => fetchDiagramApi(setRefusedMessage));
	const { controller, state, loadFailed, retryLoad } = usePageDraft(item.id, api);
	const root = useRef<HTMLElement | null>(null);
	const editor = useRef<DiagramEditorHandle>(null);
	const [fullScreen, setFullScreen] = useState(false);
	usePhoneLayer(phone || fullScreen, root);
	// A pointer click may leave focus nowhere, so Escape listens on the document while
	// full screen, after anything inner had its turn. Focus stays on the toggle both ways.
	const focusToggle = () => root.current?.querySelector<HTMLElement>('[data-testid="diagram-full-screen"]')?.focus();
	const wasFull = useRef(false);
	useEffect(() => {
		if (fullScreen || wasFull.current) focusToggle();
		wasFull.current = fullScreen;
		if (!fullScreen) return;
		const leave = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[data-slot="dialog-content"], [data-radix-popper-content-wrapper]')) return;
			setFullScreen(false);
		};
		document.addEventListener("keydown", leave);
		return () => document.removeEventListener("keydown", leave);
	}, [fullScreen]);
	const [history, setHistory] = useState(!!item.history);
	useEffect(() => { if (item.history) setHistory(true); }, [item.history, pane.openCount]);
	const [outline, setOutline] = useState(false);
	const [links, setLinks] = useState(false);
	const [linkWhole, setLinkWhole] = useState(false);
	const [exportOpen, setExportOpen] = useState(false);
	const [exportLine, setExportLine] = useState<string | null>(null);
	const [dangling, setDangling] = useState<string | null>(null);
	const [wide, setWide] = useState(false);
	useEffect(() => {
		const el = root.current;
		if (!el || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => setWide((entry?.contentRect.width ?? 0) >= 720));
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// The document on screen, parsed once per replacement from outside.
	const parsed = useMemo(() => (state.loaded ? parseDiagram(state.text) : null), [state.loaded, state.loadKey]);
	const currentDoc = (): DiagramDoc | null => {
		const now = parseDiagram(controller.state.text);
		return now.ok ? now.doc : null;
	};
	const save = () => { void controller.commit("save"); };

	// Proposals waiting on this diagram.
	const [proposals, setProposals] = useState<{ id: string; summary: string }[]>([]);
	const [reviewing, setReviewing] = useState<string | null>(null);
	const refreshProposals = useMemo(() => async () => {
		try {
			const response = await fetch(`/api/library/diagram-proposals?diagram=${encodeURIComponent(item.id)}`, { cache: "no-store" });
			if (response.ok) setProposals((await response.json() as { proposals: { id: string; summary: string }[] }).proposals);
		} catch { /* the next event heals it; the transcript and Library still list it */ }
	}, [item.id]);
	useEffect(() => { void refreshProposals(); }, [refreshProposals]);
	useServerEvent("library-changed", (event) => { if (event.itemId === item.id) void refreshProposals(); });

	const workspace = useWorkspace();
	const router = useRouter();
	const chat = useContext(ChatActionsContext);
	const close = () => {
		setFullScreen(false);
		pane.close();
	};
	const openItem = (next: { id: string; name: string; kind: LibraryKind; size: number }) => {
		if (workspace) workspace.openItem(next);
		else pane.open(next);
	};
	const followLink = (row: NoteLinkRow) => {
		const { resolution } = row;
		if (resolution.state === "live" && resolution.id && resolution.name && resolution.kind) {
			openItem({ id: resolution.id, name: resolution.name, kind: resolution.kind, size: resolution.size ?? 0 });
			return;
		}
		setDangling(resolution.state === "deleted" ? `${row.target} was deleted from your Library. The link is kept.` : `Nothing in your Library is called ${row.target} yet.`);
	};
	const followSource = (href: string) => {
		setFullScreen(false);
		if (phone) close();
		jumpToSource(href, router.push);
	};

	// Asks through the composer and sends nothing: a model call is his own act.
	const askTutor = async () => {
		await controller.commit("save");
		const message = `@${item.name} Propose changes to this diagram: `;
		setFullScreen(false);
		if (chat) {
			chat.fillComposer(message);
			if (phone) close();
			return;
		}
		router.push(`/chat/new?draft=${encodeURIComponent(message)}`);
	};

	const download = async (format: DiagramExportFormat) => {
		setExportOpen(false);
		setExportLine(null);
		const doc = currentDoc();
		try {
			if (!doc) throw new Error("no document");
			await exportDiagram(doc, item.name, format);
		} catch {
			setExportLine(`The ${format.toUpperCase()} could not be made. Your diagram is unchanged.`);
		}
	};

	const restore = async (n: number): Promise<string | null> => {
		const outcome = await controller.restore(n);
		if (outcome === "restored") { setHistory(false); return null; }
		if (outcome === "not-saved") return `Your changes could not be saved, so version ${n} was not restored.`;
		return `Version ${n} could not be restored. Your diagram is kept.`;
	};

	useEffect(() => {
		if (state.agentUpdate === null) return;
		const timer = window.setTimeout(() => controller.seenAgentUpdate(), 4000);
		return () => window.clearTimeout(timer);
	}, [state.agentUpdate, controller]);

	const paneLabel = wide ? "max-md:sr-only" : "sr-only";
	const usable = state.loaded && !state.deleted && !refusedMessage && parsed?.ok;
	const unreadable = refusedMessage ?? (parsed && !parsed.ok ? parsed.message : null);
	const connections = links && !history && !state.deleted ? (
		<NoteConnectionsPanel
			pageId={item.id}
			subject="diagram"
			onOpenPage={(id, name, kind) => openItem({ id, name, kind: kind ?? "page", size: 0 })}
			onFollowLink={followLink}
			onSource={followSource}
			className={wide ? "w-64 shrink-0 overflow-y-auto pr-3 pb-6" : "mx-3 mb-2 max-h-[40dvh] shrink-0 overflow-y-auto rounded-[10px] bg-popover p-2"}
		/>
	) : null;

	const [jumpMissed, setJumpMissed] = useState(false);
	const jumpTarget = item.jump;
	const jumpNonce = jumpTarget?.nonce;
	useEffect(() => {
		if (!jumpTarget || !usable) return;
		const timer = window.setTimeout(() => setJumpMissed(!(editor.current?.jumpTo(jumpTarget.quote ?? "", jumpTarget.terms ?? []) ?? false)), 100);
		return () => window.clearTimeout(timer);
	}, [jumpNonce, usable]);

	return (
		<WorkspacePane
			label={`Diagram ${item.name}`}
			resizeLabel="Resize page panel"
			testId="page-pane"
			className={`page-workspace ${fullScreen ? "lh-diagram-full" : ""}`}
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
				if (fullScreen) setFullScreen(false);
				else if (phone) close();
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
						status={usable ? <SaveState state={state} canRetry={!state.conflict} failedLabel="Not saved. Your diagram is kept in this browser." onRetry={() => void controller.retry()} /> : undefined}
						actions={usable ? (
							<div className="flex shrink-0 flex-wrap items-center" data-testid="diagram-header-tools">
								<Button type="button" variant="ghost" aria-pressed={outline} className={HEADER_TOOL} data-testid="diagram-outline-toggle" onClick={() => setOutline((open) => !open)}><ListTreeIcon className="ui-icon" aria-hidden="true" /><span className={paneLabel}>Outline</span></Button>
								<Button type="button" variant="ghost" aria-pressed={links} className={HEADER_TOOL} data-testid="page-links-toggle" onClick={() => setLinks((open) => !open)}><Link2Icon className="ui-icon" aria-hidden="true" /><span className={paneLabel}>Links</span></Button>
								<Popover open={exportOpen} onOpenChange={setExportOpen}>
									<PopoverTrigger asChild>
										<Button type="button" variant="ghost" className={HEADER_TOOL} data-testid="diagram-export"><DownloadIcon className="ui-icon" aria-hidden="true" /><span className={paneLabel}>Export</span></Button>
									</PopoverTrigger>
									<PopoverContent container={root.current} align="end" className="flex w-56 flex-col gap-0.5 rounded-[10px] border-0 p-1" data-testid="diagram-export-menu">
										<button type="button" className={EXPORT_ROW} data-testid="diagram-export-svg" onClick={() => void download("svg")}>Download SVG</button>
										<button type="button" className={EXPORT_ROW} data-testid="diagram-export-png" onClick={() => void download("png")}>Download PNG</button>
										<button type="button" className={EXPORT_ROW} data-testid="diagram-export-json" onClick={() => void download("json")}>Download JSON</button>
									</PopoverContent>
								</Popover>
								<Button type="button" variant="ghost" aria-pressed={history} className={HEADER_TOOL} data-testid="diagram-history-toggle" onClick={() => setHistory((open) => !open)}><HistoryIcon className="ui-icon" aria-hidden="true" /><span className={paneLabel}>History</span></Button>
								<Button type="button" variant="ghost" className={HEADER_TOOL} data-testid="diagram-ask-tutor" onClick={() => void askTutor()}><SparklesIcon className="ui-icon" aria-hidden="true" /><span className={paneLabel}>Ask the tutor</span></Button>
								{!phone && <Button type="button" variant="ghost" aria-pressed={fullScreen} className={HEADER_TOOL} data-testid="diagram-full-screen" onClick={() => setFullScreen((on) => !on)}>{fullScreen ? <Minimize2Icon className="ui-icon" aria-hidden="true" /> : <Maximize2Icon className="ui-icon" aria-hidden="true" />}<span className="sr-only">Full screen</span></Button>}
							</div>
						) : undefined}
					/>
					<p role="status" aria-live="polite" className="px-3 text-sm text-ink-2 empty:hidden" data-testid="page-agent-update">
						{state.agentUpdate !== null ? `Updated from the tutor's proposal · version ${state.agentUpdate}` : ""}
					</p>
					{exportLine && <p role="alert" className="px-3 pb-2 text-sm text-destructive" data-testid="diagram-export-failed">{exportLine}</p>}
					{jumpMissed && <p role="status" className="px-3 pb-2 text-sm text-ink-2">Those words are no longer in this diagram.</p>}
					{dangling && (
						<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-ink-2" data-testid="diagram-link-dangling-line">
							<p className="min-w-0 flex-[1_1_12rem] [overflow-wrap:anywhere]">{dangling}</p>
							<button type="button" className="prompt-secondary" onClick={() => setDangling(null)}>Dismiss</button>
						</div>
					)}
					{proposals.length > 0 && usable && (
						<div role="status" className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-[10px] bg-card px-3 py-2 text-sm" data-testid="diagram-proposal-bar">
							<p className="min-w-0 flex-[1_1_12rem] text-foreground">The tutor proposed {proposals.length === 1 ? "a change" : `${proposals.length} changes`}. Nothing has changed.</p>
							<button type="button" className="prompt-secondary" data-testid="diagram-proposal-review" onClick={() => setReviewing(proposals[0]!.id)}>Review</button>
						</div>
					)}
					{state.deleted && <p role="status" className="px-3 pb-2 text-sm text-ink-2" data-testid="page-deleted">{item.name} was deleted.</p>}
					{state.conflict && (
						<div role="status" className="flex flex-wrap items-center gap-2 px-3 pb-2 text-sm text-ink-2" data-testid="page-conflict">
							<p>This diagram changed elsewhere. Your version is safe here.</p>
							<button type="button" className="prompt-secondary" onClick={() => void controller.keepMine()} data-testid="page-keep-mine">Keep mine</button>
							<button type="button" className="prompt-secondary" onClick={() => void controller.useLatest()} data-testid="page-use-latest">Use latest</button>
						</div>
					)}
					{links && usable && !history && (
						<div className="px-3 py-2"><button type="button" className="prompt-secondary" data-testid="diagram-link-whole" onClick={() => setLinkWhole(true)}>Link the whole diagram</button></div>
					)}
					<div className={`flex min-h-0 flex-1 ${links && wide && !history ? "flex-row gap-4" : "flex-col"} ${dragging ? "pointer-events-none" : ""}`}>
						{!wide && connections}
						<div className="flex min-h-0 min-w-0 flex-1 flex-col">
							{unreadable ? (
								<p role="status" className="px-3 text-sm text-ink-2" data-testid="diagram-refused">{unreadable}</p>
							) : loadFailed ? (
								<div role="status" className="flex flex-wrap items-center gap-2 px-3 text-sm text-ink-2">
									<p>{item.name} could not be loaded.</p>
									<button type="button" className="prompt-secondary" onClick={retryLoad}>Try again</button>
								</div>
							) : !state.loaded || !parsed?.ok ? (
								<EditorLoading />
							) : history && !state.deleted ? (
								<DiagramVersions id={item.id} name={item.name} canRestore={!state.conflict} onRestore={restore} />
							) : (
								<DiagramEditor
									doc={parsed.doc}
									resetKey={state.loadKey}
									name={item.name}
									readOnly={state.deleted}
									showOutline={outline}
									handle={editor}
									linkDiagramOpen={linkWhole}
									onLinkDiagramClose={() => setLinkWhole(false)}
									onChange={(doc) => controller.edit(serializeDiagram(doc))}
								/>
							)}
						</div>
						{wide && connections}
					</div>
					{reviewing && (
						<ProposalDialog
							proposalId={reviewing}
							onClose={() => { setReviewing(null); void refreshProposals(); }}
							beforeApprove={() => controller.commit("save")}
							onApproved={(_item: LibraryItem) => { void controller.remoteChanged(); }}
						/>
					)}
				</>
			)}
		</WorkspacePane>
	);
}
