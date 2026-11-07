/**
 * The AI's blot glyph (feature 024, visual-reference §10; lifted for both
 * modes in feature 025): an irregular blob of 14 points joined by midpoint
 * quadratics plus two droplets, in a 26-unit box centred on 0 (the §10.4
 * splash recipe with our own seed). Notebook's dots and waits draw it, and
 * Study's thinking placeholder breathes it (`.nb-ink-wait`, app/paper.css).
 */

const r = (n: number) => Math.round(n * 10) / 10;

/** Our ink blot (not Riddled's logo glyph). */
export function blotPath(seed = 2.4, radius = 7.4): { d: string; drops: { cx: number; cy: number; r: number }[] } {
	const n = 14;
	const pts = Array.from({ length: n }, (_, i) => {
		const a = (i / n) * Math.PI * 2;
		const rad = radius * (1 + 0.16 * Math.sin(3 * a + seed) + 0.09 * Math.sin(7 * a + 2.3 * seed));
		return { x: Math.cos(a) * rad, y: Math.sin(a) * rad };
	});
	const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
	const start = mid(pts[n - 1]!, pts[0]!);
	let d = `M ${r(start.x)} ${r(start.y)}`;
	for (let i = 0; i < n; i++) {
		const p = pts[i]!, m = mid(p, pts[(i + 1) % n]!);
		d += ` Q ${r(p.x)} ${r(p.y)} ${r(m.x)} ${r(m.y)}`;
	}
	const drops = [0, 1].map((i) => {
		const a = 1.7 * seed + 1.33 * i + 0.9;
		const dist = radius * (1.35 + 0.5 * Math.abs(Math.sin(seed + i)));
		return { cx: r(Math.cos(a) * dist), cy: r(Math.sin(a) * dist), r: r(radius * (0.08 + 0.07 * Math.abs(Math.cos(3 * seed + i)))) };
	});
	return { d: `${d} Z`, drops };
}

const BLOT = blotPath();

/** Our blot glyph in a 26-unit box centred on 0 (§4 box, our own shape). */
export function BlotGlyph({ className = "nb-ink-dot-blot", size }: { className?: string; size?: number }) {
	return (
		<svg viewBox="-13 -13 26 26" className={className} width={size} height={size} aria-hidden="true" fill="currentColor">
			<path d={BLOT.d} />
			{BLOT.drops.map((d, i) => <circle key={i} cx={d.cx} cy={d.cy} r={d.r} />)}
		</svg>
	);
}

/** The breathing blot (visual-reference §10.3, Notebook's "Writing back"):
 *  the AI is about to write. At rest at .7 under reduced motion (app/paper.css). */
export function InkWait({ label, size = 13, testId }: { label: string; size?: number; testId?: string }) {
	return (
		<span role="status" aria-label={label} className="nb-ink-wait" data-testid={testId}>
			<BlotGlyph className="nb-ink-wait-blot" size={size} />
		</span>
	);
}
