/** The math check (feature 007): the `math_check` tool's input, the fixed
 *  Wolfram Language program the server sends (the model only fills in
 *  lhs, rhs and assumptions, each whitelisted), the parse of Wolfram's
 *  reply into a verdict, and the read-time fold that decides what the
 *  learner may see (Principle II: answers stay hidden until answered or
 *  concluded). Pure and client-safe. */
import { Literal as LiteralType, Object as ObjectType, Optional as OptionalType, String as StringType, Union as UnionType, type Static } from "typebox";
import type { LhMessage } from "./native-messages.ts";

const Type = { Literal: LiteralType, Object: ObjectType, Optional: OptionalType, String: StringType, Union: UnionType };

export const MATH_CHECK_TOOL = "math_check";
/** Checks per turn per agent (spec Assumptions). */
export const MATH_CHECK_LIMIT = 5;
const EXPRESSION_MAX = 400;
const ASSUMPTIONS_MAX = 200;

export const MathCheckInputSchema = Type.Object({
	purpose: Type.Union([Type.Literal("question"), Type.Literal("grading"), Type.Literal("lesson")], {
		description: "question: the answer of the question or problem you are about to pose. grading: the learner's expression against your committed answer. lesson: a result you state in the lesson.",
	}),
	lhs: Type.String({ description: "One side, in Wolfram Language, e.g. D[Sin[2 x], x]." }),
	rhs: Type.String({ description: "The other side, in Wolfram Language, e.g. 2 Cos[2 x]." }),
	assumptions: Type.Optional(Type.String({ description: "Optional domain, e.g. x > 0 && Element[n, Integers]." })),
});
export type MathCheckInput = Static<typeof MathCheckInputSchema>;
export type MathCheckPurpose = MathCheckInput["purpose"];

export type MathCheckOutcome = "agreed" | "disagreed" | "undecided";

/** What a check's tool result carries for the record and the card. */
export interface MathCheckDetails {
	outcome: MathCheckOutcome;
	counterexample?: string;
	reduced?: string;
	reason?: string;
	/** Wolfram's reply, trimmed. */
	raw: string;
	ms: number;
}

/** No strings, statement separators, contexts, pure functions, patterns
 *  or system variables: what is left can only build an expression. */
const ALLOWED = /^[A-Za-z0-9\s+\-*/^()[\]{},.<>=!&|]*$/;
const PAIRS: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

function fieldProblems(name: string, value: string, max: number): string[] {
	if (value.trim().length === 0) return [`${name} is empty.`];
	const problems: string[] = [];
	if (value.length > max) problems.push(`${name} is longer than ${max} characters.`);
	if (!ALLOWED.test(value)) problems.push(`${name} may only use letters, digits, spaces and + - * / ^ ( ) [ ] { } , . < > = ! & | — no strings, semicolons, colons or other symbols.`);
	if (/(^|[^=<>!])=(?!=)/.test(value)) problems.push(`${name} contains a single "=" (an assignment); use == for equality.`);
	const stack: string[] = [];
	let balanced = true;
	for (const ch of value) {
		if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
		else if (ch in PAIRS && stack.pop() !== PAIRS[ch]) { balanced = false; break; }
	}
	if (!balanced || stack.length > 0) problems.push(`${name} has unbalanced or crossed brackets.`);
	return problems;
}

/** The refinements no schema carries; empty = valid. */
export function mathCheckInputProblems(input: MathCheckInput): string[] {
	return [
		...fieldProblems("lhs", input.lhs, EXPRESSION_MAX),
		...fieldProblems("rhs", input.rhs, EXPRESSION_MAX),
		...(input.assumptions === undefined ? [] : fieldProblems("assumptions", input.assumptions, ASSUMPTIONS_MAX)),
	];
}

/** The fixed check program (research R2): FullSimplify decides when it
 *  can; otherwise numeric samples (2 integer, 4 real points that satisfy
 *  the assumptions) can find a counterexample; otherwise undecided. */
export function wolframCheckCode(input: MathCheckInput): string {
	const as = input.assumptions?.trim() || "True";
	return [
		"TimeConstrained[Module[{lh, rh, as, r, vars, pts, cex = None},",
		` lh = (${input.lhs}); rh = (${input.rhs}); as = (${as});`,
		" r = FullSimplify[lh == rh, as];",
		' If[r === True, "OUTCOME: agreed",',
		'  vars = DeleteDuplicates[Cases[{lh, rh, as}, s_Symbol /; Context[s] === "Global`", {0, Infinity}, Heads -> False]];',
		"  pts = Join[Table[Thread[vars -> RandomInteger[{2, 5}, Length[vars]]], 2], Table[Thread[vars -> RandomReal[{0.3, 2.9}, Length[vars]]], 4]];",
		"  Do[If[cex === None && TrueQ[as /. p], With[{d = Quiet[N[(lh - rh) /. p]]}, If[NumericQ[d] && Abs[d] > 10^-8 (1 + Abs[Quiet[N[rh /. p]]]), cex = p]]], {p, pts}];",
		'  Which[r === False, "OUTCOME: disagreed",',
		'   cex =!= None, "OUTCOME: disagreed\\nCOUNTEREXAMPLE: " <> ToString[cex, InputForm],',
		'   True, "OUTCOME: undecided\\nREDUCED: " <> ToString[r, InputForm]]]], 20, "OUTCOME: undecided\\nREASON: timed out"]',
	].join("\n");
}

/** Wolfram's reply → the verdict. Throws (an error result the model can
 *  act on) when the expressions did not parse or no verdict came back. */
export function parseWolframCheck(reply: string): Pick<MathCheckDetails, "outcome" | "counterexample" | "reduced" | "reason"> {
	if (/::sntx|\$Failed/.test(reply)) {
		const message = reply.split("\n").find((l) => l.includes("::")) ?? "$Failed";
		throw new Error(`Wolfram could not read the expressions: ${message.trim().slice(0, 300)}`);
	}
	const text = reply.replace(/\\n/g, "\n").replace(/"\s*$/, "");
	const outcome = /OUTCOME:\s*(agreed|disagreed|undecided)/.exec(text)?.[1] as MathCheckOutcome | undefined;
	if (!outcome) throw new Error(`The Wolfram check returned no verdict: ${reply.trim().slice(0, 300)}`);
	const field = (name: string) => new RegExp(`${name}:\\s*(.+)`).exec(text)?.[1]?.trim();
	const out: Pick<MathCheckDetails, "outcome" | "counterexample" | "reduced" | "reason"> = { outcome };
	const counterexample = field("COUNTEREXAMPLE");
	const reduced = field("REDUCED");
	const reason = field("REASON");
	if (counterexample) out.counterexample = counterexample;
	if (reduced) out.reduced = reduced;
	if (reason) out.reason = reason;
	return out;
}

// ─── What the learner may see (read-time fold, research R5) ────────────────

/** Graded items a `question` check can belong to. Each ends its turn. */
const QUESTION_ITEMS = new Set(["quiz", "explain", "probe", "recall", "problem"]);

export interface MathCheckVisibility {
	/** Nothing renders: the check's question is not answered yet. */
	hidden: boolean;
	/** The outcome shows, the expressions (the committed answer) do not. */
	expressionsHidden: boolean;
}

export interface MathCheckBindings {
	checks: Map<string, MathCheckVisibility>;
	/** Question, problem and conclude call ids whose last bound question
	 *  check agreed — the "Checked with Wolfram" label. */
	checked: Set<string>;
}

type Block = { type: string; id?: string; name?: string; arguments?: unknown };

function purposeOf(args: unknown): MathCheckPurpose {
	const p = (args as { purpose?: unknown } | null)?.purpose;
	return p === "question" || p === "grading" ? p : "lesson";
}

/** Fold the record into visibility and labels. question checks bind to
 *  the next graded item in the same turn and stay hidden until it is
 *  answered (quiz, explain) or concluded (problem); one still waiting for
 *  its question at the end of the record stays hidden too (the turn may
 *  be about to pose it). grading checks bind to the active problem: the
 *  outcome shows, the expressions wait for the conclude. */
export function mathCheckBindings(messages: readonly LhMessage[]): MathCheckBindings {
	const pending: string[] = [];
	const boundTo = new Map<string, string>(); // question check → item
	const gradingOf = new Map<string, string>(); // grading check → problem
	const itemChecks = new Map<string, string[]>();
	const itemKind = new Map<string, string>();
	const outcome = new Map<string, MathCheckOutcome>();
	const answered = new Set<string>();
	const concluded = new Set<string>();
	const problemOfConclude = new Map<string, string>();
	const previousActive = new Map<string, string | null>();
	let active: string | null = null;
	const all: string[] = [];

	// Released checks fall through to the plain-visible branch below.
	const releasePending = () => { pending.length = 0; };

	for (const m of messages) {
		const role = (m as { role?: string }).role;
		if (role === "user" || role === "custom") {
			// A practice thinking submission is the learner's turn too: an
			// unposed question check is history by now.
			releasePending();
			continue;
		}
		if (role === "toolResult") {
			const r = m as unknown as { toolCallId: string; toolName: string; isError?: boolean; details?: unknown };
			if (r.toolName === MATH_CHECK_TOOL) {
				const o = (r.details as { outcome?: unknown } | null)?.outcome;
				if (!r.isError && (o === "agreed" || o === "disagreed" || o === "undecided")) outcome.set(r.toolCallId, o);
			} else if (itemKind.has(r.toolCallId)) {
				if (r.isError) {
					// A rejected pose was never posed: its checks wait for the retry.
					pending.unshift(...(itemChecks.get(r.toolCallId) ?? []));
					itemChecks.delete(r.toolCallId);
					if (itemKind.get(r.toolCallId) === "problem" && active === r.toolCallId) active = previousActive.get(r.toolCallId) ?? null;
				} else if (r.details != null) {
					answered.add(r.toolCallId);
				}
			}
			continue;
		}
		if (role !== "assistant") continue;
		for (const block of (m as { content?: Block[] }).content ?? []) {
			if (block.type !== "toolCall" || !block.id || !block.name) continue;
			if (block.name === MATH_CHECK_TOOL) {
				all.push(block.id);
				const purpose = purposeOf(block.arguments);
				if (purpose === "question") pending.push(block.id);
				else if (purpose === "grading" && active) gradingOf.set(block.id, active);
			} else if (QUESTION_ITEMS.has(block.name)) {
				itemKind.set(block.id, block.name);
				itemChecks.set(block.id, pending.splice(0));
				if (block.name === "problem") {
					previousActive.set(block.id, active);
					active = block.id;
				}
			} else if (block.name === "conclude" && active) {
				problemOfConclude.set(block.id, active);
				concluded.add(active);
				active = null;
			}
		}
	}

	for (const [item, ids] of itemChecks) for (const id of ids) boundTo.set(id, item);
	const resolved = (item: string) => (itemKind.get(item) === "problem" ? concluded.has(item) : answered.has(item));
	const stillPending = new Set(pending);

	const checks = new Map<string, MathCheckVisibility>();
	for (const id of all) {
		const item = boundTo.get(id);
		const problem = gradingOf.get(id);
		if (item !== undefined) checks.set(id, { hidden: !resolved(item), expressionsHidden: false });
		else if (stillPending.has(id)) checks.set(id, { hidden: true, expressionsHidden: false });
		else if (problem !== undefined) checks.set(id, { hidden: false, expressionsHidden: !concluded.has(problem) });
		else checks.set(id, { hidden: false, expressionsHidden: false });
	}

	const checked = new Set<string>();
	for (const [item, ids] of itemChecks) {
		const last = ids.at(-1);
		if (last !== undefined && outcome.get(last) === "agreed") checked.add(item);
	}
	for (const [conclude, problem] of problemOfConclude) if (checked.has(problem)) checked.add(conclude);
	return { checks, checked };
}
