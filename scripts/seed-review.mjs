import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
		record("review-belief-check", "UI review · Knowledge check", lesson.messages.slice(0, check + 1), 1),
		record("review-practice", "UI review · Active practice", practice.messages.slice(0, problem + 2), 2, "practice"),
		record("review-practice-history", "UI review · Practice history", practice.messages, 3, "practice"),
	];
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
	for (const record of buildReviewChats(lesson, practice)) {
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
