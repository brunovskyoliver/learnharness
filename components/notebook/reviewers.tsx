"use client";

/**
 * The Reviewers page (feature 024, US5; ui-contract "Settings modal" →
 * Reviewers page): the saved minds a note can read with. A list (name and
 * the first line of instructions), "New reviewer", editing in place (Name,
 * "How should they read?") and "Delete reviewer" with Undo for 6 s. Every
 * change stores the whole list in `notebook.reviewers` (PUT the notebook
 * settings section, through `onSave`).
 *
 * The settings modal shows it under its "Reviewers" nav.
 */
import { nanoid } from "nanoid";
import { PlusIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NOTEBOOK_REVIEWER_INSTRUCTIONS_MAX, NOTEBOOK_REVIEWER_NAME_MAX } from "@/src/core";
import type { NotebookReviewerView } from "./nb-shared";

/** A pause in typing this long saves; leaving a field saves at once. */
const SAVE_DELAY_MS = 700;
/** How long "Reviewer deleted." offers Undo (as Resolve and Dismiss do). */
const UNDO_MS = 6000;
export const NEW_REVIEWER_NAME = "New reviewer";
export const DELETED_LINE = "Reviewer deleted.";
export const NOT_SAVED_LINE = "The reviewers couldn’t be saved. Try again.";

const firstLine = (text: string) => text.split("\n").find((line) => line.trim())?.trim() ?? "";

/** A new reviewer's id: letters, digits, _ and - (settings' NOTEBOOK_REVIEWER_ID). */
export const newReviewerId = (): string => `rev_${nanoid(12)}`;

/** One reviewer, open for editing in place. */
function ReviewerEditor({ reviewer, focusName, onChange, onDelete }: {
	reviewer: NotebookReviewerView;
	focusName: boolean;
	onChange: (patch: { name?: string; instructions?: string }) => void;
	onDelete: () => void;
}) {
	const [name, setName] = useState(reviewer.name);
	const [instructions, setInstructions] = useState(reviewer.instructions);
	const nameField = useRef<HTMLInputElement>(null);
	const area = useRef<HTMLTextAreaElement>(null);
	const timer = useRef<number | null>(null);
	const latest = useRef({ name, instructions });
	latest.current = { name, instructions };

	useEffect(() => {
		if (!focusName) return;
		nameField.current?.focus();
		nameField.current?.select();
	}, [focusName]);
	useLayoutEffect(() => {
		const el = area.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [instructions]);

	const flush = useCallback(() => {
		if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
		const { name: n, instructions: i } = latest.current;
		// A name can't be empty: the stored one stays until he types one.
		onChange({ ...(n.trim() ? { name: n.trim() } : {}), instructions: i });
	}, [onChange]);
	const later = () => {
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
	};
	// Leaving the editor (another row, closing the dialog) saves what is typed.
	const flushRef = useRef(flush);
	flushRef.current = flush;
	useEffect(() => () => { if (timer.current) flushRef.current(); }, []);

	const nameId = `nb-reviewer-name-${reviewer.id}`;
	const areaId = `nb-reviewer-how-${reviewer.id}`;
	return (
		<div className="nb-rev-editor" data-testid="nb-reviewer-editor">
			<label className="nb-rev-label" htmlFor={nameId}>Name</label>
			<input
				ref={nameField}
				id={nameId}
				className="nb-rev-input"
				value={name}
				maxLength={NOTEBOOK_REVIEWER_NAME_MAX}
				autoComplete="off"
				data-testid="nb-reviewer-name"
				onChange={(event) => { setName(event.currentTarget.value); later(); }}
				onBlur={() => { flush(); if (!name.trim()) setName(reviewer.name); }}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); flush(); area.current?.focus(); }
				}}
			/>
			<label className="nb-rev-label" htmlFor={areaId}>How should they read?</label>
			<textarea
				ref={area}
				id={areaId}
				className="nb-rev-input nb-rev-area"
				rows={3}
				value={instructions}
				maxLength={NOTEBOOK_REVIEWER_INSTRUCTIONS_MAX}
				placeholder="Say what they look for and how they ask. Empty reads plainly."
				data-testid="nb-reviewer-instructions"
				onChange={(event) => { setInstructions(event.currentTarget.value); later(); }}
				onBlur={flush}
			/>
			<div className="nb-rev-actions">
				<button type="button" className="nb-rev-text-button" data-testid="nb-reviewer-delete" onClick={() => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } onDelete(); }}>
					Delete reviewer
				</button>
			</div>
		</div>
	);
}

export function ReviewersPage({ reviewers, onSave }: {
	reviewers: readonly NotebookReviewerView[];
	onSave: (next: readonly NotebookReviewerView[]) => Promise<boolean>;
}) {
	const [openId, setOpenId] = useState<string | null>(null);
	const [fresh, setFresh] = useState<string | null>(null);
	const [deleted, setDeleted] = useState<{ reviewer: NotebookReviewerView; index: number } | null>(null);
	const [failed, setFailed] = useState(false);
	const list = useRef(reviewers);
	list.current = reviewers;
	const undoButton = useRef<HTMLButtonElement>(null);
	const newButton = useRef<HTMLButtonElement>(null);

	const save = useCallback(async (next: readonly NotebookReviewerView[]) => {
		list.current = next;
		const ok = await onSave(next);
		setFailed(!ok);
		return ok;
	}, [onSave]);

	const change = useCallback((id: string, patch: { name?: string; instructions?: string }) => {
		const current = list.current.find((r) => r.id === id);
		if (!current) return;
		const next = { ...current, ...patch };
		if (next.name === current.name && next.instructions === current.instructions) return;
		void save(list.current.map((r) => (r.id === id ? next : r)));
	}, [save]);

	useEffect(() => {
		if (!deleted) return;
		const timer = window.setTimeout(() => {
			if (document.activeElement === undoButton.current) newButton.current?.focus();
			setDeleted(null);
		}, UNDO_MS);
		return () => window.clearTimeout(timer);
	}, [deleted]);
	useEffect(() => { if (deleted) undoButton.current?.focus(); }, [deleted]);

	const add = () => {
		const reviewer: NotebookReviewerView = { id: newReviewerId(), name: NEW_REVIEWER_NAME, instructions: "" };
		setOpenId(reviewer.id);
		setFresh(reviewer.id);
		void save([...list.current, reviewer]);
	};
	const remove = (reviewer: NotebookReviewerView) => {
		const index = list.current.findIndex((r) => r.id === reviewer.id);
		if (index < 0) return;
		setOpenId(null);
		setDeleted({ reviewer: list.current[index]!, index });
		void save(list.current.filter((r) => r.id !== reviewer.id));
	};
	const undo = () => {
		if (!deleted) return;
		const next = [...list.current.filter((r) => r.id !== deleted.reviewer.id)];
		next.splice(Math.min(deleted.index, next.length), 0, deleted.reviewer);
		setDeleted(null);
		setOpenId(deleted.reviewer.id);
		setFresh(null);
		void save(next);
	};

	return (
		<section className="nb-rev" aria-labelledby="nb-rev-title" data-testid="nb-reviewers" data-settings-row="reviewers">
			<h2 id="nb-rev-title" className="nb-rev-title">Reviewers</h2>
			<p className="nb-rev-lede">Whose eyes a note is read with. Each note picks one from the row above its title.</p>
			<ul className="nb-rev-list" aria-label="Reviewers">
				{reviewers.map((reviewer) => {
					const open = reviewer.id === openId;
					const line = firstLine(reviewer.instructions);
					return (
						<li key={reviewer.id} className="nb-rev-item" data-open={open ? "" : undefined} data-testid="nb-reviewer-row">
							<button
								type="button"
								className="nb-rev-row"
								aria-expanded={open}
								data-testid="nb-reviewer-row-button"
								onClick={() => { setFresh(null); setOpenId(open ? null : reviewer.id); }}
							>
								<span className="nb-rev-name">{reviewer.name}</span>
								<span className="nb-rev-first">{line || "Reads plainly, no instructions."}</span>
							</button>
							{open && (
								<ReviewerEditor
									reviewer={reviewer}
									focusName={fresh === reviewer.id}
									onChange={(patch) => change(reviewer.id, patch)}
									onDelete={() => remove(reviewer)}
								/>
							)}
						</li>
					);
				})}
			</ul>
			{reviewers.length === 0 && <p className="nb-rev-status">No reviewers. Notes read plainly.</p>}
			{deleted && (
				<p className="nb-rev-status" role="status" data-testid="nb-reviewer-deleted">
					<span>{DELETED_LINE}</span>
					<button ref={undoButton} type="button" className="nb-rev-text-button nb-rev-link" data-testid="nb-reviewer-undo" onClick={undo}>Undo</button>
				</p>
			)}
			{failed && <p className="nb-rev-status nb-rev-error" role="alert">{NOT_SAVED_LINE}</p>}
			<button ref={newButton} type="button" className="nb-rev-new" data-testid="nb-reviewer-new" data-settings-row="new-reviewer" onClick={add}>
				<PlusIcon aria-hidden="true" />
				<span>New reviewer</span>
			</button>
		</section>
	);
}
