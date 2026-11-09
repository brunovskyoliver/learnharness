import { useId } from "react";

/**
 * LhMark — the app mark (owner's icon-no-padding.svg, 2026-09-17), inlined
 * as JSX so it rides along with the components (no network fetch, recolorable,
 * crisp at any size). 806×806 viewBox, no padding: sizing/padding is the
 * consumer's job. The gray path is the harness spiral (--nb-mark-spiral);
 * the ring and the dot take the ink (feature 025: they were white for
 * Study's dark ground).
 *
 * Each part carries its whole transform chain as one matrix (the owner's
 * nested groups multiplied out), so the ring's mask lives in the viewBox.
 *
 * `signature` (feature 028, the wordmark; research R4): the ring is masked by
 * a stroke on its centre line, so app/paper.css can draw it as one pen stroke
 * on the cold-load signature, clockwise from the spiral's open end at the top
 * so the stroke's last stretch passes the dot. Without the html attribute the
 * stroke is whole and the mark is static.
 *
 * Replaces the "LH" wordmark text in the sidebar band (also the traffic-light
 * gutter's resident in the merged desktop chrome).
 */
export function LhMark({ className = "", signature = false }: { className?: string; signature?: boolean }) {
	const id = useId();
	const mask = signature ? `lh-mark-ring-${id.replace(/[^a-zA-Z0-9_-]/g, "")}` : null;
	return (
		<svg
			viewBox="0 0 806 806"
			className={className}
			style={{ fillRule: "evenodd", clipRule: "evenodd", strokeLinejoin: "round", strokeMiterlimit: 2 }}
			aria-hidden="true"
		>
			{mask && (
				<mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="806" height="806">
					{/* The ring's centre line (r 165.19 around 617.89,188.11), a little wider than the ring (45.83); white is the mask's "show", not a colour. */}
					<path
						className="lh-mark-ring-stroke"
						d="M474.39,106.273A165.192 165.192 0 0 1 761.383,269.946A165.192 165.192 0 0 1 474.39,106.273Z"
						pathLength={1}
						fill="none"
						stroke="white"
						strokeWidth={50}
					/>
				</mask>
			)}
			<path
				className="lh-mark-spiral"
				transform="matrix(-0.125271,-0.467517,-0.467517,0.125271,2426.827868,497.306594)"
				d="M1234.728,3305.937C871.642,3324.965 587,3624.915 587,3988.5C587,4365.734 893.266,4672 1270.5,4672C1647.734,4672 1954,4365.734 1954,3988.5C1954,3880.637 1928.472,3774.304 1879.503,3678.197L1794.243,3721.64C1836.356,3804.292 1858.31,3895.737 1858.31,3988.5C1858.31,4312.921 1594.921,4576.31 1270.5,4576.31C946.079,4576.31 682.69,4312.921 682.69,3988.5C682.69,3675.817 927.482,3417.86 1239.736,3401.496L1234.728,3305.937Z"
				style={{ fill: "var(--nb-mark-spiral)" }}
			/>
			<g mask={mask ? `url(#${mask})` : undefined}>
				<path
					className="lh-mark-ring"
					transform="matrix(-0.275214,0,0,0.275214,967.545922,-909.581827)"
					d="M1270.5,3305C893.266,3305 587,3611.266 587,3988.5C587,4365.734 893.266,4672 1270.5,4672C1647.734,4672 1954,4365.734 1954,3988.5C1954,3611.266 1647.734,3305 1270.5,3305ZM1270.5,3471.537C1555.819,3471.537 1787.463,3703.181 1787.463,3988.5C1787.463,4273.819 1555.819,4505.463 1270.5,4505.463C985.181,4505.463 753.537,4273.819 753.537,3988.5C753.537,3703.181 985.181,3471.537 1270.5,3471.537Z"
					style={{ fill: "var(--ink)" }}
				/>
			</g>
			<g transform="matrix(-0.275214,0,0,0.275214,537.766587,-479.802492)">
				<circle className="lh-mark-dot" cx="1270.5" cy="3988.5" r="683.5" style={{ fill: "var(--ink)" }} />
			</g>
		</svg>
	);
}
