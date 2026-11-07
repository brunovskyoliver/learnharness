"use client";

/**
 * The settings modal's shell (feature 024 §19, lifted for both modes in
 * feature 025, T040): a lifted paper card, 840 × 704 with radius 16 and its
 * own grain, over the dim; a vertical nav on the shelf (an optional search
 * field on top) and one page at a time beside it. Below 768px it is full
 * screen with the nav as a row across the top (app/paper.css).
 *
 * The frame (Radix Dialog) and the body (Radix Tabs) are separate so the
 * body renders without a portal in render tests. Escape is left to the body's
 * owner: the frame never closes on Escape itself, so an inner layer (a menu,
 * a field, a search) can claim the key first.
 */
import { XIcon } from "lucide-react";
import { Dialog, Tabs } from "radix-ui";
import { createContext, useContext, useRef, type ReactNode, type Ref } from "react";

export interface SettingsNavItem {
	value: string;
	label: string;
	testid: string;
}

/** Inside the frame, page titles are the dialog's title. */
const InDialog = createContext(false);
/** What the ✕ on every page does. */
const CloseContext = createContext<() => void>(() => {});

export function SettingsShellFrame({ onClose, container, contentRef, onOpenAutoFocus, onCloseAutoFocus, onPointerDownOutside, children }: {
	onClose: () => void;
	/** Where the modal portals (Notebook's root); document.body otherwise. */
	container?: HTMLElement | null;
	contentRef?: Ref<HTMLDivElement>;
	onOpenAutoFocus?: (event: Event) => void;
	onCloseAutoFocus?: (event: Event) => void;
	onPointerDownOutside?: (event: CustomEvent<{ originalEvent: PointerEvent }>) => void;
	children: ReactNode;
}) {
	// Escape belongs to the body's owner (see above): Radix's own dismissal on
	// Escape is let through to the native event but its close is ignored.
	const escaping = useRef(false);
	return (
		<Dialog.Root open onOpenChange={(open) => {
			if (open) return;
			if (escaping.current) { escaping.current = false; return; }
			onClose();
		}}>
			<Dialog.Portal container={container ?? undefined}>
				<Dialog.Overlay className="nb-dialog-backdrop" data-testid="nb-settings-backdrop">
					<Dialog.Content
						ref={contentRef}
						className="nb-settings"
						data-testid="nb-settings"
						data-lh-modal-content
						data-settings-surface
						aria-describedby={undefined}
						onOpenAutoFocus={onOpenAutoFocus}
						onCloseAutoFocus={onCloseAutoFocus}
						onPointerDownOutside={onPointerDownOutside}
						onEscapeKeyDown={() => {
							escaping.current = true;
							window.setTimeout(() => { escaping.current = false; }, 0);
						}}
					>
						<InDialog.Provider value={true}>
							<CloseContext.Provider value={onClose}>{children}</CloseContext.Provider>
						</InDialog.Provider>
					</Dialog.Content>
				</Dialog.Overlay>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** The nav (search on top, then the pages' tabs or the search's results) and the pages. */
export function SettingsShellBody({ items, value, onValueChange, search, results, onClose, testid, children }: {
	items: readonly SettingsNavItem[];
	value: string;
	onValueChange: (value: string) => void;
	search?: ReactNode;
	/** Shown in the tabs' place while searching. */
	results?: ReactNode;
	/** The ✕ outside the frame (render tests); the frame's own close otherwise. */
	onClose?: () => void;
	testid?: string;
	children: ReactNode;
}) {
	const frameClose = useContext(CloseContext);
	return (
		<CloseContext.Provider value={onClose ?? frameClose}>
			<Tabs.Root className="nb-settings-body" orientation="vertical" value={value} onValueChange={onValueChange} data-testid={testid}>
				<nav className="nb-settings-nav" aria-label="Settings sections" data-testid="settings-nav">
					{search}
					{results}
					<Tabs.List className="nb-settings-tablist" aria-label="Settings" hidden={results ? true : undefined}>
						{items.map((item) => (
							<Tabs.Trigger key={item.value} value={item.value} className="nb-settings-tab" data-testid={item.testid}>{item.label}</Tabs.Trigger>
						))}
					</Tabs.List>
				</nav>
				{children}
			</Tabs.Root>
		</CloseContext.Provider>
	);
}

/** ✕ at the page's top right; it scrolls away with the page (frame sheet-10). */
export function SettingsCloseButton() {
	const close = useContext(CloseContext);
	return (
		<button type="button" className="nb-dialog-close nb-settings-close" aria-label="Close settings" data-testid="nb-settings-close" onClick={close}>
			<XIcon aria-hidden="true" size={15} strokeWidth={1.6} />
		</button>
	);
}

/** A page's heading: the dialog's title inside the frame, a plain h2 outside it. */
export function SettingsTitle({ children, className = "nb-settings-title" }: { children: ReactNode; className?: string }) {
	const inDialog = useContext(InDialog);
	return inDialog ? <Dialog.Title className={className}>{children}</Dialog.Title> : <h2 className={className}>{children}</h2>;
}

/** One page: a tab panel that scrolls on its own, with the ✕. */
export function SettingsPage({ value, testid, children }: { value: string; testid?: string; children: ReactNode }) {
	return (
		<Tabs.Content value={value} className="nb-settings-page" data-testid={testid}>
			<SettingsCloseButton />
			{children}
		</Tabs.Content>
	);
}
