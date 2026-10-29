/** Server-only, lazy tokenizer. Rank tables never enter the browser bundle. */
import type { Tiktoken } from "js-tiktoken/lite";
import { validateDemoKitSpec, type DemoKitSpec, type FinalizedDemoKitSpec, type Token, type TokenEncoding } from "../core/demo-kit.ts";

const cache = new Map<TokenEncoding, Promise<{ tokenizer: Tiktoken; bytes: Map<number, Uint8Array> }>>();
async function load(encoding: TokenEncoding) {
	const [{ Tiktoken }, { default: ranks }] = await Promise.all([
		import("js-tiktoken/lite"),
		encoding === "o200k" ? import("js-tiktoken/ranks/o200k_base") : encoding === "cl100k" ? import("js-tiktoken/ranks/cl100k_base") : import("js-tiktoken/ranks/gpt2"),
	]);
	const bytes = new Map<number, Uint8Array>();
	// 1.0.21 compresses ranks as: prefix, starting id, then base64 pieces.
	// Read public rank data instead of relying on private Tiktoken fields.
	for (const line of ranks.bpe_ranks.split("\n").filter(Boolean)) {
		const [, offset, ...pieces] = line.split(" ");
		pieces.forEach((piece, index) => bytes.set(Number(offset) + index, Buffer.from(piece, "base64")));
	}
	return { tokenizer: new Tiktoken(ranks), bytes };
}

export async function tokenize(text: string, encoding: TokenEncoding): Promise<Token[]> {
	if (!["o200k", "cl100k", "gpt2"].includes(encoding)) throw new Error("Unknown tokenizer encoding.");
	if (typeof text !== "string" || text.length > 2000) throw new Error("Text must be a string of at most 2,000 characters.");
	let pending = cache.get(encoding);
	if (!pending) { pending = load(encoding); cache.set(encoding, pending); }
	const { tokenizer, bytes } = await pending;
	return tokenizer.encode(text).map(id => {
		const piece = bytes.get(id)!;
		try { return { id, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(piece) }; }
		catch { return { id, text: null, bytes: Array.from(piece) }; }
	});
}

export async function withTokenizedPanels(spec: DemoKitSpec): Promise<FinalizedDemoKitSpec> {
	const problems = validateDemoKitSpec(spec);
	if (problems.length) throw new Error(problems.join("\n"));
	return { ...spec, panels: await Promise.all(spec.panels.map(async panel => {
		if (panel.type !== "tokens") return panel;
		const [o200k, cl100k, gpt2] = await Promise.all([tokenize(panel.text, "o200k"), tokenize(panel.text, "cl100k"), tokenize(panel.text, "gpt2")]);
		return { ...panel, tokenized: { o200k, cl100k, gpt2 } };
	})) };
}
