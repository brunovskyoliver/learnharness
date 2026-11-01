/** Undo and redo for one open diagram (feature 022). Pure, so the rules are tested
 *  directly. Keystrokes in one label merge into one step; anything else is its own. */
import type { DiagramDoc } from "@/src/core";

export const DIAGRAM_HISTORY_LIMIT = 200;
const MERGE_MS = 800;

export interface DiagramHistory {
	past: DiagramDoc[];
	present: DiagramDoc;
	future: DiagramDoc[];
	/** What the last step was typing into, so the next keystroke can join it. */
	mergeKey: string | null;
	at: number;
}

export const startHistory = (doc: DiagramDoc): DiagramHistory => ({ past: [], present: doc, future: [], mergeKey: null, at: 0 });

export function pushHistory(state: DiagramHistory, next: DiagramDoc, mergeKey: string | null, now: number): DiagramHistory {
	if (next === state.present) return state;
	if (mergeKey && mergeKey === state.mergeKey && now - state.at < MERGE_MS) return { ...state, present: next, future: [], at: now };
	return { past: [...state.past, state.present].slice(-DIAGRAM_HISTORY_LIMIT), present: next, future: [], mergeKey, at: now };
}

export function undoHistory(state: DiagramHistory): DiagramHistory {
	const previous = state.past.at(-1);
	if (!previous) return state;
	return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future], mergeKey: null, at: 0 };
}

export function redoHistory(state: DiagramHistory): DiagramHistory {
	const [next, ...rest] = state.future;
	if (!next) return state;
	return { past: [...state.past, state.present], present: next, future: rest, mergeKey: null, at: 0 };
}
