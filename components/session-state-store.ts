/** Browser-owned UI state. Never store transcript data or credentials here. */
export interface UiStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export class SessionStateStore {
	readonly storageKey: string;
	private values: Record<string, unknown> | undefined;
	private listeners = new Map<string, Set<() => void>>();
	private dirty = false;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(account: string, chatId: string, private storage: () => UiStorage | undefined) {
		this.storageKey = `lh:session-ui:v1:${encodeURIComponent(account)}:${encodeURIComponent(chatId)}`;
	}

	get(key: string): unknown {
		if (!this.values) {
			this.values = Object.create(null) as Record<string, unknown>;
			try {
				const raw = this.storage()?.getItem(this.storageKey);
				const parsed = raw ? JSON.parse(raw) : null;
				if (parsed?.version === 1 && parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values)) {
					Object.assign(this.values, parsed.values);
				}
			} catch { /* Disabled storage or corrupt state must never block a session. */ }
		}
		return this.values[key];
	}

	set(key: string, value: unknown): void {
		if (Object.is(this.get(key), value)) return;
		this.values![key] = value;
		this.dirty = true;
		for (const listener of this.listeners.get(key) ?? []) listener();
		// Coalesce typing and scrolling, with a synchronous lifecycle flush.
		if (!this.timer) this.timer = setTimeout(() => this.flush(), 150);
	}

	subscribe(key: string, listener: () => void): () => void {
		const listeners = this.listeners.get(key) ?? new Set();
		listeners.add(listener);
		this.listeners.set(key, listeners);
		return () => {
			listeners.delete(listener);
			if (!listeners.size) this.listeners.delete(key);
		};
	}

	/** Explicit reload recovery must verify the latest fields, including any
	 * write still waiting in the normal debounce window. */
	persistForReload(): boolean {
		this.get("composer");
		try {
			const storage = this.storage();
			if (!storage) return false;
			const body = JSON.stringify({ version: 1, values: this.values });
			storage.setItem(this.storageKey, body);
			if (storage.getItem(this.storageKey) !== body) return false;
			clearTimeout(this.timer);
			this.timer = undefined;
			this.dirty = false;
			return true;
		} catch { return false; }
	}

	flush(): void {
		clearTimeout(this.timer);
		this.timer = undefined;
		if (!this.dirty) return;
		try {
			this.storage()?.setItem(this.storageKey, JSON.stringify({ version: 1, values: this.values }));
			this.dirty = false;
		} catch { /* Keep the memory copy usable if quota/storage access fails. */ }
	}
}
