/** Pure sampling maths shared by the sandbox renderer and its tests. */
export type SamplingToken = { text: string; logit: number } | { text: string; p: number };
export interface SamplingOptions { temperature?: number; topK?: number; topP?: number }
export interface SamplingRow {
	text: string;
	index: number;
	base: number;
	p: number;
	cut: "cut by top-k" | "cut by top-p" | null;
}

export function distribution(tokens: SamplingToken[], { temperature = 1, topK = 0, topP = 1 }: SamplingOptions = {}): SamplingRow[] {
	if (!Array.isArray(tokens) || tokens.length < 1 || tokens.length > 30) throw new Error("tokens: provide 1–30 tokens");
	if (!Number.isFinite(temperature) || temperature <= 0) throw new Error("temperature: use a finite number greater than zero");
	if (!Number.isInteger(topK) || topK < 0) throw new Error("topK: use a non-negative integer");
	if (!Number.isFinite(topP) || topP <= 0 || topP > 1) throw new Error("topP: use a number greater than zero and at most 1");
	const probabilities = "p" in tokens[0]!;
	if (tokens.some(token => !token || typeof token.text !== "string" || (probabilities ? !("p" in token) || "logit" in token || !Number.isFinite(token.p) || token.p < 0 || token.p > 1 : !("logit" in token) || "p" in token || !Number.isFinite(token.logit)))) throw new Error("tokens: use finite logits or probabilities, never a mixture");
	if (probabilities && Math.abs(tokens.reduce((sum, token) => sum + ("p" in token ? token.p : 0), 0) - 1) > 0.01) throw new Error("tokens: probabilities must sum to 1 ± 0.01");
	const logits = tokens.map(token => "p" in token ? Math.log(token.p) : token.logit);
	const max = Math.max(...logits);
	// Subtract before dividing, so even extreme finite logits remain stable.
	const weights = logits.map(logit => Math.exp((logit - max) / temperature));
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	const rows: SamplingRow[] = tokens.map((token, index) => ({ text: token.text, index, base: weights[index]! / total, p: 0, cut: null }));
	rows.sort((a, b) => b.base - a.base || a.index - b.index);
	// Same order as Hugging Face transformers: top-k, renormalise, then top-p
	// over the renormalised distribution, then renormalise once more.
	rows.forEach((row, rank) => { if (topK > 0 && rank >= topK) row.cut = "cut by top-k"; });
	const keptByK = rows.reduce((sum, row) => sum + (row.cut ? 0 : row.base), 0);
	let cumulative = 0, kept = 0;
	rows.forEach((row, rank) => {
		if (row.cut) return;
		if (topP < 1 && rank > 0 && cumulative >= topP - 1e-9) { row.cut = "cut by top-p"; return; }
		cumulative += row.base / keptByK; kept += row.base;
	});
	for (const row of rows) row.p = row.cut ? 0 : row.base / kept;
	return rows;
}

export function sample(rows: SamplingRow[], rng: () => number = Math.random): SamplingRow {
	const draw = rng();
	if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("sample: rng must return a number from 0 up to, but not including, 1");
	let cumulative = 0;
	let last: SamplingRow | undefined;
	for (const row of rows) {
		if (row.cut || row.p <= 0) continue;
		last = row; cumulative += row.p;
		if (draw < cumulative) return row;
	}
	if (!last) throw new Error("sample: no token can be drawn");
	return last; // Floating-point addition can leave the sum just below one.
}
