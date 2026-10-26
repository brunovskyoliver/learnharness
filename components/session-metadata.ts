import type { ChatSettings, SessionPricing, TurnUsage } from "@/src/core";
import type { SessionCoverage } from "./extraction-coverage";

interface SessionMetadata {
	turns: TurnUsage[];
	pricing?: SessionPricing;
	settings?: ChatSettings;
	coverage?: SessionCoverage | null;
}

// Only concurrent reads share a request. No completed record/account cache
// can survive sign-out, and later events always read fresh server truth.
const pending = new Map<string, Promise<SessionMetadata>>();
export function readSessionMetadata(chatId: string, revalidate = false): Promise<SessionMetadata> {
	const existing = pending.get(chatId);
	if (existing && !revalidate) return existing;
	const request = fetch(`/api/chats/${encodeURIComponent(chatId)}/metadata`)
		.then((response) => { if (!response.ok) throw Error(`Session metadata: ${response.status}`); return response.json() as Promise<SessionMetadata>; })
		.finally(() => { if (pending.get(chatId) === request) pending.delete(chatId); });
	pending.set(chatId, request);
	return request;
}
