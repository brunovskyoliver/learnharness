/** POST /api/library/upload?name=: one file per request, raw body. */
import { libraryUploadResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(libraryUploadResponse);
