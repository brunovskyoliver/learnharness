/** Hosted mode refuses to run without Clerk keys rather than letting Clerk invent a
 * keyless development instance. A file of its own because proxy.ts needs it: importing
 * config.ts from the proxy makes the tracer treat its data path as a reason to sweep
 * the whole repo, the real data/ included, into the standalone (feature 023). */
export function clerkConfigured(env: Record<string, string | undefined> = process.env): boolean {
	return Boolean(env.CLERK_SECRET_KEY && (env.CLERK_PUBLISHABLE_KEY || env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
}

/** Clerk's middleware passes a request on as a rewrite to the request's URL. Next renames a
 * loopback host in that URL to `localhost`, so on a server bound to 127.x or ::1 the rewrite
 * looks external, and Next proxies it to itself until the request dies. The Host header plays
 * no part. `localhost`, `0.0.0.0` (the image) and a real address are all fine. */
export function loopbackLiteralHostname(env: Record<string, string | undefined> = process.env): boolean {
	return /^(127\.\d+\.\d+\.\d+|::1|\[::1\])$/.test(env.HOSTNAME ?? "");
}
