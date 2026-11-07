"use client";

/**
 * One note on the page (feature 024, US1): the centred column with the
 * toolbar row, the huge title (the page's name, edited in place, research
 * R2) and the body. The body is the Library page itself, saved through
 * `usePageDraft` exactly as Study's page pane does, so drafts, versions,
 * conflicts and the browser backup all behave the same.
 */
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { isUnsent } from "@/components/library/page-draft";
import { useNoteLinks } from "@/components/library/use-note-links";
import { usePageDraft } from "@/components/library/use-page-draft";
import { copyNoteMarkdown, notebookHref, type NoteMode, type WikiResolution } from "@/src/core";
import { ExportDialog } from "./export-dialog";
import { InstructionLine, type InstructionHandle } from "./instruction-line";
import { copyText, flashcardsHref, renameNote } from "./nb-actions";
import { NoteChat } from "./note-chat";
import { NoteBridge } from "./nb-plugins";
import { isUntitledName, useNotebook } from "./nb-shared";
import type { NoteEditorHandle } from "./note-editor";
import { NoteThinking } from "./thinking";
import { ToolbarRow } from "./toolbar-row";
import { useCompanion } from "./use-notebook-data";

const NoteEditor = dynamic(() => import("./note-editor"), { ssr: false, loading: () => <BodyLoading /> });

/** Typing pauses this long before a new name is saved; Enter and leaving save at once. */
const RENAME_DELAY_MS = 700;
const NAME_MAX_CHARS = 200;

function BodyLoading() {
	return <div className="nb-body-loading" role="status" aria-label="Loading the note" />;
}

export interface TitleHandle { focusEnd: () => void }

/** The note's text as he sees it, and a way to hand it to the server first (exports read the saved draft). */
interface DraftHandle { text: () => string | null; save: () => Promise<void> }

/** What the title field shows for a stored name: new notes show the placeholder. */
export const titleText = (name: string): string => (isUntitledName(name) ? "" : name);

/** The page name as a single-line, wrapping field with Riddled's title metrics. */
export const TitleField = forwardRef<TitleHandle, {
	name: string;
	onRename?: (name: string) => Promise<{ name: string } | { error: string }>;
	onEnter?: () => void;
	readOnly?: boolean;
}>(function TitleField({ name, onRename, onEnter, readOnly = false }, ref) {
	const [value, setValue] = useState(() => titleText(name));
	const [error, setError] = useState<string | null>(null);
	const field = useRef<HTMLTextAreaElement>(null);
	const saved = useRef(name);
	const timer = useRef<number | null>(null);
	const chain = useRef<Promise<boolean>>(Promise.resolve(true));
	const focused = useRef(false);

	// A rename from elsewhere (Study, another window) shows while he isn't typing here.
	useEffect(() => {
		if (focused.current || name === saved.current) return;
		saved.current = name;
		setValue(titleText(name));
	}, [name]);

	const fit = useCallback(() => {
		const el = field.current;
		if (!el) return;
		// Whole lines of the title's line height, so the body starts where Riddled's does.
		el.style.height = "auto";
		const line = parseFloat(getComputedStyle(el).lineHeight) || el.scrollHeight;
		el.style.height = `${Math.max(1, Math.round(el.scrollHeight / line)) * line}px`;
	}, []);
	useEffect(fit, [value, fit]);
	useEffect(() => {
		window.addEventListener("resize", fit);
		return () => window.removeEventListener("resize", fit);
	}, [fit]);

	const save = useCallback((text: string) => {
		if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
		if (!onRename) return chain.current;
		chain.current = chain.current.then(async () => {
			const wanted = text.trim();
			if ((wanted || "Untitled note") === saved.current || (!wanted && isUntitledName(saved.current))) { setError(null); return true; }
			const outcome = await onRename(wanted);
			if ("error" in outcome) { setError(outcome.error); return false; }
			setError(null);
			saved.current = outcome.name;
			// A stepped name ("Name (2)") shows once he leaves the field.
			if (!focused.current) setValue(titleText(outcome.name));
			return true;
		});
		return chain.current;
	}, [onRename]);
	useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

	useImperativeHandle(ref, () => ({
		focusEnd: () => {
			const el = field.current;
			if (!el) return;
			el.focus();
			el.setSelectionRange(el.value.length, el.value.length);
		},
	}), []);

	return (
		<>
			<textarea
				ref={field}
				className="nb-title"
				rows={1}
				value={value}
				placeholder="Untitled"
				aria-label="Title"
				maxLength={NAME_MAX_CHARS}
				spellCheck
				readOnly={readOnly}
				data-testid="nb-title"
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? "nb-title-error" : undefined}
				onFocus={() => { focused.current = true; }}
				onChange={(event) => {
					const next = event.currentTarget.value.replace(/[\r\n]+/g, " ");
					setValue(next);
					if (timer.current) window.clearTimeout(timer.current);
					timer.current = window.setTimeout(() => void save(next), RENAME_DELAY_MS);
				}}
				onKeyDown={(event) => {
					if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
					event.preventDefault();
					void save(value);
					onEnter?.();
				}}
				onBlur={() => {
					focused.current = false;
					// His text stays when the name was refused; the alert says why.
					void save(value).then((ok) => { if (ok && !focused.current) setValue(titleText(saved.current)); });
				}}
			/>
			{error && <p id="nb-title-error" role="alert" className="nb-title-error">{error}</p>}
		</>
	);
});

/** Notes shown in this document so far (the first is the page load); a repeat of the last one is the same showing. */
const notesShown: string[] = [];
function openedWithin(id: string): boolean {
	if (notesShown.at(-1) !== id) notesShown.push(id);
	return notesShown.length > 1;
}

export function NoteView({ note }: { note: { id: string; name: string } }) {
	const nb = useNotebook();
	const router = useRouter();
	const title = useRef<TitleHandle>(null);
	const body = useRef<NoteEditorHandle>(null);
	const { companion, mode, patch, reload } = useCompanion(note.id, nb.startMode);
	// The draft reads this browser's backup, so the body starts after mount.
	const [mounted, setMounted] = useState(false);
	useEffect(() => { setMounted(true); }, []);
	const [deleted, setDeleted] = useState(false);
	const [bridge] = useState(() => new NoteBridge());
	const [column, setColumn] = useState<HTMLDivElement | null>(null);
	const instruction = useRef<InstructionHandle>(null);
	const instructionsButton = useRef<HTMLButtonElement>(null);
	const [instructionShown, setInstructionShown] = useState(false);
	const [refocusInstructions, setRefocusInstructions] = useState(0);
	const [chatOpen, setChatOpen] = useState(false);
	const chatButton = useRef<HTMLButtonElement>(null);
	const noteText = useCallback(() => bridge.text()?.text ?? "", [bridge]);
	const draft = useRef<DraftHandle | null>(null);
	const [exportOpen, setExportOpen] = useState(false);
	const exportButton = useRef<HTMLButtonElement>(null);
	const { noteCommands, announce, reviewers, plain } = nb;
	const companionRef = useRef(companion);
	companionRef.current = companion;
	// Copy this note and Export this note, for the shortcuts and (Phase 10) the sidebar footer.
	useEffect(() => {
		noteCommands.current = {
			copy: () => {
				const text = draft.current?.text();
				if (text === null || text === undefined) return;
				const markdown = copyNoteMarkdown({ markdown: text, companion: companionRef.current, reviewers, includeAi: !plain });
				void copyText(markdown).then((ok) => announce(ok ? "Copied." : "The note could not be copied. The browser refused."));
			},
			openExport: () => setExportOpen(true),
			// The whole note, saved first so the drafting panel reads what he sees.
			makeFlashcards: () => {
				void (draft.current?.save() ?? Promise.resolve()).catch(() => { /* the server's copy is read */ }).then(() => router.push(flashcardsHref(note.id)));
			},
		};
		return () => { noteCommands.current = null; };
	}, [noteCommands, announce, reviewers, plain, router, note.id]);
	// The button comes back a render after the line hides: focus it once it is there.
	const refocused = useRef(0);
	useEffect(() => {
		if (!refocusInstructions || refocused.current === refocusInstructions || !instructionsButton.current) return;
		refocused.current = refocusInstructions;
		instructionsButton.current.focus();
	}, [refocusInstructions, instructionShown]);

	// Opening another note (sidebar, Links, a [[link]]) mounts this view anew: a focus
	// left on nothing goes to the title of an untitled note, else to the start of its text.
	useEffect(() => {
		if (!openedWithin(note.id)) return;
		let tries = 0;
		const timer = window.setInterval(() => {
			const active = document.activeElement;
			if (active && active !== document.body) { window.clearInterval(timer); return; }
			if (isUntitledName(note.name)) { title.current?.focusEnd(); window.clearInterval(timer); return; }
			if (body.current) { body.current.focusStart(); window.clearInterval(timer); return; }
			if (++tries > 50) window.clearInterval(timer);
		}, 100);
		return () => window.clearInterval(timer);
	}, [note.id, note.name]);

	// The live name: the Library list follows renames made anywhere.
	const listed = nb.library?.items.find((item) => item.id === note.id);
	const name = listed?.name ?? note.name;

	return (
		<main className="nb-page" data-testid="nb-page" data-chat={chatOpen || nb.linksOpen ? "" : undefined}>
			<div ref={setColumn} className="nb-column" data-testid="nb-column">
				<ToolbarRow
					reviewers={nb.reviewers}
					reviewerId={companion?.reviewerId}
					mode={mode}
					hasInstruction={instructionShown}
					container={nb.root}
					instructionsRef={instructionsButton}
					chatRef={chatButton}
					chatOpen={chatOpen}
					onReviewer={(id) => void patch({ reviewerId: id })}
					onEditReviewers={nb.openReviewers}
					onMode={(next: NoteMode) => void patch({ mode: next })}
					onInstructions={() => instruction.current?.open()}
					exportRef={exportButton}
					exportOpen={exportOpen}
					onExport={() => setExportOpen(true)}
					onChat={() => setChatOpen(true)}
				/>
				{companion && (
					<InstructionLine
						ref={instruction}
						value={companion.instruction}
						readOnly={deleted}
						onSave={(text) => void patch({ instruction: text })}
						onEnter={() => title.current?.focusEnd()}
						onClosed={() => setRefocusInstructions((n) => n + 1)}
						onShown={setInstructionShown}
					/>
				)}
				<TitleField
					ref={title}
					name={name}
					readOnly={deleted}
					onRename={async (wanted) => {
						const outcome = await renameNote(note.id, wanted);
						if ("error" in outcome) return outcome;
						void nb.refreshLibrary();
						return { name: outcome.ok.name };
					}}
					onEnter={() => body.current?.focusStart()}
				/>
				{mounted ? <NoteBody id={note.id} name={name} mode={mode} handle={body} title={title} noteBridge={bridge} onDeleted={setDeleted} draft={draft} /> : <div className="nb-body"><BodyLoading /></div>}
				{mounted && (
					<NoteThinking
						bridge={bridge}
						column={column}
						pageId={note.id}
						companion={companion}
						reload={reload}
						mode={mode}
						pace={nb.preferences.pace}
						layout={nb.preferences.layout}
						readOnly={deleted}
						plain={plain}
					/>
				)}
			</div>
			<NoteChat
				open={chatOpen}
				onOpenChange={setChatOpen}
				pageId={note.id}
				noteName={name}
				companion={companion}
				reload={reload}
				noteText={noteText}
				returnFocus={chatButton}
			/>
			<ExportDialog
				open={exportOpen}
				onOpenChange={setExportOpen}
				pageId={note.id}
				noteName={name}
				beforeExport={() => draft.current?.save() ?? Promise.resolve()}
				returnFocus={exportButton}
			/>
		</main>
	);
}

/** The page's text through the Library's draft controller, as Study's page pane holds it. */
function NoteBody({ id, name, mode, handle, title, noteBridge, onDeleted, draft }: {
	id: string;
	name: string;
	mode: NoteMode;
	handle: RefObject<NoteEditorHandle | null>;
	title: RefObject<TitleHandle | null>;
	noteBridge: NoteBridge;
	onDeleted: (deleted: boolean) => void;
	draft: RefObject<DraftHandle | null>;
}) {
	const nb = useNotebook();
	const router = useRouter();
	const { controller, state, loadFailed, retryLoad, flush } = usePageDraft(id);
	flush.current = () => handle.current?.flush();
	useEffect(() => {
		draft.current = {
			text: () => {
				handle.current?.flush();
				const now = controller.getState();
				return now.loaded ? now.text : null;
			},
			save: async () => {
				handle.current?.flush();
				await controller.saveDraft();
			},
		};
		return () => { draft.current = null; };
	}, [draft, controller, handle]);
	const { setSaveStatus } = nb;

	useEffect(() => { setSaveStatus(state.loaded ? state.status : null); }, [state.loaded, state.status, setSaveStatus]);
	useEffect(() => () => setSaveStatus(null), [setSaveStatus]);
	useEffect(() => { onDeleted(state.deleted); }, [state.deleted, onDeleted]);

	const followLink = useCallback((_target: string, resolution: WikiResolution | null) => {
		if (resolution?.state === "live" && resolution.id && resolution.kind === "page") {
			handle.current?.flush();
			router.push(notebookHref(resolution.id));
		}
	}, [router, handle]);
	const { bridge, wikiMenu } = useNoteLinks(id, followLink);

	const save = () => {
		handle.current?.flush();
		void controller.commit("save");
	};

	return (
		<>
			{state.deleted && (
				<p role="status" className="nb-status-line" data-testid="nb-deleted">
					{`${name} was deleted.`}
					{isUnsent(state) && <button type="button" className="nb-text-button" onClick={() => void navigator.clipboard.writeText(state.text)}>Copy text</button>}
				</p>
			)}
			{state.conflict && (
				<p role="status" className="nb-status-line" data-testid="nb-conflict">
					This note changed elsewhere. Your text is safe here.
					<button type="button" className="nb-text-button" onClick={() => void controller.keepMine()}>Keep mine</button>
					<button type="button" className="nb-text-button" onClick={() => void controller.useLatest()}>Use latest</button>
				</p>
			)}
			{state.status === "failed" && !state.conflict && !state.deleted && (
				<p role="status" className="nb-status-line" data-testid="nb-save-failed">
					Not saved. Your text is kept in this browser.
					<button type="button" className="nb-text-button" onClick={() => void controller.retry()}>Try again</button>
				</p>
			)}
			<div className="nb-body">
				{loadFailed ? (
					<p role="status" className="nb-status-line">
						{`${name} could not be loaded.`}
						<button type="button" className="nb-text-button" onClick={retryLoad}>Try again</button>
					</p>
				) : !state.loaded ? (
					<BodyLoading />
				) : (
					<NoteEditor
						key={`${state.loadKey}${state.deleted ? "-deleted" : ""}`}
						handle={handle}
						value={state.text}
						readOnly={state.deleted}
						ariaLabel={`Note ${name}`}
						mode={mode}
						onChange={(text) => controller.edit(text)}
						onSave={save}
						onExitTop={() => title.current?.focusEnd()}
						wiki={bridge}
						wikiMenu={wikiMenu}
						bridge={noteBridge}
					/>
				)}
			</div>
		</>
	);
}
