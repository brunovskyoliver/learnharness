/** POST starts a full, safe rebuild of the search index (feature 019). */
import { documentReindexResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(() => documentReindexResponse());
