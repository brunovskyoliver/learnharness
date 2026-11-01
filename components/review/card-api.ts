import type { CardFocus } from "@/src/core";

/** The learner's zone, so the server can tell where their day ends. */
export const timeZone = (): string => {
	try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

export const queueQuery = (focus: CardFocus) => `tz=${encodeURIComponent(timeZone())}&focus=${focus}`;

export interface ApiFailure { failure: string; status: number; code?: string; body: Record<string, unknown> }

/** Every call reads the same way: the JSON, or a sentence saying what went wrong. */
export async function cardFetch<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T | ApiFailure> {
	try {
		const response = await fetch(url, {
			method: init?.method ?? "GET",
			cache: "no-store",
			...(init?.body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) } : {}),
		});
		const body = await response.json().catch(() => ({})) as Record<string, unknown>;
		if (response.ok) return body as T;
		return { failure: typeof body.error === "string" ? body.error : "That didn't work.", status: response.status, code: typeof body.code === "string" ? body.code : undefined, body };
	} catch {
		return { failure: "That didn't work. Check your connection and try again.", status: 0, body: {} };
	}
}

export const failed = (value: unknown): value is ApiFailure => typeof value === "object" && value !== null && "failure" in value;
