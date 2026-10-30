/**
 * What the agent's Library tools need from the server (feature 009). The agent
 * layer can't import the store or this layer, so the turn's composition root
 * hands it this.
 */
import type { LibraryToolContext } from "../agent/tools/library.ts";
import { visionAvailable } from "./library-references.ts";
import { libraryPdfOverview } from "./library-text.ts";
import { stores } from "./stores.ts";

export const libraryContext: LibraryToolContext = {
	store: stores.libraryStore,
	pdfOverview: libraryPdfOverview,
	visionAvailable,
};
