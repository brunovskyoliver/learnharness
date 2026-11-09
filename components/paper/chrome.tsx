"use client";

/** The top-left chrome both modes share (feature 024 visual-reference §4, feature 025 R5): the menu glyph, the ✕ and our wordmark. */
import Link from "next/link";
import { LhMark } from "@/components/lh-mark";

/** Riddled's two-bar menu glyph (visual-reference §4), drawn in `--graphite`. */
export function MenuGlyph() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="nb-menu-glyph">
			<path d="M1.75 4.75h10.5M1.75 9.25h10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
		</svg>
	);
}

/** Our mark and name (not Riddled's). Notebook links it to the open note, Study to Home. */
export function Wordmark({ href, className }: { href: string; className?: string }) {
	return (
		<Link href={href} className={className ? `nb-wordmark ${className}` : "nb-wordmark"} data-testid="nb-wordmark">
			<LhMark className="nb-wordmark-mark" signature />
			<span translate="no">Brunovský’s study</span>
		</Link>
	);
}

/** The ✕ that replaces the menu glyph while the sidebar is open (same 12px span). */
export function CloseGlyph() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="nb-menu-glyph">
			<path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
		</svg>
	);
}
