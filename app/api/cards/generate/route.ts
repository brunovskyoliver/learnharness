/** POST previews a source or starts drafts, on an explicit click (feature 021). */
import { cardGenerateResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(async (request: Request) => cardGenerateResponse(request));
