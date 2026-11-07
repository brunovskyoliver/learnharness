"use client";

/**
 * "Ink from the pointer" (feature 024, US8; visual-reference §21): now and
 * then a drop of ink falls where the mouse or pen moves, then dries. A
 * fixed canvas under the page's words (pointer-events none). Only with a
 * fine pointer and without reduced motion; NotebookApp mounts it only while
 * the setting is on, so when it is off nothing listens or draws.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { blotPath } from "./nb-geometry";

const FINE = "(pointer: fine)";
const REDUCED = "(prefers-reduced-motion: reduce)";
/** Most drops on screen at once. */
const MAX_DROPS = 36;
/** The first drop after this much travel, then every 200-500px. */
const FIRST_TRAVEL = 260;

export interface Drop {
	/** Page coordinates: the drop moves with the page when it scrolls. */
	x: number;
	y: number;
	r: number;
	born: number;
	life: number;
	drip: { length: number; ms: number } | null;
	shape: Path2D | null;
}

/** §21 alpha: 90ms fade-in, hold, fade over the last 45% of its life, at .42. */
export function dropAlpha(age: number, life: number): number {
	if (age < 0 || age >= life) return 0;
	return Math.min(1, age / 90) * (1 - Math.max(0, (age - 0.55 * life) / (0.45 * life))) * 0.42;
}

/** §21 kinds: 30% big (with a drip), 70% small. `rand` is injectable for tests. */
export function makeDrop(x: number, y: number, now: number, rand: () => number = Math.random): Omit<Drop, "shape"> {
	const big = rand() < 0.3;
	const at = { x: x + (rand() - 0.5) * 6, y: y + 8 };
	if (big) {
		return { ...at, r: 3.4 + 1.8 * rand(), born: now, life: 3600 + 1600 * rand(), drip: { length: 14 + 34 * rand(), ms: 1200 + 1400 * rand() } };
	}
	return { ...at, r: 1.4 + 2.4 * rand(), born: now, life: 1900 + 1200 * rand(), drip: null };
}

function subscribeMedia(onChange: () => void) {
	const queries = [window.matchMedia(FINE), window.matchMedia(REDUCED)];
	for (const q of queries) q.addEventListener("change", onChange);
	return () => { for (const q of queries) q.removeEventListener("change", onChange); };
}
const allowedNow = () => window.matchMedia(FINE).matches && !window.matchMedia(REDUCED).matches;

/** True when this device can show the ink: a fine pointer and motion allowed. */
function useInkAllowed(): boolean {
	return useSyncExternalStore(subscribeMedia, allowedNow, () => false);
}

export function PointerInk() {
	const allowed = useInkAllowed();
	return allowed ? <InkCanvas /> : null;
}

function InkCanvas() {
	const canvas = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const el = canvas.current;
		const ctx = el?.getContext("2d");
		if (!el || !ctx) return;
		const drops: Drop[] = [];
		let ink = "#1d1c1a";
		let frame = 0;
		let last: { x: number; y: number } | null = null;
		let travelled = 0;
		let next = FIRST_TRAVEL;

		const readInk = () => {
			const root = el.closest(".nb-root") ?? document.documentElement;
			ink = getComputedStyle(root).getPropertyValue("--ink").trim() || ink;
		};
		const size = () => {
			const dpr = Math.min(2, window.devicePixelRatio || 1);
			el.width = Math.round(window.innerWidth * dpr);
			el.height = Math.round(window.innerHeight * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		readInk();
		size();
		// The theme changes the ink: follow the root's attributes and the OS scheme.
		const root = el.closest(".nb-root");
		const watch = new MutationObserver(readInk);
		if (root) watch.observe(root, { attributes: true, attributeFilter: ["data-nb-theme"] });
		const scheme = window.matchMedia("(prefers-color-scheme: dark)");
		scheme.addEventListener("change", readInk);

		const draw = () => {
			frame = 0;
			const now = performance.now();
			ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
			ctx.fillStyle = ink;
			ctx.strokeStyle = ink;
			ctx.lineCap = "round";
			for (let i = drops.length - 1; i >= 0; i--) {
				const d = drops[i]!;
				const age = now - d.born;
				if (age >= d.life) { drops.splice(i, 1); continue; }
				ctx.globalAlpha = dropAlpha(age, d.life);
				const x = d.x - window.scrollX;
				const y = d.y - window.scrollY;
				ctx.save();
				ctx.translate(x, y);
				if (d.shape) ctx.fill(d.shape);
				else { ctx.beginPath(); ctx.arc(0, 0, d.r, 0, Math.PI * 2); ctx.fill(); }
				if (d.drip) {
					const t = Math.min(1, age / d.drip.ms);
					const eased = 1 - (1 - t) ** 3;
					const length = d.drip.length * eased;
					ctx.lineWidth = 0.7 * d.r;
					ctx.beginPath();
					ctx.moveTo(0, 0.4 * d.r);
					ctx.quadraticCurveTo(0, length * 0.6, 0, length);
					ctx.stroke();
					ctx.beginPath();
					ctx.arc(0, length, d.r * (0.42 + 0.12 * t), 0, Math.PI * 2);
					ctx.fill();
				}
				ctx.restore();
			}
			ctx.globalAlpha = 1;
			if (drops.length > 0) frame = requestAnimationFrame(draw);
		};
		const kick = () => { if (!frame) frame = requestAnimationFrame(draw); };

		const onMove = (event: PointerEvent) => {
			if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
			const here = { x: event.clientX, y: event.clientY };
			if (last) travelled += Math.hypot(here.x - last.x, here.y - last.y);
			last = here;
			if (travelled < next) return;
			travelled = 0;
			next = 200 + 300 * Math.random();
			const made = makeDrop(here.x + window.scrollX, here.y + window.scrollY, performance.now());
			// Our blot shape for the drops big enough to show one (§21: r > 2.4).
			const shape = made.r > 2.4 ? new Path2D(blotPath(Math.random() * 10, made.r).d) : null;
			drops.push({ ...made, shape });
			if (drops.length > MAX_DROPS) drops.shift();
			kick();
		};
		const onScroll = () => { if (drops.length) kick(); };

		window.addEventListener("pointermove", onMove, { passive: true });
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", size);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", size);
			scheme.removeEventListener("change", readInk);
			watch.disconnect();
			if (frame) cancelAnimationFrame(frame);
		};
	}, []);
	return <canvas ref={canvas} className="nb-pointer-ink" aria-hidden="true" data-testid="nb-pointer-ink" />;
}
