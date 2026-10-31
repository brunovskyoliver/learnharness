/** The upload queue's order and clash path (feature 009), without a browser. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runUploadQueue, type UploadOutcome } from "../components/library/upload.ts";

const file = (name: string, size = 3) => ({ name, size }) as unknown as File;
const noop = () => {};

describe("runUploadQueue", () => {
	it("sends one file at a time, in order", async () => {
		const order: string[] = [];
		let active = 0;
		await runUploadQueue([file("a.md"), file("b.md")], {
			maxFileBytes: 100,
			send: async (_file, name) => {
				assert.equal(++active, 1);
				order.push(name);
				await Promise.resolve();
				active--;
				return { status: "done" };
			},
			askClash: async () => false, onProgress: noop, onRefused: noop, onSettled: noop,
		});
		assert.deepEqual(order, ["a.md", "b.md"]);
	});

	it("keeps both by retrying with the server's name, asking again if that clashes too", async () => {
		const sent: string[] = [];
		const answers: UploadOutcome[] = [
			{ status: "clash", name: "a.md", suggestedName: "a (2).md" },
			{ status: "clash", name: "a (2).md", suggestedName: "a (3).md" },
			{ status: "done" },
		];
		const asked: string[] = [];
		await runUploadQueue([file("a.md")], {
			maxFileBytes: 100,
			send: async (_file, name) => { sent.push(name); return answers.shift()!; },
			askClash: async (name, suggested) => { asked.push(`${name}>${suggested}`); return true; },
			onProgress: noop, onRefused: noop, onSettled: noop,
		});
		assert.deepEqual(sent, ["a.md", "a (2).md", "a (3).md"]);
		assert.deepEqual(asked, ["a.md>a (2).md", "a (2).md>a (3).md"]);
	});

	it("cancel skips that file and carries on", async () => {
		const sent: string[] = [];
		await runUploadQueue([file("a.md"), file("b.md")], {
			maxFileBytes: 100,
			send: async (_file, name) => { sent.push(name); return name === "a.md" ? { status: "clash", name, suggestedName: "a (2).md" } : { status: "done" }; },
			askClash: async () => false, onProgress: noop, onRefused: noop, onSettled: noop,
		});
		assert.deepEqual(sent, ["a.md", "b.md"]);
	});

	it("names a refused file, refuses an oversize file without sending and carries on", async () => {
		const refused: string[] = [];
		const sent: string[] = [];
		await runUploadQueue([file("big.pdf", 101), file("bad.exe"), file("ok.md")], {
			maxFileBytes: 100,
			send: async (_file, name) => { sent.push(name); return name === "bad.exe" ? { status: "refused", message: "No." } : { status: "done" }; },
			askClash: async () => false, onProgress: noop, onSettled: noop,
			onRefused: (name, message) => refused.push(`${name}: ${message}`),
		});
		assert.deepEqual(sent, ["bad.exe", "ok.md"]);
		assert.deepEqual(refused, ["big.pdf: This file is over the 50 MB limit.", "bad.exe: No."]);
	});
});
