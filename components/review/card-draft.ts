import { useContext } from "react";
import { SessionAccountContext } from "@/components/session-state";

/** A card being written lives here until it's saved or discarded, so navigating
 *  away or reloading loses nothing. Local only, like a page's draft. */
export interface CardDraft { front: string; back: string; conceptIds: { id: string; name: string }[]; source?: unknown; sourceLabel?: string | null }

const draftKey = (account: string | null, id: string) => `lh:card-draft:v1:${encodeURIComponent(account ?? "local")}:${encodeURIComponent(id)}`;
const openKey = (account: string | null) => `lh:card-draft-open:v1:${encodeURIComponent(account ?? "local")}`;

export function useCardDraftStore() {
	const account = useContext(SessionAccountContext);
	const safely = <T,>(run: () => T, fallback: T): T => { try { return run(); } catch { return fallback; } };
	return {
		read: (id: string): CardDraft | null => safely(() => {
			const raw = localStorage.getItem(draftKey(account, id));
			const parsed = raw ? JSON.parse(raw) as CardDraft : null;
			return parsed && typeof parsed.front === "string" && typeof parsed.back === "string" ? { ...parsed, conceptIds: Array.isArray(parsed.conceptIds) ? parsed.conceptIds : [] } : null;
		}, null),
		write: (id: string, draft: CardDraft) => safely(() => localStorage.setItem(draftKey(account, id), JSON.stringify(draft)), undefined),
		clear: (id: string) => safely(() => localStorage.removeItem(draftKey(account, id)), undefined),
		/** Which editor was open, so a reload comes back to it. */
		readOpen: (): string | null => safely(() => localStorage.getItem(openKey(account)), null),
		writeOpen: (id: string | null) => safely(() => { if (id) localStorage.setItem(openKey(account), id); else localStorage.removeItem(openKey(account)); }, undefined),
	};
}
