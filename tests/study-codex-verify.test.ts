/** Feature 025 T063 (research R14): Study's side of the verification-only
 *  codex switch (LH_NOTEBOOK_ENGINE=codex-verify, 024 R13). Inert when unset
 *  and in production (the same rule as Notebook: NODE_ENV=production, which
 *  `next start` sets, never honours it); when set, every Study resolution
 *  lands on the openai-codex spec, the engine is the verification engine,
 *  and the gates count it as configured. No network: nothing streams. */
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, afterEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-study-codex-")));
process.env.LH_DATA_DIR = dir;
const verify = await import("../src/server/codex-verify.ts");
const notebookVerify = await import("../src/agent/subagents/notebook-codex-verify.ts");
const { piEngineForSpec } = await import("../src/agent/models.ts");
const { modelCatalog } = await import("../src/server/model-catalog.ts");
const { cardModelRefusal } = await import("../src/server/card-generation.ts");
const { handleChatInput } = await import("../src/server/chat-handler.ts");
const { chatStore } = await import("../src/store/chats.ts");
const { stores } = await import("../src/server/stores.ts");

const env = process.env as Record<string, string | undefined>;
const saved = { engine: env.LH_NOTEBOOK_ENGINE, auth: env.LH_NOTEBOOK_CODEX_AUTH, node: env.NODE_ENV };
afterEach(() => {
	for (const [key, value] of [["LH_NOTEBOOK_ENGINE", saved.engine], ["LH_NOTEBOOK_CODEX_AUTH", saved.auth], ["NODE_ENV", saved.node]] as const) {
		if (value === undefined) delete env[key]; else env[key] = value;
	}
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const jwt = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.s`;
const authFile = () => {
	const file = path.join(dir, `auth-${crypto.randomUUID()}.json`);
	fs.writeFileSync(file, JSON.stringify({ tokens: { access_token: jwt(Date.now() / 1000 + 3600) } }));
	return file;
};
const CODEX = { provider: "openai-codex", id: notebookVerify.CODEX_VERIFY_MODEL_ID, thinkingLevel: notebookVerify.CODEX_VERIFY_LEVEL };
const other = { model: { provider: "openrouter", id: "some/model" } };

function assertInert() {
	assert.equal(verify.codexVerifySpec(), undefined);
	assert.equal(verify.studyRoleSpec("teacher", null), undefined);
	assert.equal(verify.studyRoleSpec("extractor", null), undefined);
	assert.deepEqual(verify.studyConversationSpec(other, null), { provider: "openrouter", id: "some/model", thinkingLevel: undefined });
	assert.equal(verify.studyConversationSpec(undefined, null), null);
	assert.equal(verify.studySlotsConfigured(undefined), false);
	assert.equal(verify.codexVerifyProblem(), null);
	const catalog = modelCatalog();
	assert.equal(catalog.slots.strong, null);
	assert.equal(catalog.providers.some((p) => p.id === "openai-codex"), false);
	assert.ok(cardModelRefusal());
}

describe("Study under the codex-verify switch", () => {
	it("is inert when unset or set to anything else", () => {
		delete env.LH_NOTEBOOK_ENGINE;
		env.NODE_ENV = "test";
		env.LH_NOTEBOOK_CODEX_AUTH = authFile();
		assertInert();
		env.LH_NOTEBOOK_ENGINE = "codex";
		assertInert();
	});

	it("is inert in production, as Notebook's is", () => {
		env.LH_NOTEBOOK_ENGINE = "codex-verify";
		env.LH_NOTEBOOK_CODEX_AUTH = authFile();
		env.NODE_ENV = "production";
		assertInert();
	});

	it("resolves every Study role and the conversation to the codex spec, and the gates pass", () => {
		env.LH_NOTEBOOK_ENGINE = "codex-verify";
		env.LH_NOTEBOOK_CODEX_AUTH = authFile();
		env.NODE_ENV = "test";
		for (const role of ["prober", "teacher", "extractor", "pdfReader", "researcher", "visualMaker"] as const) {
			assert.deepEqual(verify.studyRoleSpec(role, null), CODEX, role);
		}
		// A chat's own model never wins over the switch.
		assert.deepEqual(verify.studyConversationSpec(other, null), CODEX);
		const engine = piEngineForSpec(verify.studyConversationSpec(undefined, null)!);
		assert.equal(engine.model.provider, "openai-codex");
		assert.equal(engine.model.id, notebookVerify.CODEX_VERIFY_MODEL_ID);
		assert.equal(engine.level, notebookVerify.CODEX_VERIFY_LEVEL);
		assert.equal(verify.studySlotsConfigured(undefined), true);
		const catalog = modelCatalog();
		assert.deepEqual(catalog.slots.strong?.model, { provider: "openai-codex", id: CODEX.id });
		assert.deepEqual(catalog.defaults?.model, { provider: "openai-codex", id: CODEX.id });
		assert.equal(catalog.providers.find((p) => p.id === "openai-codex")?.keyPresent, true);
		assert.ok(catalog.models.some((m) => m.provider === "openai-codex" && m.id === CODEX.id));
		assert.equal(cardModelRefusal(), null);
		// Nothing reached settings.
		assert.equal(stores.settingsStore.readSettings()?.models?.strong, undefined);
	});

	it("the turn gate refuses plainly without a token, and with the switch off asks for models", async () => {
		const chat = chatStore.createChat("gate");
		env.LH_NOTEBOOK_ENGINE = "codex-verify";
		env.NODE_ENV = "test";
		delete env.LH_NOTEBOOK_CODEX_AUTH;
		const refused = await handleChatInput(chat.id, { type: "text", text: "hi" });
		assert.equal(refused.status, 503);
		assert.match(String(((await refused.json()) as { error?: string }).error), /LH_NOTEBOOK_CODEX_AUTH/);
		assert.equal(catalogKey(), false);
		delete env.LH_NOTEBOOK_ENGINE;
		const models = await handleChatInput(chat.id, { type: "text", text: "hi" });
		assert.equal(models.status, 503);
		assert.equal(((await models.json()) as { code?: string }).code, "models_not_configured");
		assert.equal(chatStore.getChat(chat.id)?.messages.length, 0);
	});
});

const catalogKey = () => modelCatalog().providers.find((p) => p.id === "openai-codex")?.keyPresent;
