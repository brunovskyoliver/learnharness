"use client";

/**
 * Exporting a page as PDF, Word or Markdown through POST /api/notebook/:pageId/export
 * (feature 024, US7; shared with Study's page pane in feature 025 T049). The last
 * format and the notes switch are remembered in this browser.
 */
import { EXPORT_FORMATS, type ExportFormat } from "@/src/core";

/** The export dialog's last choices (Riddled keeps riddled:export-format / riddled:export-riddles). */
export const EXPORT_FORMAT_KEY = "lh.nb.exportFormat";
export const EXPORT_NOTES_KEY = "lh.nb.exportNotes";

function readKey(key: string): string | null {
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
function writeKey(key: string, value: string): void {
	try {
		window.localStorage.setItem(key, value);
	} catch {
		/* private window or storage off: it holds for this page only */
	}
}

export function readExportChoice(): { format: ExportFormat; includeAi: boolean } {
	const format = readKey(EXPORT_FORMAT_KEY);
	return {
		format: (EXPORT_FORMATS as readonly string[]).includes(format ?? "") ? (format as ExportFormat) : "pdf",
		includeAi: readKey(EXPORT_NOTES_KEY) !== "without",
	};
}
export function writeExportChoice(choice: { format: ExportFormat; includeAi: boolean }): void {
	writeKey(EXPORT_FORMAT_KEY, choice.format);
	writeKey(EXPORT_NOTES_KEY, choice.includeAi ? "with" : "without");
}

/** The file name from Content-Disposition (the UTF-8 one when given). */
export function dispositionName(header: string | null, fallback: string): string {
	if (!header) return fallback;
	const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
	if (utf8) {
		try {
			return decodeURIComponent(utf8);
		} catch {
			/* fall through to the plain name */
		}
	}
	return /filename="([^"]+)"/i.exec(header)?.[1] ?? fallback;
}

export async function exportNote(pageId: string, format: ExportFormat, includeAi: boolean, signal?: AbortSignal): Promise<{ ok: string } | { error: string; detail?: string } | { aborted: true }> {
	try {
		const response = await fetch(`/api/notebook/${encodeURIComponent(pageId)}/export`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ format, includeAi }),
			signal,
		});
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
			const detail = [body.error, body.detail].filter(Boolean).join(" ");
			return { error: "The export didn’t work.", ...(detail ? { detail } : { detail: `The server answered ${response.status}.` }) };
		}
		const blob = await response.blob();
		const filename = dispositionName(response.headers.get("Content-Disposition"), `Note.${format}`);
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = filename;
		link.rel = "noopener";
		link.style.display = "none";
		document.body.append(link);
		link.click();
		link.remove();
		window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
		return { ok: filename };
	} catch (err) {
		if (signal?.aborted) return { aborted: true };
		return { error: "The export didn’t work.", detail: err instanceof Error ? err.message : String(err) };
	}
}
