/** Hosted-mode entry gate (2026-10-26): every API route handler and every
 * store-reading page runs inside the signed-in Clerk user's tenant
 * (config.ts runAsTenant). Outside hosted mode the wrappers are a
 * pass-through and Clerk is never called, so desktop and plain dev never
 * reach Clerk's keyless mode. tests/tenant-routes.test.ts fails when a
 * route export skips withTenant. */
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { hostedMode, runAsTenant } from "../../config.ts";

export { hostedMode };

/** Hosted mode refuses to run without Clerk keys rather than letting
 * Clerk invent a keyless development instance. */
export function clerkConfigured(env: Record<string, string | undefined> = process.env): boolean {
	return Boolean(env.CLERK_SECRET_KEY && (env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
}

export async function signedInUserId(): Promise<string | null> {
	if (!clerkConfigured()) return null;
	const { userId } = await auth();
	return userId ?? null;
}

export function withTenant<A extends unknown[]>(handler: (...args: A) => Response | Promise<Response>) {
	return async (...args: A): Promise<Response> => {
		if (!hostedMode()) return handler(...args);
		const userId = await signedInUserId();
		if (!userId) return Response.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
		return runAsTenant(userId, () => handler(...args));
	};
}

/** Pages read stores in their own body only (data goes to client
 * components as props), so the tenant scope covers every read. */
export function withTenantPage<P, R>(page: (props: P) => R | Promise<R>) {
	return async (props: P): Promise<R> => {
		if (!hostedMode()) return page(props);
		const userId = await signedInUserId();
		if (!userId) redirect("/sign-in");
		return runAsTenant(userId, () => page(props));
	};
}
