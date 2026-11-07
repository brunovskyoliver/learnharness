/**
 * VERIFICATION ONLY (feature 024, T047, research R13): a notebook engine on
 * pi-ai's own `openai-codex` provider, so the real-model pass can run the
 * whole Notebook code path (prompts, runSubmitAgent schemas, run registry,
 * SSE, companion store, UI) against a real model with an existing Codex CLI
 * login. It is not a product provider: no setting reaches it, and it is
 * inert in production and whenever LH_NOTEBOOK_ENGINE is not "codex-verify".
 *
 * The ChatGPT access token is read in memory, read-only, from the file named
 * by LH_NOTEBOOK_CODEX_AUTH (a Codex CLI auth.json) on every request. This
 * module never writes that file, never refreshes or signs in, and never logs
 * the token; an expired or missing token is a plain error.
 */
import fs from "node:fs";
import type { Api, Model, StreamFunction } from "@earendil-works/pi-ai";
import { streamSimple as codexStreamSimple } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";
import type { PiEngine } from "../models.ts";

/** The strongest gpt-5.x model in pi-ai's openai-codex catalog (2026-11-07). */
export const CODEX_VERIFY_MODEL_ID = "gpt-5.6-sol";
/** The thinking level the strong slot's default order lands on for it. */
export const CODEX_VERIFY_LEVEL = "medium";

/** On only outside production and only with LH_NOTEBOOK_ENGINE=codex-verify. */
export const notebookCodexVerifyEnabled = (): boolean =>
	process.env.LH_NOTEBOOK_ENGINE === "codex-verify" && process.env.NODE_ENV !== "production";

const decodeExp = (token: string): number | undefined => {
	try {
		const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { exp?: unknown };
		return typeof payload.exp === "number" ? payload.exp : undefined;
	} catch {
		return undefined;
	}
};

/** The access token from the auth file, or the plain reason it can't be used.
 *  Read-only: opens the file for reading and keeps nothing but the string. */
export function readCodexVerifyToken(now = Date.now()): { token: string } | { problem: string } {
	const file = process.env.LH_NOTEBOOK_CODEX_AUTH;
	if (!file) return { problem: "LH_NOTEBOOK_ENGINE=codex-verify needs LH_NOTEBOOK_CODEX_AUTH set to a Codex CLI auth.json." };
	let raw: string;
	try {
		raw = fs.readFileSync(file, { encoding: "utf8", flag: "r" });
	} catch {
		return { problem: "The file named by LH_NOTEBOOK_CODEX_AUTH can't be read." };
	}
	let token: unknown;
	try {
		token = (JSON.parse(raw) as { tokens?: { access_token?: unknown } }).tokens?.access_token;
	} catch {
		return { problem: "The file named by LH_NOTEBOOK_CODEX_AUTH is not JSON." };
	}
	if (typeof token !== "string" || !token) return { problem: "The file named by LH_NOTEBOOK_CODEX_AUTH has no ChatGPT access token." };
	const exp = decodeExp(token);
	if (exp !== undefined && exp * 1000 <= now) return { problem: "The ChatGPT access token in LH_NOTEBOOK_CODEX_AUTH has expired; it is never refreshed here." };
	return { token };
}

/** The verification engine. Every request re-reads the token. */
export function codexVerifyEngine(stream: StreamFunction = codexStreamSimple as StreamFunction): PiEngine {
	const model = OPENAI_CODEX_MODELS[CODEX_VERIFY_MODEL_ID as keyof typeof OPENAI_CODEX_MODELS] as Model<Api> | undefined;
	if (!model) throw new Error(`pi-ai's openai-codex catalog has no model ${CODEX_VERIFY_MODEL_ID}`);
	return {
		model,
		level: CODEX_VERIFY_LEVEL,
		streamFn: (requestModel, context, options) => {
			const read = readCodexVerifyToken();
			if ("problem" in read) throw new Error(read.problem);
			return stream(requestModel, context, { ...options, apiKey: read.token, reasoning: CODEX_VERIFY_LEVEL } as Parameters<StreamFunction>[2]);
		},
	};
}
