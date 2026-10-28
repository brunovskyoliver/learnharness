"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpenIcon, DumbbellIcon, Maximize2Icon, UploadIcon } from "lucide-react";
import dynamic from "next/dynamic";

// This is the initial view; its canvas/layout engines remain conditional imports.
import { GraphView, graphStatsLabel, type GraphStats } from "@/components/graph-view";
const MinimalHome = dynamic(() => import("@/components/minimal-home").then((module) => module.MinimalHome));
import { LazySetupDialog as SetupDialog } from "@/components/lazy-setup-dialog";
import { ComposerActions, NodePickerControl } from "@/components/composer-actions";
import { SetupModelsButton, useStrongKeyless, useZeroKeys, ZeroKeysPill } from "@/components/setup-cta";
import { useFieldCycle } from "@/components/field-cycle";
import { SidebarToggle } from "@/components/sidebar";
import { StatsBar } from "@/components/stats-bar";
import { Composer } from "@/components/composer";
import { useReloadDraft } from "@/components/reload-recovery";
import { WaitingSection } from "@/components/waiting-section";
import { CalibrationSection } from "@/components/calibration-section";
import { OverlayHostContext } from "@/components/overlay-host";
import { NotesImportErrors, useNotesImport } from "@/components/notes-import.tsx";
import { useActivity } from "@/components/activity-dock";
import type { GraphSnapshot } from "@/src/core";

/**
 * Home leads with what's waiting (feature 002): one scrolling column —
 * the topic composer, "Waiting for you", then the knowledge graph as a
 * section at a fixed height (Expand for full screen). Sessions live in the
 * toggleable sidebar.
 */
export function Home({
	initialConfigured,
	rendering = true,
	initialGraph,
}: {
	initialConfigured: boolean;
	initialGraph?: GraphSnapshot;
	/** GRAPH RENDERING off (owner, 2026-10-06): the home's main view is
	 * the chains view, not the canvas. Read server-side per navigation —
	 * changing the setting applies on the next visit home. */
	rendering?: boolean;
}) {
	const router = useRouter();
	const [topic, setTopic] = useState("");
	/* The topic MIRROR ("nothing gets lost" round, 2026-10-01 — same
	 * mechanics as the chat composer, owner's consistency ruling): a
	 * dictation flush lands via setState, invisible to a closure that
	 * waited through `await finish()`. Kept current at every write. */
	const topicRef = useRef("");
	// First-run gate (model-slots wave, owner 2026-09-20): chats cannot
	// start until the user has picked all three slots — no defaults for
	// 33 providers. The dock shows the CTA while unconfigured; submitting
	// a topic opens the setup dialog WITH THE DRAFT PRESERVED (Save
	// stores the slots and the queued message sends).
	const [configured, setConfigured] = useState(initialConfigured);
	// The zero-keys truth (zero-keys wave): no provider key = the pill
	// takes precedence over the models CTA (keys come first in the chain).
	const zeroKeys = useZeroKeys();
	// The strong slot's keyless truth (pre-send key guards, owner interlude
	// 2026-09-25): keys may exist generally while the STRONG slot's pinned
	// provider has none — the same skip-everything treatment on send.
	const strongKeyless = useStrongKeyless();
	const [setupOpen, setSetupOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const topicInputRef = useRef<HTMLTextAreaElement>(null);
	// The topic field is the only textarea in the home keyboard cycle.
	const cycleTopicField = useCallback(
		(): readonly HTMLElement[] => (topicInputRef.current ? [topicInputRef.current] : []),
		[],
	);
	useFieldCycle(cycleTopicField);

	/* PRACTICE MODE (owner, 2026-10-04): the graph composer's teach |
	 *  practice switch — practice creates a kind:"practice" session and
	 *  may carry proposition picks from the chain table (the chip above
	 *  the composer opens the picker; the picks seed the opening prompt).
	 *  Not enforcing any input format — the picks are a convenience. */
	const [mode, setMode] = useState<"teach" | "practice">("teach");
	const [practiceProps, setPracticeProps] = useState<{ id: string; name: string; statement: string }[]>([]);
	const [chainSelectOpen, setChainSelectOpen] = useState(false);
	useReloadDraft(() => ({ kind: "home", text: topicRef.current, mode, picks: practiceProps }), (record) => {
		if (record.draft?.kind !== "home") return;
		topicRef.current = record.draft.text;
		setTopic(record.draft.text);
		setMode(record.draft.mode);
		setPracticeProps(record.draft.picks);
		if (record.overlay.kind === "chains" && record.overlay.selectMode) setChainSelectOpen(true);
	});
	// The chain table is CONTROLLED off this id set (the lifted pick).
	const pickedIds = useMemo(() => new Set(practiceProps.map((p) => p.id)), [practiceProps]);

	const start = () => void begin();
	const begin = async () => {
		const t = topicRef.current.trim();
		if (!t || busy) return;
		// Unconfigured: the send INTERCEPTS into the setup flow (the draft
		// stays in the textarea; the learner sends it after Save).
		if (!configured) {
			setSetupOpen(true);
			return;
		}
		// The pre-send KEY guards (owner interlude, no-orphan-chats): the
		// models case guards BEFORE creation; the key cases must too — a
		// refused first send would otherwise leave an orphan error-shell
		// chat in the sidebar (the 503 lands only after POST /api/chats
		// already created the record). Same skip-everything-and-open-setup
		// treatment; the server's 503 gate remains the belt for /chat/[id]
		// sessions.
		if (zeroKeys || strongKeyless) {
			setSetupOpen(true);
			return;
		}
		setBusy(true);
		try {
			// The map context (owner, 2026-10-04): picks in EITHER mode ride
			// the CREATION as graphContext — the server writes a
			// graph-context marker as message[0] (a separate custom message
			// before the learner's first user message, propositions + the
			// chains among them); the prompt stays the learner's own words.
			const res = await fetch("/api/chats", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: t,
					...(mode === "practice" ? { kind: "practice" } : {}),
					...(practiceProps.length > 0 ? { graphContext: { propositions: practiceProps } } : {}),
				}),
			});
			const { id } = (await res.json()) as { id: string };
			// No settings PUT on create (per-session models, owner
			// 2026-09-28): the SERVER stamps the newborn from the strong
			// slot — the same default this surface's model control edits.
			router.push(`/chat/${id}?prompt=${encodeURIComponent(t)}`);
		} catch {
			setBusy(false);
		}
	};

	const startId = useId();
	const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);

	return (
		<OverlayHostContext.Provider value={overlayHost}>
		<div className="group/home relative flex h-dvh flex-col">
			{/* Window-drag strip (merged chrome, owner 2026-09-17): a dedicated
			    mask element, deliberately FIRST in the DOM. Electron's app-region
			    mask resolves by DOM order — a no-drag element subtracts only drag
			    regions that came EARLIER in the tree — so every carved control
			    (the toggle, the graph chrome) comes later and subtracts. */}
			<div className="lh-drag absolute inset-x-0 top-0 h-13" aria-hidden="true" />

			<header className="relative z-30 flex h-13 shrink-0 items-center gap-3 px-3 max-sm:group-has-[[data-mobile-graph-search=true]]/home:invisible">
				<SidebarToggle />
			</header>

			{/* One page, one scroll (hidden tracks, globals.css). */}
			<div data-testid="home-scroll" className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-[52rem] flex-col gap-8 px-4 pb-12 pt-3 sm:gap-10 sm:pt-11">
					<section aria-labelledby={startId} className="flex flex-col gap-3 sm:gap-4">
						<h1 id={startId} className="font-title text-2xl font-medium leading-[1.2] tracking-[-0.3px]">What do you want to learn?</h1>
						<div>
							{/* The pick bar (owner vision, 2026-10-04): the chain
							    table's selection is PERSISTENT — picked
							    propositions show here as a count + Clear in EITHER
							    mode (it survives mode switches; only a practice
							    send consumes it). Practice mode with nothing picked
							    shows the pick HINT so the affordance is discoverable;
							    teaching mode with nothing picked renders nothing. */}
							<ComposerActions
								picker={(practiceProps.length > 0 || mode === "practice") && (
									<NodePickerControl
										count={practiceProps.length}
										onOpen={() => setChainSelectOpen(true)}
										onClear={() => setPracticeProps([])}
									/>
								)}
							/>
							<div className="prompt-shell">
								<Composer
									busy={false}
									value={topic}
									onChange={(value) => {
										topicRef.current = value;
										setTopic(value);
									}}
									onSend={() => { void start(); }}
									onStop={() => {}}
									canSend={Boolean(topic.trim()) && !busy}
									inputRef={topicInputRef}
									autoFocus
									sendLabel="Start session"
									accessibleName={mode === "practice" ? "What do you want to practice?" : "What do you want to learn?"}
									placeholder={mode === "practice" ? "What do you want to practice?" : "A topic, a question, or a chapter to work through"}
									controls={
										<StatsBar
											turns={[]}
											setup={zeroKeys ? (
												<ZeroKeysPill onOpen={() => setSetupOpen(true)} />
											) : !configured ? (
												<SetupModelsButton onOpen={() => setSetupOpen(true)} />
											) : undefined}
											leadingSlot={
												<div className="flex h-9 items-center gap-0.5 rounded-[8px] bg-background p-[3px]" data-testid="home-mode-switch">
													{(["teach", "practice"] as const).map((m) => (
														<button
															key={m}
															type="button"
															data-testid={`home-mode-${m}`}
															onClick={() => setMode(m)}
															aria-pressed={mode === m}
															className={
																"flex h-[30px] items-center gap-1.5 rounded-sm px-2 text-sm font-medium transition-colors sm:px-3 " +
																(mode === m
																	? "bg-accent text-foreground"
																	: "text-ink-2 hover:text-foreground")
															}
														>
															{/* Narrow screens: icons only (the sidebar's session
															    icons), so the switch fits the composer's one row. */}
															{m === "practice"
																? <DumbbellIcon aria-hidden="true" className="size-3.5" />
																: <BookOpenIcon aria-hidden="true" className="size-3.5" />}
															<span className="max-sm:sr-only">{m === "teach" ? "Teach" : "Practice"}</span>
														</button>
													))}
												</div>
											}
										/>
									}
								/>
							</div>
						</div>
					</section>

					<WaitingSection />
					<CalibrationSection />

					<GraphSection
						rendering={rendering}
						initialGraph={initialGraph}
						chainSelectOpen={chainSelectOpen}
						practiceSelection={pickedIds}
						onPracticeSelectionChange={setPracticeProps}
						onChainSelectClose={() => setChainSelectOpen(false)}
					/>
				</div>
			</div>

			{/* First-run setup (unconfigured): the CTA's target and the send
			    interception's landing surface — stage 1 is the self-contained
			    first-key screen (zero-keys wave); Save never sends — the
			    draft stays for the learner to send (owner 2026-10-09). */}
			<SetupDialog
				open={setupOpen}
				onClose={() => setSetupOpen(false)}
				onDone={() => {
					setConfigured(true);
					setSetupOpen(false);
					// Save only saves: the draft waits in the composer.
				}}
			/>

			{/* The overlay host (feature 002): the chain table covers the whole
			    Home content area (owner 2026-10-28). LAST CHILD, DELIBERATELY:
			    a surface covering the drag band must paint after everything it
			    covers (the DOM-order mask law). */}
			<div ref={setOverlayHost} />
		</div>
		</OverlayHostContext.Provider>
	);
}

/**
 * The "Knowledge graph" section (feature 002): header with counts, Import
 * notes and Expand; then the live graph at a fixed height — or, with graph
 * rendering off, the minimal summary in the same box.
 */
function GraphSection({
	rendering,
	initialGraph,
	chainSelectOpen,
	practiceSelection,
	onPracticeSelectionChange,
	onChainSelectClose,
}: {
	rendering: boolean;
	initialGraph?: GraphSnapshot;
	chainSelectOpen: boolean;
	practiceSelection: ReadonlySet<string>;
	onPracticeSelectionChange: (nodes: { id: string; name: string; statement: string }[]) => void;
	onChainSelectClose: () => void;
}) {
	const headingId = useId();
	const [stats, setStats] = useState<GraphStats | null>(() =>
		initialGraph ? { ideas: initialGraph.propositions.length, chains: initialGraph.chains.length } : null,
	);
	const statsLabel = graphStatsLabel(stats);
	const [expanded, setExpanded] = useState(false);
	const expandRef = useRef<HTMLButtonElement>(null);
	const collapse = useCallback(() => {
		setExpanded(false);
		requestAnimationFrame(() => expandRef.current?.focus());
	}, []);
	// Notes import (the format-agnostic front door): file picker → POST
	// /api/graph/import. The dock's start-site nudge (accuracy wave,
	// 2026-09-19): the POST awaits the WHOLE pipeline server-side, so nudge
	// the activity dock at click and again at +600ms to catch the start.
	const fileInputRef = useRef<HTMLInputElement>(null);
	const refreshActivity = useActivity().refresh;
	const [importRevision, setImportRevision] = useState(0);
	const notesImport = useNotesImport({
		onStart: () => {
			refreshActivity();
			setTimeout(() => refreshActivity(), 600);
		},
		// The minimal summary refetches; the live graph follows its pipeline runs.
		onFinish: () => setImportRevision((revision) => revision + 1),
	});
	const { importing, onImportFiles } = notesImport;

	return (
		<section aria-labelledby={headingId} data-testid="graph-section" className="flex flex-col gap-2.5 sm:gap-3">
			<div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-1 sm:gap-x-2.5">
				<h2 id={headingId} className="flex-1 whitespace-nowrap text-xl font-semibold leading-[1.3] sm:flex-none">Knowledge graph</h2>
				{statsLabel && <span data-testid="graph-stats" className="text-sm font-medium text-muted-foreground max-sm:hidden">{statsLabel}</span>}
				<span className="hidden flex-1 sm:block" aria-hidden="true" />
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept=".md,.markdown,.txt"
					className="hidden"
					onChange={(e) => {
						onImportFiles(e.target.files);
						e.target.value = ""; // allow re-picking the same file
					}}
				/>
				<button
					type="button"
					disabled={importing}
					onClick={() => fileInputRef.current?.click()}
					data-testid="import-notes"
					className="prompt-secondary ml-auto gap-2 disabled:cursor-default max-sm:px-2.5! sm:ml-0"
				>
					<UploadIcon aria-hidden="true" className="size-4" />
					{importing ? "Importing…" : "Import notes"}
				</button>
				{rendering && statsLabel && (
					<button
						ref={expandRef}
						type="button"
						onClick={() => setExpanded(true)}
						data-testid="graph-expand"
						className="prompt-secondary gap-2 max-sm:min-w-11 max-sm:justify-center max-sm:px-0!"
					>
						<Maximize2Icon aria-hidden="true" className="size-4" />
						<span className="max-sm:sr-only">Expand</span>
					</button>
				)}
			</div>
			{notesImport.errors.length > 0 && <div className="flex flex-col gap-1 px-1"><NotesImportErrors errors={notesImport.errors} /></div>}
			{rendering ? (
				<GraphView
					section={{ expanded, onCollapse: collapse }}
					onStats={setStats}
					initialSnapshot={initialGraph}
					chainSelectOpen={chainSelectOpen}
					practiceSelection={practiceSelection}
					onPracticeSelectionChange={onPracticeSelectionChange}
					onChainSelectClose={onChainSelectClose}
				/>
			) : (
				<MinimalHome
					importRevision={importRevision}
					onStats={setStats}
					chainSelectOpen={chainSelectOpen}
					practiceSelection={practiceSelection}
					onPracticeSelectionChange={onPracticeSelectionChange}
					onChainSelectClose={onChainSelectClose}
				/>
			)}
		</section>
	);
}
