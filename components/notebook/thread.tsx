"use client";

/**
 * One thread (feature 024, US3; ui-contract "Reading and threads";
 * visual-reference §8, §8.1, §13). Collapsed: the AI's first message,
 * clamped, and "{n} replies", as one button that expands it. Expanded in
 * place: every message (his in Instrument Sans graphite, the AI's in its
 * lettering, new words inking in), the "Write back…" field with the
 * reply-line underline and the send arrow, then Resolve, Dismiss and "⋯"
 * (Copy text). After Resolve or Dismiss a status line with Undo holds its
 * place for 6 s. The same component sits in the margin and under a block.
 */
import { DropdownMenu } from "radix-ui";
import { SendIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from "react";
import { useSettingsDialog } from "@/components/settings/settings-dialog";
import { replyCount, replyCountLabel, type NotebookThread, type ThreadMessage } from "@/src/core";
import { BlotGlyph, InkDot } from "./blot";
import { refusalLine } from "./corner-hint";
import { InkText } from "./ink-text";
import { useNotebook } from "./nb-shared";
import { Sketch } from "./sketch";
import { ASK_HINT, ASK_ID, ASK_PLACEHOLDER, DISMISSED_LINE, FAILED_LINE, RESOLVED_LINE, STOPPED_LINE, useThreads, type ThreadProblem } from "./use-threads";

export const DETACHED_LINE = "The words this was about are gone.";

/** The "⋯" menu: Copy text. */
function ThreadMenu({ thread, className }: { thread: NotebookThread; className: string }) {
	const nb = useNotebook();
	const threads = useThreads();
	return (
		<DropdownMenu.Root modal={false}>
			<DropdownMenu.Trigger asChild>
				<button type="button" className={`nb-thread-more ${className}`} aria-label="More for this note" data-testid="nb-thread-more">
					<span aria-hidden="true">⋯</span>
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal container={nb.root ?? undefined}>
				<DropdownMenu.Content className="nb-menu nb-menu-small" align="end" sideOffset={6} data-testid="nb-thread-menu" data-nb-thread-menu="">
					<DropdownMenu.Item className="nb-menu-item" onSelect={() => void threads.copy(thread)}>Copy text</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

function ProblemLine({ problem, onRetry }: { problem: ThreadProblem; onRetry: () => void }) {
	const { open: openSettings } = useSettingsDialog();
	const [shown, setShown] = useState(false);
	if (problem.kind === "refused") {
		return (
			<p className="nb-thread-line" role="status" data-testid="nb-thread-problem">
				<span>{problem.reason === "models" ? "No model set up." : refusalLine({ state: "refused", reason: "key", ...(problem.provider ? { provider: problem.provider } : {}) })}</span>
				{problem.reason === "models" && <button type="button" className="nb-thread-button nb-thread-link" onClick={() => openSettings("models")}>Open Study’s settings</button>}
				<button type="button" className="nb-thread-button nb-thread-link" onClick={onRetry}>Try again</button>
			</p>
		);
	}
	return (
		<p className="nb-thread-line" role="status" data-testid="nb-thread-problem">
			<span>{problem.kind === "send" ? `${FAILED_LINE} Your words are still in the field.` : FAILED_LINE}</span>
			<button type="button" className="nb-thread-button nb-thread-link" onClick={onRetry}>Try again</button>
			{problem.detail && <button type="button" className="nb-thread-button" aria-expanded={shown} onClick={() => setShown((s) => !s)}>Show details</button>}
			{shown && problem.detail && <span className="nb-thread-detail">{problem.detail}</span>}
		</p>
	);
}

/** One message of an expanded thread. */
function Message({ message, last, threadId }: { message: ThreadMessage; last: boolean; threadId: string }) {
	const threads = useThreads();
	const [shown, setShown] = useState(false);
	if (message.author === "user") {
		return <div className="nb-msg nb-msg-user" data-author="user" data-testid="nb-thread-message">{message.text}</div>;
	}
	const streaming = message.state === "streaming" && !threads.orphaned(message.id);
	const text = streaming ? threads.liveText(message.id) ?? message.text : message.text || threads.liveText(message.id) || "";
	const failed = message.state === "failed" || (message.state === "streaming" && threads.orphaned(message.id));
	const detail = threads.detail(message.id);
	return (
		<div className="nb-msg nb-msg-ai" data-author="ai" data-state={failed ? "failed" : message.state} data-testid="nb-thread-message">
			{text && <div className="nb-voice"><InkText text={text} animate={threads.inked(message.id)} /></div>}
			{streaming && !text && <InkWait />}
			{message.sketch && <Sketch sketch={message.sketch} />}
			{message.state === "stopped" && <p className="nb-thread-line" data-testid="nb-thread-stopped">{STOPPED_LINE}</p>}
			{failed && (
				<p className="nb-thread-line" role="status" data-testid="nb-thread-failed">
					<span>{FAILED_LINE}</span>
					{last && <button type="button" className="nb-thread-button nb-thread-link" onClick={() => void threads.retry(threadId)}>Try again</button>}
					{detail && <button type="button" className="nb-thread-button" aria-expanded={shown} onClick={() => setShown((s) => !s)}>Show details</button>}
					{shown && detail && <span className="nb-thread-detail">{detail}</span>}
				</p>
			)}
		</div>
	);
}

/** "Writing back" (§10.3): the blot breathing where the answer will be. */
function InkWait() {
	return (
		<span role="status" aria-label="Writing back" className="nb-ink-wait" data-testid="nb-ink-wait">
			<BlotGlyph className="nb-ink-wait-blot" size={15} />
		</span>
	);
}

/** The Write back field: grows with his text; Enter sends, Shift+Enter breaks the line. */
function WriteBack({ thread, placeholder = "Write back…" }: { thread: NotebookThread; placeholder?: string }) {
	const threads = useThreads();
	const field = useRef<HTMLTextAreaElement>(null);
	const value = threads.draft(thread.id);
	const sending = threads.sending(thread.id);
	useLayoutEffect(() => {
		const el = field.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [value]);
	const request = threads.focusRequest;
	useEffect(() => {
		const el = field.current;
		if (request?.id !== thread.id || !el) return;
		// The thread may not be in its place yet: focus now, bring it into view once placed.
		el.focus({ preventScroll: true });
		let frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(() => el.scrollIntoView({ block: "nearest" })); });
		return () => window.cancelAnimationFrame(frame);
	}, [request, thread.id]);
	const submit = () => { if (!sending && value.trim()) void threads.send(thread.id); };
	return (
		<form className="nb-write" onSubmit={(event) => { event.preventDefault(); submit(); }}>
			<div className="nb-reply-line">
				<textarea
					ref={field}
					className="nb-write-field"
					rows={1}
					value={value}
					placeholder={placeholder}
					aria-label={thread.id === ASK_ID ? "Ask about this passage" : "Write back"}
					data-testid="nb-write-back"
					data-nb-entry=""
					onChange={(event) => threads.setDraft(thread.id, event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
						event.preventDefault();
						submit();
					}}
				/>
			</div>
			{/* aria-disabled, not disabled: a click on it keeps the focus in the thread. */}
			<button type="submit" className="nb-send" aria-label="Send" data-testid="nb-send" aria-disabled={sending || !value.trim()}>
				<SendIcon aria-hidden="true" />
			</button>
		</form>
	);
}

export interface ThreadProps {
	thread: NotebookThread;
	variant: "margin" | "inline";
	side?: "left" | "right";
	fresh: boolean;
	detached: boolean;
	/** Where its passage starts (document position), for the keyboard order; -1 when detached. */
	order: number;
	faded?: boolean;
	style?: CSSProperties;
	rootRef?: Ref<HTMLDivElement>;
	onPointerEnter?: () => void;
	onPointerLeave?: () => void;
}

export function Thread({ thread, variant, side = "right", fresh, detached, order, faded = false, style, rootRef, onPointerEnter, onPointerLeave }: ThreadProps) {
	const threads = useThreads();
	const leaving = threads.leaving(thread.id);
	const expanded = threads.openId === thread.id && !leaving;
	const messages = threads.messages(thread);
	const first = messages[0];
	const count = replyCountLabel(replyCount({ messages }));
	const margin = variant === "margin";
	const rootClass = margin ? "nb-note" : "nb-inline";
	const common = {
		ref: rootRef,
		"data-thread": thread.id,
		"data-side": margin ? side : undefined,
		"data-fresh": fresh ? "true" : undefined,
		"data-faded": faded ? "true" : undefined,
		style,
		onPointerEnter,
		onPointerLeave,
	};

	if (leaving) {
		return (
			<div {...common} className={`${rootClass} nb-thread-gone`} data-state="gone" data-testid={margin ? "nb-margin-note" : "nb-inline-reply"}>
				<p className="nb-thread-line nb-settle" role="status" data-testid="nb-thread-status">
					<span>{leaving.status === "resolved" ? RESOLVED_LINE : DISMISSED_LINE}</span>
					<button type="button" className="nb-thread-button nb-thread-link" data-nb-undo="" onClick={() => void threads.undo(thread.id)}>Undo</button>
				</p>
			</div>
		);
	}

	const roleProps = { role: "note", "aria-roledescription": "note", "aria-label": thread.id === ASK_ID ? "Your question" : margin ? "Margin note" : "Note under the passage" } as const;
	const dot = <InkDot fresh={fresh} className={margin ? "nb-note-dot" : "nb-inline-dot"} />;

	if (!expanded) {
		return (
			<div {...common} {...roleProps} className={rootClass} data-state="collapsed" data-testid={margin ? "nb-margin-note" : "nb-inline-reply"}>
				{dot}
				<button
					type="button"
					className="nb-thread-open"
					aria-expanded={false}
					data-nb-entry=""
					data-order={order}
					data-testid="nb-thread-open"
					onClick={() => threads.open(thread.id)}
				>
					<span className={`${margin ? "nb-note-text" : "nb-inline-text"} nb-voice nb-clamp`}>
						<InkText text={first?.text ?? ""} animate={fresh} />
					</span>
					{detached && <span className="nb-note-meta nb-note-detached">{DETACHED_LINE}</span>}
					{count && <span className="nb-note-meta nb-note-count" data-testid="nb-reply-count">{count}</span>}
				</button>
				{/* The drawing has its own controls, so it sits after the button, not in it. */}
				{!margin && first?.sketch && <Sketch sketch={first.sketch} />}
				<ThreadMenu thread={thread} className="nb-thread-more-hover" />
			</div>
		);
	}

	const problem = threads.problem(thread.id);
	const asking = thread.id === ASK_ID;
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return;
		const target = event.target as HTMLElement;
		// Escape order: the field first (his words stay), then the thread.
		if (target instanceof HTMLTextAreaElement && target.value.trim()) {
			event.preventDefault();
			event.currentTarget.focus();
			return;
		}
		event.preventDefault();
		threads.collapse(true);
	};
	return (
		<div
			{...common}
			{...roleProps}
			className={rootClass}
			data-state="open"
			data-testid={margin ? "nb-margin-note" : "nb-inline-reply"}
			data-nb-hold-reads=""
			tabIndex={-1}
			onKeyDown={onKeyDown}
		>
			{dot}
			{margin && <span className="nb-thread-rail" aria-hidden="true" />}
			<div className="nb-thread nb-unfold" data-testid="nb-thread">
				{detached && <p className="nb-note-meta nb-note-detached">{DETACHED_LINE}</p>}
				<div className="nb-thread-messages">
					{messages.map((message, i) => <Message key={message.id} message={message} last={i === messages.length - 1} threadId={thread.id} />)}
					{threads.waiting(thread.id) && <div className="nb-msg nb-msg-ai"><InkWait /></div>}
				</div>
				{problem && <ProblemLine problem={problem} onRetry={() => void threads.retry(thread.id)} />}
				<WriteBack thread={thread} {...(asking ? { placeholder: ASK_PLACEHOLDER } : {})} />
				{asking ? (
					<p className="nb-thread-hint" data-testid="nb-ask-hint">{ASK_HINT}</p>
				) : (
					<div className="nb-thread-actions">
						<button type="button" className="nb-thread-button" data-testid="nb-resolve" onClick={() => void threads.setStatus(thread, "resolved")}>Resolve</button>
						<button type="button" className="nb-thread-button" data-testid="nb-dismiss" onClick={() => void threads.setStatus(thread, "dismissed")}>Dismiss</button>
						<ThreadMenu thread={thread} className="nb-thread-more-end" />
					</div>
				)}
			</div>
		</div>
	);
}
