import dns from "node:dns";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";
import { mock } from "node:test";

/** Offline socket fixture: exercise the real lookup and bridge to fetch stubs. */
export function mockPdfHttps() {
	mock.method(dns, "lookup", ((_host: string, _options: unknown, callback: (error: Error | null, addresses: dns.LookupAddress[]) => void) => {
		callback(null, [{ address: "93.184.216.34", family: 4 }]);
	}) as typeof dns.lookup);
	mock.method(https, "get", ((url: string, options: https.RequestOptions, callback: (incoming: IncomingMessage) => void) => {
		const request = new EventEmitter();
		let incoming: Readable | undefined;
		const abort = () => { const reason = options.signal?.reason ?? new Error("Aborted"); incoming?.destroy(reason); request.emit("error", reason); };
		options.signal?.addEventListener("abort", abort, { once: true });
		queueMicrotask(() => {
			if (options.signal?.aborted) { abort(); return; }
			(options.lookup as LookupFunction)(new URL(url).hostname, { all: true }, error => {
				if (error) { request.emit("error", error); return; }
				void fetch(url, { signal: options.signal, redirect: "manual" }).then(response => {
					incoming = response.body ? Readable.fromWeb(response.body as ReadableStream) : Readable.from([]);
					incoming.once("close", () => options.signal?.removeEventListener("abort", abort));
					Object.assign(incoming, { headers: Object.fromEntries(response.headers), statusCode: response.status });
					callback(incoming as IncomingMessage);
				}, error => { options.signal?.removeEventListener("abort", abort); request.emit("error", error); });
			});
		});
		return request;
	}) as typeof https.get);
}
