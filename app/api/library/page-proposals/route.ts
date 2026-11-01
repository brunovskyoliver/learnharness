/** GET lists the page edits waiting for the learner (feature 023). */
import { pageProposalsResponse, withTenant } from "@/src/server";

export const dynamic = "force-dynamic";

export const GET = withTenant(async (request: Request) => pageProposalsResponse(request));
