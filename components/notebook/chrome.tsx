"use client";

/** Notebook's top-left chrome (feature 024, visual-reference §4), from the shared paper chrome (feature 025). */
import { Wordmark as PaperWordmark } from "@/components/paper/chrome";
import { notebookHref } from "@/src/core";

export { CloseGlyph, MenuGlyph } from "@/components/paper/chrome";

/** Our mark and name, linking to the current note. */
export function Wordmark({ noteId }: { noteId: string }) {
	return <PaperWordmark href={notebookHref(noteId)} />;
}
