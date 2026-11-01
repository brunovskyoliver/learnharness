/** Browser checks only: a held edit through the real store, from outside the server,
 *  as page_revise stores one in a selection's turn. Args: data dir, page id, base
 *  version, then the new text as JSON. Prints the proposal's id. */
const [dataDir, id, base, json] = process.argv.slice(2);
process.env.LH_DATA_DIR = dataDir;
const { pageProposalStore } = await import("../../src/store/page-proposals.ts");
const text = JSON.parse(json!) as string;
const result = await pageProposalStore.propose({ pageId: id!, baseVersion: Number(base), chatId: "browser-check", toolCallId: `browser-${Date.now()}-${Math.random()}`, apply: () => text });
console.log(JSON.stringify({ outcome: result.outcome, id: result.outcome === "proposed" ? result.proposal.id : null }));
export {};
