"use client";

import { XIcon } from "lucide-react";
import { useEffect } from "react";
import { useDemoPanel } from "@/components/artifacts/demo-panel-context";
import { useWorkspace } from "@/components/workspace/workspace-context";
import { WorkspacePane } from "@/components/workspace-pane";

/** The session's demo beside the lesson: a resizable column right of the
 *  transcript on wide screens, a sheet over the top half on narrow ones (the
 *  composer stays reachable below it). The transcript iframe is positioned over the slot without remounting. */
export function DemoPanel() {
	const panel = useDemoPanel();
	const demo = panel?.demos.find((d) => d.id === panel.openId) ?? null;
	// The workspace counts a demo as holding the right pane.
	const setDemoOpen = useWorkspace()?.setDemoOpen;
	const holding = demo !== null;
	useEffect(() => {
		if (!holding || !setDemoOpen) return;
		setDemoOpen(true);
		return () => setDemoOpen(false);
	}, [holding, setDemoOpen]);
	if (!panel || !demo) return null;

	return (
		<WorkspacePane label="Demo" resizeLabel="Resize demo panel" testId="demo-panel" className="demo-workspace">
			{(dragging) => (
				<>
					<div className="flex h-13 shrink-0 items-center gap-3 px-3">
						{panel.demos.length > 1 ? (
							<select
								aria-label="Demo"
								value={demo.id}
								onChange={(e) => panel.open(e.target.value)}
								className="min-w-0 flex-1 truncate rounded-md bg-transparent py-1 text-sm font-medium text-ink outline-none hover:bg-shelf focus-visible:ring-1 focus-visible:ring-focus"
								data-testid="demo-panel-select"
							>
								{panel.demos.map((d) => (
									<option key={d.id} value={d.id}>
										{d.title}
									</option>
								))}
							</select>
						) : (
							<span className="min-w-0 flex-1 truncate text-sm font-medium">{demo.title}</span>
						)}
						<div data-demo-actions="" className="flex shrink-0 items-center" />
						<button
							type="button"
							aria-label="Close demo panel"
							onClick={panel.close}
							data-testid="demo-panel-close"
							className="ui-icon-button text-faint hover:bg-shelf hover:text-ink"
						>
							<XIcon className="ui-icon" />
						</button>
					</div>
					<div className={`min-h-0 flex-1 overflow-hidden p-3 ${dragging ? "pointer-events-none" : ""}`}>
						<div data-demo-slot="" className="h-full min-h-0" />
					</div>
				</>
			)}
		</WorkspacePane>
	);
}
