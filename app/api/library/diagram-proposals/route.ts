/** GET the proposals waiting for a decision, optionally for one diagram. */
import { diagramProposalsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: Request) => diagramProposalsResponse(request));
