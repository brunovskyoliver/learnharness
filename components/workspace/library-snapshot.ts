"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useServerEvent, useServerResync } from "@/components/server-events";
import type { LibraryFolder, LibraryItem } from "@/src/core";

export interface LibrarySnapshot {
	/** null until the first successful load. */
	items: LibraryItem[] | null;
	folders: LibraryFolder[];
	/** No list yet and the load failed. A failed refresh keeps the last good list. */
	failed: boolean;
	retry: () => void;
}

/** The catalog for a surface that isn't the Library: fetched only while `active`,
 *  so a closed folder tree or palette costs no request. */
export function useLibrarySnapshot(active: boolean): LibrarySnapshot {
	const [items, setItems] = useState<LibraryItem[] | null>(null);
	const [folders, setFolders] = useState<LibraryFolder[]>([]);
	const [failed, setFailed] = useState(false);
	const request = useRef(0);
	const activeRef = useRef(active);
	activeRef.current = active;
	const refresh = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as { items: LibraryItem[]; folders: LibraryFolder[] };
			if (id !== request.current) return;
			setItems(body.items);
			setFolders(body.folders);
			setFailed(false);
		} catch {
			if (id === request.current) setFailed(true);
		}
	}, []);
	useEffect(() => { if (active) void refresh(); }, [active, refresh]);
	const onChange = useCallback(() => { if (activeRef.current) void refresh(); }, [refresh]);
	useServerEvent("library-changed", onChange);
	useServerResync(onChange);
	const retry = useCallback(() => { setFailed(false); void refresh(); }, [refresh]);
	return { items, folders, failed: failed && items === null, retry };
}
