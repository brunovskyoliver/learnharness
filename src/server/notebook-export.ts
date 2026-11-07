/**
 * Notebook export (feature 024, US7, contracts/api.md "Export"):
 * POST /api/notebook/:pageId/export { format, includeAi } → the file.
 *
 * The page's text is what he sees (the saved draft, else the head). The
 * document model and the Markdown/HTML come from core; Word pictures are
 * PNGs from resvg; the PDF is our own HTML printed by headless Chromium
 * with JavaScript off (renderPdf). With no browser on this machine the PDF
 * is refused with the reason (constitution IV); Word and Markdown still work.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { ROOT } from "../../config.ts";
import { pdfUnavailableReason, renderPdf } from "../agent/subagents/headless.ts";
import { docx, type DocxPicture } from "../core/docx.ts";
import { LibraryCatalogError } from "../core/library.ts";
import { isNotebookId } from "../core/notebook.ts";
import type { Sketch } from "../core/notebook-sketch.ts";
import {
	buildExportDocument, contentDisposition, EXPORT_FORMATS, EXPORT_MIME, EXPORT_PALETTE, exportFilename, exportHtml, exportMarkdown, exportSketchSvg,
	type ExportDocument, type ExportFormat,
} from "../core/notebook-export.ts";
import { effectiveSettings, stores } from "./stores.ts";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// ─── fonts for the PDF ───────────────────────────────────────────────────────

const FAMILIES = ["Instrument Sans", "Newsreader"];
let fontCache: string | null = null;

function cssFiles(dir: string, depth = 0, out: string[] = []): string[] {
	if (depth > 3 || out.length > 400) return out;
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) cssFiles(full, depth + 1, out);
		else if (entry.name.endsWith(".css")) out.push(full);
	}
	return out;
}

/** Notebook's two faces as @font-face rules with the files inlined (data: URLs), read from
 *  the woff2 files next/font wrote for the Notebook route (`.next/static`, or `.next/dev/static`
 *  under `next dev`). Only the Latin subset of each family and style, preferring the variable
 *  file. "" when none is found: the PDF then falls back to Arial and Georgia. */
export function notebookFontFaces(): string {
	if (fontCache) return fontCache;
	const roots = [...new Set([ROOT, process.cwd()])].flatMap((base) => [path.join(base, ".next", "static"), path.join(base, ".next", "dev", "static")]);
	const chosen = new Map<string, { rule: string; variable: boolean }>();
	for (const root of roots) {
		for (const file of cssFiles(root)) {
			let css: string;
			try {
				css = fs.readFileSync(file, "utf8");
			} catch {
				continue;
			}
			if (!css.includes("@font-face")) continue;
			for (const match of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
				const block = match[1]!;
				const family = /font-family:\s*['"]?([^;'"]+?)['"]?\s*(;|$)/.exec(block)?.[1]?.trim();
				if (!family || !FAMILIES.includes(family)) continue;
				const range = /unicode-range:\s*([^;]+)/.exec(block)?.[1] ?? "";
				if (range && !/U\+\?\?|U\+0+-0*FF\b/i.test(range)) continue;
				const style = /font-style:\s*(\w+)/.exec(block)?.[1] ?? "normal";
				const weight = /font-weight:\s*([^;]+)/.exec(block)?.[1]?.trim() ?? "400";
				const variable = /\s/.test(weight);
				const key = `${family}|${style}`;
				if (chosen.get(key)?.variable && !variable) continue;
				const url = /src:\s*url\(([^)]+)\)/.exec(block)?.[1]?.replace(/['"]/g, "");
				if (!url || !url.endsWith(".woff2")) continue;
				const fontPath = path.resolve(path.dirname(file), url.replace(/^\/_next\/static\//, `${root}/`));
				let data: Buffer;
				try {
					data = fs.readFileSync(fontPath);
				} catch {
					continue;
				}
				const stretch = /font-stretch:\s*([^;]+)/.exec(block)?.[1];
				const rule = `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};${stretch ? `font-stretch:${stretch};` : ""}src:url(data:font/woff2;base64,${data.toString("base64")}) format("woff2");}`;
				chosen.set(key, { rule, variable });
			}
		}
	}
	const faces = [...chosen.values()].map((c) => c.rule).join("\n");
	// Not found yet (dev before the route was compiled): look again next time.
	if (faces) fontCache = faces;
	return faces;
}

// ─── pictures for Word ───────────────────────────────────────────────────────

async function sketchPictures(doc: ExportDocument): Promise<Map<Sketch, DocxPicture>> {
	const out = new Map<Sketch, DocxPicture>();
	const sketches = [...doc.units.flatMap((u) => u.notes), ...doc.otherNotes].flatMap((n) => n.messages).flatMap((m) => (m.sketch ? [m.sketch] : []));
	if (!sketches.length) return out;
	const { Resvg } = await import("@resvg/resvg-js");
	for (const sketch of sketches) {
		try {
			const { svg, width, height } = exportSketchSvg(sketch);
			// Twice the pixels, shown at its size: sharp in print.
			const png = new Resvg(svg, { fitTo: { mode: "width", value: width * 2 }, font: { loadSystemFonts: true, defaultFontFamily: "Georgia" }, background: EXPORT_PALETTE.paper }).render().asPng();
			out.set(sketch, { png: new Uint8Array(png), width, height });
		} catch (err) {
			// The captions still go in (docx.ts falls back to them).
			console.error("[notebook export] a drawing could not be pictured:", err instanceof Error ? err.message : err);
		}
	}
	return out;
}

// ─── the route ───────────────────────────────────────────────────────────────

export type ExportBody = { format: ExportFormat; includeAi: boolean };

export function parseExportBody(raw: unknown): { ok: true; body: ExportBody } | { ok: false; error: string } {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, error: "The body must be an object." };
	const { format, includeAi } = raw as Record<string, unknown>;
	if (typeof format !== "string" || !(EXPORT_FORMATS as readonly string[]).includes(format)) return { ok: false, error: 'format must be "pdf", "docx" or "md".' };
	if (typeof includeAi !== "boolean") return { ok: false, error: "includeAi must be true or false." };
	return { ok: true, body: { format: format as ExportFormat, includeAi } };
}

/** The file for one export: bytes, type and name. Exported for tests. */
export async function notebookExportFile(pageId: string, body: ExportBody): Promise<{ data: Uint8Array; type: string; filename: string } | { status: number; error: string; detail?: string; reason?: string }> {
	const page = await stores.libraryStore.readPage(pageId);
	if (!page) return { status: 404, error: "That note is no longer in your Library." };
	const companion = (await stores.notebookStore.read(pageId)).companion;
	const doc = buildExportDocument({
		title: page.item.name,
		markdown: page.draft?.content ?? page.head.content,
		companion,
		reviewers: effectiveSettings().notebook.reviewers,
		includeAi: body.includeAi,
	});
	const filename = exportFilename(page.item.name, body.format);
	const type = EXPORT_MIME[body.format];
	if (body.format === "md") return { data: new TextEncoder().encode(exportMarkdown(doc, { title: true })), type, filename };
	if (body.format === "docx") {
		const data = docx(doc, await sketchPictures(doc), { deflateRaw: (bytes) => zlib.deflateRawSync(bytes), crc32: (bytes) => zlib.crc32(bytes) });
		return { data, type, filename };
	}
	const unavailable = pdfUnavailableReason();
	if (unavailable) return { status: 503, error: "PDF export needs a browser on this computer. Word and Markdown still work.", detail: unavailable, reason: "pdf" };
	try {
		const pdf = await renderPdf(exportHtml(doc, notebookFontFaces()));
		return { data: new Uint8Array(pdf), type, filename };
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		console.error("[notebook export] the PDF could not be printed:", detail);
		return { status: 500, error: "The PDF could not be made.", detail };
	}
}

/** POST /api/notebook/:pageId/export */
export async function notebookExportResponse(request: Request, pageId: string): Promise<Response> {
	if (!isNotebookId(pageId)) return json({ error: "That id is not valid." }, 400);
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		raw = undefined;
	}
	const parsed = parseExportBody(raw);
	if (!parsed.ok) return json({ error: parsed.error }, 400);
	try {
		const file = await notebookExportFile(pageId, parsed.body);
		if ("status" in file) return json({ error: file.error, ...(file.detail ? { detail: file.detail } : {}), ...(file.reason ? { reason: file.reason } : {}) }, file.status);
		return new Response(Buffer.from(file.data), {
			status: 200,
			headers: {
				"Content-Type": file.type,
				"Content-Disposition": contentDisposition(file.filename),
				"Content-Length": String(file.data.byteLength),
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (err) {
		if (!(err instanceof LibraryCatalogError)) throw err;
		return json({ error: "Your Library could not be loaded." }, 500);
	}
}
