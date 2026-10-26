/**
 * The hosted entry gate (2026-10-26): every API route export runs through
 * withTenant, every page that reads stores through withTenantPage, and
 * hosted mode fails closed (no Clerk keys → 503 at the proxy, 401 from a
 * handler with no signed-in user). A new route that forgets the wrapper
 * would run with no tenant and fail-closed reads would look empty — this
 * test names it instead.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy.ts";
import { withTenant } from "../src/server/tenant-access.ts";

const APP = path.resolve(import.meta.dirname, "..", "app");
const files = (name: string) => (fs.readdirSync(APP, { recursive: true }) as string[]).filter((f) => path.basename(f) === name).map((f) => path.join(APP, f));

describe("hosted entry gate", () => {
	it("every API route export is wrapped in withTenant", () => {
		const routes = files("route.ts");
		assert.ok(routes.length >= 30);
		for (const file of routes) {
			const src = fs.readFileSync(file, "utf8");
			const rel = path.relative(APP, file);
			assert.doesNotMatch(src, /^export (async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/m, `${rel}: unwrapped handler`);
			for (const [, method, value] of src.matchAll(/^export const (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) = (.*)$/gm)) {
				assert.match(value!, /^withTenant\(/, `${rel}: ${method} skips withTenant`);
			}
		}
	});

	it("every page that imports the server barrel wraps its default export", () => {
		for (const file of files("page.tsx")) {
			const src = fs.readFileSync(file, "utf8");
			const names = src.match(/import \{([^}]*)\} from "@\/src\/server"/)?.[1]?.split(",").map((n) => n.trim()) ?? [];
			if (names.every((n) => n === "" || n === "hostedMode")) continue;
			assert.match(src, /^export default withTenantPage\(/m, `${path.relative(APP, file)} reads stores without withTenantPage`);
		}
	});

	it("passes through outside hosted mode and refuses without a user in hosted mode", async () => {
		const handler = withTenant(async () => new Response("ok"));
		assert.equal(await (await handler()).text(), "ok");
		process.env.LH_HOSTED = "1";
		try {
			assert.equal((await handler()).status, 401);
		} finally {
			delete process.env.LH_HOSTED;
		}
	});

	it("hosted proxy fails closed without Clerk keys", async () => {
		const saved = { secret: process.env.CLERK_SECRET_KEY, pk: process.env.CLERK_PUBLISHABLE_KEY };
		process.env.LH_HOSTED = "1";
		delete process.env.CLERK_SECRET_KEY;
		delete process.env.CLERK_PUBLISHABLE_KEY;
		try {
			for (const url of ["http://localhost/api/chats", "http://localhost/"]) {
				assert.equal((await proxy(new NextRequest(url)))!.status, 503);
			}
		} finally {
			delete process.env.LH_HOSTED;
			if (saved.secret !== undefined) process.env.CLERK_SECRET_KEY = saved.secret;
			if (saved.pk !== undefined) process.env.CLERK_PUBLISHABLE_KEY = saved.pk;
		}
	});
});

describe("sign-in root layout", () => {
	it("sign-in pages and the app shell sit under separate root layouts", () => {
		// Clerk soft-navigates after sign-in/out; only a root-layout change
		// forces the full load that swaps the shell's providers in or out.
		assert.equal(fs.existsSync(path.join(APP, "layout.tsx")), false);
		assert.deepEqual(files("layout.tsx").map((f) => path.relative(APP, f)).sort(), ["(app)/layout.tsx", "(auth)/layout.tsx"]);
		assert.ok(fs.existsSync(path.join(APP, "(auth)/sign-in/[[...sign-in]]/page.tsx")));
	});
});
