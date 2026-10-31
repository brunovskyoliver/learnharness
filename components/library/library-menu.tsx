"use client";

import { ContextMenu, DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface LibraryMenuAction { label: string; onSelect: () => void; destructive?: boolean; testId?: string }

const PANEL = "z-50 min-w-44 rounded-[10px] bg-accent p-1 text-foreground data-[state=closed]:hidden";
const ROW = "flex min-h-9 cursor-default items-center rounded-md px-2 text-base outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--accent)_80%,var(--foreground))] pointer-coarse:min-h-11";

/** The ⋯ menu and the right-click menu share one list of actions. */
export function LibraryEntryMenu({ actions, children }: { actions: readonly LibraryMenuAction[]; children: ReactNode }) {
	if (actions.length === 0) return <>{children}</>;
	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<ContextMenu.Content data-lh-menu className={PANEL}>
					{actions.map((action) => (
						<ContextMenu.Item key={action.label} className={`${ROW} ${action.destructive ? "text-destructive" : ""}`} onSelect={action.onSelect}>{action.label}</ContextMenu.Item>
					))}
				</ContextMenu.Content>
			</ContextMenu.Portal>
		</ContextMenu.Root>
	);
}

export function LibraryMoreButton({ name, actions }: { name: string; actions: readonly LibraryMenuAction[] }) {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger asChild>
				<Button type="button" variant="ghost" size="icon" aria-label={`More actions for ${name}`} data-testid="library-more" className="size-9 text-muted-foreground pointer-coarse:size-11">
					<MoreHorizontalIcon className="ui-icon" aria-hidden="true" />
				</Button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content data-lh-menu align="end" sideOffset={4} className={PANEL}>
					{actions.map((action) => (
						<DropdownMenu.Item key={action.label} data-testid={action.testId} className={`${ROW} ${action.destructive ? "text-destructive" : ""}`} onSelect={action.onSelect}>{action.label}</DropdownMenu.Item>
					))}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}
