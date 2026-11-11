import { claudeCodeInstallationResponse, withTenant } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Installation/version only; never reads auth status or makes a model request.
 * Only the Request is forwarded: Next's second handler argument (the route
 * context) must not land in the handler's test seams. */
export const GET = withTenant((request: Request) => claudeCodeInstallationResponse(request));
