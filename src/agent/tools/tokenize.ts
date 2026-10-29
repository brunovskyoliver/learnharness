import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Literal, Object as ObjectType, String as StringType, Union } from "typebox";
import { Check, Errors } from "typebox/value";
import { tokenize } from "../tokenizer.ts";
import { invalidInputResult, serverExecute } from "../tool-execute.ts";

const TokenizeInputSchema = ObjectType({ text: StringType({ minLength: 1, maxLength: 2000 }), encoding: Union([Literal("o200k"), Literal("cl100k"), Literal("gpt2")]) });
/** Owner-approved wording, contracts/ml-visual-tool.md. */
const DESCRIPTION = "Tokenize text exactly as a model sees it, with o200k (GPT-4o and later), cl100k (GPT-4, GPT-3.5) or gpt2. Returns the token ids and pieces. Use it whenever you state a token count or a split; never guess one. To show the split to the learner, use `ml_visual` with kind `tokens`.";
export function tokenizeTool(): AgentTool<typeof TokenizeInputSchema> {
	const run = serverExecute("tokenize", TokenizeInputSchema, async ({ text, encoding }) => {
		const tokens = await tokenize(text, encoding);
		const pieces = tokens.map(token => ({ id: token.id, text: token.text ?? token.bytes!.map(byte => `<0x${byte.toString(16).toUpperCase().padStart(2, "0")}>`).join("") }));
		return { text: `${tokens.length} tokens with ${encoding}: ${JSON.stringify(pieces)}`, details: { encoding, count: tokens.length, tokens } };
	});
	return { name: "tokenize", label: "tokenize", description: DESCRIPTION, parameters: TokenizeInputSchema,
		execute: (id, input, signal) => {
			if (!Check(TokenizeInputSchema, input)) return Promise.resolve(invalidInputResult("tokenize", [...Errors(TokenizeInputSchema, input)].map(error => `${error.instancePath || "/"}: ${error.message}`)));
			return run(id, input, signal);
		},
	};
}
