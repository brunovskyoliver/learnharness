/**
 * Notebook (feature 024): /notebook opens the last note (or the newest page,
 * or a new "Untitled note") at its own address; /notebook/<pageId> opens
 * that page as a note. Notebook's note-page stylesheet loads only here; the
 * shared paper system and its faces load with the root layout (feature 025).
 */
import "../notebook.css";
import { notFound, redirect } from "next/navigation";
import { NotebookApp } from "@/components/notebook/notebook-app";
import { RouteExit } from "@/components/paper/route-content";
import { effectiveSettings, hostedMode, resolveNotebookNote, signedInEmail, withTenantPage } from "@/src/server";

export const dynamic = "force-dynamic";

async function NotebookPage({ params }: { params: Promise<{ id?: string[] }> }) {
	const { id } = await params;
	if (id && id.length > 1) notFound();
	const resolved = await resolveNotebookNote(id?.[0]);
	if ("redirectTo" in resolved) redirect(resolved.redirectTo);
	if ("missing" in resolved) notFound();
	const { notebook } = effectiveSettings();
	const hosted = hostedMode();
	return (
		<RouteExit>
		<NotebookApp
			note={resolved.note}
			preferences={{ startMode: notebook.startMode, pointerInk: notebook.pointerInk, appearance: notebook.appearance, textSize: notebook.textSize, lettering: notebook.lettering, ink: notebook.ink, pace: notebook.pace, layout: notebook.layout }}
			reviewers={notebook.reviewers.map((r) => ({ id: r.id, name: r.name, instructions: r.instructions, ...(r.seeded ? { seeded: true as const } : {}) }))}
			lastNoteId={notebook.lastNoteId}
			account={hosted ? await signedInEmail() : null}
			hosted={hosted}
		/>
		</RouteExit>
	);
}

export default withTenantPage(NotebookPage);
