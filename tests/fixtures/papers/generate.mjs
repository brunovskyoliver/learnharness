// Own synthetic PDF fixture; no third-party text, library or network.
import { writeFileSync } from "node:fs";
function buildPdf(pageTexts) {
	const objects = []; // 1-indexed
	const pageIds = pageTexts.map((_, i) => 3 + i * 2);
	const fontId = 3 + pageTexts.length * 2;
	objects[1] = "<</Type/Catalog/Pages 2 0 R>>";
	objects[2] = `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(" ")}]/Count ${pageTexts.length}>>`;
	pageTexts.forEach((text, i) => {
		const pageId = pageIds[i];
		const contentId = pageId + 1;
		const escaped = text.replace(/([()\\])/g, "\\$1");
		const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
		objects[pageId] =
			`<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents ${contentId} 0 R` +
			`/Resources<</Font<</F1 ${fontId} 0 R>>>>>>`;
		objects[contentId] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
	});
	objects[fontId] = "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>";

	let pdf = "%PDF-1.4\n";
	const offsets = [];
	for (let id = 1; id < objects.length; id++) {
		offsets[id] = pdf.length;
		pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
	}
	const xrefStart = pdf.length;
	pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
	for (let id = 1; id < objects.length; id++) {
		pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<</Size ${objects.length}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
	return new TextEncoder().encode(pdf);
}

const pages = Array.from({ length: 12 }, (_, i) => i === 3
  ? "Page 4: Scaled Dot-Product Attention"
  : `Page ${i + 1}: Synthetic paper fixture text.`);
writeFileSync(new URL("sample.pdf", import.meta.url), buildPdf(pages));
