/** GET /api/library: live items and limits (contracts/library-api.md). */
import { libraryListResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(() => libraryListResponse());
