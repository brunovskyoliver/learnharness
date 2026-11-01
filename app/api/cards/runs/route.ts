/** GET recent flashcard generations (feature 021). */
import { cardRunsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async () => cardRunsResponse());
