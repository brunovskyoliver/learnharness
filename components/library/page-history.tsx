"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PageVersion } from "@/src/core";

const PagePreview = dynamic(() => import("./page-preview.tsx").then((m) => m.PagePreview), { ssr: false });

/** `Version {n} · {You | Agent} · {time}`. */
export function versionLabel(version: Pick<PageVersion, "n" | "author" | "at">): string {
	const time = new Date(version.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
	return `Version ${version.n} · ${version.author === "agent" ? "Agent" : "You"} · ${time}`;
}

/** The version list and a read-only preview. Restoring adds a version. */
export function PageHistory({ id, onRestore, canRestore }: { id: string; onRestore: (n: number) => Promise<void>; canRestore: boolean }) {
	const [versions, setVersions] = useState<PageVersion[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [selected, setSelected] = useState<number | null>(null);
	const [content, setContent] = useState<string | null>(null);
	const [restoring, setRestoring] = useState(false);
	const load = useCallback(async () => {
		setFailed(false);
		try {
			const response = await fetch(`/api/library/pages/${encodeURIComponent(id)}/versions`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as { versions: PageVersion[] };
			setVersions(body.versions);
			setSelected((current) => current ?? body.versions[0]?.n ?? null);
		} catch {
			setFailed(true);
		}
	}, [id]);
	useEffect(() => { void load(); }, [load]);
	useEffect(() => {
		if (selected === null) return;
		let live = true;
		setContent(null);
		void fetch(`/api/library/pages/${encodeURIComponent(id)}/versions/${selected}`, { cache: "no-store" })
			.then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
			.then((body: { content: string }) => { if (live) setContent(body.content); })
			.catch(() => { if (live) setFailed(true); });
		return () => { live = false; };
	}, [id, selected]);

	if (failed) {
		return (
			<div role="status" className="flex flex-wrap items-center gap-2 px-3 text-sm text-ink-2">
				<p>The history could not be loaded.</p>
				<button type="button" className="prompt-secondary" onClick={() => void load()}>Try again</button>
			</div>
		);
	}
	if (!versions) {
		return (
			<div role="status" aria-label="Loading history" className="flex flex-col gap-1 px-3">
				<Skeleton className="h-9 w-full rounded-md" />
				<Skeleton className="h-9 w-full rounded-md" />
			</div>
		);
	}
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3" data-testid="page-history">
			<ul className="flex shrink-0 flex-col gap-0.5">
				{versions.map((version) => (
					<li key={version.n}>
						<button
							type="button"
							aria-current={selected === version.n ? "true" : undefined}
							onClick={() => setSelected(version.n)}
							suppressHydrationWarning
							className={cn("w-full rounded-md px-2 py-1.5 text-left text-sm text-ink-2 transition-colors hover:bg-accent pointer-coarse:min-h-11", selected === version.n && "bg-accent text-foreground")}
						>{versionLabel(version)}</button>
					</li>
				))}
			</ul>
			{selected !== null && (
				<>
					<Button
						type="button"
						disabled={!canRestore || restoring || content === null}
						className="w-fit bg-accent text-foreground hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:h-11"
						data-testid="page-restore"
						onClick={() => {
							setRestoring(true);
							void onRestore(selected).finally(() => setRestoring(false));
						}}
					>Restore this version</Button>
					{content === null ? <Skeleton className="h-24 w-full rounded-[10px]" /> : <PagePreview content={content} />}
				</>
			)}
		</div>
	);
}
