"use client";

/** Selecting lesson text offers "Save to a page" (feature 017). Small, because
 *  the transcript loads it: the dialog arrives on the first use. */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type RefObject } from "react";
import { BookmarkPlusIcon } from "lucide-react";
import { SAVE_PASSAGE_EVENT } from "@/components/library/page-pane-api";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { parseCitationHref } from "@/src/core";
import { readPassageSelection, type PassageSelection } from "./passage-selection";

const SavePassageDialog = dynamic(() => import("@/components/library/save-passage-dialog.tsx").then((m) => m.SavePassageDialog), { ssr: false });

export function TranscriptPassages({ chatId, scopeRef }: { chatId: string; scopeRef: RefObject<HTMLElement | null> }) {
	const [selected, setSelected] = useState<PassageSelection | null>(null);
	const [saving, setSaving] = useState<PassageSelection | null>(null);
	const [nothing, setNothing] = useState(false);
	// What was last selected, because the palette's field takes the selection away.
	const last = useRef<PassageSelection | null>(null);
	useEffect(() => {
		let frame = 0;
		const read = () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const next = readPassageSelection(window.getSelection(), scopeRef.current);
				if (next) last.current = next;
				setSelected(next);
			});
		};
		document.addEventListener("selectionchange", read);
		// Text may have been selected before this mounted.
		read();
		return () => { cancelAnimationFrame(frame); document.removeEventListener("selectionchange", read); };
	}, [scopeRef]);
	useEffect(() => {
		const fromPalette = () => {
			if (last.current) { setNothing(false); setSaving(last.current); }
			else setNothing(true);
		};
		window.addEventListener(SAVE_PASSAGE_EVENT, fromPalette);
		return () => window.removeEventListener(SAVE_PASSAGE_EVENT, fromPalette);
	}, []);
	useEffect(() => {
		if (!nothing) return;
		const timer = window.setTimeout(() => setNothing(false), 4000);
		return () => window.clearTimeout(timer);
	}, [nothing]);
	// A PDF citation in the transcript opens the viewer beside it (feature 020).
	const workspace = useWorkspace();
	const [citeFailed, setCiteFailed] = useState(false);
	useEffect(() => {
		const scope = scopeRef.current;
		if (!scope) return;
		const onClick = (event: MouseEvent) => {
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
			const anchor = (event.target as Element | null)?.closest?.("a[href]");
			const citation = anchor ? parseCitationHref(anchor.getAttribute("href") ?? "") : null;
			if (!citation) return;
			event.preventDefault();
			event.stopPropagation();
			setCiteFailed(false);
			void import("@/components/library/use-note-links").then(({ openCitation }) => openCitation(citation)).then((target) => {
				if (target) workspace?.openItem(target.item, target.jump);
				else setCiteFailed(true);
			});
		};
		scope.addEventListener("click", onClick, true);
		return () => scope.removeEventListener("click", onClick, true);
	}, [scopeRef, workspace]);
	useEffect(() => {
		if (!citeFailed) return;
		const timer = window.setTimeout(() => setCiteFailed(false), 6000);
		return () => window.clearTimeout(timer);
	}, [citeFailed]);
	const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
	return (
		<>
			{selected && !saving && (
				<button
					type="button"
					className="lh-passage-trigger"
					data-testid="save-passage"
					style={{
						left: `clamp(0.5rem, calc(${selected.rect.left}px - 4.5rem), calc(100vw - 10rem))`,
						// Under the selection on touch, where the system's own menu sits above it.
						top: Math.min(window.innerHeight - 56, Math.max(8, coarse ? selected.rect.bottom + 8 : selected.rect.top - 40)),
					}}
					// Keeps the selection while the pointer presses.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => setSaving(selected)}
				>
					<BookmarkPlusIcon className="ui-icon" aria-hidden="true" />
					Save to a page
				</button>
			)}
			{nothing && <p role="status" className="lh-passage-trigger" style={{ left: "0.5rem", bottom: "0.5rem" }}>Select some lesson text first.</p>}
			{citeFailed && <p role="status" className="lh-passage-trigger" data-testid="citation-missing" style={{ left: "0.5rem", bottom: "0.5rem" }}>That document is no longer in your Library.</p>}
			{saving && <SavePassageDialog chatId={chatId} passage={saving} onClose={() => setSaving(null)} />}
		</>
	);
}
