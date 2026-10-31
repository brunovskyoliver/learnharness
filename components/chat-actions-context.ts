import { createContext } from "react";

/** Why a page can't ask the tutor right now (feature 010): the same states
 *  that keep the composer from sending. Null: it can. */
export type ChatSendBlock = "question" | "problem" | "busy" | null;

/**
 * Server-sync channel for artifact renderers: the CENTRAL jobs poll in Chat
 * calls syncFromServer() when a background job settles — the wake turn's
 * steer + response are already persisted by then, so fresh messages replace
 * local state in one pull. sendText feeds the demo error-fix loop.
 * (contracts.ts "THE ASYNC PROTOCOL" §4.) Kept apart from chat.tsx so the
 * page editor can read it without loading the chat.
 */
export const ChatActionsContext = createContext<{
	chatId: string;
	syncFromServer: () => Promise<void>;
	/** Send a user message into the session (demo error-fix loop, W6). */
	sendText: (text: string) => void;
	/** Opens the model setup dialog (BYOK, 2026-09-22): refused job cards
	 *  deep-link into the same SetupDialog the send interception uses. */
	openSetup: () => void;
	/** Puts text in the composer and focuses it, sending nothing (page Ask…). */
	fillComposer: (text: string) => void;
	sendBlock: ChatSendBlock;
} | null>(null);
