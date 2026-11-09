import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { citationHref, libraryHref, parseCitationHref, parseLibraryHref } from "../src/core/document-anchors.ts";

// Feature 027, T008: any Library item address, not only page citations.

describe("parseLibraryHref", () => {
	it("accepts /library?item=ID alone", () => {
		assert.deepEqual(parseLibraryHref("/library?item=lib_a"), { itemId: "lib_a" });
	});
	it("takes a page that is an integer ≥ 1, and ignores any other", () => {
		assert.deepEqual(parseLibraryHref("/library?item=lib_a&page=3"), { itemId: "lib_a", page: 3 });
		for (const page of ["0", "-1", "2.5", "x", ""]) assert.deepEqual(parseLibraryHref(`/library?item=lib_a&page=${page}`), { itemId: "lib_a" }, page);
	});
	it("takes a quote, decoded", () => {
		const href = citationHref({ itemId: "lib a", page: 2, quote: "it (really) works" });
		assert.deepEqual(parseLibraryHref(href), { itemId: "lib a", page: 2, quote: "it (really) works" });
		assert.deepEqual(parseLibraryHref("/library?item=x&quote="), { itemId: "x" });
	});
	it("ignores a hash", () => {
		assert.deepEqual(parseLibraryHref("/library?item=x#top"), { itemId: "x" });
	});
	it("accepts an absolute URL only on the given origin", () => {
		assert.deepEqual(parseLibraryHref("https://app.example/library?item=x&page=1", "https://app.example"), { itemId: "x", page: 1 });
		assert.equal(parseLibraryHref("https://elsewhere.example/library?item=x", "https://app.example"), null);
		assert.equal(parseLibraryHref("https://app.example/library?item=x"), null, "no origin given: paths only");
		assert.equal(parseLibraryHref("//app.example/library?item=x", "https://app.example"), null);
	});
	it("rejects other paths and an address with no item", () => {
		for (const href of ["/library", "/library?view=trash", "/libraryx?item=a", "/library/items?item=a", "/chat/x?item=a", "javascript:alert(1)", "/library?item="]) {
			assert.equal(parseLibraryHref(href, "https://app.example"), null, href);
		}
	});
	it("parseCitationHref still requires a page", () => {
		assert.equal(parseCitationHref("/library?item=x"), null);
		assert.deepEqual(parseCitationHref("/library?item=x&page=2"), { itemId: "x", page: 2, quote: "" });
	});
});

describe("libraryHref", () => {
	it("round-trips through parseLibraryHref and encodes as citationHref does", () => {
		assert.equal(libraryHref({ itemId: "a", page: 2, quote: "q (x)" }), citationHref({ itemId: "a", page: 2, quote: "q (x)" }));
		assert.equal(libraryHref({ itemId: "a" }), "/library?item=a");
		assert.equal(libraryHref({ itemId: "a", quote: "it's" }), "/library?item=a&quote=it%27s");
		assert.deepEqual(parseLibraryHref(libraryHref({ itemId: "a/b", quote: "x y" })), { itemId: "a/b", quote: "x y" });
	});
});
