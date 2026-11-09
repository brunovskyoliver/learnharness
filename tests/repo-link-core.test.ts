/** Library git sync's pure rules (feature 026, research R6, R7, R16): addresses,
 *  branch names, the hosted address block, which tree entries are mirrored,
 *  limits and their sentences. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRefusal, MAX_FILE_BYTES } from "../src/core/library.ts";
import {
	classifyEntry, failureMessage, isBlockedAddress, isBranchName, isIgnoredDirectory, isLfsPointer, limitFailure, parseRepoAddress, repoKeyOf,
	REPO_MAX_BYTES, REPO_MAX_FILES, REPO_MAX_LINKS, REPO_PULL_POOL, REPO_SYNC_INTERVAL_MS, syncStatusText, type RepoAddress,
} from "../src/core/repo-link.ts";

const ascii = (text: string) => new TextEncoder().encode(text);
const address = (raw: string, options?: { allowLoopbackHttp?: boolean }) => {
	const result = parseRepoAddress(raw, options);
	assert.ok(!isRefusal(result), `${raw} should parse`);
	return result as RepoAddress;
};
const refusal = (raw: string, options?: { allowLoopbackHttp?: boolean }) => {
	const result = parseRepoAddress(raw, options);
	assert.ok(isRefusal(result), `${raw} should be refused`);
	return result;
};

describe("repo limits", () => {
	it("match research R16", () => {
		assert.equal(REPO_MAX_FILES, 2000);
		assert.equal(REPO_MAX_BYTES, 524_288_000);
		assert.equal(REPO_MAX_LINKS, 10);
		assert.equal(REPO_SYNC_INTERVAL_MS, 900_000);
		assert.equal(REPO_PULL_POOL, 2);
	});
});

describe("parseRepoAddress", () => {
	it("accepts https and normalizes display and key", () => {
		for (const raw of ["https://github.com/oliver/notes", "https://github.com/oliver/notes.git", "https://GitHub.com/oliver/notes/", " https://github.com/oliver/notes.git/ "]) {
			const parsed = address(raw);
			assert.equal(parsed.display.toLowerCase(), "github.com/oliver/notes", raw);
			assert.equal(parsed.repoBase, "github.com/oliver/notes", raw);
		}
		assert.equal(address("https://github.com/oliver/notes.git/").url, "https://github.com/oliver/notes.git");
		assert.equal(address("https://git.example.com:8443/team/notes").display, "git.example.com:8443/team/notes");
	});
	it("keeps the path's case in the key; only the host is folded", () => {
		assert.equal(address("https://GITHUB.com/Oliver/Notes").repoBase, "github.com/Oliver/Notes");
	});
	it("refuses everything that isn't https with not_https", () => {
		for (const raw of ["git@github.com:oliver/notes.git", "ssh://git@github.com/oliver/notes", "http://github.com/oliver/notes", "file:///home/oliver/notes", "git://github.com/oliver/notes"]) {
			assert.equal(refusal(raw).refused, "not_https", raw);
		}
		assert.equal(refusal("http://github.com/x").message, "Only HTTPS addresses are supported.");
	});
	it("refuses credentials in the address without echoing them", () => {
		for (const raw of ["https://oliver:ghp_secret123@github.com/oliver/notes", "https://ghp_secret123@github.com/oliver/notes"]) {
			const result = refusal(raw);
			assert.equal(result.refused, "credential_in_address");
			assert.equal(result.message, "Take the name or token out of the address and put the token in its own field.");
			assert.ok(!JSON.stringify(result).includes("ghp_secret123"));
		}
	});
	it("refuses query, fragment, empty path and junk with invalid_address", () => {
		for (const raw of ["https://github.com/oliver/notes?x=1", "https://github.com/oliver/notes#main", "https://github.com", "https://github.com/", "https://github.com/.git", "", "   ", "not a url", "github.com/oliver/notes"]) {
			assert.equal(refusal(raw).refused, "invalid_address", JSON.stringify(raw));
		}
		assert.equal(refusal("").message, "That isn't a repo address.");
	});
	it("accepts loopback http only with allowLoopbackHttp, and only 127.0.0.1", () => {
		assert.equal(refusal("http://127.0.0.1:4000/notes.git").refused, "not_https");
		const parsed = address("http://127.0.0.1:4000/notes.git", { allowLoopbackHttp: true });
		assert.equal(parsed.url, "http://127.0.0.1:4000/notes.git");
		assert.equal(parsed.display, "127.0.0.1:4000/notes");
		for (const raw of ["http://localhost:4000/notes.git", "http://10.0.0.1/notes.git", "http://127.0.0.2:4000/notes.git"]) {
			assert.equal(refusal(raw, { allowLoopbackHttp: true }).refused, "not_https", raw);
		}
	});
	it("builds the repo key from address and branch", () => {
		assert.equal(repoKeyOf(address("https://github.com/oliver/notes.git").repoBase, "main"), "github.com/oliver/notes#main");
	});
});

describe("isBranchName", () => {
	it("follows git's ref-name rules", () => {
		for (const name of ["main", "feature/x", "v1.2", "release-2026", "a_b"]) assert.ok(isBranchName(name), name);
		for (const name of ["", " ", "-x", "/x", "x/", "x.", "a..b", "a//b", "a b", "a~b", "a^b", "a:b", "a?b", "a*b", "a[b", "a\\b", "x.lock", "a/.b", "@", "a@{b", "x\x01"]) {
			assert.ok(!isBranchName(name), JSON.stringify(name));
		}
	});
});

describe("isBlockedAddress", () => {
	it("blocks loopback, private, link-local and unspecified", () => {
		for (const ip of ["127.0.0.1", "127.9.9.9", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "[::1]", "garbage"]) {
			assert.ok(isBlockedAddress(ip), ip);
		}
	});
	it("allows public addresses", () => {
		for (const ip of ["140.82.112.3", "172.15.0.1", "172.32.0.1", "192.169.0.1", "8.8.8.8", "2606:4700::1111", "fec0::1", "::ffff:8.8.8.8"]) {
			assert.ok(!isBlockedAddress(ip), ip);
		}
	});
});

describe("classifyEntry", () => {
	it("keeps supported files once their bytes match", () => {
		assert.deepEqual(classifyEntry({ path: "week1/notes.md", mode: "100644" }), { action: "read", kind: "markdown" });
		assert.deepEqual(classifyEntry({ path: "week1/notes.md", mode: "100644" }, ascii("# hi")), { action: "keep", kind: "markdown" });
		assert.deepEqual(classifyEntry({ path: "run.sh", mode: "100755" }, ascii("echo")), { action: "keep", kind: "code" });
		assert.deepEqual(classifyEntry({ path: "paper.pdf", mode: "100644" }, ascii("%PDF-1.4")), { action: "keep", kind: "pdf" });
	});
	it("names symlinks, submodules, bad names, LFS pointers, files over 50 MiB and content mismatches", () => {
		assert.deepEqual(classifyEntry({ path: "link.md", mode: "120000" }), { action: "skip", file: { path: "link.md", reason: "symlink" } });
		assert.deepEqual(classifyEntry({ path: "vendor/lib", mode: "160000" }), { action: "skip", file: { path: "vendor/lib", reason: "submodule" } });
		assert.deepEqual(classifyEntry({ path: "a\x01b.md", mode: "100644" }), { action: "skip", file: { path: "a\x01b.md", reason: "bad-name" } });
		assert.deepEqual(classifyEntry({ path: " spaced.md", mode: "100644" }), { action: "skip", file: { path: " spaced.md", reason: "bad-name" } });
		const pointer = ascii("version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n");
		assert.deepEqual(classifyEntry({ path: "slides.pdf", mode: "100644" }, pointer), { action: "skip", file: { path: "slides.pdf", reason: "lfs" } });
		assert.deepEqual(classifyEntry({ path: "big.pdf", mode: "100644", size: MAX_FILE_BYTES + 1 }), { action: "skip", file: { path: "big.pdf", reason: "too-large" } });
		assert.deepEqual(classifyEntry({ path: "big.md", mode: "100644" }, new Uint8Array(MAX_FILE_BYTES + 1).fill(0x61)), { action: "skip", file: { path: "big.md", reason: "too-large" } });
		assert.deepEqual(classifyEntry({ path: "fake.pdf", mode: "100644" }, ascii("not a pdf")), { action: "skip", file: { path: "fake.pdf", reason: "content-mismatch" } });
	});
	it("counts unsupported, hidden and ignored entries without naming them", () => {
		assert.deepEqual(classifyEntry({ path: "photo.raw", mode: "100644" }), { action: "count", bucket: "unsupported" });
		assert.deepEqual(classifyEntry({ path: "Makefile", mode: "100644" }), { action: "count", bucket: "unsupported" });
		assert.deepEqual(classifyEntry({ path: ".gitignore", mode: "100644" }), { action: "count", bucket: "hiddenOrIgnored" });
		assert.deepEqual(classifyEntry({ path: "node_modules/x/readme.md", mode: "100644" }), { action: "count", bucket: "hiddenOrIgnored" });
		assert.deepEqual(classifyEntry({ path: ".github/workflows/ci.yml", mode: "100644" }), { action: "count", bucket: "hiddenOrIgnored" });
		for (const dir of [".git", "node_modules", ".obsidian"]) assert.ok(isIgnoredDirectory(dir), dir);
		assert.ok(!isIgnoredDirectory("week1"));
	});
	it("detects LFS pointers only when small and starting with the spec line", () => {
		assert.ok(isLfsPointer(ascii("version https://git-lfs.github.com/spec/v1\n")));
		assert.ok(!isLfsPointer(ascii("# version https://git-lfs.github.com/spec/v1")));
		assert.ok(!isLfsPointer(ascii(`version https://git-lfs.github.com/spec/v1\n${"x".repeat(1100)}`)));
	});
});

describe("limits and sentences (R16, ui-contract.md)", () => {
	it("passes at the limits and names the overshoot past them", () => {
		assert.equal(limitFailure({ files: REPO_MAX_FILES, bytes: REPO_MAX_BYTES }), null);
		const files = limitFailure({ files: 2345, bytes: 10 })!;
		assert.equal(files.code, "limit-files");
		assert.equal(files.message, "The repo has 2,345 supported files, 345 over the 2,000 limit.");
		assert.deepEqual(files.limit, { kind: "files", limit: 2000, found: 2345 });
		const bytes = limitFailure({ files: 3, bytes: REPO_MAX_BYTES + 25 * 1024 * 1024 })!;
		assert.equal(bytes.code, "limit-bytes");
		assert.equal(bytes.message, "The repo has 525.0 MB of supported files, 25.0 MB over the 500 MB limit.");
	});
	it("counts only the supported files that would be mirrored (T058)", () => {
		// The pull feeds limitFailure only what classifyEntry keeps: a repo of
		// 3,000 unsupported files and 600 MB of skipped ones is within the limits.
		const entries = [
			...Array.from({ length: 3000 }, (_, i) => ({ path: `raw/${i}.bin`, mode: "100644", size: 1 })),
			...Array.from({ length: 12 }, (_, i) => ({ path: `big/${i}.pdf`, mode: "100644", size: MAX_FILE_BYTES + 1 })),
			{ path: "notes.md", mode: "100644", size: 4 },
		];
		let files = 0;
		let bytes = 0;
		for (const entry of entries) {
			if (classifyEntry(entry).action === "read") { files += 1; bytes += entry.size; }
		}
		assert.deepEqual({ files, bytes }, { files: 1, bytes: 4 });
		assert.equal(limitFailure({ files, bytes }), null);
	});
	it("has a sentence for every failure", () => {
		assert.equal(failureMessage("auth", { hadToken: true }), "The repo refused the token. Check that it can read this repo.");
		assert.equal(failureMessage("auth"), "This repo is private. Add a token that can read it.");
		assert.equal(failureMessage("not-found"), "No repo or branch was found at that address.");
		assert.equal(failureMessage("network"), "The repo's server couldn't be reached.");
		assert.equal(failureMessage("too-large-download"), "The repo's download is over 500 MB.");
		assert.equal(failureMessage("address-blocked"), "This address can't be reached from the hosted app.");
		assert.equal(failureMessage("server"), "The repo couldn't be pulled.");
	});
	it("writes the status line", () => {
		const now = new Date("2026-11-08T12:00:00Z");
		const synced = (iso: string) => syncStatusText({ state: "synced", lastSuccessAt: iso }, now);
		assert.equal(syncStatusText({ state: "never" }, now), "Syncing for the first time…");
		assert.equal(syncStatusText({ state: "syncing" }, now), "Syncing…");
		assert.equal(synced("2026-11-08T11:59:30Z"), "Synced just now");
		assert.equal(synced("2026-11-08T11:55:00Z"), "Synced 5 min ago");
		assert.equal(synced("2026-11-08T09:00:00Z"), "Synced 3 h ago");
		assert.ok(synced("2026-11-01T09:00:00Z").startsWith("Synced on "));
		assert.equal(syncStatusText({ state: "failed", failure: { code: "network", message: "The repo's server couldn't be reached.", detail: "" } }, now), "Sync failed · The repo's server couldn't be reached.");
	});
});
