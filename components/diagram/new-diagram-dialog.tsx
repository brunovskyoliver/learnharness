"use client";

/** New diagram (feature 022): a name and one of three starting forms. */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DIAGRAM_FORM_HINT, DIAGRAM_FORM_LABEL, DIAGRAM_FORMS, type DiagramForm, type LibraryItem } from "@/src/core";

const DEFAULT_NAME: Record<DiagramForm, string> = { diagram: "Untitled diagram", "concept-map": "Untitled concept map", whiteboard: "Untitled whiteboard" };

/** A clash on a name he didn't type steps past it; one he typed asks. */
export async function createDiagram(name: string, form: DiagramForm, folderId: string | null, stepName: boolean): Promise<{ item: LibraryItem } | { error: string; suggestedName?: string }> {
	const send = (value: string) => fetch("/api/library/diagrams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: value, form, ...(folderId ? { folderId } : {}) }) });
	try {
		let response = await send(name);
		if (response.status === 409 && stepName) {
			const body = await response.json() as { suggestedName?: string };
			if (body.suggestedName) response = await send(body.suggestedName);
		}
		const body = await response.json().catch(() => ({})) as { item?: LibraryItem; error?: string; suggestedName?: string };
		if (response.ok && body.item) return { item: body.item };
		return { error: body.error ?? "The diagram could not be created.", ...(body.suggestedName ? { suggestedName: body.suggestedName } : {}) };
	} catch {
		return { error: "The diagram could not be created. Check your connection and try again." };
	}
}

export function NewDiagramDialog({ folderId, onCreated, onClose }: { folderId: string | null; onCreated: (item: LibraryItem) => void; onClose: () => void }) {
	const [form, setForm] = useState<DiagramForm>("diagram");
	const [name, setName] = useState("");
	const [failure, setFailure] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const create = async () => {
		setBusy(true);
		setFailure(null);
		const typed = name.trim();
		const result = await createDiagram(typed || DEFAULT_NAME[form], form, folderId, !typed);
		setBusy(false);
		if ("item" in result) { onCreated(result.item); return; }
		setFailure(result.suggestedName ? `${result.error} ${result.suggestedName} is free.` : result.error);
	};
	return (
		<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="flex flex-col gap-3 rounded-[10px] border-0 bg-popover" data-testid="diagram-new-dialog">
				<DialogTitle className="text-base font-semibold">New diagram</DialogTitle>
				<DialogDescription className="text-sm text-muted-foreground">Choose how it starts. You can use every tool in any of them.</DialogDescription>
				<form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (!busy) void create(); }}>
					<fieldset className="flex flex-col gap-1">
						<legend className="sr-only">Starting form</legend>
						{DIAGRAM_FORMS.map((option) => (
							<label key={option} className={`flex cursor-pointer items-start gap-2 rounded-[6px] p-2 text-sm hover:bg-accent pointer-coarse:min-h-11 ${form === option ? "bg-accent" : ""}`}>
								<input type="radio" name="diagram-form" value={option} checked={form === option} data-testid={`diagram-form-${option}`} className="mt-1 accent-foreground" onChange={() => setForm(option)} />
								<span className="flex flex-col"><span className="text-foreground">{DIAGRAM_FORM_LABEL[option]}</span><span className="text-muted-foreground">{DIAGRAM_FORM_HINT[option]}</span></span>
							</label>
						))}
					</fieldset>
					<label className="flex flex-col gap-1 text-sm text-ink-2">Name
						<input name="diagram-name" value={name} autoComplete="off" placeholder={`${DEFAULT_NAME[form]}…`} data-testid="diagram-new-name" className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm text-foreground pointer-coarse:h-11" onChange={(event) => setName(event.target.value)} />
					</label>
					{failure && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]" data-testid="diagram-new-failure">{failure}</p>}
					<div className="flex justify-end gap-2">
						<button type="button" className="prompt-secondary" onClick={onClose}>Cancel</button>
						<button type="submit" className="prompt-primary" disabled={busy} data-testid="diagram-new-create">{busy ? "Creating…" : "Create"}</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
