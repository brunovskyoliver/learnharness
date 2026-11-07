/**
 * A minimal Word (.docx) writer for Notebook exports (feature 024, US7,
 * research R7): WordprocessingML for the subset an exported note needs —
 * Title, Heading 1-3, Normal, quotes, code, bulleted and numbered lists
 * (numbering.xml), bold/italic/underline/strike/code runs, links as text
 * with their address, and the AI's notes in their own italic serif style
 * with sketches as PNG pictures. Fonts: Instrument Sans (Arial when it is
 * not installed) and Newsreader (Georgia), named in fontTable.xml.
 * Pure: the PNGs come in from the caller and zip.ts packs the parts.
 */
import { EXPORT_PALETTE, OTHER_NOTES_HEADING, sketchCaptionLines, type ExportBlock, type ExportDocument, type ExportNote, type ExportRun } from "./notebook-export.ts";
import { firstWords } from "./notebook.ts";
import type { Sketch } from "./notebook-sketch.ts";
import { textEntry, zip, type ZipDeps, type ZipEntry } from "./zip.ts";

export interface DocxPicture {
	png: Uint8Array;
	/** Pixels at 96 dpi. */
	width: number;
	height: number;
}

/** Style ids the document uses (tests look for them). */
export const DOCX_STYLES = { note: "AINote", yours: "YourNote", caption: "NoteCaption", speaker: "NoteSpeaker" } as const;

const SANS = "Instrument Sans";
const SERIF = "Newsreader";
const hex = (colour: string) => colour.replace("#", "").slice(0, 6).toUpperCase();
const INK = hex(EXPORT_PALETTE.ink!);
const GRAPHITE = hex(EXPORT_PALETTE.graphite!);
const FAINT = hex(EXPORT_PALETTE.faint!);
const RULE = hex(EXPORT_PALETTE.rule!);
const RIDDLE = hex(EXPORT_PALETTE.riddle!);
const SHELF = hex(EXPORT_PALETTE.shelf!);

/** Pictures never wider than the text column (A4 minus 23 mm margins ≈ 6.2 in). */
const MAX_PICTURE_PX = 580;
const EMU_PER_PX = 9525;

const xml = (value: string): string =>
	value
		// Characters XML 1.0 can't hold.
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

// ─── runs and paragraphs ─────────────────────────────────────────────────────

function textRuns(text: string, rPr: string): string {
	return text.split("\n").map((line, i) => `<w:r>${rPr}${i > 0 ? "<w:br/>" : ""}${line ? `<w:t xml:space="preserve">${xml(line)}</w:t>` : ""}</w:r>`).join("");
}

function runXml(run: ExportRun): string {
	const props: string[] = [];
	if (run.code) props.push('<w:rStyle w:val="CodeChar"/>');
	else if (run.math) props.push('<w:rStyle w:val="MathChar"/>');
	if (run.bold) props.push("<w:b/>");
	if (run.italic) props.push("<w:i/>");
	if (run.strike) props.push("<w:strike/>");
	const colour = run.color ? EXPORT_PALETTE[`text-${run.color}`] : undefined;
	if (colour) props.push(`<w:color w:val="${hex(colour)}"/>`);
	if (run.underline || run.href) props.push('<w:u w:val="single"/>');
	const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
	let out = textRuns(run.text, rPr);
	// Links as text, with the address after it when it says something the text doesn't.
	if (run.href && run.href !== run.text && /^(https?:|mailto:)/i.test(run.href)) out += textRuns(` (${run.href})`, "");
	return out;
}

const runsXml = (runs: readonly ExportRun[]) => runs.map(runXml).join("");

function paragraph(content: string, pPr = ""): string {
	return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
}
const styled = (style: string, extra = "") => `<w:pStyle w:val="${style}"/>${extra}`;

// ─── pictures ────────────────────────────────────────────────────────────────

interface PictureRef { rid: string; file: string; picture: DocxPicture; id: number }

function drawing(ref: PictureRef, description: string): string {
	const scale = Math.min(1, MAX_PICTURE_PX / ref.picture.width);
	const cx = Math.round(ref.picture.width * scale * EMU_PER_PX);
	const cy = Math.round(ref.picture.height * scale * EMU_PER_PX);
	return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${ref.id}" name="Drawing ${ref.id}" descr="${xml(description)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${ref.id}" name="${ref.file}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${ref.rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

// ─── the body ────────────────────────────────────────────────────────────────

interface Lists { numId: (list: number, ordered: boolean, level: number, start: number) => number }

function blockXml(block: ExportBlock, lists: Lists): string {
	const quote = "quote" in block && block.quote > 0 ? block.quote : 0;
	const quotePr = quote ? styled("Quote", `<w:ind w:left="${567 * quote}"/>`) : "";
	switch (block.kind) {
		case "heading":
			return paragraph(runsXml(block.runs), styled(`Heading${Math.min(3, block.level)}`));
		case "paragraph":
			return paragraph(runsXml(block.runs), quotePr);
		case "item": {
			const numId = lists.numId(block.list, block.ordered, block.level, block.number);
			return paragraph(runsXml(block.runs), `${styled("ListParagraph")}<w:numPr><w:ilvl w:val="${Math.min(8, block.level)}"/><w:numId w:val="${numId}"/></w:numPr>`);
		}
		case "code":
			return paragraph(textRuns(block.text, ""), styled("Code", quote ? `<w:ind w:left="${567 * quote}"/>` : ""));
		case "math":
			return paragraph(textRuns(block.text, '<w:rPr><w:rStyle w:val="MathChar"/></w:rPr>'), quotePr || '<w:jc w:val="center"/>');
		case "image":
			return paragraph(textRuns(`[${block.alt || "image"}]`, "<w:rPr><w:i/></w:rPr>"), quotePr);
		case "rule":
			return paragraph("", `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="${RULE}"/></w:pBdr>`);
	}
}

function noteXml(note: ExportNote, picture: (sketch: Sketch) => PictureRef | null, withQuote: boolean): string {
	const out: string[] = [];
	if (withQuote) out.push(paragraph(textRuns(`On “${firstWords(note.quote, 12)}”`, ""), styled(DOCX_STYLES.caption)));
	for (const message of note.messages) {
		const style = message.author === "ai" ? DOCX_STYLES.note : DOCX_STYLES.yours;
		const speaker = message.speaker ? textRuns(`${message.speaker}: `, `<w:rPr><w:rStyle w:val="${DOCX_STYLES.speaker}"/></w:rPr>`) : "";
		const paragraphs = message.runs.length ? message.runs : speaker ? [[]] : [];
		paragraphs.forEach((runs, i) => out.push(paragraph(`${i === 0 ? speaker : ""}${runsXml(runs)}`, styled(style))));
		if (message.sketch) {
			const ref = picture(message.sketch);
			if (ref) out.push(paragraph(drawing(ref, message.sketch.title), styled(style)));
			const lines = sketchCaptionLines(message.sketch);
			for (const line of ref ? lines.slice(1) : lines) out.push(paragraph(textRuns(line, ""), styled(DOCX_STYLES.caption)));
		}
	}
	return out.join("");
}

// ─── fixed parts ─────────────────────────────────────────────────────────────

const STYLES = `${HEAD}<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${SANS}" w:hAnsi="${SANS}" w:eastAsia="${SANS}" w:cs="${SANS}"/><w:color w:val="${INK}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="360" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:spacing w:val="-12"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:sz w:val="34"/><w:szCs w:val="34"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="${RULE}"/></w:pBdr><w:ind w:left="567"/></w:pPr><w:rPr><w:color w:val="${GRAPHITE}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${SHELF}"/><w:spacing w:after="160" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="${DOCX_STYLES.note}"><w:name w:val="AI note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="8" w:space="8" w:color="${RULE}"/></w:pBdr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/><w:ind w:left="425"/></w:pPr><w:rPr><w:rFonts w:ascii="${SERIF}" w:hAnsi="${SERIF}" w:eastAsia="${SERIF}" w:cs="${SERIF}"/><w:i/><w:iCs/><w:color w:val="${RIDDLE}"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="${DOCX_STYLES.yours}"><w:name w:val="Your note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="8" w:space="8" w:color="${RULE}"/></w:pBdr><w:spacing w:after="100"/><w:ind w:left="425"/></w:pPr><w:rPr><w:color w:val="${GRAPHITE}"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:customStyle="1" w:styleId="${DOCX_STYLES.caption}"><w:name w:val="Note caption"/><w:basedOn w:val="Normal"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="8" w:space="8" w:color="${RULE}"/></w:pBdr><w:spacing w:after="40"/><w:ind w:left="425"/></w:pPr><w:rPr><w:color w:val="${GRAPHITE}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="character" w:customStyle="1" w:styleId="${DOCX_STYLES.speaker}"><w:name w:val="Note speaker"/><w:rPr><w:rFonts w:ascii="${SANS}" w:hAnsi="${SANS}" w:cs="${SANS}"/><w:i w:val="0"/><w:iCs w:val="0"/><w:caps/><w:color w:val="${FAINT}"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
<w:style w:type="character" w:customStyle="1" w:styleId="CodeChar"><w:name w:val="Code character"/><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:shd w:val="clear" w:color="auto" w:fill="${SHELF}"/></w:rPr></w:style>
<w:style w:type="character" w:customStyle="1" w:styleId="MathChar"><w:name w:val="Maths"/><w:rPr><w:rFonts w:ascii="${SERIF}" w:hAnsi="${SERIF}" w:cs="${SERIF}"/><w:i/></w:rPr></w:style>
</w:styles>`;

const FONT_TABLE = `${HEAD}<w:fonts ${W_NS}>
<w:font w:name="${SANS}"><w:altName w:val="Arial"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="${SERIF}"><w:altName w:val="Georgia"/><w:family w:val="roman"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="Courier New"><w:family w:val="modern"/><w:pitch w:val="fixed"/></w:font>
</w:fonts>`;

const BULLETS = ["•", "◦", "▪"];

function numberingXml(nums: readonly { id: number; ordered: boolean; level: number; start: number }[]): string {
	const levels = (ordered: boolean) => Array.from({ length: 9 }, (_, l) => {
		const fmt = ordered ? (["decimal", "lowerLetter", "lowerRoman"][l % 3]!) : "bullet";
		const text = ordered ? `%${l + 1}.` : BULLETS[l % 3]!;
		return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`;
	}).join("");
	const abstract = `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false)}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>`;
	const instances = nums.map((n) => `<w:num w:numId="${n.id}"><w:abstractNumId w:val="${n.ordered ? 1 : 0}"/>${n.ordered ? `<w:lvlOverride w:ilvl="${n.level}"><w:startOverride w:val="${n.start}"/></w:lvlOverride>` : ""}</w:num>`).join("");
	return `${HEAD}<w:numbering ${W_NS}>${abstract}${instances}</w:numbering>`;
}

// ─── the package ─────────────────────────────────────────────────────────────

/** The .docx parts for an export document; `pictures` holds a PNG per sketch (missing ones fall back to captions). */
export function docxEntries(doc: ExportDocument, pictures: ReadonlyMap<Sketch, DocxPicture> = new Map()): ZipEntry[] {
	const nums: { id: number; ordered: boolean; level: number; start: number; list: number }[] = [];
	const lists: Lists = {
		numId: (list, ordered, level, start) => {
			const known = nums.find((n) => n.list === list);
			if (known) return known.id;
			const id = nums.length + 1;
			nums.push({ id, ordered, level, start, list });
			return id;
		},
	};
	const refs: PictureRef[] = [];
	const picture = (sketch: Sketch): PictureRef | null => {
		const found = pictures.get(sketch);
		if (!found) return null;
		const id = refs.length + 1;
		const ref = { rid: `rIdImg${id}`, file: `image${id}.png`, picture: found, id };
		refs.push(ref);
		return ref;
	};

	const body: string[] = [];
	if (doc.title.trim()) body.push(paragraph(textRuns(doc.title.trim(), ""), styled("Title")));
	for (const unit of doc.units) {
		body.push(blockXml(unit.block, lists));
		if (doc.includeAi) for (const note of unit.notes) body.push(noteXml(note, picture, false));
	}
	if (doc.includeAi && doc.otherNotes.length) {
		body.push(paragraph(textRuns(OTHER_NOTES_HEADING, ""), styled("Heading1")));
		for (const note of doc.otherNotes) body.push(noteXml(note, picture, true));
	}
	// An empty body still needs one paragraph.
	if (!body.length) body.push(paragraph(""));

	const document = `${HEAD}<w:document ${W_NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1304" w:bottom="1418" w:left="1304" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr></w:body></w:document>`;

	const rels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
<Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
${refs.map((r) => `<Relationship Id="${r.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${r.file}"/>`).join("\n")}
</Relationships>`;

	const contentTypes = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`;

	const packageRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`;

	const core = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(doc.title)}</dc:title></cp:coreProperties>`;

	return [
		textEntry("[Content_Types].xml", contentTypes),
		textEntry("_rels/.rels", packageRels),
		textEntry("docProps/core.xml", core),
		textEntry("word/document.xml", document),
		textEntry("word/_rels/document.xml.rels", rels),
		textEntry("word/styles.xml", STYLES),
		textEntry("word/numbering.xml", numberingXml(nums)),
		textEntry("word/fontTable.xml", FONT_TABLE),
		...refs.map((r) => ({ name: `word/media/${r.file}`, data: r.picture.png, store: true })),
	];
}

/** The .docx file's bytes. */
export function docx(doc: ExportDocument, pictures: ReadonlyMap<Sketch, DocxPicture>, deps: ZipDeps): Uint8Array {
	return zip(docxEntries(doc, pictures), deps);
}
