/** Export (feature 022): SVG, PNG and JSON, made in the browser from what is on
 *  screen, unsaved edits included. PNG draws the same escaped SVG onto a canvas, so
 *  nothing leaves the machine and the desktop app behaves the same. */
import { diagramToSvg, serializeDiagram, type DiagramDoc } from "@/src/core";

export type DiagramExportFormat = "svg" | "png" | "json";

/** Below the size browsers refuse to draw, so a huge whiteboard still exports. */
const MAX_PNG_SIDE = 8192;

export function diagramFileName(name: string, format: DiagramExportFormat): string {
	const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "Diagram";
	return `${safe}.${format}`;
}

function download(name: string, blob: Blob) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	document.body.append(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function svgToPng(svg: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onerror = () => reject(new Error("The picture could not be drawn."));
		image.onload = () => {
			const scale = Math.min(2, MAX_PNG_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1));
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.floor(image.naturalWidth * scale));
			canvas.height = Math.max(1, Math.floor(image.naturalHeight * scale));
			const context = canvas.getContext("2d");
			if (!context) return reject(new Error("This browser can't draw a PNG."));
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG could not be made."))), "image/png");
		};
		image.src = svgDataUrl(svg);
	});
}

export async function exportDiagram(doc: DiagramDoc, name: string, format: DiagramExportFormat): Promise<void> {
	const fileName = diagramFileName(name, format);
	if (format === "json") return download(fileName, new Blob([serializeDiagram(doc)], { type: "application/json" }));
	const svg = diagramToSvg(doc, name);
	if (format === "svg") return download(fileName, new Blob([svg], { type: "image/svg+xml" }));
	download(fileName, await svgToPng(svg));
}
