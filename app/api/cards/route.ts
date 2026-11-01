/** GET every card (no active card's back); POST writes one by hand (feature 021). */
import { cardCreateResponse, cardsListResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async () => cardsListResponse());
export const POST = withTenant(async (request: Request) => cardCreateResponse(request));
