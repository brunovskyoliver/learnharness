"use client";

import { XIcon } from "lucide-react";
import { useDemoPanel } from "@/components/artifacts/demo-panel-context";
import { WorkspacePane } from "@/components/workspace-pane";

/** The session's demo beside the lesson: a resizable column right of the
 *  transcript on wide screens, a sheet over the top half on narrow ones (the
 *  composer stays reachable below it). The transcript iframe is positioned over the slot without remounting. */
export function DemoPanel() {
	const panel = useDemoPanel();
	if (!panel || panel.openId === null) return null;
	const demo = panel.demos.find((d) => d.id === panel.openId);
	if (!demo) return null;

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
								className="min-w-0 flex-1 truncate rounded-md bg-transparent py-1 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
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
							className="ui-icon-button text-muted-foreground hover:bg-accent hover:text-foreground"
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
