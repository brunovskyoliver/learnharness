/** POST creates a diagram (feature 022). */
import { diagramCreateResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const POST = withTenant(async (request: Request) => diagramCreateResponse(request));
