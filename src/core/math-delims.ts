/** Shared Markdown/TeX boundaries for legacy delimiter compatibility and
 * display-only tool-content recovery. Source arguments are never rewritten. */
import {
	canParseTex, knownTexCommand, mapMathContent, numericPercentEscape, outsideTexComments,
	readContentSpans, recoverDocumentLayout, texRanges,
} from "./content-reader.ts";

const escaped = (text: string, i: number) => {
	let n = 0; while (i > 0 && text[--i] === "\\") n++;
	return n % 2 === 1;
};

/** Preserve the legacy list-continuation policy: indented display math
 * degrades to inline rather than disrupting list structure. Literal code
 * indentation is already protected by the shared reader. */
function indented(text: string, i: number): boolean {
	const prefix = text.slice(text.lastIndexOf("\n", i - 1) + 1, i);
	return prefix.length > 0 && /^[ \t]+$/.test(prefix);
}
function blockPosition(text: string, i: number): boolean {
	return /^[ \t]*$/.test(text.slice(text.lastIndexOf("\n", i - 1) + 1, i));
}

/** micromark closes native single-dollar spans at escaped dollars too.
 * Replace an intended literal dollar with equivalent dollar-free TeX before
 * tokenization. Code, prose, unbalanced spans and display dollars stay raw. */
function replaceEscapedDollars(content: string): string {
	let out = "";
	for (let i = 0; i < content.length; i++) {
		if (content[i] === "\\" && content[i + 1] === "$" && !escaped(content, i)) {
			out += "\\text{\\textdollar}"; i++;
		} else out += content[i];
	}
	return out;
}

/** A line-start `$$` with TeX after it, closed by `$$` at the end of a
 * formula line, is no fence at either end: Markdown opens a block that never
 * closes and swallows the rest of the text. The reader leaves such a pair in
 * prose, so frame both ends here. An opener with no closer yet (streaming)
 * and indented openers (list content) stay as written. */
function frameDisplayDollars(prose: string, lineStart: boolean): string {
	const opener = /(^|\n)\$\$(?!\$)/g;
	let out = "", from = 0, m: RegExpExecArray | null;
	while ((m = opener.exec(prose))) {
		const at = m.index + m[1]!.length;
		if (at === 0 && !lineStart) continue;
		let close = -1;
		for (let j = at + 2; j < prose.length - 1; j++) {
			if (prose[j] === "$" && !escaped(prose, j)) {
				if (prose[j + 1] === "$" && prose[j + 2] !== "$") { close = j; break; }
				break; // another dollar first: not this shape
			}
		}
		const body = close < 0 ? "" : prose.slice(at + 2, close).replace(/^[ \t]*\n/, "").trimEnd();
		if (!body) continue;
		// Prose after the closer on the same line moves to its own line.
		const rest = prose.slice(close + 2), pad = /^[ \t]*/.exec(rest)![0].length;
		const ends = pad === rest.length || rest[pad] === "\n";
		out += prose.slice(from, at) + "$$\n" + body + "\n$$" + (ends ? "" : "\n");
		from = opener.lastIndex = close + 2 + (ends ? 0 : pad);
	}
	return out + prose.slice(from);
}

/** Read old \(...\)/\[...\] syntax without touching literal content or
 * reparsing native math as Markdown. Dollar authoring remains native. */
export function transformMathDelimiters(markdown: string): string {
	let offset = 0;
	return readContentSpans(markdown).map(span => {
		const start = offset; offset += span.raw.length;
		if (span.kind === "prose") return span.raw.includes("$$") ? frameDisplayDollars(span.raw, start === 0 || markdown[start - 1] === "\n") : span.raw;
		if (span.kind !== "math") return span.raw;
		if (span.open === "$") return "$" + replaceEscapedDollars(span.body) + span.close;
		if (span.open !== "\\(" && span.open !== "\\[") return span.raw;
		const body = span.body.trim();
		if (!body) return span.raw;
		if (span.open === "\\(") return `$$${body}$$`;
		if (indented(markdown, start)) return `$$${body.replace(/\s*\n\s*/g, " ")}$$`;
		const before = blockPosition(markdown, start) ? "" : "\n\n";
		const end = start + span.raw.length;
		const after = end === markdown.length || markdown[end] === "\n" ? "" : "\n\n";
		return `${before}$$\n${body}\n$$${after}`;
	}).join("");
}

const DEBRIS: Record<string, string> = {
	"\b": "\\b", "\t": "\\t", "\v": "\\v", "\f": "\\f", "\r": "\\r",
};

/** Recover JSON-swallowed command prefixes only in recognized math, never
 * in code or genuine TeX comments. Restore all debris in one pass. Physical
 * display newlines and CRLF remain source whitespace. Inline LF recovery is
 * limited to complete known n-command names. Under the approved typical-
 * model-authoring policy this includes newline+u→nu in inline math only;
 * already-correct commands are never decoded into whitespace. */
export function restoreMathEscapes(text: string): string {
	if (!/[\b\t\n\v\f\r]/.test(text)) return text;
	return mapMathContent(text, (body, display) => outsideTexComments(body, part => {
		const restored = part.replace(/[\b\t\v\f\r]/g, (char, offset: number) => {
			if (char === "\r" && part[offset + 1] === "\n") return char;
			const suffix = /^[A-Za-z]+/.exec(part.slice(offset + 1))?.[0];
			return suffix && knownTexCommand(DEBRIS[char]!.slice(1) + suffix) ? DEBRIS[char]! : char;
		});
		if (display) return restored;
		return restored.replace(/\n([A-Za-z]+)/g, (whole, suffix: string) =>
			knownTexCommand("n" + suffix) ? "\\n" + suffix : whole);
	}));
}

const commandSymbol = /[,;:!|{}%]/;

/** Decode prefixes and row separators according to ORIGINAL TeX context.
 * A native pair is literal; an encoded pair supplies a factor, so an encoded
 * four-backslash row becomes TWO, never a command prefix. Unknown commands
 * without that structural evidence are left alone. */
function recoverCommandRuns(inner: string, display: boolean): string {
	const ranges = texRanges(inner);
	const recovered = inner.replace(/\\+/g, (run: string, offset: number) => {
		const contexts = ranges.filter(r => offset >= r.start && offset < r.end);
		if (contexts.some(r => r.kind === "row" || r.kind === "comment") || run.length % 2 !== 0) return run;
		const next = inner[offset + run.length] ?? "";
		const encoded = contexts.filter(r => r.kind === "encoded").at(-1);
		const word = /^[A-Za-z]+/.exec(inner.slice(offset + run.length))?.[0];
		if (encoded) {
			const factor = encoded.factor!;
			const rows = run.length % (2 * factor) === 0;
			const command = word ? knownTexCommand(word) : commandSymbol.test(next);
			if (run.length % factor === 0 && (rows || command)) return "\\".repeat(run.length / factor);
			return run;
		}
		if (next === "%") return numericPercentEscape(inner, offset + run.length) ? "\\" : run;
		if (word) return word.length > 1 && knownTexCommand(word) ? "\\" : run;
		return next && commandSymbol.test(next) ? "\\" : run;
	});
	// Structural evidence is primary (parse success cannot prove row
	// preservation). As an additional guard, never turn parseable source into
	// a parse failure through partial command recovery.
	if (recovered !== inner && !canParseTex(recovered, display) && canParseTex(inner, display)) return inner;
	return recovered;
}

export function healOverescapedCommands(text: string): string {
	return text.includes("\\\\") ? mapMathContent(text, recoverCommandRuns) : text;
}

/** Presentation-only, language-independent recovery. Shape parsing, saved
 * identities, grading and model history must use the unprojected source. */
export function repairMathForDisplay(text: string): string {
	return healOverescapedCommands(restoreMathEscapes(recoverDocumentLayout(text)));
}
