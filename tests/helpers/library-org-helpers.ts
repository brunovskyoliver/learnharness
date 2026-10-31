import type { LibraryItem, LibraryTombstone } from "../../src/core/library.ts";

export const resolveCatalogEntries = (catalog: readonly (LibraryItem | LibraryTombstone)[], id: string) => catalog.find((entry) => entry.id === id) ?? null;
