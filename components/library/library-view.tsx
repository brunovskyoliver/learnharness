"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { SearchIcon, UploadIcon, XIcon } from "lucide-react";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerEvent, useServerResync } from "@/components/server-events";
import { MAX_FILE_BYTES, nameKey, type LibraryItem } from "@/src/core";
import { DeleteItemDialog } from "./delete-item-dialog.tsx";
import { LibraryRow } from "./library-row.tsx";
import { runUploadQueue, sendFile } from "./upload.ts";

const RAISED_2 = "bg-accent text-foreground hover:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:h-11";
const LOAD_FAILED = "Your Library could not be loaded.";

export interface LibraryBodyProps {
	/** null until the first successful load. */
	items: LibraryItem[] | null;
	loadFailed: boolean;
	refreshFailed: boolean;
	query: string;
	onRetry: () => void;
	onChanged: () => void;
	onDelete: (item: LibraryItem, opener: HTMLElement) => void;
}

/** The list's states, pure for SSR tests. Loading, empty and failed stay
 *  distinct, and a failed refresh keeps the list. */
export function LibraryBody({ items, loadFailed, refreshFailed, query, onRetry, onChanged, onDelete }: LibraryBodyProps) {
	const failedLine = (
		<div role="status" className="flex flex-wrap items-center gap-2 text-ink-2">
			<p>{LOAD_FAILED}</p>
			<button type="button" onClick={onRetry} className="prompt-secondary">Try again</button>
		</div>
	);
	if (items === null) {
		return loadFailed ? failedLine : (
			<div role="status" aria-label="Loading your Library" className="flex flex-col gap-1">
				<Skeleton className="h-[62px] w-full rounded-[10px]" />
				<Skeleton className="h-[62px] w-full rounded-[10px]" />
				<Skeleton className="h-[62px] w-full rounded-[10px]" />
			</div>
		);
	}
	const key = nameKey(query.trim());
	const shown = key ? items.filter((item) => nameKey(item.name).includes(key)) : items;
	return (
		<>
			{refreshFailed && failedLine}
			{items.length === 0 ? (
				<p className="text-ink-2">Nothing here yet. Upload a document or start a page.</p>
			) : shown.length === 0 ? (
				<p role="status" className="text-ink-2">Nothing matched</p>
			) : (
				<ul className="flex flex-col gap-1" data-testid="library-list">
					{shown.map((item) => <LibraryRow key={item.id} item={item} onRenamed={onChanged} onDelete={onDelete} />)}
				</ul>
			)}
		</>
	);
}

interface Clash { name: string; suggestedName: string; answer: (keepBoth: boolean) => void }

/** The full Library view: upload, list, search, rename, open and delete. */
export function LibraryView() {
	const [items, setItems] = useState<LibraryItem[] | null>(null);
	const [loadFailed, setLoadFailed] = useState(false);
	const [refreshFailed, setRefreshFailed] = useState(false);
	const [query, setQuery] = useState("");
	const [deleting, setDeleting] = useState<LibraryItem | null>(null);
	const [inFlight, setInFlight] = useState<{ name: string; percent: number } | null>(null);
	const [refusals, setRefusals] = useState<{ id: number; name: string; message: string }[]>([]);
	const [clash, setClash] = useState<Clash | null>(null);
	const [dragging, setDragging] = useState(false);
	const picker = useRef<HTMLInputElement>(null);
	const uploadButton = useRef<HTMLButtonElement>(null);
	const opener = useRef<HTMLElement | null>(null);
	const maxFileBytes = useRef(MAX_FILE_BYTES);
	const queue = useRef<Promise<void>>(Promise.resolve());
	const nextRefusal = useRef(0);
	const loaded = useRef(false);
	const request = useRef(0);

	const refresh = useCallback(async () => {
		const id = ++request.current;
		try {
			const response = await fetch("/api/library", { cache: "no-store" });
			if (!response.ok) throw new Error(String(response.status));
			const body = await response.json() as { items: LibraryItem[]; limits: { maxFileBytes: number } };
			if (id !== request.current) return;
			maxFileBytes.current = body.limits.maxFileBytes;
			loaded.current = true;
			setItems(body.items);
			setLoadFailed(false);
			setRefreshFailed(false);
		} catch {
			if (id !== request.current) return;
			if (loaded.current) setRefreshFailed(true);
			else setLoadFailed(true);
		}
	}, []);
	const retry = useCallback(() => {
		setLoadFailed(false);
		void refresh();
	}, [refresh]);
	useEffect(() => { void refresh(); }, [refresh]);
	useServerEvent("library-changed", () => void refresh());
	useServerResync(() => void refresh());

	const enqueue = (files: File[]) => {
		if (files.length === 0) return;
		queue.current = queue.current.then(() => runUploadQueue(files, {
			maxFileBytes: maxFileBytes.current,
			send: sendFile,
			askClash: (name, suggestedName) => new Promise((answer) => setClash({ name, suggestedName, answer })),
			onProgress: (name, percent) => setInFlight({ name, percent }),
			onRefused: (name, message) => setRefusals((list) => [...list, { id: nextRefusal.current++, name, message }]),
			onSettled: () => {
				setInFlight(null);
				void refresh();
			},
		}));
	};
	const answerClash = (keepBoth: boolean) => {
		clash?.answer(keepBoth);
		setClash(null);
	};
	const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

	return (
		<div
			className={`flex h-dvh min-w-0 flex-col ${dragging ? "outline-2 -outline-offset-4 outline-border" : ""}`}
			data-testid="library-view"
			onDragOver={(event) => {
				if (!hasFiles(event)) return;
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
			}}
			onDrop={(event) => {
				if (!hasFiles(event)) return;
				event.preventDefault();
				setDragging(false);
				enqueue([...event.dataTransfer.files]);
			}}
		>
			<TopBar />
			<div data-testid="library-scroll" className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-[52rem] flex-col gap-4 px-4 pb-12 pt-3 sm:pt-11">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h1 className="font-title text-2xl font-medium leading-[1.2] tracking-[-0.3px]">Library</h1>
						<Button ref={uploadButton} type="button" className={RAISED_2} onClick={() => picker.current?.click()} data-testid="library-upload">
							<UploadIcon className="ui-icon" aria-hidden="true" />
							Upload
						</Button>
						<input
							ref={picker}
							type="file"
							multiple
							hidden
							data-testid="library-file-input"
							onChange={(event) => {
								enqueue([...(event.target.files ?? [])]);
								event.target.value = "";
							}}
						/>
					</div>
					<label className="flex h-9 items-center gap-2 rounded-md bg-card px-2.5 text-muted-foreground transition-colors focus-within:bg-accent pointer-coarse:h-11">
						<SearchIcon className="ui-icon shrink-0" aria-hidden="true" />
						<input
							type="search"
							value={query}
							placeholder="Search your Library"
							aria-label="Search your Library"
							data-testid="library-search"
							onChange={(event) => setQuery(event.target.value)}
							autoComplete="off"
							spellCheck={false}
							className="min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground"
						/>
					</label>
					{inFlight && (
						<div className="flex items-center justify-between gap-3 rounded-[10px] bg-card px-3 py-2.5" data-testid="library-upload-row">
							<span className="min-w-0 text-base [overflow-wrap:anywhere]">{inFlight.name}</span>
							<span
								role="progressbar"
								aria-label={`Uploading ${inFlight.name}`}
								aria-valuemin={0}
								aria-valuemax={100}
								aria-valuenow={inFlight.percent}
								className="shrink-0 text-sm tabular-nums text-muted-foreground"
							>
								{inFlight.percent}%
							</span>
						</div>
					)}
					{refusals.map((refusal) => (
						<div key={refusal.id} role="alert" className="flex items-center justify-between gap-2 rounded-[10px] bg-card py-1.5 pl-3 pr-1.5" data-testid="library-refusal">
							<p className="min-w-0 text-sm [overflow-wrap:anywhere]">
								<span className="font-medium text-foreground">{refusal.name}</span>
								<span className="text-destructive"> · {refusal.message}</span>
							</p>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={`Dismiss ${refusal.name}`}
								className="size-9 pointer-coarse:size-11"
								onClick={() => setRefusals((list) => list.filter((entry) => entry.id !== refusal.id))}
							>
								<XIcon className="ui-icon" aria-hidden="true" />
							</Button>
						</div>
					))}
					<LibraryBody
						items={items}
						loadFailed={loadFailed}
						refreshFailed={refreshFailed}
						query={query}
						onRetry={retry}
						onChanged={() => void refresh()}
						onDelete={(item, button) => {
							opener.current = button;
							setDeleting(item);
						}}
					/>
				</div>
			</div>
			<DeleteItemDialog
				item={deleting}
				onClose={() => setDeleting(null)}
				onDeleted={() => {
					setDeleting(null);
					void refresh();
				}}
				returnFocus={() => (opener.current?.isConnected ? opener.current : uploadButton.current)?.focus()}
			/>
			<Dialog open={clash !== null} onOpenChange={(open) => { if (!open) answerClash(false); }}>
				<DialogContent showCloseButton={false} aria-describedby={undefined} data-testid="library-clash-dialog" className="gap-4 rounded-[10px] border-0 bg-card sm:max-w-md" onCloseAutoFocus={(event) => { event.preventDefault(); uploadButton.current?.focus(); }}>
					<DialogTitle className="text-base font-semibold [overflow-wrap:anywhere]">{clash?.name} is already in your Library.</DialogTitle>
					<div className="flex flex-wrap justify-end gap-2">
						<Button type="button" variant="ghost" className="pointer-coarse:h-11" onClick={() => answerClash(false)} data-testid="library-clash-cancel">Cancel</Button>
						<Button type="button" className={`${RAISED_2} h-auto min-h-9 max-w-full whitespace-normal text-left [overflow-wrap:anywhere]`} onClick={() => answerClash(true)} data-testid="library-clash-keep">
							Keep both as {clash?.suggestedName}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
