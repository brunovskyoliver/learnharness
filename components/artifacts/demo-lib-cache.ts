/** Demo-kit files for sandboxed demo frames, fetched by the app page.
 *
 *  Demo frames run with an opaque origin (sandbox="allow-scripts"), so the
 *  browser never caches their own requests. The app page fetches each kit
 *  file once, at a content-versioned URL the server marks immutable
 *  (next.config.ts), keeps one promise per file for the page's lifetime, and
 *  hands the code to frames: inlined into the srcdoc, or through the
 *  `demo-lib-request` bridge (specs/024-instant-loads/contracts/demo-lib-bridge.md).
 *  Only files on the allow-list are ever fetched or sent. */

/** Kit files a frame may receive. Extend here (and in the contract) when the
 *  kit build adds a file. */
export const DEMO_LIB_FILES = ["runtime.js", "vega.js", "plotly-light.js", "plotly.js", "flow.js", "flow.css"] as const;
export type DemoLibFile = (typeof DEMO_LIB_FILES)[number];

export function isDemoLibFile(file: unknown): file is DemoLibFile {
	return typeof file === "string" && (DEMO_LIB_FILES as readonly string[]).includes(file);
}

/** `/demo-kit/<file>?v=<version>`; without a version (kit not built when
 *  the app was built) the plain, revalidated URL. */
export function demoLibUrl(file: DemoLibFile, version: string): string {
	return version ? `/demo-kit/${file}?v=${encodeURIComponent(version)}` : `/demo-kit/${file}`;
}

export interface DemoLibCache {
	get(file: string): Promise<string>;
}

export function createDemoLibCache({ fetcher = (...args: Parameters<typeof fetch>) => fetch(...args), version = "" }: { fetcher?: typeof fetch; version?: string } = {}): DemoLibCache {
	const files = new Map<DemoLibFile, Promise<string>>();
	return {
		get(file) {
			if (!isDemoLibFile(file)) return Promise.reject(new Error(`could not load ${String(file)}`));
			let p = files.get(file);
			if (!p) {
				p = (async () => {
					const response = await fetcher(demoLibUrl(file, version)).catch(() => null);
					if (!response?.ok) throw new Error(`could not load ${file}`);
					return response.text();
				})();
				// A failure is not remembered: the next plot that needs the file retries.
				p.catch(() => { if (files.get(file) === p) files.delete(file); });
				files.set(file, p);
			}
			return p;
		},
	};
}

const pageCache = createDemoLibCache({ version: process.env.LH_DEMO_KIT_VERSION ?? "" });

/** The page-wide cache: one download per kit file, shared by every frame. */
export function getDemoLib(file: string): Promise<string> {
	return pageCache.get(file);
}
