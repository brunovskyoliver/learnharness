import { subscriptionControlsResponse, withTenant } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withTenant(subscriptionControlsResponse);
export const POST = withTenant(subscriptionControlsResponse);
