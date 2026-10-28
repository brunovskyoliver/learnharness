/**
 * The queued-steer indicator's pins (composer steering, owner arc
 * 2026-10-03): the quiet one-liners above the composer shell, and the
 * visibleQueuedSteers fold that decides which queued steers still show.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { QueuedSteersBody } from "../components/queued-steers.tsx";
import { SessionModel, visibleQueuedSteers } from "../components/session-core.ts";

describe("QueuedSteersBody (the quiet queue above the composer)", () => {
	it("renders one truncated right-aligned row per queued steer (feature 001)", () => {
		const html = renderToStaticMarkup(
			<QueuedSteersBody
				steers={[
					{ id: "steer_a", text: "also cover Venus while you are at it, please and thank you" },
					{ id: "steer_b", text: "short one" },
				]}
			/>,
		);
		assert.match(html, /data-testid="queued-steers"/);
		assert.equal(html.match(/>Queued</g)?.length, 2, "one labelled row per steer");
		assert.match(html, /truncate/, "single-line truncation with ellipsis");
		assert.match(html, /items-end/, "right-aligned stack");
		assert.match(html, /bg-card/, "a raised row");
		assert.doesNotMatch(html, /muted-foreground\/\d/, "no opacity text greys");
		assert.match(html, /also cover Venus/, "the text rides the row");
	});

	it("each row has a remove control named after its text, 44px on coarse pointers (feature 002)", () => {
		const html = renderToStaticMarkup(<QueuedSteersBody steers={[{ id: "steer_a", text: "Can you show it on a plot?" }]} onRemove={() => {}} />);
		assert.match(html, /<button type="button" aria-label="Remove queued message: Can you show it on a plot\?" data-testid="queued-steer-remove"/);
		assert.match(html, /pointer-coarse:size-11/);
		assert.match(html, /text-ink-2 transition-colors hover:bg-accent hover:text-foreground/);
	});

	it("Already sent: no remove control, the row waits for its card; Could not remove: the × retries", () => {
		const sent = renderToStaticMarkup(<QueuedSteersBody steers={[{ id: "a", text: "x", note: "Already sent" }]} onRemove={() => {}} />);
		assert.match(sent, /role="status"[^>]*>Already sent</);
		assert.doesNotMatch(sent, /queued-steer-remove/);
		const failed = renderToStaticMarkup(<QueuedSteersBody steers={[{ id: "a", text: "x", note: "Could not remove" }]} onRemove={() => {}} />);
		assert.match(failed, /role="status"[^>]*>Could not remove</);
		assert.match(failed, /queued-steer-remove/);
	});

	it("empty queue renders nothing", () => {
		assert.equal(renderToStaticMarkup(<QueuedSteersBody steers={[]} />), "");
	});
});

describe("visibleQueuedSteers (the fold: a line dies when its card lands)", () => {
	it("a queued steer stays visible until its id lands in the messages", () => {
		const queue = [
			{ id: "steer_a", text: "a" },
			{ id: "steer_b", text: "b" },
		];
		const before = visibleQueuedSteers(queue, [{ id: "msg_1" } as never]);
		assert.equal(before.length, 2, "nothing landed yet — both lines show");
		const after = visibleQueuedSteers(queue, [
			{ id: "msg_1" } as never,
			{ id: "steer_a", role: "user", content: "a" } as never,
		]);
		assert.deepEqual(after.map((s) => s.id), ["steer_b"], "the drained steer's line dropped");
	});
});

describe("SessionModel.cancelSteer (feature 002)", () => {
	/** A model with two queued steers; fetch answers POST /steer with 200 and DELETE with `answer`. */
	async function queued(answer: () => Promise<Response>) {
		const calls: string[] = [];
		const model = new SessionModel({
			chatId: "chat_1",
			initialMessages: [],
			fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
				calls.push(`${init?.method ?? "GET"} ${String(url)}`);
				return init?.method === "DELETE" ? answer() : Response.json({ ok: true });
			},
		});
		await model.steer("first");
		await model.steer("second");
		return { model, calls, ids: model.getState().steerQueue.map((s) => s.id) };
	}

	it("drops the row at once and DELETEs the steer by id", async () => {
		const { model, calls, ids } = await queued(async () => Response.json({ ok: true }));
		const pending = model.cancelSteer(ids[0]!);
		assert.deepEqual(model.getState().steerQueue.map((s) => s.text), ["second"], "gone before the server answers");
		await pending;
		assert.deepEqual(model.getState().steerQueue.map((s) => s.text), ["second"]);
		assert.equal(calls.at(-1), `DELETE /api/chats/chat_1/steer/${ids[0]}`);
	});

	it("409 already delivered: the row returns in place as Already sent", async () => {
		const { model, ids } = await queued(async () => Response.json({ error: "already delivered" }, { status: 409 }));
		await model.cancelSteer(ids[0]!);
		assert.deepEqual(model.getState().steerQueue.map((s) => [s.text, s.note]), [["first", "Already sent"], ["second", undefined]]);
	});

	it("any other failure or a dropped connection: the row returns as Could not remove", async () => {
		for (const answer of [async () => Response.json({ error: "cannot withdraw" }, { status: 409 }), async () => { throw new TypeError("Failed to fetch"); }]) {
			const { model, ids } = await queued(answer);
			await model.cancelSteer(ids[1]!);
			assert.deepEqual(model.getState().steerQueue.map((s) => [s.text, s.note]), [["first", undefined], ["second", "Could not remove"]]);
			assert.equal(model.getState().error, null, "no session-level error for a withdrawn message");
		}
	});
});
