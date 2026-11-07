"use client";

/**
 * Export this note (feature 024, US7; ui-contract "Export dialog",
 * visual-reference §20): three format cards (PDF, Word, Markdown), the
 * "Include the notes" switch, Cancel and the solid "Export {format}" pill.
 * The last format and switch are remembered in this browser, as Riddled
 * does. The note is saved first, so the file holds what he sees. A failed
 * export says so in place with the details one click away.
 */
import { Dialog, RadioGroup, Switch } from "radix-ui";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { EXPORT_FORMAT_NAME, EXPORT_FORMATS, type ExportFormat } from "@/src/core";
import { exportNote, readExportChoice, writeExportChoice } from "./nb-actions";
import { isUntitledName, useNotebook } from "./nb-shared";

const DESCRIPTION: Record<ExportFormat, string> = {
	pdf: "To read, print or send.",
	docx: "To keep editing in Word, Pages or Google Docs.",
	md: "Plain text for anywhere.",
};

type Problem = { detail?: string } | null;

export function ExportDialog({ open, onOpenChange, pageId, noteName, beforeExport, returnFocus }: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pageId: string;
	noteName: string;
	/** Hands the note's latest words to the server. */
	beforeExport: () => Promise<void>;
	/** Focus goes here on close when nothing else had it before. */
	returnFocus: RefObject<HTMLElement | null>;
}) {
	const nb = useNotebook();
	const [format, setFormat] = useState<ExportFormat>("pdf");
	const [includeAi, setIncludeAi] = useState(true);
	const [busy, setBusy] = useState(false);
	const [problem, setProblem] = useState<Problem>(null);
	const [detailsShown, setDetailsShown] = useState(false);
	const running = useRef<AbortController | null>(null);
	const before = useRef<Element | null>(null);
	const switchId = useId();
	const hintId = useId();

	// Each opening starts from the last choices made in this browser.
	useEffect(() => {
		if (!open) return;
		const choice = readExportChoice();
		setFormat(choice.format);
		setIncludeAi(choice.includeAi);
		setProblem(null);
		setDetailsShown(false);
	}, [open]);
	// Closing (Cancel, Escape, the backdrop) stops an export still on its way.
	useEffect(() => {
		if (open) return;
		running.current?.abort();
		running.current = null;
		setBusy(false);
	}, [open]);

	const choose = (next: { format?: ExportFormat; includeAi?: boolean }) => {
		const choice = { format: next.format ?? format, includeAi: next.includeAi ?? includeAi };
		setFormat(choice.format);
		setIncludeAi(choice.includeAi);
		writeExportChoice(choice);
	};

	const run = async () => {
		if (busy) return;
		setBusy(true);
		setProblem(null);
		setDetailsShown(false);
		const controller = new AbortController();
		running.current = controller;
		try {
			await beforeExport();
		} catch {
			/* the server's copy is exported; his unsaved words stay in this browser */
		}
		const outcome = await exportNote(pageId, format, includeAi, controller.signal);
		if (running.current !== controller) return;
		running.current = null;
		setBusy(false);
		if ("aborted" in outcome) return;
		if ("error" in outcome) {
			setProblem({ ...(outcome.detail ? { detail: outcome.detail } : {}) });
			return;
		}
		nb.announce(`Exported “${outcome.ok}”.`);
		onOpenChange(false);
	};

	const shownName = isUntitledName(noteName) ? "Untitled" : noteName;
	const formatName = EXPORT_FORMAT_NAME[format];

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal container={nb.root ?? undefined}>
				<Dialog.Overlay className="nb-dialog-backdrop" data-testid="nb-export-backdrop">
					<Dialog.Content
						className="nb-export"
						data-testid="nb-export-dialog"
						aria-describedby={undefined}
						onOpenAutoFocus={() => { before.current = document.activeElement; }}
						onCloseAutoFocus={(event) => {
							event.preventDefault();
							const back = before.current;
							if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus();
							else returnFocus.current?.focus();
						}}
					>
						<Dialog.Title className="nb-export-title">{`Export “${shownName}”`}</Dialog.Title>
						<RadioGroup.Root
							className="nb-export-formats"
							aria-label="Format"
							orientation="horizontal"
							value={format}
							onValueChange={(value) => choose({ format: value as ExportFormat })}
						>
							{EXPORT_FORMATS.map((f) => (
								<RadioGroup.Item key={f} value={f} className="nb-option-card" data-testid={`nb-export-format-${f}`}>
									<span className="nb-option-title">{EXPORT_FORMAT_NAME[f]}</span>
									<span className="nb-option-description">{DESCRIPTION[f]}</span>
								</RadioGroup.Item>
							))}
						</RadioGroup.Root>
						<div className="nb-option-card nb-export-toggle">
							<label htmlFor={switchId} className="nb-export-toggle-text">
								<span className="nb-option-title">Include the notes</span>
								<span id={hintId} className="nb-option-description">Each one sits under the paragraph it&apos;s about, drawings too.</span>
							</label>
							<Switch.Root
								id={switchId}
								className="nb-switch"
								checked={includeAi}
								onCheckedChange={(checked) => choose({ includeAi: checked })}
								aria-describedby={hintId}
								data-testid="nb-export-include"
							>
								<Switch.Thumb className="nb-switch-thumb" />
							</Switch.Root>
						</div>
						{problem && (
							<div className="nb-export-problem" role="alert" data-testid="nb-export-problem">
								<p>
									The export didn&apos;t work.{" "}
									{problem.detail && (
										<button type="button" className="nb-text-button" aria-expanded={detailsShown} onClick={() => setDetailsShown((s) => !s)}>
											{detailsShown ? "Hide details" : "Show details"}
										</button>
									)}
								</p>
								{detailsShown && problem.detail && <p className="nb-export-detail" data-testid="nb-export-detail">{problem.detail}</p>}
							</div>
						)}
						<div className="nb-export-actions">
							<Dialog.Close className="nb-export-cancel" data-testid="nb-export-cancel">Cancel</Dialog.Close>
							<button type="button" className="nb-pill" data-testid="nb-export-run" aria-disabled={busy || undefined} onClick={() => void run()}>
								{busy ? "Exporting…" : `Export ${formatName}`}
							</button>
						</div>
					</Dialog.Content>
				</Dialog.Overlay>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
