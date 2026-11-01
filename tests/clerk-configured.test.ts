import assert from "node:assert/strict";
import { test } from "node:test";
import { loopbackLiteralHostname } from "../src/server/clerk-configured.ts";

test("only a loopback literal is refused as the hosted server's name", () => {
	for (const HOSTNAME of ["127.0.0.1", "127.0.0.2", "::1", "[::1]"]) assert.equal(loopbackLiteralHostname({ HOSTNAME }), true, HOSTNAME);
	for (const HOSTNAME of ["localhost", "0.0.0.0", "::", "172.29.5.181", "app", "abc123def456", undefined]) assert.equal(loopbackLiteralHostname({ HOSTNAME }), false, String(HOSTNAME));
});
