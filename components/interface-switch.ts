"use client";

/**
 * Switching between Study and Notebook (feature 024). The choice lives in
 * settings (`general.interface`), so a reload or another window opens the
 * same mode; each mode reopens where it was left: Study at its last path
 * (this browser's localStorage), Notebook at `notebook.lastNoteId` (the
 * Notebook route resolves it). A switch changes nothing else.
 *
 * Kept small and free of Notebook code: Study's startup graph carries it.
 */
import { notebookHref, STUDY_LAST_PATH_KEY, studyReturnPath, type InterfaceMode } from "@/src/core";

/** Remember where Study is (every Study navigation). */
export function rememberStudyPath(path: string): void {
	try {
		window.localStorage.setItem(STUDY_LAST_PATH_KEY, path);
	} catch {
		/* storage unavailable: Study reopens at Home */
	}
}

function storedStudyPath(): string | null {
	try {
		return window.localStorage.getItem(STUDY_LAST_PATH_KEY);
	} catch {
		return null;
	}
}

/** Writes one key of a settings section, keeping the rest of the section as stored. */
export async function writeSettingsKey(section: "general" | "notebook", patch: Record<string, unknown>): Promise<boolean> {
	const read = await fetch("/api/settings", { cache: "no-store" });
	if (!read.ok) return false;
	const record = ((await read.json()) as { settings?: Record<string, unknown> | null }).settings ?? {};
	const current = record[section];
	const next = { ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}), ...patch };
	const put = await fetch(`/api/settings/${section}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
	return put.ok;
}

/**
 * The note bare /notebook would open, asked before navigating: going there
 * directly skips the page's redirect, which Next handles on the client by
 * rendering nothing until it follows it (a blank frame between the modes,
 * feature 028). Falls back to /notebook, which still resolves on the server.
 */
async function notebookTarget(): Promise<string> {
	try {
		const response = await fetch("/api/notebook/open", { method: "POST", cache: "no-store" });
		if (response.ok) {
			const { href } = (await response.json()) as { href?: unknown };
			if (typeof href === "string" && href.startsWith(`${notebookHref()}/`)) return href;
		}
	} catch {
		/* the server resolves it on the way */
	}
	return notebookHref();
}

/** Saves the mode, then goes there. False (and no navigation) when the save failed. */
export async function switchInterface(target: InterfaceMode, navigate: (href: string) => void): Promise<boolean> {
	let saved = false;
	try {
		saved = await writeSettingsKey("general", { interface: target });
	} catch {
		saved = false;
	}
	if (!saved) {
		console.error(`[interface] could not save the switch to ${target}`);
		return false;
	}
	navigate(target === "notebook" ? await notebookTarget() : studyReturnPath(storedStudyPath()));
	return true;
}
