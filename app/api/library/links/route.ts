/** GET lists repo links and pending first links; POST links a repo (feature 026, contracts/api.md). */
import { repoLinkCreateResponse, repoLinksListResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(() => repoLinksListResponse());
export const POST = withTenant(async (request: Request) => repoLinkCreateResponse(request));
