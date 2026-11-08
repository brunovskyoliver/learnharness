/**
 * Storage ports (the hexagonal seams — vision §1 "storage stays swappable").
 *
 * One port per ENTITY, with domain operations — never one generic
 * key/value interface. Core and the service layer that orbits it code
 * against these types only; concrete adapters live in src/store/ (fs
 * JSON/JSONL today, SQLite drop-in later) and are wired exactly once, in
 * the composition root (src/server/stores.ts). Dependencies point one way:
 * adapters may import core; core NEVER imports an adapter.
 */

import type { LhMessage } from "./native-messages.ts";
import type { WikiPins } from "./note-links.ts";
import type {
	ChatRecord,
	ChatSettings,
	ChatSummary,
	GraphChain,
	GraphNode,
	JobKind,
	JobRecord,
	ExtractionRunUsage,
	PlanTree,
	Position,
	CoverageEntry,
	SessionCheckpoint,
	TurnUsage,
	NotesSource,
} from "./contracts.ts";
import type { UserSettings } from "./settings.ts";
import type { DiagramDoc, DiagramProposal, DiagramProposalStatus, DiagramRefusalCode } from "./diagram.ts";
import type { PageProposal, PageProposalStatus } from "./page-proposals.ts";
import type { LibraryFolder, LibraryItem, LibraryMarks, LibraryTrashEntry, LibraryRefusal, LibraryTextState, LibraryTombstone, PageAuthor, PageHead, PageState, PageVersion, PageVersionCause, PageWriteResult } from "./library.ts";

// ─── ChatStore — the session record's home (data/chats) ─────────────────────

export interface ChatStore {
	/** Create a session record (persisted immediately). */
	/** Create a session record; kind "practice" marks a practice session
	 *  (absent = teach, the default). */
	createChat(title: string, kind?: "practice", seed?: Pick<ChatRecord, "messages" | "settings" | "followup">): ChatRecord;
	/** Update startup independently of the child turn's message writes. */
	saveFollowupStartup(id: string, startup: NonNullable<ChatRecord["followup"]>["startup"]): void;
	/** The full record, or null if unknown id / corrupt file. */
	getChat(id: string): ChatRecord | null;
	/** All sessions, newest activity first (the sidebar's list view). */
	listChats(): ChatSummary[];
	/** Persist the full native message list (the record IS the agent
	 * state — Wave B, owner-approved 2026-09-26). */
	saveMessages(id: string, messages: LhMessage[]): void;
	/** Persist the session plan tree (plan tools call this in execute). */
	saveTree(id: string, tree: PlanTree): void;
	/** Append one usage entry to the record's turn log (the money channel,
	 * 2026-09): idempotent per turn id — each request carries its own, so
	 * a turn persisted twice appends once while continuation turns (which
	 * share a response message id) each keep their usage. */
	appendTurnUsage(id: string, entry: TurnUsage): void;
	/** Append one extraction-run usage entry — idempotent per startedAt. */
	appendExtractionUsage(id: string, entry: ExtractionRunUsage): void;
	/** Persist the per-chat model/thinking settings (the model control).
	 *  Replace-whole: the picker sends the complete settings object. */
	saveSettings(id: string, settings: ChatSettings): void;
	/** Rename a session (the header's click-to-edit title, 2026-09-17).
	 * Like saveSettings: a rename is NOT conversation activity — updatedAt
	 * stays put, so sidebar order never churns on a rename. */
	renameChat(id: string, title: string): ChatRecord;
	/** Delete the session record entirely (session-deletion wave 6, owner
	 *  2026-09-22). False when the id is unknown. The graph-ledger purge and
	 *  job cleanup are the caller's choreography (core/graph-deletion.ts +
	 *  the DELETE route), not the store's. */
	deleteChat(id: string): boolean;
}

// ─── GraphStore — the append-only evidence ledgers (data/graph) ──────────────
// Chains are the stored truth (owner, 2026-09-30): nodes + reasoning
// chains; edges are a DERIVED view (core/graph.ts) and never touch this
// seam. Reads return the raw append-order lines; merging chain assertions
// by (premises, conclusion) is DERIVED in core/graph.ts — the store never
// decides. The extraction pipeline is the sole writer; this read surface
// stays.

export interface GraphStore {
	/** Append one GraphNode (ids are unique — no merging needed). */
	appendNode(node: GraphNode): void;
	/** Raw node lines in append order. */
	readNodes(): GraphNode[];

	/** Append one chain ASSERTION (a second session asserting the same
	 *  (premises, conclusion) appends another line; readers merge). */
	appendChain(assertion: GraphChain): void;
	readChains(): GraphChain[];

	/** Append one emission checkpoint. */
	appendCheckpoint(checkpoint: SessionCheckpoint): void;
	readCheckpoints(): SessionCheckpoint[];
	/** Message-granular extraction coverage (vision-extraction-coverage.md):
	 *  append-only; one line per covered message. The chat-extraction
	 *  checkpoint — "uncovered" is derived from these, never tracked. */
	appendCoverage(entry: CoverageEntry): void;
	readCoverage(): CoverageEntry[];

	/** Append one cluster-naming run's usage (graph-global money channel) —
	 *  idempotent per startedAt. */

	/** Upsert one imported-notes source record (config.sourcesFile() — a
	 *  JSON map, not a ledger; an upsert keeps the existing usage log). */
	upsertSource(source: NotesSource): void;
	/** Every notes source record, by id order-insensitive. */
	readSources(): NotesSource[];
	/** Append one run's usage to a source record — idempotent per
	 *  startedAt, mirroring ChatRecord.extractions. */
	appendSourceUsage(id: string, entry: ExtractionRunUsage): void;

	/** The layout ledger (config.positionsFile()): nodeId → resting {x,y}.
	 *  WRITTEN ONLY by the incremental settle after a merge (core/layout.ts
	 *  settleGraphLayout) — read-only for everything else. */
	readPositions(): Record<string, Position>;
	/** Replace the whole ledger (the settle is a full-graph computation). */
	writePositions(positions: Record<string, Position>): void;

	/** THE DESTRUCTIVE SEAM (session-deletion wave 6, owner 2026-09-22 —
	 *  the first non-append operation on these ledgers): atomically
	 *  replace the full contents of any subset of the six rewritable
	 *  ledgers. Each provided array is written to a temp file and renamed
	 *  over the ledger (crash-safe: a torn write never replaces the
	 *  original); absent keys leave their ledger untouched. The pure
	 *  computation is core/graph-deletion.ts — the store only makes the
	 *  replacement atomic. */
	rewriteLedgers(next: {
		nodes?: GraphNode[];
		chains?: GraphChain[];
		coverage?: CoverageEntry[];
		checkpoints?: SessionCheckpoint[];
	}): void;
}

// ─── JobStore — background sub-agent jobs (data/jobs) ─────────────────────────

export interface CreateJobInit {
	kind: JobKind;
	chatId: string;
	toolCallId: string;
	/** First activity line (defaults to "starting"). */
	activity?: string;
	/** Saved on the job before its worker is spawned. */
	input?: unknown;
}

/** Mergeable fields — identity (id, kind, chatId, toolCallId, createdAt) is immutable. */
export type JobPatch = Partial<Omit<JobRecord, "id" | "kind" | "chatId" | "toolCallId" | "createdAt">>;

export interface JobStore {
	/** Create a running job (keyed by toolCallId for spawn dedup). */
	createJob(init: CreateJobInit): JobRecord;
	getJob(id: string): JobRecord | null;
	/** Merge a patch into the record; null if unknown id. */
	updateJob(id: string, patch: JobPatch): JobRecord | null;
	/** Jobs for a chat, or all chats when omitted, newest activity first. */
	listJobs(chatId?: string): JobRecord[];
	/** The job fulfilling a given tool part, if any (spawn-hook dedup). */
	findJobByToolCallId(chatId: string, toolCallId: string): JobRecord | null;
	/** Delete every job record for a chat — running or finished (session-
	 *  deletion wave 6). Returns how many files were removed. The deletion
	 *  route refuses while jobs are still running, so by the time this
	 *  fires every record is terminal. */
	deleteJobsForChat(chatId: string): number;
}

// ─── SettingsStore — THE user settings record (settings-storage wave, 2026-09-19) ──

/** The learner's documents and pages (feature 009). */
export interface LibraryStore {
	/** Live items after reconciling with the folder, by name. Throws
	 *  LibraryCatalogError when the catalog can't be used. */
	list(): Promise<LibraryItem[]>;
	/** A live item, or null for an unknown id or a tombstone. */
	get(id: string): Promise<LibraryItem | null>;
	/** Every entry including tombstones, after reconciling. For @ tokens, which
	 *  must resolve old and deleted names honestly. */
	catalog(): Promise<(LibraryItem | LibraryTombstone)[]>;
	/** A text item's bytes as UTF-8: a document's file, a page's head version. */
	readText(item: LibraryItem): Promise<string>;
	/** Store a validated name's bytes. Never overwrites; refusals store nothing. */
	writeUpload(name: string, body: AsyncIterable<Uint8Array>, declaredBytes: number, folderId?: string | null): Promise<LibraryItem | LibraryRefusal>;
	/** Every folder, by name (feature 011). */
	folders(): Promise<LibraryFolder[]>;
	createFolder(name: string, parentId: string | null): Promise<LibraryFolder | LibraryRefusal>;
	/** Null for an unknown id. Sibling names never collide. */
	renameFolder(id: string, name: string): Promise<LibraryFolder | LibraryRefusal | null>;
	/** Null for an unknown id. Refuses a cycle and a sibling name clash. */
	moveFolder(id: string, parentId: string | null): Promise<LibraryFolder | LibraryRefusal | null>;
	/** False for an unknown id. Refuses a folder with anything in it. */
	removeFolder(id: string): Promise<boolean | LibraryRefusal>;
	/** Null for an unknown id. Marks never touch content or `updatedAt`. */
	markItem(id: string, marks: LibraryMarks): Promise<LibraryItem | null>;
	markFolder(id: string, marks: Omit<LibraryMarks, "tags">): Promise<LibraryFolder | null>;
	/** Recoverable: bytes and versions are kept, and references read as deleted. */
	trashItem(id: string): Promise<LibraryTrashEntry | null>;
	/** A folder and everything under it, as one entry. */
	trashFolder(id: string): Promise<LibraryTrashEntry | null>;
	listTrash(): Promise<LibraryTrashEntry[]>;
	/** Puts everything back; a name now taken steps to a free one. Null when unknown. */
	restoreTrash(entryId: string): Promise<{ items: LibraryItem[]; folders: LibraryFolder[] } | null>;
	/** Deletes for good, leaving tombstones. False when unknown. */
	purgeTrash(entryId: string): Promise<boolean>;
	/** Newest first, live items only. */
	recent(limit?: number): Promise<LibraryItem[]>;
	/** Remembered apart from the catalog, so opening never rewrites it. */
	markOpened(id: string): Promise<boolean>;
	/** Changes only the catalog entry: bytes, versions and references stay. */
	moveItem(id: string, folderId: string | null): Promise<LibraryItem | LibraryRefusal | null>;
	/** Rename, moving the file too. Null for an unknown id. */
	rename(id: string, name: string): Promise<LibraryItem | LibraryRefusal | null>;
	/** Delete the bytes and leave a tombstone. False for an unknown id. */
	remove(id: string): Promise<boolean>;
	setTextState(id: string, state: LibraryTextState): Promise<void>;
	/** Cached text info: rebuildable, null when absent or damaged. */
	readDerived(id: string): Promise<unknown>;
	writeDerived(id: string, value: unknown): Promise<void>;
	documentPath(item: Pick<LibraryItem, "name" | "mirror">): string;
	/** A new page with its first version. */
	createPage(name: string, content: string, options: PageCreateOptions): Promise<{ item: LibraryItem; head: PageHead } | LibraryRefusal>;
	/** Head and draft, or null for an unknown id, a document or a tombstone. */
	readPage(id: string): Promise<PageState | null>;
	/** Compare-and-swap on base and rev; a mismatch changes nothing. */
	savePageDraft(id: string, input: { base: number; rev: number; content: string }): Promise<PageWriteResult<{ rev: number }>>;
	/** Text exactly equal to the newest version makes no version (`created: false`).
	 *  `cause: "conflict"` passes the compare and commits the other side's draft
	 *  first, reported as `otherVersion`. */
	commitPageVersion(id: string, input: { base: number; rev: number; content: string; cause?: PageVersionCause }): Promise<PageWriteResult<{ version: PageVersion; created: boolean; otherVersion?: number }>>;
	/** Newest first, metadata only. */
	listPageVersions(id: string): Promise<PageVersion[] | null>;
	readPageVersion(id: string, n: number): Promise<{ version: PageVersion; content: string } | null>;
	/** Names a version, or clears its name with null (feature 010). */
	namePageVersion(id: string, n: number, name: string | null): Promise<PageVersion | "missing">;
	/** The last version the learner has seen, and the tutor versions since. A
	 *  page never seen counts as seen up to its head, which is written. */
	readPageSeen(id: string): Promise<{ version: number; unseen: PageVersion[] } | "missing">;
	/** Moves the seen version forward, never past the head. */
	markPageSeen(id: string, version: number): Promise<{ version: number } | "missing">;
	/** Commits a dirty draft, then adds one version with the old text. */
	restorePageVersion(id: string, n: number): Promise<{ version: PageVersion } | "missing">;
	/** Agent revision under the page lock, per contracts/agent-tools.md. */
	revisePageAsAgent(id: string, revision: AgentRevision): Promise<AgentRevisionResult>;
	/** Clear origin.chatId from pages made in a deleted session. */
	unlinkChat(chatId: string): Promise<void>;
	/** Every live page's latest text, draft included, and the chats its versions name (feature 016). */
	pageTexts(): Promise<PageText[]>;
	/** What each page's wiki links meant when their target was renamed (feature 016). */
	wikiPins(): Promise<WikiPins>;
	/** Adds a block to the end as a new learner version, the draft committed first (feature 017). */
	appendToPage(id: string, block: string, options: { chatId?: string }): Promise<{ item: LibraryItem; version: PageVersion } | "missing" | "too-large">;
}

export interface PageText { item: LibraryItem; text: string; chatIds: string[]; ideas?: { nodeId: string; name: string }[] }

/** What a diagram read answers (feature 022). `content` is the stored JSON. */
export type DiagramRead = PageState | { refused: DiagramRefusalCode; message: string; item: LibraryItem };
export type DiagramWrite<T> = PageWriteResult<T> | { refused: DiagramRefusalCode; message: string };
export type ProposalOutcome =
	| { outcome: "approved"; proposal: DiagramProposal; item: LibraryItem; version: PageVersion; savedLearnerVersion?: number }
	| { outcome: "stale"; head: number }
	| { outcome: "resolved"; proposal: DiagramProposal }
	| { outcome: "missing" }
	| { outcome: "target-gone" }
	| { outcome: "refused"; code: DiagramRefusalCode; message: string }
	| { outcome: "name-taken"; refusal: LibraryRefusal };

/** Diagrams and their proposals (feature 022). A diagram's catalog row, marks and
 *  trash are the LibraryStore's; these are its versions and what the agent proposes. */
export interface DiagramStore {
	create(name: string, doc: DiagramDoc, options: PageCreateOptions): Promise<{ item: LibraryItem; head: PageHead } | LibraryRefusal>;
	/** Null for an unknown id or another kind. A newer schema is refused, not read. */
	read(id: string): Promise<DiagramRead | null>;
	saveDraft(id: string, input: { base: number; rev: number; content: string }): Promise<DiagramWrite<{ rev: number }>>;
	commit(id: string, input: { base: number; rev: number; content: string; cause?: PageVersionCause }): Promise<DiagramWrite<{ version: PageVersion; created: boolean; otherVersion?: number }>>;
	versions(id: string): Promise<PageVersion[] | null>;
	version(id: string, n: number): Promise<{ version: PageVersion; content: string } | null>;
	restore(id: string, n: number): Promise<{ version: PageVersion } | "missing" | { refused: DiagramRefusalCode; message: string }>;
	/** Stores a proposal apart from the diagram. The same call again returns the same one. */
	propose(input: { diagramId: string | null; name: string; summary: string; baseVersion: number | null; doc: DiagramDoc; chatId?: string; toolCallId?: string }): Promise<DiagramProposal | "missing">;
	proposals(filter?: { diagramId?: string; status?: DiagramProposalStatus }): Promise<DiagramProposal[]>;
	proposal(id: string): Promise<DiagramProposal | null>;
	/** Edit first: changes only the proposal. */
	editProposal(id: string, doc: DiagramDoc): Promise<DiagramProposal | "missing" | "resolved">;
	reject(id: string): Promise<ProposalOutcome>;
	/** `expected` is what the learner compared against. A move since then refuses, so
	 *  an approval can't undo what he never saw. His draft becomes his version first. */
	approve(id: string, options: { expected?: { head: number; rev: number }; name?: string }): Promise<ProposalOutcome>;
	/** A deleted session's proposals lose their link, as its pages do. */
	unlinkChat(chatId: string): Promise<void>;
}

export type PageProposalAccept =
	| { outcome: "accepted"; proposal: PageProposal; item: LibraryItem; version: PageVersion; savedLearnerVersion?: number }
	/** The head is not the one the tutor changed. */
	| { outcome: "moved"; head: number }
	/** His typing since sits on the same lines. */
	| { outcome: "overlap"; head: number }
	/** The page isn't what the review compared against. */
	| { outcome: "compared-stale"; head: number }
	| { outcome: "too-large" }
	| { outcome: "resolved"; proposal: PageProposal }
	| { outcome: "target-gone" }
	| { outcome: "missing" };

export interface PageProposalReview {
	proposal: PageProposal;
	/** Null once the page has left the Library. `merged` is what Accept would write, null if it can't. */
	current: { text: string; name: string; expected: { head: number; rev: number }; merged: string | null; moved: boolean } | null;
}

/** Held page edits (feature 023). Nothing but `accept` touches a page. */
export interface PageProposalStore {
	/** Same contract as an agent revision's base and `apply`, with no write to the page or its draft. */
	propose(input: { pageId: string; baseVersion: number; chatId?: string; toolCallId?: string; apply: (head: string) => string | { refused: string } }): Promise<
		| { outcome: "proposed"; proposal: PageProposal }
		| { outcome: "stale"; head: number }
		| { outcome: "refused"; reason: string }
		| { outcome: "too-large" }
		| { outcome: "missing" }
	>;
	proposals(filter?: { pageId?: string; status?: PageProposalStatus }): Promise<PageProposal[]>;
	proposal(id: string): Promise<PageProposal | null>;
	review(id: string): Promise<PageProposalReview | null>;
	edit(id: string, text: string): Promise<PageProposal | "missing" | "resolved" | "too-large">;
	reject(id: string): Promise<{ outcome: "rejected" | "resolved"; proposal: PageProposal } | { outcome: "missing" }>;
	accept(id: string, expected: { head: number; rev: number }): Promise<PageProposalAccept>;
	/** A deleted session's proposals stay and lose their link, as its pages do. */
	unlinkChat(chatId: string): Promise<void>;
}

export interface PageCreateOptions { author: PageAuthor; chatId?: string; toolCallId?: string; folderId?: string | null }

export interface AgentRevision {
	baseVersion: number;
	chatId?: string;
	toolCallId?: string;
	/** The new text from the head's, or why it can't apply. Runs under the lock. */
	apply: (head: string) => string | { refused: string };
}

export type AgentRevisionResult =
	| { outcome: "revised"; item: LibraryItem; version: PageVersion; savedLearnerVersion?: number; repeated?: boolean }
	| { outcome: "stale"; head: number; savedLearnerVersion?: number }
	| { outcome: "refused"; reason: string; savedLearnerVersion?: number }
	| { outcome: "too-large"; savedLearnerVersion?: number }
	| { outcome: "missing" };

/**
 * The one record for every non-secret product preference (core/settings.ts
 * UserSettings — delta semantics, see that module's doc). The store is
 * replace-whole on the RECORD; per-section scoping is a server-band concern
 * (single process, no stale-client hazard to defend against at this seam).
 * Schema-version lazy migration happens inside readSettings, never in
 * the callers. (The legacy default-settings.json fold died with the chat
 * section — per-session models, owner 2026-09-28.)
 */
export interface SettingsStore {
	/** The sanitized record, or null when none exists yet (first boot). */
	readSettings(): UserSettings | null;
	/** Persist the record (replace-whole). Callers pass a SANITIZED record. */
	writeSettings(settings: UserSettings): void;
}

// ─── PromptOverrideStore — per-segment system-prompt overrides (2026-09-19) ──

/**
 * User text overriding ONE source prompt segment (the shared base or one
 * numeric fragment), stored at the data-dir seam mirroring the source
 * layout (config.PROMPTS_OVERRIDE_DIR). File presence is NOT the override:
 * the settings record's agent.prompts switch is the explicit on/off, so a
 * user can keep a customized file on disk while running the source default.
 * The segment LIST is always derived from source at runtime — see the
 * adapter (src/store/prompt-overrides.ts) for the loader rules.
 */
export interface PromptOverrideStore {
	/** Every override path currently on disk ("system-prompt.md",
	 *  "teacher/20-teaching.md", ...), POSIX-relative, sorted. */
	listOverrides(): string[];
	/** The override text, or null when the path has no file. */
	readOverride(segmentPath: string): string | null;
	/** Persist override text for a segment path (creates parents). */
	writeOverride(segmentPath: string, text: string): void;
	/** Remove the override file, if present (switches are untouched — an
	 *  on-switch with no file composes the source default, inert). */
	deleteOverride(segmentPath: string): void;
}

// ─── Repo tokens (feature 026, research R8) ────────────────────────────────

/** Personal access tokens for repo links: { [linkId]: token } in a 0600 file
 *  beside auth.json, never in it, so a token is never reflected into
 *  process.env nor listed on the keys page. Per tenant in hosted mode. */
export interface RepoTokenStore {
	get(linkId: string): string | null;
	set(linkId: string, token: string): void;
	/** Absent = silent success. */
	delete(linkId: string): void;
	/** `maskKey` of the token, or null when none is stored. The only form the client sees. */
	mask(linkId: string): string | null;
}

/** Library git sync's transport (feature 026, research R5): the branch tip
 *  without a fetch, and a shallow read of one commit's tree. Failures throw
 *  `RepoRemoteError` (core/repo-link.ts) carrying a `SyncFailure`. */
export interface RepoRemoteRequest {
	url: string;
	/** Sent as Basic `x-access-token:<token>`; never logged or echoed. */
	token?: string;
	/** Omitted: the remote's default branch (its HEAD). */
	branch?: string;
}
export interface RepoTip { branch: string; commit: string }
export interface RepoTreeEntry {
	/** Repo-relative, "/"-separated. */
	path: string;
	/** git mode: "100644", "100755", "120000", "160000". */
	mode: string;
	oid: string;
	type: "blob" | "commit";
	/** The blob's bytes (blobs only), read from the local shallow clone. */
	read(): Promise<Uint8Array>;
}
export interface RepoSnapshotRequest extends RepoRemoteRequest {
	branch: string;
	/** Names the temp gitdir under library/git-work/. */
	linkId: string;
	/** Directories not walked (counted by the caller). */
	skipDirectory?(path: string, name: string): boolean;
	/** Download cap; default REPO_MAX_BYTES. Tests lower it. */
	maxDownloadBytes?: number;
}
export interface RepoRemote {
	tip(request: RepoRemoteRequest): Promise<RepoTip>;
	/** Depth-1, single-branch clone into a temp gitdir, every non-directory entry
	 *  of the tip's tree handed to `visit` while the clone exists, then the gitdir
	 *  is deleted. Resolves with the commit read. */
	snapshot(request: RepoSnapshotRequest, visit: (entry: RepoTreeEntry) => Promise<void> | void): Promise<RepoTip>;
}

// ─── AuthStore — BYOK provider keys (auth-keys wave, 2026-09-19) ────────────

/**
 * The long-standing flat {VAR: value} auth.json map (config.AUTH_FILE) —
 * the same file the Electron app has always hand-edited, now first-class
 * server-managed. Values are opaque strings: shape validation is a
 * server-band concern (core/auth-keys.ts validateKeyShape — the store
 * persists what it is given); env precedence is a server-band concern
 * too (src/server/keys.ts). Unknown vars ride along verbatim.
 */
export interface AuthStore {
	/** The whole map — absent or corrupt file = {} ("no keys yet", the
	 *  documented first-boot state). Never throws. */
	authVars(): Record<string, string>;
	/** Set one VAR (atomic write, mode 0600 always, other vars preserved). */
	setAuthVar(name: string, value: string): void;
	/** Remove one VAR if present (absent = no-op, still a silent success). */
	deleteAuthVar(name: string): void;
}


/** Temporary PDFs owned by one teacher turn or researcher run. */
export interface PaperFiles {
	write(bytes: Uint8Array): Promise<string>;
	dispose(): Promise<void>;
}
