import assert from "node:assert/strict";
import dns from "node:dns";
import { afterEach, it, mock } from "node:test";
import { fetchPublicPdf, publicLookup } from "../src/agent/papers/public-pdf.ts";
import { mockPdfHttps } from "./helpers/mock-pdf-https.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { mock.restoreAll(); globalThis.fetch = originalFetch; });
function resolveAs(addresses: dns.LookupAddress[]) {
	return mock.method(dns, "lookup", ((_host: string, _options: unknown, callback: (error: null, addresses: dns.LookupAddress[]) => void) => callback(null, addresses)) as typeof dns.lookup);
}
function lookup(all = true) {
	return new Promise<string | dns.LookupAddress[]>((resolve, reject) => publicLookup("publisher.example", { all }, (error, addresses) => error ? reject(error) : resolve(addresses)));
}

it("rejects private/reserved IPv4, IPv6, mapped addresses and mixed DNS answers", async () => {
	for (const address of ["0.0.0.0", "10.0.0.1", "100.100.100.200", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "192.0.2.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::", "::1", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1", "2002:7f00:1::"]) {
		resolveAs([{ address, family: address.includes(":") ? 6 : 4 }]);
		await assert.rejects(lookup(), /private address/, address);
		mock.restoreAll();
	}
	resolveAs([{ address: "93.184.216.34", family: 4 }, { address: "::1", family: 6 }]);
	await assert.rejects(lookup(), /private address/);
});

it("returns the validated DNS result to the socket without another lookup", async () => {
	const addresses = [{ address: "93.184.216.34", family: 4 }, { address: "2001:4860:4860::8888", family: 6 }];
	const resolver = resolveAs(addresses);
	assert.deepEqual(await lookup(), addresses);
	assert.equal(resolver.mock.callCount(), 1);
	assert.equal(await lookup(false), addresses[0]!.address);
});

it("guards each redirect connection and preserves public PDF bodies", async () => {
	mockPdfHttps();
	const fetched: string[] = [];
	globalThis.fetch = async url => { fetched.push(String(url)); return fetched.length === 1 ? new Response(null, { status: 302, headers: { location: "https://second.example/paper.pdf" } }) : new Response("pdf bytes"); };
	assert.equal(await (await fetchPublicPdf("https://first.example/paper.pdf")).text(), "pdf bytes");
	assert.deepEqual(fetched, ["https://first.example/paper.pdf", "https://second.example/paper.pdf"]);
	const resolver = mock.method(dns, "lookup", ((host: string, _options: unknown, callback: (error: null, addresses: dns.LookupAddress[]) => void) => callback(null, [{ address: host === "second.example" ? "127.0.0.1" : "93.184.216.34", family: 4 }])) as typeof dns.lookup);
	fetched.length = 0;
	await assert.rejects(fetchPublicPdf("https://first.example/paper.pdf"), /private address/);
	assert.deepEqual(fetched, ["https://first.example/paper.pdf"]);
	assert.equal(resolver.mock.callCount(), 2);
});

it("fails closed on DNS errors, URL credentials and parent cancellation", async () => {
	mockPdfHttps();
	mock.method(dns, "lookup", ((_host: string, _options: unknown, callback: (error: Error, addresses: []) => void) => callback(new Error("DNS failed"), [])) as typeof dns.lookup);
	await assert.rejects(fetchPublicPdf("https://publisher.example/paper.pdf"), /DNS failed/);
	await assert.rejects(fetchPublicPdf("https://user:password@publisher.example/paper.pdf"), /credentials/);
	const controller = new AbortController(); controller.abort(new Error("cancelled by learner"));
	await assert.rejects(fetchPublicPdf("https://publisher.example/paper.pdf", controller.signal), /cancelled by learner/);
});
