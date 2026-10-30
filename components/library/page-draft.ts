/** The page draft's logic with no React and no real clock, so the no-loss rules
 *  (SC-002, research R10) are tested directly: a reducer for what a tab shows,
 *  and a controller that drives it against the page routes. The learner's text
 *  is never replaced while it differs from what the server already holds. */
import type { PageDraftView, PageHead, PageState, PageVersion } from "@/src/core";

export type SaveStatus = "saved" | "saving" | "draft-saved" | "failed";

export const SAVE_STATE_LABEL: Record<SaveStatus, string> = {
	saved: "Saved",
	saving: "Saving…",
	"draft-saved": "Draft saved",
	failed: "Not saved. Your text is kept in this browser.",
};

export interface PageDraftState {
	/** False until the first load has settled. */
	loaded: boolean;
	text: string;
	/** The version this text was edited from, and its text. */
	base: number;
	baseText: string;
	/** The server draft's rev this tab last saw. 0 means none. */
	rev: number;
	/** The text the server is known to hold, as draft or head. */
	acked: string;
	status: SaveStatus;
	conflict: { head: PageHead; draft: PageDraftView | null } | null;
	/** "Updated by the agent · version {n}". */
	agentUpdate: number | null;
	/** Bumps whenever the text was replaced from outside, so the editor reloads. */
	loadKey: number;
}

export interface PageBackup { text: string; base: number; rev: number; at: number }

export type PageDraftAction =
	| { type: "loaded"; page: PageState; backup: PageBackup | null }
	| { type: "edited"; text: string }
	| { type: "saving" }
	| { type: "draft-acked"; text: string; rev: number }
	| { type: "version-acked"; text: string; version: number }
	| { type: "failed" }
	| { type: "stale"; head: PageHead; draft: PageDraftView | null }
	| { type: "remote"; page: PageState; author?: "learner" | "agent"; version?: number }
	| { type: "resolved"; page: PageState; replaceText: boolean }
	| { type: "agent-update-seen" };

export const initialPageDraft: PageDraftState = {
	loaded: false, text: "", base: 0, baseText: "", rev: 0, acked: "", status: "saved", conflict: null, agentUpdate: null, loadKey: 0,
};

export const isDirty = (state: PageDraftState) => state.loaded && state.text !== state.baseText;
/** Text the server does not hold yet. */
export const isUnsent = (state: PageDraftState) => state.loaded && state.text !== state.acked;

function fromServer(state: PageDraftState, page: PageState): PageDraftState {
	const text = page.draft?.content ?? page.head.content;
	return {
		...state,
		loaded: true,
		text,
		base: page.head.n,
		baseText: page.head.content,
		rev: page.draft?.rev ?? 0,
		acked: text,
		status: page.draft ? "draft-saved" : "saved",
		conflict: null,
		loadKey: state.loadKey + 1,
	};
}

export function pageDraftReducer(state: PageDraftState, action: PageDraftAction): PageDraftState {
	switch (action.type) {
		case "loaded": {
			const server = fromServer(state, action.page);
			const backup = action.backup;
			if (!backup || backup.text === server.text) return server;
			// A reload with text the server never got: it comes back. If the page
			// moved on meanwhile, it comes back with the conflict line.
			const clean = backup.base === server.base && backup.rev === server.rev;
			return {
				...server,
				text: backup.text,
				status: "failed",
				conflict: clean ? null : { head: action.page.head, draft: action.page.draft },
			};
		}
		case "edited":
			return { ...state, text: action.text, agentUpdate: null, status: action.text === state.acked ? (action.text === state.baseText ? "saved" : "draft-saved") : state.status === "failed" ? "failed" : "saving" };
		case "saving":
			return { ...state, status: "saving" };
		case "draft-acked":
			return {
				...state,
				rev: action.rev,
				acked: action.text,
				status: state.text !== action.text ? "saving" : action.text === state.baseText ? "saved" : "draft-saved",
			};
		case "version-acked":
			return {
				...state,
				base: action.version,
				baseText: action.text,
				rev: 0,
				acked: action.text,
				status: state.text === action.text ? "saved" : "saving",
			};
		case "failed":
			return { ...state, status: "failed" };
		case "stale":
			// Identical text is no conflict: another tab or the agent's pre-save got it there.
			if (action.head.content === state.text) return { ...state, base: action.head.n, baseText: state.text, rev: action.draft?.rev ?? 0, acked: action.draft?.content ?? state.text, status: "saved", conflict: null };
			return { ...state, conflict: { head: action.head, draft: action.draft }, status: "failed" };
		case "remote": {
			const { page } = action;
			const sameBase = page.head.n === state.base;
			if (sameBase && (page.draft?.rev ?? 0) === state.rev) return state;
			if (page.head.content === state.text) {
				return { ...state, base: page.head.n, baseText: state.text, rev: page.draft?.rev ?? 0, acked: page.draft?.content ?? state.text, status: "saved", conflict: null };
			}
			if (isDirty(state)) {
				// The server's draft moving under a head we agree on only matters at the next save.
				return sameBase ? state : { ...state, conflict: { head: page.head, draft: page.draft }, status: state.status };
			}
			if (sameBase) return state;
			return {
				...fromServer(state, page),
				agentUpdate: action.author === "agent" ? action.version ?? page.head.n : null,
			};
		}
		case "resolved": {
			const { page, replaceText } = action;
			if (replaceText) return fromServer(state, page);
			return { ...state, base: page.head.n, baseText: page.head.content, rev: page.draft?.rev ?? 0, acked: page.head.content, status: state.text === page.head.content ? "saved" : "saving", conflict: null };
		}
		case "agent-update-seen":
			return { ...state, agentUpdate: null };
	}
}

/** What the controller needs from the page routes. */
export interface PageApi {
	read(id: string): Promise<PageState | null>;
	putDraft(id: string, input: { base: number; rev: number; content: string }): Promise<{ rev: number } | { stale: { head: PageHead; draft: PageDraftView | null } } | null>;
	commit(id: string, input: { base: number; rev: number; content: string; cause?: string }): Promise<{ version: PageVersion; created: boolean; otherVersion?: number } | { stale: { head: PageHead; draft: PageDraftView | null } } | null>;
	restore(id: string, n: number): Promise<{ version: PageVersion } | null>;
}

/** Tab-local backup. One key per tab, so two tabs never overwrite each other. */
export interface PageBackupStore {
	read(): PageBackup | null;
	write(backup: PageBackup): void;
	clear(): void;
}

export interface PageDraftOptions {
	id: string;
	api: PageApi;
	backup: PageBackupStore;
	draftDelayMs?: number;
	backupDelayMs?: number;
	onLoadFailed?: () => void;
}

const isStale = <T extends object>(r: T | { stale: unknown } | null): r is { stale: { head: PageHead; draft: PageDraftView | null } } => !!r && "stale" in r;

/** One open page in one tab. */
export class PageDraftController {
	state = initialPageDraft;
	private listeners = new Set<() => void>();
	private draftTimer: ReturnType<typeof setTimeout> | null = null;
	private backupTimer: ReturnType<typeof setTimeout> | null = null;
	private writing: Promise<unknown> = Promise.resolve();
	private busy = 0;
	private remoteWaiting: { author?: "learner" | "agent"; version?: number } | null = null;
	private closed = false;
	private loading: Promise<boolean> | null = null;
	private readonly options: Required<Pick<PageDraftOptions, "draftDelayMs" | "backupDelayMs">> & PageDraftOptions;

	constructor(options: PageDraftOptions) {
		this.options = { draftDelayMs: 1000, backupDelayMs: 300, ...options };
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => { this.listeners.delete(listener); };
	};
	getState = () => this.state;

	private dispatch(action: PageDraftAction) {
		this.state = pageDraftReducer(this.state, action);
		for (const listener of [...this.listeners]) listener();
	}

	/** Writes run one at a time, so a commit can't pass an unfinished draft. */
	private enqueue<T>(work: () => Promise<T>): Promise<T> {
		this.busy++;
		const run = this.writing.then(work, work);
		this.writing = run.catch(() => {}).finally(() => {
			this.busy--;
			if (this.busy === 0 && this.remoteWaiting) {
				const waiting = this.remoteWaiting;
				this.remoteWaiting = null;
				void this.remoteChanged(waiting.author, waiting.version);
			}
		});
		return run;
	}

	/** One load at a time: a second answer landing after he started typing would
	 *  replace his text with the server's (React's development double effect did). */
	load(): Promise<boolean> {
		this.loading ??= this.loadOnce().finally(() => { this.loading = null; });
		return this.loading;
	}

	private async loadOnce(): Promise<boolean> {
		try {
			const page = await this.options.api.read(this.options.id);
			if (!page) { this.options.onLoadFailed?.(); return false; }
			this.dispatch({ type: "loaded", page, backup: this.options.backup.read() });
			this.syncBackup();
			if (isUnsent(this.state) && !this.state.conflict) this.scheduleDraft();
			return true;
		} catch {
			this.options.onLoadFailed?.();
			return false;
		}
	}

	edit(text: string) {
		if (!this.state.loaded || text === this.state.text) return;
		this.dispatch({ type: "edited", text });
		this.scheduleBackup();
		if (!this.state.conflict) this.scheduleDraft();
	}

	private scheduleDraft() {
		if (this.draftTimer) clearTimeout(this.draftTimer);
		if (!isUnsent(this.state)) return;
		this.draftTimer = setTimeout(() => { this.draftTimer = null; void this.saveDraft(); }, this.options.draftDelayMs);
	}

	private scheduleBackup() {
		if (this.backupTimer) return;
		this.backupTimer = setTimeout(() => { this.backupTimer = null; this.syncBackup(); }, this.options.backupDelayMs);
	}

	/** The backup holds text the server lacks, and goes once it has it. */
	syncBackup() {
		// Before the first load this tab knows nothing, and a backup from before a reload is still needed.
		if (!this.state.loaded) return;
		if (isUnsent(this.state) || this.state.conflict) {
			const { text, base, rev } = this.state;
			this.options.backup.write({ text, base, rev, at: Date.now() });
		} else {
			this.options.backup.clear();
		}
	}

	saveDraft(): Promise<void> {
		return this.enqueue(async () => {
			const { text, base, rev, conflict } = this.state;
			if (conflict || text === this.state.acked) return;
			this.syncBackup();
			try {
				const result = await this.options.api.putDraft(this.options.id, { base, rev, content: text });
				if (isStale(result)) this.dispatch({ type: "stale", ...result.stale });
				else if (!result) this.dispatch({ type: "failed" });
				else this.dispatch({ type: "draft-acked", text, rev: result.rev });
			} catch {
				this.dispatch({ type: "failed" });
			}
			this.syncBackup();
			if (!this.closed && isUnsent(this.state) && this.state.status !== "failed" && !this.state.conflict) this.scheduleDraft();
		});
	}

	/** Save, close and leave. Text equal to the head makes no request at all. */
	commit(cause?: "save" | "autosave-close"): Promise<void> {
		if (this.draftTimer) { clearTimeout(this.draftTimer); this.draftTimer = null; }
		return this.enqueue(async () => {
			const { text, base, rev, conflict, baseText } = this.state;
			if (!this.state.loaded || conflict) { this.syncBackup(); return; }
			if (text === baseText && rev === 0) { this.syncBackup(); return; }
			this.dispatch({ type: "saving" });
			this.syncBackup();
			try {
				const result = await this.options.api.commit(this.options.id, { base, rev, content: text, cause });
				if (isStale(result)) this.dispatch({ type: "stale", ...result.stale });
				else if (!result) this.dispatch({ type: "failed" });
				else this.dispatch({ type: "version-acked", text, version: result.version.n });
			} catch {
				this.dispatch({ type: "failed" });
			}
			this.syncBackup();
			if (!this.closed && isUnsent(this.state) && !this.state.conflict && this.state.status !== "failed") this.scheduleDraft();
		});
	}

	/** Try again after a failure. */
	retry(): Promise<void> {
		return this.state.base && this.state.text === this.state.acked ? this.commit("save") : this.saveDraft();
	}

	/** Keep mine: anything else goes in as its own version, then this text is newest. */
	keepMine(): Promise<void> {
		return this.enqueue(async () => {
			const { text, base } = this.state;
			try {
				const result = await this.options.api.commit(this.options.id, { base, rev: 0, content: text, cause: "conflict" });
				const page = await this.options.api.read(this.options.id);
				if (!result || isStale(result) || !page) return this.dispatch({ type: "failed" });
				this.dispatch({ type: "resolved", page, replaceText: false });
				this.syncBackup();
			} catch {
				this.dispatch({ type: "failed" });
			}
		});
	}

	/** Use latest: this text goes in as its own version first, then the newest is
	 *  brought back on top. It is in History either way. */
	useLatest(): Promise<void> {
		return this.enqueue(async () => {
			const { text, base, conflict } = this.state;
			if (!conflict) return;
			try {
				const result = await this.options.api.commit(this.options.id, { base, rev: 0, content: text, cause: "conflict" });
				if (!result || isStale(result)) return this.dispatch({ type: "failed" });
				if (result.created) {
					const restored = await this.options.api.restore(this.options.id, result.otherVersion ?? conflict.head.n);
					if (!restored) return this.dispatch({ type: "failed" });
				}
				const page = await this.options.api.read(this.options.id);
				if (!page) return this.dispatch({ type: "failed" });
				this.dispatch({ type: "resolved", page, replaceText: true });
				this.syncBackup();
			} catch {
				this.dispatch({ type: "failed" });
			}
		});
	}

	/** The page changed elsewhere. Fetch the truth, unless our own write is under
	 *  way: its event can beat its response, so look again once it lands. */
	async remoteChanged(author?: "learner" | "agent", version?: number): Promise<void> {
		if (this.busy > 0) {
			this.remoteWaiting = { author, version };
			return;
		}
		try {
			const page = await this.options.api.read(this.options.id);
			if (page) this.dispatch({ type: "remote", page, author, version });
			this.syncBackup();
		} catch { /* the next event or resync heals it */ }
	}

	/** After a restore or rename: load what the server says, keeping nothing stale. */
	async reloadClean(): Promise<void> {
		const page = await this.options.api.read(this.options.id);
		if (page) this.dispatch({ type: "resolved", page, replaceText: true });
		this.syncBackup();
	}

	seenAgentUpdate() { this.dispatch({ type: "agent-update-seen" }); }

	/** The tab is going away: only synchronous work is safe here. */
	pageHide() { this.syncBackup(); }

	/** The pane closed or the route changed: unsaved text becomes a version. */
	close(): Promise<void> {
		this.closed = true;
		if (this.backupTimer) { clearTimeout(this.backupTimer); this.backupTimer = null; }
		this.syncBackup();
		return this.commit("autosave-close");
	}

	/** React's development double effect closes and reopens the same controller. */
	reopened() { this.closed = false; }

	/** Wait for queued writes; tests and the restore action use this. */
	settled(): Promise<unknown> { return this.writing; }
}

/** The page routes over fetch. */
export function fetchPageApi(fetcher: typeof fetch = fetch): PageApi {
	const base = (id: string) => `/api/library/pages/${encodeURIComponent(id)}`;
	const send = (url: string, method: string, body: unknown) => fetcher(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const stale = async (r: Response) => {
		const body = await r.json() as { head: PageHead; draft: PageDraftView | null };
		return { stale: { head: body.head, draft: body.draft } };
	};
	return {
		read: async (id) => {
			const r = await fetcher(base(id), { cache: "no-store" });
			if (r.status === 404) return null;
			if (!r.ok) throw new Error(String(r.status));
			return await r.json() as PageState;
		},
		putDraft: async (id, input) => {
			const r = await send(`${base(id)}/draft`, "PUT", input);
			if (r.status === 409) return stale(r);
			return r.ok ? await r.json() as { rev: number } : null;
		},
		commit: async (id, input) => {
			const r = await send(`${base(id)}/versions`, "POST", input);
			if (r.status === 409) return stale(r);
			return r.ok ? await r.json() as { version: PageVersion; created: boolean; otherVersion?: number } : null;
		},
		restore: async (id, n) => {
			const r = await send(`${base(id)}/restore`, "POST", { n });
			return r.ok ? await r.json() as { version: PageVersion } : null;
		},
	};
}

/** Backups in localStorage, one key per tab. A tab that crashed left a key no
 *  live tab owns; a new tab with none of its own picks up the newest. */
export function browserBackupStore(account: string, id: string, local: Storage, session: Storage): PageBackupStore {
	const prefix = `lh:page-backup:${account}:${id}:`;
	let tab = session.getItem("lh:page-tab");
	if (!tab) {
		tab = Math.random().toString(36).slice(2, 10);
		session.setItem("lh:page-tab", tab);
	}
	const own = prefix + tab;
	const parse = (raw: string | null): PageBackup | null => {
		if (!raw) return null;
		try { return JSON.parse(raw) as PageBackup; } catch { return null; }
	};
	return {
		read() {
			const mine = parse(local.getItem(own));
			if (mine) return mine;
			let newest: PageBackup | null = null;
			for (let i = 0; i < local.length; i++) {
				const key = local.key(i);
				if (!key?.startsWith(prefix)) continue;
				const backup = parse(local.getItem(key));
				if (backup && (!newest || backup.at > newest.at)) newest = backup;
			}
			return newest;
		},
		write(backup) {
			try { local.setItem(own, JSON.stringify(backup)); } catch { /* storage full: the status line already says not saved */ }
		},
		clear() { local.removeItem(own); },
	};
}
