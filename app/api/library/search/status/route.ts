/** GET every item's index state (feature 019). */
import { documentStatusResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(() => documentStatusResponse());
