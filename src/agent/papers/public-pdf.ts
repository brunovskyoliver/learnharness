import dns from "node:dns";
import https from "node:https";
import { BlockList, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { arxivFetch } from "./arxiv.ts";

const blocked = new BlockList();
for (const [address, prefix] of [
	["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
	["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
	["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
	["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");
// IPv6 must be global unicast; exclude documentation and transition ranges
// that can encode an otherwise forbidden IPv4 destination.
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) blocked.addSubnet(address, prefix, "ipv6");

/** This is the socket's lookup, not a preflight followed by another DNS query. */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
	dns.lookup(hostname, { all: true, family: options.family, hints: options.hints }, (error, addresses) => {
		if (error) { callback(error, []); return; }
		if (!addresses.length || addresses.some(({ address, family }) => family === 4
			? blocked.check(address, "ipv4")
			: family !== 6 || !globalV6.check(address, "ipv6") || blocked.check(address, "ipv6"))) {
			callback(new Error("The PDF link points to a private address."), []); return;
		}
		if (options.all) callback(null, addresses);
		else callback(null, addresses[0]!.address, addresses[0]!.family);
	});
};

function publicHttpsUrl(raw: string): URL {
	const url = new URL(raw);
	const host = url.hostname.replace(/^\[|\]$/g, "");
	if (url.protocol !== "https:") throw new Error("The PDF link is not https.");
	if (url.username || url.password) throw new Error("The PDF link contains credentials.");
	if (/^[\d.]+$/.test(host) || host.includes(":") || host === "localhost" || /\.(local|internal|localhost)$/.test(host)) throw new Error("The PDF link points to a private address.");
	return url;
}

/** Keep hostname/SNI and certificate validation; pin DNS at connection time. */
function requestPdf(url: string, signal?: AbortSignal): Promise<Response> {
	return new Promise((resolve, reject) => {
		const request = https.get(url, { lookup: publicLookup, agent: false, signal, headers: { "Accept-Encoding": "identity" } }, incoming => {
			const headers = new Headers();
			for (const [name, value] of Object.entries(incoming.headers)) {
				if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
			}
			const status = incoming.statusCode ?? 502;
			const noBody = [204, 205, 304].includes(status);
			if (noBody) incoming.resume();
			resolve(new Response(noBody ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>, { status, headers }));
		});
		request.on("error", error => reject(signal?.aborted ? signal.reason : error));
	});
}

/** Every PDF hop uses the guarded connection, including arXiv redirects. */
export async function fetchPublicPdf(raw: string, signal?: AbortSignal): Promise<Response> {
	let url = publicHttpsUrl(raw);
	for (let hop = 0; hop <= 3; hop++) {
		const response = url.hostname === "arxiv.org"
			? await arxivFetch(url.href, signal, (target, options) => requestPdf(String(target), options?.signal ?? undefined))
			: await requestPdf(url.href, AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]));
		const location = response.headers.get("location");
		if (response.status < 300 || response.status >= 400 || !location) return response;
		await response.body?.cancel();
		url = publicHttpsUrl(new URL(location, url).href);
	}
	throw new Error("The PDF link redirected too many times.");
}
