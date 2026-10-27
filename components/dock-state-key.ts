/** Every composer variant includes its fold state in the height animation key. */
export function dockStateKey(mode: string, _docked: boolean, expanded: boolean): string {
	return `${mode}:${expanded}`;
}

/** Hysteresis keeps reading mode compact until the actual conversation bottom. */
export function nextDockExpanded({ expanded, distance, direction, editing, composing, explicitExpansion = false }: {
	expanded: boolean;
	distance: number;
	direction: "up" | "down" | "none";
	editing: boolean;
	composing: boolean;
	explicitExpansion?: boolean;
}): boolean {
	if (editing || composing || explicitExpansion) return true;
	if (expanded && direction === "up" && distance > 96) return false;
	if (!expanded && direction === "down" && distance <= 16) return true;
	return expanded;
}
