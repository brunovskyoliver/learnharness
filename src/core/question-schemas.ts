/** Model tool schemas, kept outside the lightweight question logic. */
import { Array as ArrayType, Boolean as BooleanType, Integer as IntegerType, Literal as LiteralType, Object as ObjectType, Optional as OptionalType, String as StringType, Union as UnionType, type Static } from "typebox";
const Type = { Array: ArrayType, Boolean: BooleanType, Integer: IntegerType, Literal: LiteralType, Object: ObjectType, Optional: OptionalType, String: StringType, Union: UnionType };

/** One quiz answer option. Owner ruling (2026-09-26): NO `description`
 *  field — the model reliably used it to leak correctness ("that's not the
 *  gradient", "close but…"), making quizzes answerable by elimination.
 *  Neutral elaboration belongs in the question text or the post-answer
 *  explanation; the option is a bare claim. */
const quizOptionProps = {
	label: Type.String({ description: "Display label for the answer option — a bare claim, no reasoning" }),
	value: Type.Optional(
		Type.String({
			description: "Optional machine-readable value returned for the option. Defaults to the label.",
		}),
	),
};

/** One ask answer option — keeps `description`: ask is ungraded preference
 *  collection, there is no correctness to leak. */
const askOptionProps = {
	...quizOptionProps,
	description: Type.Optional(
		Type.String({ description: "Optional extra detail shown below the option" }),
	),
};


// The SHARED quiz authoring fields — everything except `nodeId`. The probe
// and teach agents use DIFFERENT tools under the same name (docs/probe-teach-
// split.md §1): the prober's quiz has NO nodeId field at all (there is no
// map to position on), the teacher's adds it (the position signal — the
// per-session tree validation runs in the tool's execute, tools.ts).
// Grading rules are identical, single-sourced here. The cross-field
// authoring contract (quizInputProblems, above) is enforced at the
// tool-call boundary in execute — TypeBox carries the structure to the
// model, the problems function carries the refinements.
//
// Argument-order ruling (owner, 2026-09-25): the explanation is REASONING,
// and reasoning happens BEFORE the answer is chosen — models emit tool
// args in schema order, so explanation sits immediately BEFORE correctAnswer.
// (All consumers read by key; the order is authoring guidance, nothing else.)
const demoReference = Type.Optional(Type.Object({
	messageId: Type.String({ minLength: 1, description: "Exact demo messageId supplied with the delivered demo. References this revision, not another demo with the same title." }),
	panel: Type.Optional(Type.Integer({ minimum: 0, description: "Optional zero-based graph panel index within the referenced kit demo." })),
}));

export const quizInputBase = Type.Object({
	demoRef: demoReference,
	question: Type.String({
		description:
			"The single quiz question to ask. ONE question per turn: ask, then end your turn — the answer determines the next question.",
	}),
	options: Type.Array(Type.Object(quizOptionProps), {
		minItems: 2,
		description:
			"REQUIRED. The answer options (2 or more) as a JSON ARRAY of option objects — never a " +
			"JSON-encoded string. Options only — there is no free-text mode. " +
			"Give each option a stable `value`; you reference the correct one by that value in correctAnswer. " +
			"Never add your own 'I don't know' option — that choice is added for you.",
	}),
	multiSelect: Type.Optional(
		Type.Boolean({
			description: "Set to true when more than one option is correct and the learner must select all of them.",
		}),
	),
	explanation: Type.String({
		description:
			"REQUIRED. Explanation revealed AFTER the learner answers (shown whether they got it right or wrong). " +
			"Use it to reinforce why the correct answer is correct. It is written BEFORE correctAnswer by design: " +
			"reason it out first, then commit the answer the reasoning supports.",
	}),
	correctAnswer: Type.Union([Type.String(), Type.Array(Type.String())], {
		description:
			"REQUIRED. The correct answer as the option value(s) — the `value` field of the option you intend. " +
			'Single-select: a single string (e.g. "mercury"). Multi-select: an array of strings (e.g. ["belize", "niue"]); ' +
			"the learner is only correct if their selection matches this set exactly. " +
			"Always pass the value, not a position number — this is self-checking and prevents miscounting. " +
			"A value that matches no option fails validation and the call is returned to you to fix.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
});

// The TEACH-side quiz object: the shared base + the plan-position field
// + the ROLE field (owner design 2026-10-03, "two questions per teaching
// unit"): `type` declares the question's role in the cycle. The ROLE
// DOCTRINE lives in the system prompt (owner: tool descriptions stay
// purely MECHANICAL — no instructions on what the questions should be);
// the enum's one-liners below say only WHEN each kind fires.
// nodeId means "this question is ABOUT this node" — a position signal,
// never a completion signal (docs/probe-teach-split.md §3). BOTH teaching
// types carry it. The cross-field authoring contract (the Gate-3
// hardening: a quiz whose correctAnswer can't be graded NEVER reaches the
// learner — schema-valid ⇔ gradeable, the rules exactly what the grading
// path accepts) runs at the CALL BOUNDARY in the tool's execute:
// quizInputProblems here, the per-session plan-nodeId validation in
// tools.ts (it reads the live chat record, which this core never touches).

/** The teaching-cycle role field, shared VERBATIM by both teach quizzing
 *  tools (owner, 2026-10-09: explain gains the cycle's types — a
 *  free-recall check collapses behind the reveal exactly like a quiz
 *  check; a prediction never does). Bare words, never quoted (the
 *  quote-copy wobble — see the whitehead pins, tests/tool-heal.test.ts). */
const predictCheckType = Type.Union([Type.Literal("predict"), Type.Literal("check")], {
	description:
		"REQUIRED — the question's role in the teaching cycle, as a bare word (no quotes): predict = posed BEFORE " +
		"you teach the step (its own turn; the learner answers, then your teaching resolves it — arrives open, never " +
		"collapsed); check = posed AFTER the step's teaching is complete (arrives collapsed behind the Check your " +
		"understanding reveal). ONE question per turn either way.",
});


/** The TEACH-side quiz object. The required pair leads the property
 *  order (owner, 2026-10-09): glm-5.3 dropped `type`/`nodeId` on long
 *  calls BECAUSE they trailed every content field — fields generated
 *  first get dropped least. The order is also the authoring order:
 *  commit to the node and the question's role, then write the question. */
export const quizInputObject = Type.Object({
	type: predictCheckType,
	nodeId: Type.String({
		description:
			"REQUIRED plan-tree node id this question is about — must EXACTLY match one of this session's " +
			"plan_init node slugs (validated at call time; a mismatched id is rejected back to you). " +
			"The lesson's position on the map derives from these tags (the node the latest tagged question is about is " +
			"where the map stands; earlier ones count as visited). A node takes as many questions as it deserves: stay on " +
			"one node for as many turns as the understanding needs — one reasoning step at a time, never rush forward. " +
			"For off-map checks use ask_user_question.",
	}),
	...quizInputBase.properties,
});

/** The PROBE-side quiz declaration: the shared authoring contract, no
 *  nodeId and no `type` field at all — the session's map doesn't exist
 *  yet, and probing has exactly ONE question role (owner 2026-10-03: the
 *  prober keeps its own tool; the teaching cycle's types stay with the
 *  teacher, so nothing invites misuse). Structurally identical to
 *  quizInputBase (the old superRefine never reached the wire — it ran at
 *  the call boundary, where quizInputProblems runs now). */
export const probeQuizInputSchema = quizInputBase;

/** The DISPLAY parse for persisted quiz calls (tool-parts.ts): the base
 *  + `type` as an OPTIONAL plain string (old records carry none, and
 *  Value.Clean keeps a key only when the schema knows it — the dock would
 *  otherwise lose the role it renders and gates by). Normalization is
 *  normalizeQuizType at the read seam; nodeId stays stripped (unknown
 *  key). The PROBE quiz parses against the bare base — probe calls carry
 *  no type. */
export const quizDisplayInputSchema = Type.Object({
	...quizInputBase.properties,
	type: Type.Optional(Type.String()),
});

// ─── the explain tool (free-recall quizzing, owner 2026-09-27) ─────────────
//
// Quiz mechanics WITHOUT options: the learner answers in his own words.
// The SYCOPHANCY MITIGATION is structural — the model commits to the full
// correct answer BEFORE posing (the commitment rides the persisted call
// args, is revealed to the learner on submit, and is restated in the answer
// result the model grades against; the client never grades free text).
// ONE committed answer, reasoning included (owner ruling 2026-09-27: the
// separate explanation field was quiz remnant — collapsed away).
// Mechanics doctrine lives in the TOOL DESCRIPTIONS (pi-native ruling),
// not in the system prompt.

export const explainInputBase = Type.Object({
	demoRef: demoReference,
	question: Type.String({
		description:
			"The single question to ask. ONE question per turn: ask, then end your turn — the answer determines the next.",
	}),
	correctAnswer: Type.String({
		description:
			"REQUIRED. The full correct answer in your own words, reasoning included — COMMITTED before the learner " +
			"ever sees the question. The commitment is immutable: when his answer returns, grade it strictly against this " +
			"text — never revise the commitment after seeing his words, and never mark a wrong answer right to be kind. " +
			"It is shown to him on submit; your next reply grades the nuance of what he wrote.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
});

/** The TEACH-side explain object: base + the plan-position field (same
 *  semantics as the quiz's nodeId — the seam recognizes BOTH tools). */
/** The TEACH-side explain object: base + the teaching-cycle role field
 *  and the plan-position field (same semantics as the quiz's — the seam
 *  recognizes BOTH tools). The required pair leads the property order,
 *  exactly as the teach quiz's (owner, 2026-10-09). */
export const explainInputObject = Type.Object({
	type: predictCheckType,
	nodeId: Type.String({
		description:
			"REQUIRED plan-tree node id this question is about — must EXACTLY match one of this session's " +
			"plan_init node slugs (validated at call time; a mismatched id is rejected back to you). " +
			"The lesson's position on the map derives from these tags (the node the latest tagged question is about is " +
			"where the map stands; earlier ones count as visited). A node takes as many questions as it deserves: stay on " +
			"one node for as many turns as the understanding needs — one reasoning step at a time, never rush forward. " +
			"For off-map checks use ask_user_question.",
	}),
	...explainInputBase.properties,
});

/** The DISPLAY parse for persisted explain calls (tool-parts.ts): the
 *  base + `type` as an OPTIONAL plain string — exactly the quiz display
 *  pattern. Old records carry none; questionNeedsReveal treats them as
 *  checks (the standing default). nodeId stays stripped (unknown key).
 *  The PROBE recall parses against the bare base. */
export const explainDisplayInputSchema = Type.Object({
	...explainInputBase.properties,
	type: Type.Optional(Type.String()),
});


/** The TEACHER's quiz declaration (base + the position field). */
export const quizInputSchema = quizInputObject;

export const askInputSchema = Type.Object({
	demoRef: demoReference,
	// No `mode` param — the pi original has none: the mode is inferred from
	// whether options are present (the dock does exactly this). One less
	// knob for the model to misuse.
	question: Type.String({
		description:
			"The single question to ask the learner. ONE question per turn: ask, then end your turn — the answer determines the next question.",
	}),
	details: Type.Optional(
		Type.String({ description: "Optional extra context or instructions shown under the question." }),
	),
	options: Type.Optional(
		Type.Array(Type.Object(askOptionProps), {
			minItems: 2,
			description:
				"Optional multiple-choice options. Omit for free-form text input. " +
				"The learner can always choose 'Other' and type a custom answer when options are provided.",
		}),
	),
	multiSelect: Type.Optional(
		Type.Boolean({ description: "Set to true to allow multiple answers to the same question." }),
	),
});
// Ask's option sanity (labels non-empty, values distinct — ask is not
// graded, but duplicate values break the dock's value keying) runs at the
// call boundary in execute (askOptionProblems, above).

export type QuizToolInput = Static<typeof quizInputObject>;
export type AskToolInput = Static<typeof askInputSchema>;
export type ExplainToolInput = Static<typeof explainInputObject>;
export type ProbeExplainToolInput = Static<typeof explainInputBase>;


/** A real selected answer, in the order the options were displayed. */
