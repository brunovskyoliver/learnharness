"use client";

import { ContextMenu, DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import { CheckIcon, ChevronDownIcon, MoreHorizontalIcon } from "lucide-react";

export interface LibraryMenuAction { label: string; onSelect: () => void; destructive?: boolean; testId?: string }

const PANEL = "nb-menu min-w-44 data-[state=closed]:hidden";
const ROW = "nb-menu-item items-center";

/** The ⋯ menu and the right-click menu share one list of actions. */
export function LibraryEntryMenu({ actions, children }: { actions: readonly LibraryMenuAction[]; children: ReactNode }) {
	if (actions.length === 0) return <>{children}</>;
	return (
		<ContextMenu.Root>
			<ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
			<ContextMenu.Portal>
				<ContextMenu.Content data-lh-menu className={PANEL}>
					{actions.map((action) => (
						<ContextMenu.Item key={action.label} className={`${ROW} ${action.destructive ? "text-red" : ""}`} onSelect={action.onSelect}>{action.label}</ContextMenu.Item>
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
				<button type="button" aria-label={`More actions for ${name}`} data-testid="library-more" className="lh-tool">
					<MoreHorizontalIcon aria-hidden="true" />
				</button>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content data-lh-menu align="end" sideOffset={4} className={PANEL}>
					{actions.map((action) => (
						<DropdownMenu.Item key={action.label} data-testid={action.testId} className={`${ROW} ${action.destructive ? "text-red" : ""}`} onSelect={action.onSelect}>{action.label}</DropdownMenu.Item>
					))}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	);
}

/** Where focus goes back to after a dialog opened from a row's menus. */
export function moreButton(label: string): HTMLElement {
	return [...document.querySelectorAll<HTMLElement>('[data-testid="library-more"]')].find((button) => button.getAttribute("aria-label") === label) ?? document.body;
}

/** A row's checkbox while selecting. The label makes the 44 px target on coarse pointers. */
export function LibrarySelectBox({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
	return (
		<label className="ml-3 flex shrink-0 items-center justify-center pointer-coarse:ml-0 pointer-coarse:size-11">
			<input type="checkbox" checked={checked} onChange={onChange} aria-label={label} data-testid="library-select" className="size-4 accent-ink pointer-coarse:size-6" />
		</label>
	);
}

/** A filter's choice, as a menu by DESIGN.md's rules rather than the system's list. */
export function LibraryChoice<T extends string>({ label, name, value, options, onChange, testId }: {
	label: string;
	/** The accessible name, before the current value. */
	name: string;
	value: T;
	options: readonly { value: T; label: string }[];
	onChange: (value: T) => void;
	testId: string;
}) {
	const current = options.find((option) => option.value === value)?.label ?? "";
	return (
		<div className="flex min-w-0 items-center gap-1 text-sm text-faint">
			<span aria-hidden="true">{label}</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<button type="button" aria-label={`${name}: ${current}`} data-testid={testId} className="lh-tool min-w-0 max-w-full gap-1 pr-1 text-ink">
						<span className="min-w-0 truncate">{current}</span>
						<ChevronDownIcon className="!size-3 text-faint" aria-hidden="true" />
					</button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content data-lh-menu align="start" sideOffset={4} collisionPadding={8} className={`${PANEL} max-w-[min(20rem,calc(100vw-1rem))]`}>
						<DropdownMenu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
							{options.map((option) => (
								<DropdownMenu.RadioItem key={option.value} value={option.value} data-testid={`${testId}-option`} className={`${ROW} [overflow-wrap:anywhere]`}>
									<span className="nb-menu-check"><DropdownMenu.ItemIndicator><CheckIcon aria-hidden="true" /></DropdownMenu.ItemIndicator></span>
									{option.label}
								</DropdownMenu.RadioItem>
							))}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	);
}
