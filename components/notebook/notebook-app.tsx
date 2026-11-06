"use client";

/**
 * Notebook's root (feature 024). Phase 2 placeholder: the `.nb-root`
 * wrapper with the theme, size, lettering and ink attributes and the
 * route's font variables, showing the note's name. Phase 3 builds the
 * page itself here. Opening a note remembers it as the one Notebook
 * reopens (`notebook.lastNoteId`).
 */
import { useEffect } from "react";
import { writeSettingsKey } from "@/components/interface-switch";
import type { NotebookAppearance, NotebookInk, NotebookLettering, NotebookTextSize } from "@/src/core";

export interface NotebookPreferences {
	appearance: NotebookAppearance;
	textSize: NotebookTextSize;
	lettering: NotebookLettering;
	ink: NotebookInk;
}

export function NotebookApp({ note, fontClasses, preferences, lastNoteId }: {
	note: { id: string; name: string };
	fontClasses: string;
	preferences: NotebookPreferences;
	lastNoteId: string | null;
}) {
	useEffect(() => {
		if (lastNoteId === note.id) return;
		void writeSettingsKey("notebook", { lastNoteId: note.id }).catch(() => {
			/* Notebook then reopens on the newest page instead */
		});
	}, [note.id, lastNoteId]);

	return (
		<div
			className={`nb-root ${fontClasses}`}
			data-testid="notebook-root"
			data-nb-theme={preferences.appearance}
			data-nb-text-size={preferences.textSize}
			data-nb-lettering={preferences.lettering}
			data-nb-ink={preferences.ink}
			data-note-id={note.id}
		>
			<main className="nb-column">
				<h1 className="nb-title">{note.name}</h1>
			</main>
		</div>
	);
}
