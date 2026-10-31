/** Browser checks only: a tutor revision through the real store, from outside
 *  the server, while the page is closed. Args: data dir, page id, base version,
 *  then the new text as JSON. Prints the outcome. */
const [dataDir, id, base, json] = process.argv.slice(2);
process.env.LH_DATA_DIR = dataDir;
const { libraryStore } = await import("../../src/store/library.ts");
const text = JSON.parse(json!) as string;
const result = await libraryStore.revisePageAsAgent(id!, { baseVersion: Number(base), chatId: "browser-check", toolCallId: `browser-${Date.now()}`, apply: () => text });
console.log(JSON.stringify({ outcome: result.outcome, version: result.outcome === "revised" ? result.version.n : null }));
export {};
