import { tokenize, withTenant } from "@/src/server";
import type { DemoTokenizeRequest } from "@/src/core";

export const runtime = "nodejs";

async function handlePOST(req: Request) {
	const body: unknown = await req.json().catch(() => null);
	if (!body || typeof body !== "object" || !("text" in body) || typeof body.text !== "string" || body.text.length > 2000 || !("encoding" in body) || !["o200k", "cl100k", "gpt2"].includes(body.encoding as string)) {
		return Response.json({ error: "Text must be a string of at most 2,000 characters and encoding must be o200k, cl100k or gpt2." }, { status: 400 });
	}
	try {
		return Response.json({ encoding: body.encoding, tokens: await tokenize(body.text, body.encoding as DemoTokenizeRequest["encoding"]) });
	} catch (error) {
		return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
	}
}

export const POST = withTenant(handlePOST);
