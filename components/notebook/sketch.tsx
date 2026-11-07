"use client";

/**
 * A stepped sketch (feature 024, US4; ui-contract "Sketch"; visual-reference
 * §16): the serif title and sans subtitle, the drawing (our validated
 * primitives as SVG, src/core/notebook-sketch.ts) revealing one step at a
 * time with its strokes inking in, the step's big serif line, then the
 * caption on the left and the stepper on the right (‹ i/n › ↻), and "See it
 * larger". A drawing plays itself once per browser (its hash remembered);
 * after that it shows finished. Reduced motion shows the last step at once.
 */
import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { renderSketchSvg, SKETCH_FAILED_TEXT, sketchLabel, validateSketch, type Sketch as SketchData } from "@/src/core";
import { InkText } from "./ink-text";
import { SketchDialog } from "./sketch-dialog";

/** Drawing units to CSS px on the page (§16.1: a 17-unit title shows ≈19px, 11-unit text ≈13px). */
export const SKETCH_SCALE = 1.12;
/** Autoplay pace "note" (§16.2): each step holds 1150ms + 22ms per caption character. */
export const stepHoldMs = (caption: string): number => 1150 + 22 * caption.length;

const PLAYED_KEY = (hash: string) => `lh.nb.sketch.${hash}`;

/** A short stable hash of a sketch (FNV-1a over its JSON), to remember that it played. */
export function sketchHash(sketch: SketchData): string {
	const text = JSON.stringify(sketch);
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

const played = (hash: string): boolean => {
	try { return window.localStorage.getItem(PLAYED_KEY(hash)) === "1"; } catch { return false; }
};
const remember = (hash: string) => {
	try { window.localStorage.setItem(PLAYED_KEY(hash), "1"); } catch { /* it may play again next time */ }
};
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The SVG with its step groups shown up to `step`. Groups that appear after
 * it mounted ink in (`data-live`); the ones already there stay drawn, so a
 * step back and forth only redraws what comes back.
 */
export function DrawingPicture({ sketch, step, liveStart, large = false }: { sketch: SketchData; step: number; liveStart: boolean; large?: boolean }) {
	const host = useRef<HTMLDivElement>(null);
	const svg = useMemo(() => renderSketchSvg(sketch), [sketch]);
	const shown = useRef<number | null>(null);
	useLayoutEffect(() => {
		const groups = host.current?.querySelectorAll<SVGGElement>("svg > [data-step], svg > g > [data-step]") ?? [];
		const before = shown.current;
		const animate = !reducedMotion();
		for (const g of groups) {
			const i = Number(g.dataset.step);
			const visible = i <= step;
			g.style.opacity = visible ? "1" : "0";
			g.removeAttribute("opacity");
			if (!visible) g.removeAttribute("data-live");
			else if (animate && (before === null ? liveStart : i > before)) g.setAttribute("data-live", "");
		}
		shown.current = step;
	}, [step, liveStart, svg]);
	return (
		<div
			ref={host}
			className={`nb-drawing-picture${large ? " nb-drawing-large" : ""}`}
			style={large ? undefined : { maxWidth: sketch.w * SKETCH_SCALE }}
			data-testid="nb-sketch-drawing"
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}

export interface SketchPlayer {
	step: number;
	count: number;
	/** Bumps on "Draw it again": the drawing remounts and inks in from the start. */
	round: number;
	liveStart: boolean;
	/** The last step has been shown (See it larger appears). */
	finished: boolean;
	go: (step: number) => void;
	replay: () => void;
}

/** Steps, autoplay once per drawing, replay. */
export function useSketchPlayer(sketch: SketchData): SketchPlayer {
	const count = sketch.steps.length;
	const last = count - 1;
	const hash = useMemo(() => sketchHash(sketch), [sketch]);
	// The server and the first paint show it finished; the browser decides after mount.
	const [state, setState] = useState({ step: last, round: 0, liveStart: false, playing: false, finished: true });
	const timer = useRef(0);
	useEffect(() => () => window.clearTimeout(timer.current), []);

	const play = useCallback((round: number) => {
		window.clearTimeout(timer.current);
		setState({ step: 0, round, liveStart: true, playing: true, finished: last === 0 });
	}, [last]);

	const roundRef = useRef(state.round);
	roundRef.current = state.round;
	// Before the first paint: a drawing not yet played here starts from its first step.
	useLayoutEffect(() => {
		if (reducedMotion() || played(hash)) return;
		remember(hash);
		play(roundRef.current + 1);
	}, [hash, play]);

	// Autoplay: hold each step for its caption, then the next.
	useEffect(() => {
		if (!state.playing) return;
		if (state.step >= last) {
			setState((s) => ({ ...s, playing: false, finished: true }));
			return;
		}
		timer.current = window.setTimeout(() => {
			setState((s) => (s.playing ? { ...s, step: Math.min(last, s.step + 1) } : s));
		}, stepHoldMs(sketch.steps[state.step]?.caption ?? ""));
		return () => window.clearTimeout(timer.current);
	}, [state.playing, state.step, last, sketch]);

	const go = useCallback((step: number) => {
		window.clearTimeout(timer.current);
		const next = Math.max(0, Math.min(last, step));
		setState((s) => ({ ...s, step: next, playing: false, finished: s.finished || next === last }));
	}, [last]);
	const replay = useCallback(() => {
		if (reducedMotion()) { go(last); return; }
		play(roundRef.current + 1);
	}, [go, last, play]);

	return { step: state.step, count, round: state.round, liveStart: state.liveStart, finished: state.finished, go, replay };
}

/** ‹ i/n › ↻; ←/→ step while it has focus. */
export function Stepper({ player }: { player: SketchPlayer }) {
	const { step, count, go, replay } = player;
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "ArrowLeft") { event.preventDefault(); go(step - 1); }
		if (event.key === "ArrowRight") { event.preventDefault(); go(step + 1); }
	};
	return (
		<div className="nb-stepper" role="group" aria-label="Steps" onKeyDown={onKeyDown} data-testid="nb-sketch-stepper">
			<button type="button" className="nb-drawing-control" aria-label="Previous step" aria-disabled={step <= 0} data-testid="nb-sketch-prev" onClick={() => { if (step > 0) go(step - 1); }}>
				<ChevronLeftIcon aria-hidden="true" size={14} strokeWidth={1.7} />
			</button>
			<span className="nb-step-count" data-testid="nb-sketch-count">{`${step + 1}/${count}`}</span>
			<button type="button" className="nb-drawing-control" aria-label="Next step" aria-disabled={step >= count - 1} data-testid="nb-sketch-next" onClick={() => { if (step < count - 1) go(step + 1); }}>
				<ChevronRightIcon aria-hidden="true" size={14} strokeWidth={1.7} />
			</button>
			<button type="button" className="nb-drawing-control" aria-label="Draw it again" data-testid="nb-sketch-replay" onClick={replay}>
				<RotateCcwIcon aria-hidden="true" size={13} strokeWidth={1.7} />
			</button>
		</div>
	);
}

/** Title and subtitle above the drawing. */
export function SketchHead({ sketch }: { sketch: SketchData }) {
	return (
		<div className="nb-sketch-head">
			<span className="nb-sketch-title nb-voice">{sketch.title}</span>
			{sketch.subtitle && <span className="nb-sketch-subtitle">{sketch.subtitle}</span>}
		</div>
	);
}

/** The inline sketch under the AI's words. An invalid drawing says so in place. */
export function Sketch({ sketch: raw }: { sketch: unknown }) {
	const checked = useMemo(() => validateSketch(raw), [raw]);
	if (!checked.ok) return <p className="nb-sketch-failed" data-testid="nb-sketch-failed">{SKETCH_FAILED_TEXT}</p>;
	return <ValidSketch sketch={checked.sketch} />;
}

function ValidSketch({ sketch }: { sketch: SketchData }) {
	const player = useSketchPlayer(sketch);
	const [large, setLarge] = useState(false);
	const opener = useRef<HTMLButtonElement>(null);
	const current = sketch.steps[player.step];
	return (
		<div className="nb-sketch" data-testid="nb-sketch" data-step={player.step}>
			<figure className="nb-sketch-figure" style={{ maxWidth: sketch.w * SKETCH_SCALE }}>
				<SketchHead sketch={sketch} />
				<DrawingPicture key={player.round} sketch={sketch} step={player.step} liveStart={player.liveStart} />
				{current?.note && <p key={`${player.round}-${player.step}`} className="nb-sketch-note nb-voice" data-testid="nb-sketch-note"><InkText text={current.note} animate={false} /></p>}
			</figure>
			<div className="nb-sketch-row">
				<p className="nb-sketch-caption nb-voice" aria-live="polite" data-testid="nb-sketch-caption"><InkText text={current?.caption ?? ""} animate={false} /></p>
				<Stepper player={player} />
			</div>
			<button
				ref={opener}
				type="button"
				className="nb-sketch-larger"
				data-testid="nb-sketch-larger"
				data-hidden={player.finished ? undefined : "true"}
				tabIndex={player.finished ? undefined : -1}
				aria-hidden={player.finished ? undefined : true}
				onClick={() => setLarge(true)}
			>See it larger</button>
			<SketchDialog open={large} onOpenChange={setLarge} sketch={sketch} player={player} label={sketchLabel(sketch)} returnFocus={opener} />
		</div>
	);
}
