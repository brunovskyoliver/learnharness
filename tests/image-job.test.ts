import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai";

const data = fs.mkdtempSync(path.join(os.tmpdir(), "lh-image-job-"));
process.env.LH_DATA_DIR = data;
const { PATHS } = await import("../config.ts");
const { createJobRunner, pdfModelOverride } = await import("../src/agent/subagents/runner.ts");
const { jobTools } = await import("../src/agent/tools/jobs.ts");
const { readTool } = await import("../src/agent/tools/read.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { jobStore } = await import("../src/store/jobs.ts");
const { libraryStore } = await import("../src/store/library.ts");
import type { SteerMessage } from "../src/core/contracts.ts";

const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n"), Buffer.alloc(16)]);
async function addImage(name = "fig.png") {
	async function* body() { yield new Uint8Array(PNG); }
	return await libraryStore.writeUpload(name, body(), PNG.length) as { id: string; name: string };
}
const textOf = (result: { content: unknown[] }) => (result.content[0] as { text: string }).text;

function harness(over: { engineFor?: () => undefined } = {}) {
	const delivered: SteerMessage[] = [];
	const runner = createJobRunner({
		chatStore, jobStore, library: libraryStore,
		deliver: async (steer: SteerMessage) => { delivered.push(steer); },
		...(over.engineFor ? { engineFor: over.engineFor } : {}),
	} as never);
	return { runner, delivered };
}

afterEach(() => { pdfModelOverride.current = undefined; });
after(() => fs.rmSync(data, { recursive: true, force: true }));

describe("job kind image", () => {
	it("runs on the pdfReader role, once, seeing the image and the question", async () => {
		const seen: string[] = [];
		const faux = createFauxCore({});
		faux.setResponses([(context) => { seen.push(JSON.stringify(context.messages)); return fauxAssistantMessage([fauxText("A triangle.")]); }]);
		pdfModelOverride.current = { model: faux.getModel(), streamFn: faux.streamSimple };
		const item = await addImage();
		const chat = chatStore.createChat("t");
		const { runner, delivered } = harness();
		const input = { item: item.id, name: item.name, question: "What shape?" };
		const job = jobStore.createJob({ kind: "image", chatId: chat.id, toolCallId: "t1", input });
		await runner.runJob(job.id, input as never);
		assert.equal(seen.length, 1);
		assert.ok(seen[0]!.includes("What shape?") && seen[0]!.includes('"image"'));
		assert.ok(delivered[0]!.content.includes("A triangle."));
		assert.equal(jobStore.getJob(job.id)!.status, "done");
	});
	it("refuses with no vision slot and makes no model call", async () => {
		const item = await addImage("norole.png");
		const chat = chatStore.createChat("t");
		const { runner, delivered } = harness({ engineFor: () => undefined });
		const input = { item: item.id, name: item.name, question: "q" };
		const job = jobStore.createJob({ kind: "image", chatId: chat.id, toolCallId: "t2", input });
		await runner.runJob(job.id, input as never);
		assert.ok(delivered[0]!.content.startsWith("Image failed:"));
		assert.equal(jobStore.getJob(job.id)!.status, "error");
	});
	it("the tool refuses before any job exists when no vision model is set", async () => {
		const item = await addImage("tool.png");
		let spawned = 0;
		const tools = jobTools({ chatId: "c", jobStore, spawn: () => { spawned++; }, library: { store: libraryStore, pdfOverview: async () => null, visionAvailable: () => false } });
		const text = textOf(await tools.image!.execute("t3", { item: item.id, question: "q" } as never));
		assert.ok(text.includes("No vision model"));
		assert.equal(spawned, 0);
	});
	it("the tool refuses a non-image and a deleted item, and dispatches an image", async () => {
		async function* body() { yield new TextEncoder().encode("hi"); }
		const doc = await libraryStore.writeUpload("doc.md", body(), 2) as { id: string };
		const gone = await addImage("gone.png");
		await libraryStore.remove(gone.id);
		const ok = await addImage("ok.png");
		const spawned: unknown[] = [];
		const chat = chatStore.createChat("t");
		const tools = jobTools({ chatId: chat.id, jobStore, spawn: (_j, input) => { spawned.push(input); }, library: { store: libraryStore, pdfOverview: async () => null, visionAvailable: () => true } });
		assert.ok(textOf(await tools.image!.execute("a", { item: doc.id, question: "q" } as never)).includes("not an image"));
		assert.ok(textOf(await tools.image!.execute("b", { item: gone.id, question: "q" } as never)).includes("deleted"));
		assert.ok(textOf(await tools.image!.execute("c", { item: "ok.png", question: "q" } as never)).startsWith("Dispatched"));
		assert.deepEqual(spawned, [{ item: ok.id, name: "ok.png", question: "q" }]);
	});
	it("is not registered without the Library context", () => {
		assert.equal(jobTools({ chatId: "c", jobStore, spawn: () => {} }).image, undefined);
	});
});

describe("read and images", () => {
	it("refuses a Library image and returns no bytes", async () => {
		await addImage("lib.png");
		const result = await readTool.execute("r", { path: path.join(PATHS.files, "lib.png") } as never);
		assert.equal(textOf(result), "This image is in the Library. Use the image tool.");
		assert.equal(result.content.length, 1);
	});
	it("still reads an image elsewhere", async () => {
		const outside = path.join(fs.mkdtempSync(path.join(data, "o-")), "x.png");
		fs.writeFileSync(outside, PNG);
		const result = await readTool.execute("r", { path: outside } as never);
		assert.ok(result.content.some((c) => (c as { type: string }).type === "image"));
	});
	it("still reads text in the Library folder", async () => {
		fs.mkdirSync(PATHS.files, { recursive: true });
		const file = path.join(PATHS.files, "note.md");
		fs.writeFileSync(file, "hello");
		assert.equal(textOf(await readTool.execute("r", { path: file } as never)), "hello");
	});
});
