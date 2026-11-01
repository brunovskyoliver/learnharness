/** GET the daily queue: the next front and counts, never a back (feature 021). */
import { cardQueueResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: Request) => cardQueueResponse(request));
