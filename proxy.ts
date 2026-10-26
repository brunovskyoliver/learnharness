import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { desktopAPIAuthorized } from "./src/server/desktop-access.ts";
import { clerkConfigured } from "./src/server/tenant-access.ts";

const NO_STORE = { "Cache-Control": "no-store" };
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/** Hosted mode (LH_HOSTED=1): every page needs a Clerk session (redirect to
 * sign-in), every API call gets a 401 without one. Route handlers still
 * resolve the user themselves (withTenant); this is the outer wall. */
const hosted = clerkMiddleware(async (auth, request) => {
	if (isPublic(request)) return;
	const { userId, redirectToSignIn } = await auth();
	if (userId) return;
	if (request.nextUrl.pathname.startsWith("/api/")) {
		return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: NO_STORE });
	}
	return redirectToSignIn();
});

/** Outside hosted mode: applies to every API method, including SSE and
 * spending/settings routes. No public callback or worker bypass: internal
 * jobs call server functions, and any legitimate self-HTTP request must
 * carry the private capability. */
export function proxy(request: NextRequest, event?: NextFetchEvent) {
	if (process.env.LH_HOSTED === "1") {
		if (!clerkConfigured()) {
			return NextResponse.json({ error: "Hosted mode needs CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY." }, { status: 503, headers: NO_STORE });
		}
		return hosted(request, event as NextFetchEvent);
	}
	if (request.nextUrl.pathname.startsWith("/api/") && !desktopAPIAuthorized(request.headers)) {
		return NextResponse.json(
			{ error: "Desktop API access requires the trusted LearnHarness window." },
			{ status: 403, headers: NO_STORE },
		);
	}
	return NextResponse.next();
}

export const config = {
	matcher: [
		// Pages (skip Next internals and static files) and every API route.
		"/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api)(.*)",
	],
};
