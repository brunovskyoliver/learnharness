/** Guards from the final integration slice (feature 023): the routes 011-023 added are
 *  each behind withTenant, by name, and the proxy can't bring the repo into the desktop
 *  build by importing the data seam. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const routesUnder = (dir: string): string[] => {
	const start = path.join(ROOT, "app/api", dir);
	return (fs.readdirSync(start, { recursive: true }) as string[]).filter((file) => path.basename(file) === "route.ts").map((file) => path.join(start, file));
};

describe("hosted gate on the workspace's routes", () => {
	const routes = [...routesUnder("library"), ...routesUnder("cards")];
	it("every route file under library and cards exports only withTenant handlers", () => {
		assert.ok(routes.length >= 40, `found ${routes.length}`);
		for (const file of routes) {
			const source = fs.readFileSync(file, "utf8");
			const rel = path.relative(ROOT, file);
			const exported = [...source.matchAll(/^export (?:async )?(?:const|function) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b(.*)$/gm)];
			assert.ok(exported.length > 0, `${rel} exports no handler`);
			for (const [, method, rest] of exported) assert.match(rest!, /^ = withTenant\(/, `${rel}: ${method} skips withTenant`);
		}
	});
	it("names the proposal and diagram routes, so a move can't drop them from the sweep", () => {
		const rels = routes.map((file) => path.relative(path.join(ROOT, "app/api"), file));
		for (const expected of [
			"library/page-proposals/route.ts", "library/page-proposals/[id]/route.ts", "library/page-proposals/[id]/accept/route.ts", "library/page-proposals/[id]/reject/route.ts",
			"library/diagram-proposals/route.ts", "library/diagram-proposals/[id]/approve/route.ts", "library/diagrams/route.ts", "library/trash/route.ts", "library/folders/route.ts", "library/search/route.ts", "cards/route.ts", "cards/[id]/reveal/route.ts",
		]) assert.ok(rels.includes(expected), expected);
	});
});

describe("the proxy's import graph", () => {
	const resolve = (from: string, spec: string): string | null => {
		const base = path.resolve(path.dirname(from), spec);
		return [base, `${base}.ts`, `${base}.tsx`].find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) ?? null;
	};
	it("never reaches config.ts, whose data path makes the tracer take the whole repo", () => {
		const seen = new Set<string>();
		const walk = (file: string) => {
			if (seen.has(file)) return;
			seen.add(file);
			const source = fs.readFileSync(file, "utf8");
			for (const [, spec] of source.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]+)"/g)) {
				const next = resolve(file, spec!);
				if (next) walk(next);
			}
		};
		walk(path.join(ROOT, "proxy.ts"));
		assert.ok(seen.size >= 3);
		assert.ok(!seen.has(path.join(ROOT, "config.ts")), [...seen].map((file) => path.relative(ROOT, file)).join(", "));
	});
	it("the build-time refusal is still there", () => {
		assert.match(fs.readFileSync(path.join(ROOT, "scripts/build-server.mjs"), "utf8"), /REFUSING: standalone contains a data\/ directory/);
		assert.match(fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8"), /"\*\*\/data\/\*\*\/\*"/);
	});
});
