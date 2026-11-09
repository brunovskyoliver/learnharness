"use client";

/**
 * The Links panel in Notebook (feature 024, T044; FR-013): the page's place
 * among the other notes, read from the same connections as Study's pane
 * (features 016-017, `useNoteConnections`) and set in Notebook type. A quiet
 * lifted panel at the right, opened from the sidebar footer's "Links": the
 * page slides aside as it does for the note chat. Links to this page, Links
 * from this page, Related notes, Lessons, Ideas in your graph, each with its
 * empty sentence. A page opens as a note here; anything else (a lesson, a
 * graph idea, a diagram or PDF) opens in Study, which becomes the mode.
 * A Radix Dialog: focus stays in it, Escape or a click on the page closes it
 * and the focus goes back where it was.
 */
import { XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import type { ReactNode, RefObject } from "react";
import { writeSettingsKey } from "@/components/interface-switch";
import { CONNECTION_EMPTY, useNoteConnections } from "@/components/workspace/note-connections";
import { notebookHref, type LibraryKind, type NoteLinkRow } from "@/src/core";
import { BlotGlyph } from "./blot";
import { useNotebook } from "./nb-shared";

export const LINKS_TITLE = "Links";

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="nb-links-section" aria-label={title}>
			<h3 className="nb-links-label">{title}</h3>
			<ul className="nb-links-list">{children}</ul>
		</section>
	);
}

const Empty = ({ children }: { children: ReactNode }) => <li className="nb-links-empty">{children}</li>;

function Row({ name, meta, onOpen, testId, state }: { name: string; meta?: string | null; onOpen?: () => void; testId: string; state?: string }) {
	const body = (
		<>
			<span className="nb-links-name">{name}</span>
			{meta ? <span className="nb-links-meta">{meta}</span> : null}
		</>
	);
	return (
		<li>
			{onOpen
				? <button type="button" className="nb-links-row" data-testid={testId} data-state={state} onClick={onOpen}>{body}</button>
				: <div className="nb-links-row" data-testid={testId} data-state={state} data-static="">{body}</div>}
		</li>
	);
}

export function LinksPanel({ open, onOpenChange, pageId, noteName, returnFocus }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pageId: string;
	noteName: string;
	returnFocus: RefObject<HTMLElement | null>;
}) {
	const nb = useNotebook();
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal container={nb.root ?? undefined}>
				<Dialog.Overlay className="nb-chat-dim" data-testid="nb-links-dim" />
				<Dialog.Content
					className="nb-chat nb-links"
					data-testid="nb-links-panel"
					data-nb-hold-reads=""
					aria-describedby="nb-links-sub"
					onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }}
				>
					<header className="nb-chat-head">
						<div className="nb-chat-heading">
							<BlotGlyph className="nb-chat-dot" size={9} />
							<Dialog.Title className="nb-chat-title nb-voice">{LINKS_TITLE}</Dialog.Title>
						</div>
						<p id="nb-links-sub" className="nb-chat-sub">{`On “${noteName}”`}</p>
						<Dialog.Close className="nb-chat-close" aria-label="Close links" data-testid="nb-links-close">
							<XIcon aria-hidden="true" size={15} strokeWidth={1.6} />
						</Dialog.Close>
					</header>
					{/* Read only while shown, as Study's pane does. */}
					{open && <LinksBody pageId={pageId} onLeave={() => onOpenChange(false)} />}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function LinksBody({ pageId, onLeave }: { pageId: string; onLeave: () => void }) {
	const router = useRouter();
	const { data, failed, refresh } = useNoteConnections(pageId);
	const openNote = (id: string) => {
		onLeave();
		if (id !== pageId) router.push(notebookHref(id));
	};
	// Lessons, graph ideas and other kinds live in Study: going there makes Study the mode.
	const toStudy = (href: string) => {
		onLeave();
		void writeSettingsKey("general", { interface: "study" }).catch(() => false).then(() => router.push(href));
	};
	const openItem = (id: string, kind: LibraryKind | undefined) => {
		if (!kind || kind === "page") openNote(id);
		else toStudy(`/library?item=${encodeURIComponent(id)}`);
	};
	const follow = (row: NoteLinkRow) => {
		const r = row.resolution;
		if (r.state === "live" && r.id) openItem(r.id, r.kind);
	};

	if (!data) {
		return (
			<div className="nb-chat-scroll nb-links-scroll">
				{failed ? (
					<p className="nb-chat-line" role="status" data-testid="nb-links-failed">
						<span>These links could not be loaded.</span>
						<button type="button" className="nb-chat-link" onClick={() => void refresh()}>Try again</button>
					</p>
				) : <p className="nb-links-empty" role="status" aria-label="Loading links">Reading the links…</p>}
			</div>
		);
	}
	const cited = new Set(data.sources.map((row) => row.chatId));
	const sessions = data.sessions.filter((row) => !cited.has(row.chatId) && !row.gone);
	return (
		<div className="nb-chat-scroll nb-links-scroll" data-testid="nb-links-body">
			<Section title="Links to this page">
				{data.backlinks.length === 0 ? <Empty>{CONNECTION_EMPTY.backlinks}</Empty> : data.backlinks.map((row) => (
					<Row key={row.id} testId="nb-links-backlink" name={`${row.name}${row.archived ? " · archived" : ""}`} meta={row.kind === "diagram" ? `Diagram · ${row.snippet}` : row.snippet} onOpen={() => openItem(row.id, row.kind)} />
				))}
			</Section>
			<Section title="Links from this page">
				{data.links.length === 0 ? <Empty>{CONNECTION_EMPTY.links("page")}</Empty> : data.links.map((row) => {
					const r = row.resolution;
					const meta = r.state === "missing" ? "No such page yet" : r.state === "deleted" ? "Deleted from your Library" : r.name !== row.target ? `Written as ${row.target}` : null;
					return <Row key={row.target} testId="nb-links-link" state={r.state} name={r.name ?? row.target} meta={meta} onOpen={r.state === "live" && r.id ? () => follow(row) : undefined} />;
				})}
			</Section>
			<Section title="Related notes">
				{data.related.length === 0 ? <Empty>{CONNECTION_EMPTY.related}</Empty> : data.related.map((row) => (
					<Row key={row.id} testId="nb-links-related" name={row.name} meta={row.kind === "diagram" ? `Diagram · ${row.reason}` : row.reason} onOpen={() => openItem(row.id, row.kind)} />
				))}
			</Section>
			<Section title="Lessons">
				{data.sources.length === 0 && sessions.length === 0 ? <Empty>{CONNECTION_EMPTY.lessons("page")}</Empty> : null}
				{data.sources.map((row) => row.gone
					? <Empty key={`${row.chatId}/${row.messageId}`}>{CONNECTION_EMPTY.sourceGone}</Empty>
					: <Row key={`${row.chatId}/${row.messageId}`} testId="nb-links-source" name={row.title ?? "A lesson"} meta="Saved passage · opens in Study" onOpen={() => toStudy(row.href)} />)}
				{sessions.map((row) => <Row key={row.chatId} testId="nb-links-session" name={row.title ?? "A lesson"} meta="Opens the session in Study" onOpen={() => toStudy(row.href)} />)}
			</Section>
			<Section title="Ideas in your graph">
				{data.graph.length === 0 ? <Empty>{CONNECTION_EMPTY.graph("page")}</Empty> : data.graph.map((row) => (
					<Row key={row.id} testId="nb-links-graph" name={row.name} meta={row.statement} onOpen={row.href ? () => toStudy(row.href!) : undefined} />
				))}
			</Section>
		</div>
	);
}
