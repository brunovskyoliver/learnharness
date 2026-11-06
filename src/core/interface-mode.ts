/**
 * The two interfaces, Study and Notebook (feature 024): which one a path
 * belongs to, and where each reopens. Pure and tiny, because Study's
 * startup graph carries it (the sidebar's "Notebook" button and the
 * global toggle). Everything else Notebook needs loads with its route.
 */
import type { InterfaceMode } from "./settings.ts";

/** Study's last location, per browser (data-model.md). */
export const STUDY_LAST_PATH_KEY = "lh.study.lastPath";
export const NOTEBOOK_ROOT = "/notebook";

export const isNotebookPath = (pathname: string): boolean => pathname === NOTEBOOK_ROOT || pathname.startsWith(`${NOTEBOOK_ROOT}/`);
export const interfaceOfPath = (pathname: string): InterfaceMode => (isNotebookPath(pathname) ? "notebook" : "study");
export const otherInterface = (mode: InterfaceMode): InterfaceMode => (mode === "study" ? "notebook" : "study");

/** Where Study reopens: its last same-origin path, never a Notebook one; Home otherwise. */
export function studyReturnPath(stored: string | null | undefined): string {
	if (typeof stored !== "string" || !stored.startsWith("/") || stored.startsWith("//") || stored.length > 2000) return "/";
	const pathname = stored.split(/[?#]/)[0]!;
	return isNotebookPath(pathname) ? "/" : stored;
}

/** Where Notebook opens: a note, or the route that picks one (last note, newest page, or a new note). */
export const notebookHref = (noteId?: string | null): string => (noteId ? `${NOTEBOOK_ROOT}/${encodeURIComponent(noteId)}` : NOTEBOOK_ROOT);
