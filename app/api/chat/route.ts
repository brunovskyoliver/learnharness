import { handleChatRequest, withTenant } from "@/src/server";

async function handlePOST(req: Request) {
	return handleChatRequest(req);
}

export const POST = withTenant(handlePOST);
