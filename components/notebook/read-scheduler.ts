/**
 * When Notebook reads on its own (feature 024, US2, ui-contract "Paces"):
 * after a typing pause of the pace's delay, one automatic read, unless
 * the note is in "When you ask", he is composing (IME), a thread field or
 * the selection menu has focus, or the text is what the last read saw.
 * Typing while a read runs stops it. Pure: timers and effects are
 * injected, so it is tested with fake timers and drives the React hook.
 */
import { textHash } from "@/src/core";

export interface ReadSchedulerDeps {
	/** The delay before reading (paceDelay). */
	delay: () => number;
	/** False in "When you ask", read-only notes and while refused for good. */
	enabled: () => boolean;
	/** The note's text as a read would send it. */
	text: () => string;
	/** True while focus sits where a read must wait (thread field, selection menu). */
	held: () => boolean;
	start: (text: string) => void;
	/** Stop the running automatic read (POST abort). */
	abort: (runId: string) => void;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (handle: unknown) => void;
}

export class ReadScheduler {
	private timer: unknown = null;
	private composing = false;
	private pendingAfterComposition = false;
	private running: string | null = null;
	private lastHash: string | null = null;
	private readonly setTimer: (fn: () => void, ms: number) => unknown;
	private readonly clearTimer: (handle: unknown) => void;

	constructor(private readonly deps: ReadSchedulerDeps) {
		this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
		this.clearTimer = deps.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
	}

	/** The text the last read saw (the companion's read cursor on load). */
	seen(hash: string | null | undefined): void {
		if (hash) this.lastHash = hash;
	}

	/** A run he can stop by typing (null when it ended). */
	setRunning(runId: string | null): void {
		this.running = runId;
	}

	get runningId(): string | null {
		return this.running;
	}

	/** He typed: stop a running read and restart the pause. */
	edited(): void {
		if (this.running) {
			const id = this.running;
			this.running = null;
			this.deps.abort(id);
		}
		this.arm();
	}

	compositionStart(): void {
		this.composing = true;
	}

	compositionEnd(): void {
		this.composing = false;
		if (this.pendingAfterComposition) {
			this.pendingAfterComposition = false;
			this.arm();
		}
	}

	/** The mode or note changed: forget the waiting pause. */
	cancel(): void {
		if (this.timer !== null) this.clearTimer(this.timer);
		this.timer = null;
		this.pendingAfterComposition = false;
	}

	/** "Try again" after a failed read: read the current text now. */
	retry(): void {
		this.cancel();
		this.lastHash = null;
		this.fire();
	}

	dispose(): void {
		this.cancel();
	}

	private arm(): void {
		this.cancel();
		if (!this.deps.enabled()) return;
		this.timer = this.setTimer(() => this.fire(), this.deps.delay());
	}

	private fire(): void {
		this.timer = null;
		if (!this.deps.enabled() || this.running) return;
		if (this.composing) {
			this.pendingAfterComposition = true;
			return;
		}
		if (this.deps.held()) return;
		const text = this.deps.text();
		if (!text.trim()) return;
		const hash = textHash(text);
		if (hash === this.lastHash) return;
		this.lastHash = hash;
		this.deps.start(text);
	}
}
