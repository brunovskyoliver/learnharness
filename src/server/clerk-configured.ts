/** Hosted mode refuses to run without Clerk keys rather than letting Clerk invent a
 * keyless development instance. A file of its own because proxy.ts needs it: importing
 * config.ts from the proxy makes the tracer treat its data path as a reason to sweep
 * the whole repo, the real data/ included, into the standalone (feature 023). */
export function clerkConfigured(env: Record<string, string | undefined> = process.env): boolean {
	return Boolean(env.CLERK_SECRET_KEY && (env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
}
