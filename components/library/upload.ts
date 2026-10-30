/** Library uploads (feature 009): one XHR per file, in sequence, because fetch
 *  has no upload progress. A clash waits for the learner's answer. */
import { LIBRARY_REFUSALS } from "@/src/core";

export type UploadOutcome =
	| { status: "done" }
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
			let body: { error?: string; code?: string; name?: string; suggestedName?: string } = {};
			try { body = JSON.parse(xhr.responseText) as typeof body; } catch { /* a proxy's own error page */ }
			if (xhr.status === 201) resolve({ status: "done" });
			else if (xhr.status === 409 && body.suggestedName) resolve({ status: "clash", name: body.name ?? name, suggestedName: body.suggestedName });
			else resolve({ status: "refused", message: body.error ?? FAILED });
		};
		xhr.send(file);
	});
}

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
