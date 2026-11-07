"use client";

/** A diagram's History (feature 022): the versions, each with its picture, its outline
 *  and what changed from the one before, then Restore. Restoring adds a version. */
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { diagramOutline, diagramToSvg, diffDiagrams, parseDiagram, type DiagramDoc, type PageVersion } from "@/src/core";
import { diagramUrl } from "./diagram-api.ts";
import { DiagramDiffView } from "./diagram-diff.tsx";
import { svgDataUrl } from "./diagram-export.ts";

const CAUSE: Partial<Record<PageVersion["cause"], string>> = { "proposal-approved": "Approved proposal", restore: "Restored", "before-agent": "Saved before a proposal", "autosave-close": "Saved on closing", conflict: "Kept in a conflict" };

const when = (at: string) => new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function versionLine(version: PageVersion): string {
	const who = version.author === "agent" ? (version.editedByLearner ? "Tutor, edited by you" : "Tutor") : "You";
	return `Version ${version.n} · ${who} · ${when(version.at)}${CAUSE[version.cause] ? ` · ${CAUSE[version.cause]}` : ""}`;
}

async function readDoc(id: string, n: number): Promise<DiagramDoc | string> {
	const response = await fetch(`${diagramUrl(id)}/versions/${n}`, { cache: "no-store" });
	const body = await response.json() as { content?: string; error?: string };
	if (!response.ok || body.content === undefined) return body.error ?? "This version could not be loaded.";
	const parsed = parseDiagram(body.content);
	return parsed.ok ? parsed.doc : parsed.message;
}

export function DiagramVersions({ id, name, onRestore, canRestore }: { id: string; name: string; onRestore: (n: number) => Promise<string | null>; canRestore: boolean }) {
	const [versions, setVersions] = useState<PageVersion[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [picked, setPicked] = useState<PageVersion | null>(null);
	const [shown, setShown] = useState<{ doc: DiagramDoc; before: DiagramDoc | null } | string | null>(null);
	const [refusal, setRefusal] = useState<string | null>(null);
	const load = useCallback(async () => {
		setFailed(false);
		try {
			const response = await fetch(`${diagramUrl(id)}/versions`, { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			setVersions((await response.json() as { versions: PageVersion[] }).versions);
		} catch {
			setFailed(true);
		}
	}, [id]);
	useEffect(() => { void load(); }, [load]);
	const pick = async (version: PageVersion) => {
		setPicked(version);
		setShown(null);
		setRefusal(null);
		const doc = await readDoc(id, version.n);
		if (typeof doc === "string") return setShown(doc);
		const older = versions?.find((other) => other.n < version.n);
		const before = older ? await readDoc(id, older.n) : null;
		setShown({ doc, before: typeof before === "string" ? null : before });
	};
	if (failed) return <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 text-sm text-ink"><p>The history could not be loaded.</p><button type="button" className="lh-text-action" onClick={() => void load()}>Try again</button></div>;
	if (!versions) return <div role="status" aria-label="Loading the history" className="flex flex-col gap-2 px-4"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6" data-testid="diagram-history">
			<ul className="flex flex-col gap-0.5">
				{versions.map((version) => (
					<li key={version.n}>
						<button type="button" aria-pressed={picked?.n === version.n} data-testid="diagram-version" className="lh-outline-row w-full aria-pressed:bg-shelf aria-pressed:text-ink" onClick={() => void pick(version)}>{versionLine(version)}</button>
					</li>
				))}
			</ul>
			{picked && shown === null && <div role="status" aria-label="Loading this version"><Skeleton className="h-32 w-full rounded-lg" /></div>}
			{picked && typeof shown === "string" && <p role="status" className="text-sm text-graphite">{shown}</p>}
			{picked && shown && typeof shown !== "string" && (
				<section aria-label={`Version ${picked.n}`} className="flex flex-col gap-3 rounded-lg border border-rule p-3" data-testid="diagram-version-preview">
					{/* An image can't run anything, and the SVG's text is escaped. */}
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img src={svgDataUrl(diagramToSvg(shown.doc, name))} alt={`Version ${picked.n} of ${name}`} className="max-h-72 w-full rounded-md object-contain" />
					<DiagramDiffView diff={diffDiagrams(shown.before, shown.doc)} />
					<details className="text-sm text-graphite">
						<summary className="cursor-pointer select-none text-ink pointer-coarse:min-h-11">Read as text</summary>
						<p className="mt-2 whitespace-pre-wrap [overflow-wrap:anywhere]">{diagramOutline(shown.doc)}</p>
					</details>
					{refusal && <p role="alert" className="text-sm text-red">{refusal}</p>}
					<div><button type="button" className="nb-pill" disabled={!canRestore} data-testid="diagram-restore" onClick={() => void onRestore(picked.n).then(setRefusal)}>Restore this version</button></div>
				</section>
			)}
		</div>
	);
}
