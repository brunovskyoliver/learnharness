/** The Library's pure rules (feature 009): names, kinds, content checks, limits. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	contentMatches, kindForName, MAX_FILE_BYTES, nameKey, OUTLINE_MAX_BYTES, PAGE_MAX_BYTES,
	REFERENCE_INLINE_MAX_BYTES, REFERENCE_MAX_PER_MESSAGE, REFERENCE_MESSAGE_MAX_BYTES, suggestName, uploadName,
} from "../src/core/library.ts";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("library limits", () => {
	it("match the plan", () => {
		assert.equal(MAX_FILE_BYTES, 52_428_800);
		assert.equal(REFERENCE_INLINE_MAX_BYTES, 32_768);
		assert.equal(REFERENCE_MESSAGE_MAX_BYTES, 65_536);
		assert.equal(REFERENCE_MAX_PER_MESSAGE, 8);
		assert.equal(OUTLINE_MAX_BYTES, 8_192);
		assert.equal(PAGE_MAX_BYTES, 1_048_576);
	});
});

describe("uploadName", () => {
	it("refuses separators, leading dots, control characters and bad lengths", () => {
		for (const name of ["", "   ", "../x.md", "a/b.md", "a\\b.md", ".env", "..", "a\nb.md", "a\x7fb.md", "x".repeat(201)]) {
			assert.equal(uploadName(name), null, JSON.stringify(name));
		}
	});
	it("trims and normalizes to NFC", () => {
		assert.equal(uploadName("  notes.md "), "notes.md");
		assert.equal(uploadName("café.md"), "café.md");
		assert.equal(uploadName("x".repeat(200)), "x".repeat(200));
	});
	it("compares names without regard to case or normal form", () => {
		assert.equal(nameKey("CAFÉ.md"), nameKey("café.MD"));
	});
});

describe("kindForName", () => {
	it("detects each kind from the extension, lower-cased", () => {
		const cases = { "a.MD": "markdown", "a.markdown": "markdown", "a.tex": "text", "a.tsv": "csv", "a.PDF": "pdf", "a.webp": "image", "a.ipynb": "code", "a.r": "code" };
		for (const [name, kind] of Object.entries(cases)) assert.equal(kindForName(name), kind, name);
	});
	it("refuses unknown extensions, SVG, and names with no extension", () => {
		for (const name of ["a.exe", "a.svg", "a.docx", "README", "a."]) assert.equal(kindForName(name), null, name);
	});
});

describe("contentMatches", () => {
	it("requires the PDF header", () => {
		assert.equal(contentMatches("a.pdf", ascii("%PDF-1.7 rest")), true);
		assert.equal(contentMatches("a.pdf", ascii("not a pdf")), false);
	});
	it("requires magic bytes that match the image extension", () => {
		const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
		assert.equal(contentMatches("a.png", png), true);
		assert.equal(contentMatches("a.jpg", png), false);
		assert.equal(contentMatches("a.jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)), true);
		assert.equal(contentMatches("a.gif", ascii("GIF89a")), true);
		assert.equal(contentMatches("a.webp", ascii("RIFF0000WEBP")), true);
		assert.equal(contentMatches("a.webp", ascii("RIFF0000WAVE")), false);
		assert.equal(contentMatches("a.bmp", ascii("BM00")), true);
	});
	it("refuses NUL and invalid UTF-8 in text kinds", () => {
		assert.equal(contentMatches("a.md", ascii("# café")), true);
		assert.equal(contentMatches("a.txt", bytes(0x61, 0x00, 0x62)), false);
		assert.equal(contentMatches("a.csv", bytes(0x61, 0xff, 0x62)), false);
	});
	it("accepts a multi-byte character cut by the end of the window", () => {
		assert.equal(contentMatches("a.txt", bytes(0x61, 0xc3)), true);
	});
	it("refuses a name with no accepted kind", () => {
		assert.equal(contentMatches("a.exe", ascii("text")), false);
	});
});

describe("suggestName", () => {
	it("finds the first free numbered name", () => {
		const taken = new Set(["notes (2).pdf"]);
		assert.equal(suggestName("notes.pdf", (c) => taken.has(c)), "notes (3).pdf");
		assert.equal(suggestName("README", () => false), "README (2)");
	});
	it("stays within the name limit", () => {
		const suggested = suggestName(`${"x".repeat(196)}.pdf`, () => false);
		assert.equal(suggested.length, 200);
		assert.ok(suggested.endsWith(" (2).pdf"));
	});
});
