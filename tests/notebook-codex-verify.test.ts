/** Feature 024 T047: the verification-only codex engine switch
 *  (LH_NOTEBOOK_ENGINE=codex-verify, research R13). Inert in production and
 *  when unset; reads the token read-only; refuses plainly without one; the
 *  notebook gate counts it as configured. No network: the stream is faked. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";
import { createFauxCore, fauxAssistantMessage, normalizeContext, type StreamFunction } from "@earendil-works/pi-ai";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-nb-codex-")));
process.env.LH_DATA_DIR = dir;
delete process.env.LH_NOTEBOOK_FAUX;
const verify = await import("../src/agent/subagents/notebook-codex-verify.ts");
const nb = await import("../src/server/notebook.ts");

const env = process.env as Record<string, string | undefined>;
const saved = { engine: env.LH_NOTEBOOK_ENGINE, auth: env.LH_NOTEBOOK_CODEX_AUTH, node: env.NODE_ENV };
afterEach(() => {
	for (const [key, value] of [["LH_NOTEBOOK_ENGINE", saved.engine], ["LH_NOTEBOOK_CODEX_AUTH", saved.auth], ["NODE_ENV", saved.node]] as const) {
		if (value === undefined) delete env[key]; else env[key] = value;
	}
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
const authFile = (token: string) => {
	const file = path.join(dir, `auth-${crypto.randomUUID()}.json`);
	fs.writeFileSync(file, JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: token, refresh_token: "r" } }));
	return file;
};
const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

describe("the codex-verify switch", () => {
	it("is inert when unset, set to anything else, or in production", () => {
		delete env.LH_NOTEBOOK_ENGINE;
		env.NODE_ENV = "test";
		assert.equal(verify.notebookCodexVerifyEnabled(), false);
		env.LH_NOTEBOOK_ENGINE = "codex";
		assert.equal(verify.notebookCodexVerifyEnabled(), false);
		env.LH_NOTEBOOK_ENGINE = "codex-verify";
		assert.equal(verify.notebookCodexVerifyEnabled(), true);
		env.NODE_ENV = "production";
		assert.equal(verify.notebookCodexVerifyEnabled(), false);
	});

	it("in production the notebook gate ignores it and asks for the strong slot", () => {
		env.LH_NOTEBOOK_ENGINE = "codex-verify";
		env.LH_NOTEBOOK_CODEX_AUTH = authFile(jwt(Date.now() / 1000 + 3600));
		env.NODE_ENV = "production";
		assert.equal(nb.notebookModelRefusal()?.body.reason, "models");
	});

	it("refuses plainly with no auth file, an unreadable one, or an expired token", () => {
		delete env.LH_NOTEBOOK_CODEX_AUTH;
		assert.match((verify.readCodexVerifyToken() as { problem: string }).problem, /needs LH_NOTEBOOK_CODEX_AUTH/);
		env.LH_NOTEBOOK_CODEX_AUTH = path.join(dir, "missing.json");
		assert.match((verify.readCodexVerifyToken() as { problem: string }).problem, /can't be read/);
		env.LH_NOTEBOOK_CODEX_AUTH = authFile(jwt(Date.now() / 1000 - 10));
		assert.match((verify.readCodexVerifyToken() as { problem: string }).problem, /expired; it is never refreshed/);
	});

	it("the gate counts it as configured with a token and refuses plainly without", () => {
		env.LH_NOTEBOOK_ENGINE = "codex-verify";
		env.NODE_ENV = "test";
		env.LH_NOTEBOOK_CODEX_AUTH = authFile(jwt(Date.now() / 1000 + 3600));
		assert.equal(nb.notebookModelRefusal(), null);
		delete env.LH_NOTEBOOK_CODEX_AUTH;
		const refusal = nb.notebookModelRefusal();
		assert.equal(refusal?.status, 503);
		assert.match(String(refusal?.body.error), /LH_NOTEBOOK_CODEX_AUTH/);
		assert.equal(refusal?.body.reason, undefined);
	});

	it("injects the token as apiKey on each request and never writes the file", async () => {
		const token = jwt(Date.now() / 1000 + 3600);
		const file = authFile(token);
		const before = { hash: sha(file), mtime: fs.statSync(file).mtimeMs };
		env.LH_NOTEBOOK_CODEX_AUTH = file;
		const faux = createFauxCore({});
		faux.setResponses([fauxAssistantMessage("ok", { stopReason: "stop" })]);
		const seen: Record<string, unknown>[] = [];
		const fake: StreamFunction = (model, context, options) => {
			seen.push({ ...options });
			return faux.streamSimple(model, context, options);
		};
		const engine = verify.codexVerifyEngine(fake);
		assert.equal(engine.model.provider, "openai-codex");
		assert.equal(engine.model.id, verify.CODEX_VERIFY_MODEL_ID);
		const stream = engine.streamFn(faux.getModel() as never, normalizeContext({ messages: [{ role: "user", content: "hi", timestamp: 0 }] }), {});
		for await (const _ of stream) { /* drain */ }
		assert.equal(seen[0]!.apiKey, token);
		assert.equal(seen[0]!.reasoning, verify.CODEX_VERIFY_LEVEL);
		assert.deepEqual({ hash: sha(file), mtime: fs.statSync(file).mtimeMs }, before);
		delete env.LH_NOTEBOOK_CODEX_AUTH;
		assert.throws(() => engine.streamFn(faux.getModel() as never, normalizeContext({ messages: [] }), {}), /LH_NOTEBOOK_CODEX_AUTH/);
	});
});
