import { notFound } from "next/navigation";
import { Chat } from "@/components/chat";
import { continueDraft, lessonProgressOf, slotsConfigured } from "@/src/core";
import { clientMessages, compactionInFlight, getChat, isTurnRunning, sessionCost, readSettingsRecord, turnFailure, withTenantPage } from "@/src/server";

export const dynamic = "force-dynamic";

async function ChatPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ prompt?: string; answer?: string; continue?: string }>;
}) {
	const [{ id }, { prompt, answer, continue: resume }] = await Promise.all([params, searchParams]);
	const chat = getChat(id);
	if (!chat) notFound();
	// The persistent setup CTA's seed (BYOK, owner 2026-09-22): slotsConfigured
	// over the settings record, server-read — the same gate home/new read. The
	// server's 503 stays the truth; this only decides whether the pill rides.
	const record = readSettingsRecord();
	// Home's Continue (feature 003): the draft names the next topic as of
	// now, so a stale list never drafts a finished topic.
	const progress = resume === "1" && chat.kind !== "practice" ? lessonProgressOf(chat.tree, chat.messages) : null;
	return (
		<Chat
			key={chat.id}
			chatId={chat.id}
			title={chat.title}
			kind={chat.kind ?? "teach"}
			// Wave D: the record IS native agent history — the client view is
				// derived app-side (core/view.ts projectView; GET serves the same
				// native messages).
				initialMessages={clientMessages(chat.messages)}
			initialTurns={chat.turns ?? []}
			initialPricing={sessionCost(chat)}
			initialError={turnFailure(chat.id)}
			initialConfigured={slotsConfigured(record?.models)}
			initialSettings={chat.settings}
			initialModels={record?.models}
			initialPrompt={prompt}
			initialAnswer={answer}
			initialContinue={resume === "1" ? { draft: progress ? continueDraft(progress) : undefined } : undefined}
			// A teacher turn that outlived its client: the remounted view must
			// attach (busy shimmer + poll), never resurrect the stale record.
			initiallyInFlight={isTurnRunning(chat.id)}
			initiallyCompacting={compactionInFlight(chat.id)}
		/>
	);
}

export default withTenantPage(ChatPage);
