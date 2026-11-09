/**
 * The kind icons of a reference chip (feature 027, ui-contract §1; approved by
 * the owner at gate 2). Its own module so the composer's field draws them
 * without loading the chip's navigation code.
 */
import { FileCodeIcon, FileIcon, FileTextIcon, FileTypeIcon, ImageIcon, NetworkIcon, NotebookTextIcon, SheetIcon, type LucideIcon } from "lucide-react";
import type { LibraryKind } from "@/src/core";

export const KIND_ICON: Record<LibraryKind, LucideIcon> = {
	page: NotebookTextIcon,
	markdown: FileTextIcon,
	text: FileTextIcon,
	code: FileCodeIcon,
	csv: SheetIcon,
	pdf: FileTypeIcon,
	image: ImageIcon,
	diagram: NetworkIcon,
	other: FileIcon,
};
