import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildMlReviewChats } from "./seed-ml.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = new URL("../tests/fixtures/golden-data/chats/", import.meta.url);

function callIndex(messages, name, predicate = () => true) {
	const index = messages.findIndex(message => Array.isArray(message.content) &&
		message.content.some(part => part.type === "toolCall" && part.name === name && predicate(part.arguments)));
	if (index < 0) throw new Error(`Review fixture is missing ${name}`);
	return index;
}

/** Synthetic review records are separate from the immutable golden fixtures. */
export function buildReviewChats(lesson, practice, now = new Date()) {
	const check = callIndex(lesson.messages, "quiz", args => args.type === "check");
	const problem = callIndex(practice.messages, "problem");
	const template = structuredClone(lesson.messages[check]);
	const timestamp = now.getTime();
	const spec = {
		params: { rate: { type: "slider", label: "Learning rate", min: 0.01, max: 0.5, step: 0.01, value: 0.08 } },
		state: { x: "2", y: "-2", history: "[{step:0,x:2,y:-2,loss:12}]" },
		step: "s.x = s.x * (1 - 2*p.rate); s.y = s.y * (1 - 4*p.rate); s.history.push({step:t+1,x:s.x,y:s.y,loss:s.x*s.x+2*s.y*s.y})",
		run: { maxSteps: 120 },
		panels: [
			{ type: "plot3d", title: "Loss surface", traces: '[{type:"surface",x:[-3,-2,-1,0,1,2,3],y:[-3,-2,-1,0,1,2,3],z:Array.from({length:7},(_,j)=>Array.from({length:7},(_,i)=>(i-3)**2+2*(j-3)**2)),showscale:false},{type:"scatter3d",mode:"lines+markers",x:s.history.map(p=>p.x),y:s.history.map(p=>p.y),z:s.history.map(p=>p.loss),line:{width:5,color:"#f2c66d"},marker:{size:3,color:"#f2c66d"}}]' },
			{ type: "chart", title: "Loss over time", data: { points: "s.history" }, spec: { data: { name: "points" }, mark: { type: "line", point: true }, encoding: { x: { field: "step", type: "quantitative", title: "Step" }, y: { field: "loss", type: "quantitative", title: "Loss" } } } },
			{ type: "readouts", items: [{ label: "Step", value: "t" }, { label: "Loss", value: "(s.x*s.x+2*s.y*s.y).toFixed(3)" }] },
		],
	};
	const artifact = {
		id: "review_gradient_demo", role: "custom", customType: "subagent-steer", display: true,
		content: "Interactive gradient descent demo.", timestamp: timestamp - 2000,
		details: { jobId: "review_gradient_demo", kind: "demo", toolCallId: "review_demo_call", result: {
			title: "Gradient descent in two weights", tested: true,
			html: `<!doctype html><html><body><div id="lh-kit"></div><script type="application/json" id="lh-kit-spec">${JSON.stringify(spec)}</script><script src="/demo-kit/runtime.js"></script></body></html>`,
		} },
	};
	const question = {
		...template, id: "review_gradient_question", timestamp: timestamp - 1000,
		content: [
			{ type: "text", text: "## Gradient descent\n\nGradient descent reduces loss by adjusting the weights. Small steps make steady progress; larger ones can jump across the valley.\n\nUse the demo beside this lesson. Expand **Loss surface**, rotate the camera, and change the learning rate. Escape returns to the workspace with your values and camera preserved.\n\nCompare **Loss over time** at 0.08 and 0.3. Press Reset between runs." },
			{ type: "toolCall", id: "review_gradient_check", name: "quiz", arguments: {
				type: "check", nodeId: "gradient", question: "Set the learning rate to 0.3 and press Reset, then Run. How does the path differ from the default 0.08?",
				details: "Compare the steps across the loss surface and the loss curve.",
				options: [
					{ label: "The larger rate makes larger jumps and can overshoot the valley.", value: "overshoot" },
					{ label: "The path stays the same; only the chart updates faster.", value: "same" },
					{ label: "The larger rate always reaches the minimum in one step.", value: "single" },
				], correctAnswer: "overshoot", explanation: "A larger learning rate makes larger updates. Here the second weight changes sign on each step at 0.3, producing an oscillating path.",
				demoRef: { messageId: artifact.id },
			} },
		],
	};
	delete question.responseId;
	question.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	const tree = { version: 1, nodes: [{ id: "gradient", title: "Learning rate controls the update step" }], edges: [] };
	const assistantCall = (id, name, args) => ({
		...question, id, timestamp: timestamp - 2500,
		content: [{ type: "toolCall", id, name, arguments: args }],
	});
	const toolResult = (id, name, details) => ({
		id: `${id}_result`, role: "toolResult", toolCallId: id, toolName: name,
		content: [{ type: "text", text: JSON.stringify(details) }], details, isError: false, timestamp: timestamp - 2400,
	});
	const handoff = structuredClone(lesson.messages.find(message => message.customType === "probe-handoff"));
	if (!handoff) throw new Error("Review fixture is missing probe-handoff");
	handoff.id = "review_gradient_handoff";
	handoff.content = "Explore how the learning rate changes gradient descent.";
	handoff.details = { chatId: "review-gradient-descent" };
	const record = (id, title, messages, offset, kind) => ({
		version: 1, id, title, createdAt: new Date(timestamp - 3600000).toISOString(),
		updatedAt: new Date(timestamp - offset * 60000).toISOString(), messages: structuredClone(messages),
		...(kind ? { kind } : {}),
	});
	const gradient = record("review-gradient-descent", "UI review · Gradient descent", [
			{ id: "review_gradient_user", role: "user", content: "Help me understand how the learning rate affects gradient descent.", timestamp: timestamp - 3000 },
			assistantCall("review_probe_done", "probe_done", { assessment: { strands: [{ strand: "Gradient descent", assessment: "Prepared review example: explore the update size, loss curve and overshooting using the interactive demo." }] } }),
			toolResult("review_probe_done", "probe_done", { ok: true }), handoff,
			assistantCall("review_plan", "plan_init", { mermaid: "graph TD\n gradient[Learning rate controls the update step]" }),
			toolResult("review_plan", "plan_init", { ok: true, tree }), artifact, question,
		], 0);
	gradient.tree = tree;
	return [
		gradient,
		buildMathCheckChat(question, record, timestamp),
		record("review-belief-check", "UI review · Knowledge check", lesson.messages.slice(0, check + 1), 1),
		record("review-practice", "UI review · Active practice", practice.messages.slice(0, problem + 2), 2, "practice"),
		record("review-practice-history", "UI review · Practice history", practice.messages, 3, "practice"),
	];
}

/** A synthetic lesson with one Wolfram math check row per state DESIGN.md
 *  lists (feature 007): equal, not equal (with a counterexample), couldn't
 *  decide (with Wolfram's reply), check failed, and a call with no result
 *  ("check not finished"; the live "Checking with Wolfram…" row exists only
 *  while a turn streams). Then a question check that agreed, bound to a quiz
 *  the learner answered: that card ends with "Checked with Wolfram". */
function buildMathCheckChat(assistantTemplate, record, timestamp) {
	let clock = timestamp - 5000;
	const usage = assistantTemplate.usage;
	const assistant = (id, content) => ({ ...assistantTemplate, id, timestamp: clock++, usage, content });
	const call = (id, args) => ({ type: "toolCall", id, name: "math_check", arguments: args });
	const result = (id, details, isError = false, text = JSON.stringify(details)) => ({
		id: `${id}_result`, role: "toolResult", toolCallId: id, toolName: "math_check",
		content: [{ type: "text", text }], details: isError ? undefined : details, isError, timestamp: clock++,
	});
	const reply = (body) => `Out[1]= "${body}"`;
	const options = [
		{ label: "\\(2\\cos 2x\\)", value: "two-cos" },
		{ label: "\\(\\cos 2x\\)", value: "cos" },
		{ label: "\\(-2\\cos 2x\\)", value: "minus-two-cos" },
	];
	const quizArgs = {
		type: "check", nodeId: "chain", question: "What is \\(\\frac{d}{dx}\\sin 2x\\)?",
		details: "Apply the chain rule to the inner \\(2x\\).", options, correctAnswer: "two-cos",
		explanation: "The outer derivative is \\(\\cos 2x\\); the inner \\(2x\\) contributes a factor of 2.",
	};
	const tree = { version: 1, nodes: [{ id: "chain", title: "The chain rule scales by the inner derivative" }], edges: [] };
	const chat = record("review-math-check", "UI review · Math check", [
		{ id: "review_math_user", role: "user", content: "Can you check the chain rule examples with Wolfram as we go?", timestamp: clock++ },
		assistant("review_math_plan", [{ type: "toolCall", id: "review_math_plan", name: "plan_init", arguments: { mermaid: "graph TD\n chain[The chain rule scales by the inner derivative]" } }]),
		{ id: "review_math_plan_result", role: "toolResult", toolCallId: "review_math_plan", toolName: "plan_init", content: [{ type: "text", text: "{\"ok\":true}" }], details: { ok: true, tree }, isError: false, timestamp: clock++ },
		assistant("review_math_equal", [
			{ type: "text", text: "## The chain rule\n\nDifferentiate the outside, then multiply by the derivative of the inside. For \\(\\sin 2x\\) that gives \\(2\\cos 2x\\)." },
			call("review_math_equal", { purpose: "lesson", lhs: "D[Sin[2 x], x]", rhs: "2 Cos[2 x]" }),
		]),
		result("review_math_equal", { outcome: "agreed", raw: reply("OUTCOME: agreed"), ms: 1840 }),
		assistant("review_math_not_equal", [
			{ type: "text", text: "Forgetting the inner factor is the usual slip: \\(\\cos 2x\\) is not the derivative." },
			call("review_math_not_equal", { purpose: "lesson", lhs: "D[Sin[2 x], x]", rhs: "Cos[2 x]", assumptions: "x > 0" }),
		]),
		result("review_math_not_equal", { outcome: "disagreed", counterexample: "{x -> 3}", raw: reply("OUTCOME: disagreed\\nCOUNTEREXAMPLE: {x -> 3}"), ms: 2310 }),
		assistant("review_math_undecided", [
			{ type: "text", text: "With a symbolic exponent the identity needs assumptions about \\(n\\)." },
			call("review_math_undecided", { purpose: "lesson", lhs: "D[x^n, x]", rhs: "n x^(n - 1)", assumptions: "Element[n, Reals]" }),
		]),
		result("review_math_undecided", { outcome: "undecided", reduced: "n x^(-1 + n) == n x^(-1 + n) || x == 0", reason: "Needs x != 0.", raw: reply("OUTCOME: undecided\\nREDUCED: n x^(-1 + n) == n x^(-1 + n) || x == 0"), ms: 20000 }),
		assistant("review_math_failed", [
			{ type: "text", text: "The same rule for a composition of three functions:" },
			call("review_math_failed", { purpose: "lesson", lhs: "D[Sin[Cos[x^2]], x]", rhs: "-2 x Sin[x^2] Cos[Cos[x^2]]" }),
		]),
		result("review_math_failed", null, true, "The Wolfram check is unavailable: fetch failed."),
		assistant("review_math_unfinished", [
			{ type: "text", text: "And for a product inside the sine:" },
			call("review_math_unfinished", { purpose: "lesson", lhs: "D[Sin[x Exp[x]], x]", rhs: "(1 + x) Exp[x] Cos[x Exp[x]]" }),
		]),
		assistant("review_math_question_check", [
			{ type: "text", text: "Your turn." },
			call("review_math_question_check", { purpose: "question", lhs: "D[Sin[2 x], x]", rhs: "2 Cos[2 x]" }),
		]),
		result("review_math_question_check", { outcome: "agreed", raw: reply("OUTCOME: agreed"), ms: 1620 }),
		assistant("review_math_quiz", [{ type: "toolCall", id: "review_math_quiz", name: "quiz", arguments: quizArgs }]),
		{
			id: "review_math_quiz_result", role: "toolResult", toolCallId: "review_math_quiz", toolName: "quiz",
			content: [{ type: "text", text: JSON.stringify({ kind: "quiz", answers: [{ index: 1, label: options[0].label }], correct: true, confidence: 80 }) }],
			details: {
				kind: "quiz", tool: "quiz", questionType: "check", questionText: quizArgs.question,
				options: options.map((o, i) => ({ index: i + 1, label: o.label })), dontKnow: false,
				answers: [{ label: options[0].label, value: options[0].value, index: 1 }],
				answeredAt: new Date(clock).toISOString(), correctIndices: [1], explanation: quizArgs.explanation, correct: true, confidence: 80,
			},
			isError: false, timestamp: clock++,
		},
		assistant("review_math_close", [{ type: "text", text: "Right: the inner \\(2x\\) contributes the factor of 2." }]),
	], 0.5);
	chat.tree = tree;
	return chat;
}

/** Exclusive writes preserve both unrelated chats and edits to seeded examples. */
export async function seedReviewChats(dataDir = process.env.LH_DATA_DIR || path.join(root, "data")) {
	if (process.env.LH_HOSTED === "1") throw new Error("Review seeding is for local development, not hosted tenant data.");
	const [lesson, practice] = await Promise.all([
		readFile(new URL("chat_mv27rrra_feff23b6.json", fixtures), "utf8").then(JSON.parse),
		readFile(new URL("chat_mv293wv5_10656952.json", fixtures), "utf8").then(JSON.parse),
	]);
	const chats = path.join(path.resolve(dataDir), "chats");
	await mkdir(chats, { recursive: true });
	const results = [];
	for (const record of [...buildReviewChats(lesson, practice), ...await buildMlReviewChats(lesson)]) {
		try {
			await writeFile(path.join(chats, `${record.id}.json`), JSON.stringify(record, null, "\t") + "\n", { flag: "wx" });
			results.push({ id: record.id, status: "created" });
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			results.push({ id: record.id, status: "kept" });
		}
	}
	return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	try {
		// Match Next dev's data-root configuration, including .env.local.
		const { default: nextEnv } = await import("@next/env");
		nextEnv.loadEnvConfig(root, true);
		for (const result of await seedReviewChats()) console.log(`${result.status}: /chat/${result.id}`);
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
