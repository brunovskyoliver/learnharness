/** POST creates a page (feature 009, contracts/library-api.md). */
import { pageCreateResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(async (request: Request) => pageCreateResponse(request));
