import { claudeCodeAuthResponse, withTenant } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hosted only: the current user's Claude Code sign-in status (GET) and
 * start / code / cancel / sign-out (POST). 404 outside hosted mode. */
export const GET = withTenant(claudeCodeAuthResponse);
export const POST = withTenant(claudeCodeAuthResponse);
