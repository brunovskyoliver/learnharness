/** GET graph ideas to link to a card, read only (feature 021). */
import { cardConceptsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: Request) => cardConceptsResponse(request));
