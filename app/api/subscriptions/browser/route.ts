import { subscriptionBrowserResponse, withTenant } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = withTenant(subscriptionBrowserResponse);
export const POST = withTenant(subscriptionBrowserResponse);
