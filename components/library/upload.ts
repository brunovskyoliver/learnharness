/** Library uploads (feature 009): one XHR per file, in sequence, because fetch
 *  has no upload progress. A clash waits for the learner's answer. */
import { kindForName, LIBRARY_REFUSALS, MAX_FILE_BYTES, type LibraryItem } from "@/src/core";

export type UploadOutcome =
	| { status: "done"; item?: LibraryItem }
	| { status: "clash"; name: string; suggestedName: string }
	| { status: "refused"; message: string };

const FAILED = "The upload failed. Check your connection and try again.";

export function sendFile(file: File, name: string, onProgress: (percent: number) => void): Promise<UploadOutcome> {
	return new Promise((resolve) => {
		const xhr = new XMLHttpRequest();
		xhr.open("POST", `/api/library/upload?name=${encodeURIComponent(name)}`);
		xhr.setRequestHeader("Content-Type", "application/octet-stream");
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
		};
		xhr.onerror = () => resolve({ status: "refused", message: FAILED });
		xhr.onabort = xhr.onerror;
		xhr.onload = () => {
			let body: { error?: string; code?: string; name?: string; suggestedName?: string; item?: LibraryItem } = {};
			try { body = JSON.parse(xhr.responseText) as typeof body; } catch { /* a proxy's own error page */ }
			if (xhr.status === 201) resolve({ status: "done", ...(body.item ? { item: body.item } : {}) });
			else if (xhr.status === 409 && body.suggestedName) resolve({ status: "clash", name: body.name ?? name, suggestedName: body.suggestedName });
			else resolve({ status: "refused", message: body.error ?? FAILED });
		};
		xhr.send(file);
	});
}

/** A page's image (feature 010, US6): the image kinds the content route serves inline. */
export const pageImageRefusal = (name: string) => `${name} is a kind of file that can't be added to a page.`;

export function pageImageProblem(file: Pick<File, "name" | "size">): string | null {
	if (kindForName(file.name) !== "image" || /\.svg$/i.test(file.name)) return pageImageRefusal(file.name);
	if (file.size > MAX_FILE_BYTES) return LIBRARY_REFUSALS.tooLarge.message;
	return null;
}

/** Uploads an image for a page as its own Library item. A name already taken
 *  takes the free one offered: the learner chose a picture, not a name. */
export async function uploadPageImage(file: File, onProgress: (percent: number) => void, send = sendFile): Promise<{ item: LibraryItem } | { refused: string }> {
	const problem = pageImageProblem(file);
	if (problem) return { refused: problem };
	let name = file.name;
	for (let attempt = 0; attempt < 3; attempt++) {
		const outcome = await send(file, name, onProgress);
		if (outcome.status === "done") return outcome.item ? { item: outcome.item } : { refused: "The upload failed. Check your connection and try again." };
		if (outcome.status === "refused") return { refused: outcome.message };
		name = outcome.suggestedName;
	}
	return { refused: "The upload failed. Check your connection and try again." };
}

export const pageImageSrc = (item: Pick<LibraryItem, "id">) => `/api/library/items/${encodeURIComponent(item.id)}/content`;
export const pageImageAlt = (fileName: string) => fileName.replace(/\.[^.]+$/, "").trim() || "Image";

export interface UploadQueueDeps {
	maxFileBytes: number;
	send: (file: File, name: string, onProgress: (percent: number) => void) => Promise<UploadOutcome>;
	/** Resolves true for Keep both. */
	askClash: (name: string, suggestedName: string) => Promise<boolean>;
	onProgress: (name: string, percent: number) => void;
	onRefused: (name: string, message: string) => void;
	/** One file finished, whatever the outcome. */
	onSettled: (name: string) => void;
}

export async function runUploadQueue(files: File[], deps: UploadQueueDeps): Promise<void> {
	for (const file of files) {
		let name = file.name;
		if (file.size > deps.maxFileBytes) {
			deps.onRefused(name, LIBRARY_REFUSALS.tooLarge.message);
			continue;
		}
		for (;;) {
			const sending = name;
			deps.onProgress(sending, 0);
			const outcome = await deps.send(file, sending, (percent) => deps.onProgress(sending, percent));
			deps.onSettled(sending);
			if (outcome.status === "refused") deps.onRefused(sending, outcome.message);
			if (outcome.status !== "clash" || !await deps.askClash(outcome.name, outcome.suggestedName)) break;
			name = outcome.suggestedName;
		}
	}
}
