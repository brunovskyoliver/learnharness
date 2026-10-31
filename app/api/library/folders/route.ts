/** POST creates a Library folder (feature 011). */
import { folderCreateResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(async (request: Request) => folderCreateResponse(request));
