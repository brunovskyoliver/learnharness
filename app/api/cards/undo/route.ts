/** POST takes back a card's last rating (feature 021). */
import { cardUndoResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(async (request: Request) => cardUndoResponse(request));
