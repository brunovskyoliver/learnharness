/** Feature 021 as rendered on the server: distinct queue states, no back before
 *  reveal, Home's row and the palette's entries. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueueEmpty, RatingButtons, RevealMeta, dueLine } from "../components/review/queue-panel.tsx";
import { MakePreviewBody, parseMakeParam } from "../components/review/make-panel.tsx";
import { cardMeta, runCost, runLine } from "../components/review/card-lists.tsx";
import { WaitingSectionView } from "../components/waiting-section.tsx";
import { buildPaletteEntries, CARD_RATINGS, type CardReveal, type ReviewQueue } from "../src/core/index.ts";

const queue = (over: Partial<ReviewQueue> = {}): ReviewQueue => ({ card: null, due: 0, weakDue: 0, laterToday: 0, nextDueAt: null, dayEndsAt: "2026-11-04T04:00:00Z", total: 0, suspended: 0, undo: null, ...over });
const empty = (q: ReviewQueue, focus: "all" | "weak-only" = "all") => renderToStaticMarkup(<QueueEmpty queue={q} focus={focus} now={new Date("2026-11-03T10:00:00Z")} onNew={() => {}} onShowAll={() => {}} />);

describe("the queue's empty states", () => {
	it("tells no cards from all done from nothing weak", () => {
		assert.match(empty(queue()), /No flashcards yet/);
		const done = empty(queue({ total: 3, laterToday: 2, nextDueAt: "2026-11-03T10:10:00Z" }));
		assert.match(done, /All done for now/);
		assert.match(done, /2 cards come back later today, the next in 10 min/);
		assert.match(empty(queue({ total: 3, nextDueAt: "2026-11-05T10:00:00Z" })), /The next card is due in 2 days/);
		assert.match(empty(queue({ total: 3, due: 2 }), "weak-only"), /None of the 2 due cards link to a weak idea/);
	});
	it("counts in words", () => {
		assert.equal(dueLine({ due: 1 }), "1 card due");
		assert.equal(dueLine({ due: 4 }), "4 cards due");
	});
});

describe("the answer side", () => {
	const reveal: CardReveal = {
		id: "c", back: "B",
		previews: CARD_RATINGS.map((rating, index) => ({ rating, label: rating[0]!.toUpperCase() + rating.slice(1), interval: `${index + 1} min`, due: "x" })),
		source: { label: "Lesson: Waves", href: "/chat/1", gone: true },
		concepts: [{ id: "n", name: "Idea", statement: "", weak: true, gone: false }],
	};
	it("names each rating with its gap and its key", () => {
		const html = renderToStaticMarkup(<RatingButtons reveal={reveal} disabled={false} onRate={() => {}} />);
		for (const [index, label] of ["Again", "Hard", "Good", "Easy"].entries()) {
			assert.ok(html.includes(`aria-label="${label}, back in ${index + 1} min"`), label);
			assert.ok(html.includes(`aria-keyshortcuts="${index + 1}"`));
		}
	});
	it("says a source is gone instead of linking it, and names weak ideas", () => {
		const html = renderToStaticMarkup(<RevealMeta reveal={reveal} />);
		assert.match(html, /Lesson: Waves · this source is gone/);
		assert.ok(!html.includes("<a "));
		assert.match(html, /Idea · weak/);
	});
});

describe("the route's first response", () => {
	it("holds no card data: the page only mounts the client view", () => {
		const page = fs.readFileSync("app/(app)/review/page.tsx", "utf8");
		// Only the client view, inside the page's exit wrapper (feature 028), which carries no data.
		assert.match(page, /return <RouteExit><ReviewView \/><\/RouteExit>;/);
		assert.match(page, /^export default withTenantPage\(/m);
	});
	it("keeps the FSRS library out of everything a browser loads", () => {
		const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]));
		for (const file of [...walk("components"), ...walk("src/core"), ...walk("src/store")]) assert.ok(!fs.readFileSync(file, "utf8").includes('"ts-fsrs"'), file);
	});
	it("loads the review code with its route, not from the shell", () => {
		for (const file of ["components/sidebar.tsx", "components/workspace/sidebar-nav.tsx", "components/waiting-section.tsx", "components/home.tsx", "components/activity-dock.tsx"]) {
			assert.ok(!fs.readFileSync(file, "utf8").includes("components/review"), file);
		}
	});
});

describe("Make flashcards", () => {
	const preview = { label: "Notes", source: null, chars: 1200, truncated: true, model: "cheap-model", refusal: null };
	const handlers = { busy: false, failure: null, onGenerate: () => {}, onByHand: () => {}, onCancel: () => {}, onSettings: () => {} };
	it("says what goes where before the click, and that nothing joins unread", () => {
		const html = renderToStaticMarkup(<MakePreviewBody preview={preview} {...handlers} />);
		assert.match(html, /Sends 1,200 characters of this source to cheap-model/);
		assert.match(html, /only the first part goes/);
		assert.match(html, /Nothing joins your queue until you do/);
		assert.match(html, /Generate drafts/);
	});
	it("offers settings and hand writing when no model is set, and no way to send", () => {
		const html = renderToStaticMarkup(<MakePreviewBody preview={{ ...preview, refusal: { error: "No model." } }} {...handlers} />);
		assert.match(html, /No model\./);
		assert.ok(!html.includes("Generate drafts"));
		assert.match(html, /Write one by hand/);
	});
	it("reads its address", () => {
		assert.deepEqual(parseMakeParam("page:lib_1", () => null), { kind: "page", itemId: "lib_1" });
		assert.deepEqual(parseMakeParam("lesson:c1", () => null), { kind: "lesson", chatId: "c1" });
		assert.deepEqual(parseMakeParam("passage", () => '{"itemId":"i","page":2,"text":"t"}'), { kind: "passage", itemId: "i", page: 2, text: "t" });
		assert.deepEqual(parseMakeParam("passage", () => '{"itemId":"lib_n","text":"his words"}'), { kind: "passage", itemId: "lib_n", text: "his words" });
		assert.equal(parseMakeParam("passage", () => '{"itemId":"i","page":"2","text":"t"}'), null);
		assert.equal(parseMakeParam("passage", () => "not json"), null);
		assert.equal(parseMakeParam("nope", () => null), null);
	});
	it("states cost at read time, and never shows an unpriced run as free", () => {
		const run = { id: "r", label: "N", status: "done" as const, truncated: false, drafts: 2, costUsd: null, usage: { steps: 1 }, updatedAt: "x" };
		assert.equal(runCost(run), "cost unknown");
		assert.equal(runLine(run), "2 drafts from N · cost unknown");
		assert.equal(runLine({ ...run, costUsd: 0.001 }), "2 drafts from N · under $0.01");
		assert.equal(runLine({ ...run, status: "failed", error: "boom" }), "N failed: boom · cost unknown");
		assert.match(runLine({ ...run, status: "interrupted", usage: undefined }), /interrupted/);
	});
	it("words a row's meta", () => {
		const row = { id: "c", front: "f", status: "active" as const, suspended: false, phase: "review" as const, due: "2026-11-01T00:00:00Z", source: null, concepts: [], createdAt: "", updatedAt: "" };
		assert.equal(cardMeta(row, new Date("2026-11-02T00:00:00Z")), "In review · due");
		assert.equal(cardMeta({ ...row, suspended: true }), "Suspended");
	});
});

describe("Home's row", () => {
	const props = { chats: [], loadError: false, onRetry: () => {} };
	it("shows how many are due, with a quiet Review, and counts as one open row", () => {
		const html = renderToStaticMarkup(<WaitingSectionView {...props} cards={{ due: 7, weakDue: 2, failed: false, retry: () => {} }} />);
		assert.match(html, /data-testid="waiting-cards-row"/);
		assert.match(html, />Flashcards</);
		assert.match(html, />7 due</);
		assert.match(html, /2 on weak ideas/);
		assert.match(html, /class="waiting-row-action lh-tool"[^>]*>Review</);
		assert.match(html, />1 open</);
	});
	it("shows no row at zero, and the empty line still reads", () => {
		const html = renderToStaticMarkup(<WaitingSectionView {...props} cards={{ due: 0, weakDue: 0, failed: false, retry: () => {} }} />);
		assert.ok(!html.includes("waiting-cards-row"));
		assert.match(html, /Nothing is waiting/);
	});
	it("says a failed count failed", () => {
		const html = renderToStaticMarkup(<WaitingSectionView {...props} cards={{ due: 3, weakDue: 0, failed: true, retry: () => {} }} />);
		assert.match(html, /Could not count your flashcards/);
		assert.match(html, />3 due</, "the last count stays");
	});
});

describe("the palette", () => {
	it("has Review and New flashcard everywhere, and lesson cards in a lesson", () => {
		const labels = (inLesson: boolean) => buildPaletteEntries({ inSession: inLesson, inLesson, chats: [], items: [], folders: [] }).map((entry) => entry.label);
		assert.ok(labels(false).includes("Review flashcards"));
		assert.ok(labels(false).includes("New flashcard"));
		assert.ok(!labels(false).includes("Make flashcards from this lesson"));
		assert.ok(labels(true).includes("Make flashcards from this lesson"));
	});
});

describe("Review on the paper (feature 025)", () => {
	const reveal: CardReveal = {
		id: "c", back: "B", source: null, concepts: [],
		previews: CARD_RATINGS.map((rating, index) => ({ rating, label: rating, interval: `${index + 1} min`, due: "x" })),
	};
	it("draws the ratings as ringed cards with the key in mono from 640px", () => {
		const html = renderToStaticMarkup(<RatingButtons reveal={reveal} disabled={false} onRate={() => {}} />);
		assert.equal(html.match(/class="lh-rating"/g)?.length, 4);
		assert.match(html, /grid-cols-2[^"]*sm:grid-cols-4/, "two by two below 640px");
		assert.match(html, /class="[^"]*font-mono[^"]*max-sm:hidden"[^>]*>1</);
		assert.doesNotMatch(html, /bg-shelf/);
	});
	it("has one ink pill per state and quiet text actions", () => {
		assert.match(empty(queue()), /class="nb-pill"[^>]*>New card</);
		assert.match(empty(queue({ total: 3, due: 2 }), "weak-only"), /class="lh-text-action"[^>]*>Show all due</);
		const make = renderToStaticMarkup(<MakePreviewBody preview={{ label: "N", source: null, chars: 10, truncated: false, model: "m", refusal: null }} busy={false} failure={null} onGenerate={() => {}} onByHand={() => {}} onCancel={() => {}} onSettings={() => {}} />);
		assert.match(make, /data-testid="make-panel" class="lh-card-block/);
		assert.match(make, /class="nb-pill"[^>]*>Generate drafts</);
		assert.match(make, /class="lh-text-action"[^>]*>Write one by hand</);
		assert.doesNotMatch(make, /prompt-(primary|secondary)|bg-shelf/);
	});
});
