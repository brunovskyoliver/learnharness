/**
 * Note links, sources and the graph, read deterministically from what is stored
 * (features 016-017, specs/016-intelligent-notes/contracts). No handler here
 * calls a model or writes a ledger. Routes wrap these in withTenant, and the
 * stores are tenant-scoped, so one tenant's pages can't appear in another's.
 */
import { isRefusal, LIBRARY_REFUSALS, LibraryCatalogError } from "../core/library.ts";
import { getGraph } from "../core/graph.ts";
import { backlinksOf, outgoingLinks, relatedNotes, wikiTable, type NoteDoc } from "../core/note-links.ts";
import { graphLinksOf, PASSAGE_MAX_CHARS, passageBlock, scanSourceRefs, sourceHref, studyNotesMarkdown, studyNotesName } from "../core/note-sources.ts";
import type { PageText } from "../core/ports.ts";
import { stores } from "./stores.ts";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function guarded(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (err) {
		if (!(err instanceof LibraryCatalogError)) throw err;
		console.error("[notes]", err.message);
		return json({ error: "Your Library could not be loaded.", code: "catalog" }, 500);
	}
}

const pageGone = () => json({ error: "That page is no longer in your Library." }, 404);
const sessionGone = () => json({ error: "That session is no longer here." }, 404);

const asDoc = ({ item, text }: PageText): NoteDoc => ({
	id: item.id, name: item.name, text,
	...(item.tags ? { tags: item.tags } : {}),
	...(item.folderId ? { folderId: item.folderId } : {}),
	...(item.archivedAt ? { archived: true } : {}),
});

/** The sessions a page came from or was edited in. */
function sessionsOfPage(page: PageText): string[] {
	const origin = page.item.origin.type === "agent" ? page.item.origin.chatId : undefined;
	return [...new Set([...scanSourceRefs(page.text).map((ref) => ref.chatId), ...page.chatIds, ...(origin ? [origin] : [])])];
}

interface SourceRow { chatId: string; messageId: string | null; title: string | null; gone: boolean; href: string }

/** One row per place cited. A deleted session reads as gone; the page's text stays. */
function sourceRows(text: string): SourceRow[] {
	const rows = new Map<string, SourceRow>();
	for (const { chatId, messageId } of scanSourceRefs(text)) {
		const key = `${chatId}\n${messageId ?? ""}`;
		if (rows.has(key)) continue;
		const chat = stores.chatStore.getChat(chatId);
		rows.set(key, { chatId, messageId, title: chat?.title ?? null, gone: !chat, href: sourceHref(chatId, messageId) });
	}
	return [...rows.values()];
}

/** GET what the editor needs to draw links: every entry, this page's pins, its sources. */
export function wikiCatalogResponse(request: Request): Promise<Response> {
	return guarded(async () => {
		const pageId = new URL(request.url).searchParams.get("page");
		const [entries, pins] = await Promise.all([stores.libraryStore.catalog(), stores.libraryStore.wikiPins()]);
		const page = pageId ? await stores.libraryStore.readPage(pageId) : null;
		const text = page ? page.draft?.content ?? page.head.content : "";
		return json({ entries, pins: pageId ? pins[pageId] ?? {} : {}, sources: sourceRows(text) });
	});
}

/** GET a page's connections: links, backlinks, related notes, sessions, sources and graph. */
export function pageConnectionsResponse(id: string): Promise<Response> {
	return guarded(async () => {
		const [pages, entries, pins] = await Promise.all([stores.libraryStore.pageTexts(), stores.libraryStore.catalog(), stores.libraryStore.wikiPins()]);
		const self = pages.find((page) => page.item.id === id);
		if (!self) return pageGone();
		const table = wikiTable(entries);
		const docs = pages.map(asDoc);
		const sessionsByDoc = new Map(pages.map((page) => [page.item.id, sessionsOfPage(page)]));
		const sessionIds = sessionsByDoc.get(id) ?? [];
		const sessions = sessionIds.map((chatId) => {
			const chat = stores.chatStore.getChat(chatId);
			return { chatId, title: chat?.title ?? null, gone: !chat, href: sourceHref(chatId, null) };
		});
		return json({
			links: outgoingLinks(asDoc(self), table, pins),
			backlinks: backlinksOf(id, docs, table, pins),
			related: relatedNotes(id, docs, table, pins, (doc) => sessionsByDoc.get(doc.id) ?? []),
			sources: sourceRows(self.text),
			sessions,
			graph: graphLinksOf(self.text, sessionIds, getGraph(stores.graphStore).nodes),
		});
	});
}

/** GET the pages tied to a session: the other direction of the same links. */
export function sessionPagesResponse(chatId: string): Promise<Response> {
	return guarded(async () => {
		if (!stores.chatStore.getChat(chatId)) return sessionGone();
		const pages = await stores.libraryStore.pageTexts();
		const rows = pages.filter((page) => sessionsOfPage(page).includes(chatId)).map(({ item, text }) => ({
			id: item.id, name: item.name, kind: item.kind, size: item.size,
			passages: scanSourceRefs(text).filter((ref) => ref.chatId === chatId).length,
		}));
		return json({ pages: rows.sort((a, b) => a.name.localeCompare(b.name)) });
	});
}

const inChat = (chat: { messages: readonly { id: string }[] }, messageId: string) => chat.messages.some((message) => message.id === messageId);

/** POST a passage to a page. The session and message are checked, and the title
 *  comes from the session, never from the client. */
export function pagePassageResponse(request: Request, id: string): Promise<Response> {
	return guarded(async () => {
		const body = await request.json().catch(() => null) as { markdown?: unknown; chatId?: unknown; messageId?: unknown } | null;
		if (typeof body?.markdown !== "string" || !body.markdown.trim() || typeof body.chatId !== "string" || typeof body.messageId !== "string") return json({ error: "That passage could not be read." }, 400);
		if (body.markdown.length > PASSAGE_MAX_CHARS) return json({ error: "That passage is too long to save at once." }, 413);
		const chat = stores.chatStore.getChat(body.chatId);
		if (!chat) return sessionGone();
		if (!inChat(chat, body.messageId)) return json({ error: "That message is no longer in the session." }, 404);
		const result = await stores.libraryStore.appendToPage(id, passageBlock(body.markdown, { chatId: chat.id, messageId: body.messageId, title: chat.title }), { chatId: chat.id });
		if (result === "missing") return pageGone();
		if (result === "too-large") return json({ error: LIBRARY_REFUSALS.pageTooLarge.message, code: "too_large" }, 413);
		return json(result, 201);
	});
}

/** POST "Turn this lesson into study notes": the deterministic extract, on an
 *  explicit click, as a new page. No model is called, so it costs nothing. */
export function studyNotesResponse(chatId: string): Promise<Response> {
	return guarded(async () => {
		const chat = stores.chatStore.getChat(chatId);
		if (!chat) return sessionGone();
		if (chat.kind === "practice") return json({ error: "Study notes are made from lessons.", code: "practice" }, 409);
		const content = studyNotesMarkdown(chat);
		if (!content) return json({ error: "This lesson has nothing to turn into notes yet.", code: "empty" }, 409);
		const name = studyNotesName(chat.title);
		const first = await stores.libraryStore.createPage(name, content, { author: "learner", chatId });
		const made = isRefusal(first) && first.suggestedName ? await stores.libraryStore.createPage(first.suggestedName, content, { author: "learner", chatId }) : first;
		if (isRefusal(made)) return json({ error: made.message, code: made.refused }, made.refused === "too_large" ? 413 : 409);
		return json(made, 201);
	});
}
