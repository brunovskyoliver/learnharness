"use client";

/**
 * "← Back to {lesson}" (feature 027, ui-contract §5): shown in the Library
 * while a chip's return point exists, across items, folders and a reload.
 * Goes back through history when the lesson is right behind this entry, else
 * pushes the lesson's address (research R9). The lesson puts focus back on
 * the chip and forgets the point (components/reference-return.ts).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { useSessionList } from "@/components/session-list";
import { readReturnPoint, returnRoute, RETURN_EVENT, type ReturnPoint } from "@/components/reference-return";

/** The return point, kept in step with this tab's storage. */
export function useReturnPoint(): ReturnPoint | null {
	const [point, setPoint] = useState<ReturnPoint | null>(null);
	useEffect(() => {
		const read = () => setPoint(readReturnPoint());
		read();
		window.addEventListener(RETURN_EVENT, read);
		return () => window.removeEventListener(RETURN_EVENT, read);
	}, []);
	return point;
}

export function BackPill({ point }: { point: ReturnPoint }) {
	const router = useRouter();
	const { chats } = useSessionList();
	const title = chats?.find((chat) => chat.id === point.chatId)?.title?.trim() || point.title;
	const label = `Back to ${title}`;
	const [announced, setAnnounced] = useState("");
	useEffect(() => {
		// Said once when it appears, not on every title refresh.
		const timer = window.setTimeout(() => setAnnounced(`${label} is available.`), 150);
		return () => window.clearTimeout(timer);
	}, [point.pushed]);
	const goBack = () => {
		const route = returnRoute(point, window.history.state);
		if (route.type === "back") router.back();
		else router.push(route.href);
	};
	return (
		<div className="lh-back-pill-row">
			<button type="button" className="nb-pill lh-back-pill" onClick={goBack} data-testid="back-pill">
				<ArrowLeftIcon aria-hidden="true" />
				<span className="min-w-0 truncate">{label}</span>
			</button>
			<p role="status" aria-live="polite" className="sr-only">{announced}</p>
		</div>
	);
}
