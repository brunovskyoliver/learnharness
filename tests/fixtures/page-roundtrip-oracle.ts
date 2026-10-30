/** Independent check for the page round trip: the same parser family the chat
 *  renderer uses (remark, GFM, single-dollar math, after the app's legacy
 *  delimiter reader), so "no content lost" means "reads the same in the app",
 *  not "TipTap agrees with itself". Layout that carries no content is dropped:
 *  positions, list tightness, marker style, heading style and fence style. */
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { transformMathDelimiters } from "../../src/core/math-delims.ts";

type N = { type: string; children?: N[]; value?: string; [k: string]: unknown };

const KEEP = ["type", "value", "depth", "ordered", "start", "checked", "lang", "url", "alt", "align", "title"] as const;

function clean(node: N, defs: Map<string, { url: string; title: string | null }>): N | null {
	if (node.type === "definition") return null;
	if (node.type === "linkReference" || node.type === "imageReference") {
		const def = defs.get(String(node.identifier));
		if (def) node = { ...node, type: node.type === "linkReference" ? "link" : "image", url: def.url, title: def.title } as N;
	}
	const out: N = { type: node.type };
	for (const k of KEEP) if (node[k] !== undefined && node[k] !== null) (out as Record<string, unknown>)[k] = node[k];
	// Math keeps its TeX, whichever delimiter or indentation carried it.
	if ((node.type === "math" || node.type === "inlineMath") && typeof node.value === "string") out.value = node.value.trim();
	if (node.children) {
		const kids: N[] = [];
		for (const c of node.children) {
			const k = clean(c, defs);
			if (!k) continue;
			// remark-breaks makes a soft line break a visible break in this app,
			// so both spellings are the same content.
			const piece = k.type === "break" ? { type: "text", value: "\n" } : k;
			const last = kids.at(-1);
			if (piece.type === "text" && last?.type === "text") last.value = `${last.value}${piece.value}`;
			else kids.push(piece);
		}
		for (const k of kids) if (k.type === "text") k.value = String(k.value).replace(/[ \t]*\n[ \t]*/g, "\n");
		out.children = kids;
	}
	return out;
}

export function contentOf(md: string): N {
	const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath, { singleDollarTextMath: true });
	const tree = processor.parse(transformMathDelimiters(md.replace(/\r\n/g, "\n"))) as unknown as N;
	const defs = new Map<string, { url: string; title: string | null }>();
	const walk = (n: N) => {
		if (n.type === "definition") defs.set(String(n.identifier), { url: String(n.url), title: (n.title as string | null) ?? null });
		n.children?.forEach(walk);
	};
	walk(tree);
	return clean(tree, defs)!;
}
