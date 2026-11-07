"use client";

/**
 * Note chat (feature 024, US6; ui-contract "Note chat"; visual-reference
 * §17): a right panel over the page, which slides left and fades while it
 * is open. The header (dot, "This note", "On “{name}”", ✕), then, while
 * the chat is empty, the opening line in the AI's lettering, what it read,
 * and three starters that fill the field (they never send). His messages
 * are written ahead by the server; the answer streams in and inks in.
 * The history is the note's companion `chat`, so it is there on reopen.
 * A failed or stopped answer offers Try again. A Radix Dialog: focus stays
 * in the panel, Escape (or a click on the page) closes it and the focus
 * returns to the chat button. Reads wait while it is open.
 */
import { ArrowUpIcon, SquareIcon, XIcon } from "lucide-react";
import { Dialog } from "radix-ui";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import type { NoteChatMessage, NoteCompanion } from "@/src/core";
import { BlotGlyph } from "./blot";
import { refusalLine } from "./corner-hint";
import { InkText } from "./ink-text";
import { startChat, stopRun } from "./nb-actions";
import { useNotebook } from "./nb-shared";
import { currentReviewer } from "./toolbar-row";
import { useRunStream } from "./use-run-stream";
import { FAILED_LINE, STOPPED_LINE } from "./use-threads";

export const CHAT_OPENING = "I’ve read all of this note. Ask me anything about it.";
export const CHAT_STARTERS = ["What am I still getting wrong?", "What have we worked out so far?", "What should I do next?"] as const;
export const CHAT_PLACEHOLDER = "Ask about this note…";

/** What the chat read (ui-contract: "Read the whole note, {n} threads and your instructions."). */
export function chatContextLabel(threads: number, instructions: boolean): string {
	const count = threads === 1 ? "1 thread" : `${threads} threads`;
	if (threads === 0) return instructions ? "Read the whole note and your instructions." : "Read the whole note.";
	return instructions ? `Read the whole note, ${count} and your instructions.` : `Read the whole note and ${count}.`;
}

type Problem = { kind: "refused"; reason: "models" | "key"; provider?: string } | { kind: "send"; detail?: string } | { kind: "retry"; detail?: string };

/** "Writing back" (§10.3): the blot breathing where the answer will be. */
function InkWait() {
	return (
		<span role="status" aria-label="Writing back" className="nb-ink-wait" data-testid="nb-chat-wait">
			<BlotGlyph className="nb-ink-wait-blot" size={15} />
		</span>
	);
}

export function NoteChat({ open, onOpenChange, pageId, noteName, companion, reload, noteText, returnFocus }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pageId: string;
	noteName: string;
	companion: NoteCompanion | null;
	reload: () => void;
	/** The note's text as he sees it now. */
	noteText: () => string;
	returnFocus: RefObject<HTMLElement | null>;
}) {
	const nb = useNotebook();
	const { open: openSettings } = useSettingsDialog();
	const [draft, setDraft] = useState("");
	// His message while it is on its way: shown until the companion holds more messages than when he sent it.
	const [pending, setPending] = useState<{ text: string; at: number } | null>(null);
	const [started, setStarted] = useState<string | null>(null);
	const [live, setLive] = useState<Record<string, string>>({});
	const [inked, setInked] = useState<ReadonlySet<string>>(new Set());
	const [lost, setLost] = useState<ReadonlySet<string>>(new Set());
	const [details, setDetails] = useState<Record<string, string>>({});
	const [problem, setProblem] = useState<Problem | null>(null);
	const [shownDetail, setShownDetail] = useState<string | null>(null);
	const field = useRef<HTMLTextAreaElement>(null);
	const scroller = useRef<HTMLDivElement>(null);

	const chat: readonly NoteChatMessage[] = useMemo(() => companion?.chat ?? [], [companion]);
	const last = chat.at(-1);
	// An answer still marked streaming: follow its run (ours or one started elsewhere); gone runs count as failed.
	const streamingRun = last?.author === "ai" && last.state === "streaming" && last.runId && !lost.has(last.runId) ? last.runId : null;
	const followId = started ?? streamingRun;
	const writing = Boolean(followId) || pending !== null;
	const showPending = pending !== null && chat.length <= pending.at;

	// Followed while open or closed, so a reopened panel never replays the same words twice.
	useRunStream(followId, {
		delta: ({ messageId, text }) => {
			setLive((current) => ({ ...current, [messageId]: (current[messageId] ?? "") + text }));
			setInked((current) => (current.has(messageId) ? current : new Set(current).add(messageId)));
		},
		done: () => { setStarted(null); nb.announce("Reply ready."); reload(); },
		failed: ({ error, detail }) => {
			if (last?.author === "ai" && detail) setDetails((current) => ({ ...current, [last.id]: detail }));
			setStarted(null);
			nb.announce(error);
			reload();
		},
		stopped: () => { setStarted(null); reload(); },
		lost: () => {
			if (followId) setLost((current) => new Set(current).add(followId));
			setStarted(null);
			reload();
		},
	});
	useEffect(() => { if (pending !== null && !showPending) setPending(null); }, [pending, showPending]);

	// The newest words stay in view.
	useLayoutEffect(() => {
		const el = scroller.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [chat, live, showPending, open]);
	useLayoutEffect(() => {
		const el = field.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
	}, [draft, open]);

	const begin = useCallback(async (send: { message: string } | { retry: true }) => {
		setProblem(null);
		const outcome = await startChat(pageId, noteText(), send);
		if ("ok" in outcome) {
			setStarted(outcome.ok.id);
			reload();
			return true;
		}
		if ("message" in send) { setPending(null); setDraft((current) => current || send.message); }
		if ("refused" in outcome) setProblem({ kind: "refused", ...outcome.refused });
		else setProblem({ kind: "message" in send ? "send" : "retry", ...("error" in outcome ? { detail: outcome.error } : {}) });
		nb.announce(FAILED_LINE);
		reload();
		return false;
	}, [pageId, noteText, reload, nb]);

	const send = () => {
		const message = draft.trim();
		if (!message || writing) return;
		setPending({ text: message, at: chat.length });
		setDraft("");
		void begin({ message });
	};
	const retry = () => { if (!writing) void begin({ retry: true }); };
	const stop = () => { if (followId) void stopRun(followId); };
	const fill = (starter: string) => {
		setDraft(starter);
		window.requestAnimationFrame(() => {
			const el = field.current;
			if (!el) return;
			el.focus();
			el.setSelectionRange(el.value.length, el.value.length);
		});
	};

	const threads = companion?.threads.filter((t) => t.status !== "dismissed").length ?? 0;
	const reviewer = currentReviewer(nb.reviewers, companion?.reviewerId);
	const hasInstructions = Boolean(companion?.instruction.trim() || reviewer?.instructions.trim());
	const empty = chat.length === 0 && !showPending;

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal container={nb.root ?? undefined}>
				<Dialog.Overlay className="nb-chat-dim" data-testid="nb-chat-dim" />
				<Dialog.Content
					className="nb-chat"
					data-testid="nb-chat-panel"
					data-nb-hold-reads=""
					aria-describedby="nb-chat-sub"
					onOpenAutoFocus={(event) => { event.preventDefault(); field.current?.focus(); }}
					onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}
				>
					<header className="nb-chat-head">
						<div className="nb-chat-heading">
							<BlotGlyph className="nb-chat-dot" size={9} />
							<Dialog.Title className="nb-chat-title nb-voice">This note</Dialog.Title>
						</div>
						<p id="nb-chat-sub" className="nb-chat-sub">{`On “${noteName}”`}</p>
						<Dialog.Close className="nb-chat-close" aria-label="Close chat" data-testid="nb-chat-close">
							<XIcon aria-hidden="true" size={15} strokeWidth={1.6} />
						</Dialog.Close>
					</header>

					<div ref={scroller} className="nb-chat-scroll" data-testid="nb-chat-scroll">
						{empty ? (
							<div className="nb-chat-opening">
								<p className="nb-chat-open-line nb-voice" data-testid="nb-chat-opening">{CHAT_OPENING}</p>
								<p className="nb-chat-context" data-testid="nb-chat-context">{chatContextLabel(threads, hasInstructions)}</p>
								<ul className="nb-chat-starters" aria-label="Starters">
									{CHAT_STARTERS.map((starter) => (
										<li key={starter}>
											<button type="button" className="nb-chat-starter" data-testid="nb-chat-starter" onClick={() => fill(starter)}>{starter}</button>
										</li>
									))}
								</ul>
							</div>
						) : (
							<ol className="nb-chat-messages" aria-label="Chat about this note">
								{chat.map((message, i) => {
									if (message.author === "user") {
										return <li key={message.id} className="nb-chat-msg nb-chat-user" data-author="user" data-testid="nb-chat-message">{message.text}</li>;
									}
									const isLast = i === chat.length - 1;
									const orphan = message.state === "streaming" && (!message.runId || lost.has(message.runId)) && message.runId !== followId;
									const streaming = message.state === "streaming" && !orphan;
									const text = streaming ? live[message.id] ?? message.text : message.text || live[message.id] || "";
									const failed = message.state === "failed" || orphan;
									const detail = details[message.id];
									return (
										<li key={message.id} className="nb-chat-msg nb-chat-ai" data-author="ai" data-state={failed ? "failed" : message.state} data-testid="nb-chat-message">
											{text && <div className="nb-voice"><InkText text={text} animate={inked.has(message.id)} /></div>}
											{streaming && !text && <InkWait />}
											{message.state === "stopped" && (
												<p className="nb-chat-line" data-testid="nb-chat-stopped">
													<span>{STOPPED_LINE}</span>
													{isLast && <button type="button" className="nb-chat-link" onClick={retry}>Try again</button>}
												</p>
											)}
											{failed && (
												<p className="nb-chat-line" role="status" data-testid="nb-chat-failed">
													<span>{FAILED_LINE}</span>
													{isLast && <button type="button" className="nb-chat-link" onClick={retry}>Try again</button>}
													{detail && <button type="button" className="nb-chat-text-button" aria-expanded={shownDetail === message.id} onClick={() => setShownDetail((s) => (s === message.id ? null : message.id))}>Show details</button>}
													{shownDetail === message.id && detail && <span className="nb-chat-detail">{detail}</span>}
												</p>
											)}
										</li>
									);
								})}
								{showPending && (
									<>
										<li className="nb-chat-msg nb-chat-user" data-author="user" data-testid="nb-chat-message">{pending?.text}</li>
										<li className="nb-chat-msg nb-chat-ai" data-author="ai"><InkWait /></li>
									</>
								)}
							</ol>
						)}
						{problem && (
							<p className="nb-chat-line nb-chat-problem" role="status" data-testid="nb-chat-problem">
								{problem.kind === "refused" ? (
									<>
										<span>{problem.reason === "models" ? "No model set up." : refusalLine({ state: "refused", reason: "key", ...(problem.provider ? { provider: problem.provider } : {}) })}</span>
										{problem.reason === "models" && <button type="button" className="nb-chat-link" onClick={() => openSettings("models")}>Open Study’s settings</button>}
									</>
								) : (
									<>
										<span>{problem.kind === "send" ? `${FAILED_LINE} Your words are still in the field.` : FAILED_LINE}</span>
										<button type="button" className="nb-chat-link" onClick={problem.kind === "send" ? send : retry}>Try again</button>
										{problem.detail && <span className="nb-chat-detail">{problem.detail}</span>}
									</>
								)}
							</p>
						)}
					</div>

					<form className="nb-chat-form" onSubmit={(event) => { event.preventDefault(); send(); }}>
						<textarea
							ref={field}
							className="nb-chat-field"
							rows={1}
							value={draft}
							placeholder={CHAT_PLACEHOLDER}
							aria-label="Ask about this note"
							data-testid="nb-chat-field"
							onChange={(event) => setDraft(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
								event.preventDefault();
								send();
							}}
						/>
						{followId ? (
							<button type="button" className="nb-chat-send" data-filled="" aria-label="Stop" data-testid="nb-chat-stop" onClick={stop}>
								<SquareIcon aria-hidden="true" />
							</button>
						) : (
							<button type="submit" className="nb-chat-send" data-filled={draft.trim() ? "" : undefined} aria-label="Send" aria-disabled={writing || !draft.trim()} data-testid="nb-chat-send">
								<ArrowUpIcon aria-hidden="true" />
							</button>
						)}
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
