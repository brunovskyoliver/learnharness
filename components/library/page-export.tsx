"use client";

/** Export (feature 010, US5): copy the stored Markdown or print the rendered page
 *  alone; files come from the shared export dialog (feature 025 T049). Print uses
 *  the browser's dialog; no PDF library. */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MessageResponse } from "@/components/ai-elements/message";

/** "{page name}.md", with characters no file system takes replaced. */
export function markdownFileName(name: string): string {
	const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "Page";
	return `${safe}.md`;
}

/** Renders the page for print only, under its name as the document title,
 *  prints once it has drawn, then goes. */
export function PrintRoot({ name, text, onDone }: { name: string; text: string; onDone: () => void }) {
	const root = useRef<HTMLDivElement>(null);
	const done = useRef(onDone);
	done.current = onDone;
	useEffect(() => {
		const previousTitle = document.title;
		document.title = name;
		document.documentElement.dataset.lhPrinting = "";
		const finish = () => {
			delete document.documentElement.dataset.lhPrinting;
			document.title = previousTitle;
			done.current();
		};
		window.addEventListener("afterprint", finish, { once: true });
		// Two frames: React has drawn the page and KaTeX has laid it out.
		let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => window.print()); });
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("afterprint", finish);
			delete document.documentElement.dataset.lhPrinting;
			document.title = previousTitle;
		};
	}, [name]);
	return createPortal(
		<div ref={root} id="lh-print-root" data-testid="page-print-root" className="lh-prose">
			<MessageResponse>{text}</MessageResponse>
		</div>,
		document.body,
	);
}
