/**
 * Shiki's theme for code in lessons, pages and cards (feature 025, T056): the
 * scopes of Shiki's own CSS-variables theme, each a `--lh-code-*` variable
 * that app/paper.css points at a paper ink. One registration serves light and
 * dark: the variables resolve per theme, so a theme change recolours
 * highlighted code with no re-highlight. Streamdown asks for a pair, hence a
 * name and a type per side.
 */

type Settings = { foreground?: string; fontStyle?: string };

const v = (role: string) => `var(--lh-code-${role})`;

const TOKEN_COLORS: { scope: string | string[]; settings: Settings }[] = [
	{ scope: ["keyword.operator.accessor", "meta.group.braces.round.function.arguments", "meta.template.expression", "markup.fenced_code meta.embedded.block"], settings: { foreground: v("foreground") } },
	{ scope: "emphasis", settings: { fontStyle: "italic" } },
	{ scope: ["strong", "markup.heading.markdown", "markup.bold.markdown"], settings: { fontStyle: "bold" } },
	{ scope: ["markup.italic.markdown"], settings: { fontStyle: "italic" } },
	{ scope: "meta.link.inline.markdown", settings: { fontStyle: "underline", foreground: v("token-link") } },
	{ scope: ["string", "markup.fenced_code", "markup.inline"], settings: { foreground: v("token-string") } },
	{ scope: ["comment", "string.quoted.docstring.multi"], settings: { foreground: v("token-comment") } },
	{ scope: ["constant.numeric", "constant.language", "constant.other.placeholder", "constant.character.format.placeholder", "variable.language.this", "variable.other.object", "variable.other.class", "variable.other.constant", "meta.property-name", "meta.property-value", "support"], settings: { foreground: v("token-constant") } },
	{ scope: ["keyword", "storage.modifier", "storage.type", "storage.control.clojure", "entity.name.function.clojure", "entity.name.tag.yaml", "support.function.node", "support.type.property-name.json", "punctuation.separator.key-value", "punctuation.definition.template-expression"], settings: { foreground: v("token-keyword") } },
	{ scope: "variable.parameter.function", settings: { foreground: v("token-parameter") } },
	{ scope: ["support.function", "entity.name.type", "entity.other.inherited-class", "meta.function-call", "meta.instance.constructor", "entity.other.attribute-name", "entity.name.function", "constant.keyword.clojure"], settings: { foreground: v("token-function") } },
	{ scope: ["entity.name.tag", "string.quoted", "string.regexp", "string.interpolated", "string.template", "string.unquoted.plain.out.yaml", "keyword.other.template"], settings: { foreground: v("token-string") } },
	{ scope: ["punctuation.definition.arguments", "punctuation.definition.dict", "punctuation.separator", "meta.function-call.arguments"], settings: { foreground: v("token-punctuation") } },
	{ scope: ["markup.underline.link", "punctuation.definition.metadata.markdown"], settings: { foreground: v("token-link") } },
	{ scope: ["beginning.punctuation.definition.list.markdown"], settings: { foreground: v("token-string") } },
	{ scope: ["punctuation.definition.string.begin.markdown", "punctuation.definition.string.end.markdown", "string.other.link.title.markdown", "string.other.link.description.markdown"], settings: { foreground: v("token-keyword") } },
	{ scope: ["markup.inserted", "meta.diff.header.to-file", "punctuation.definition.inserted"], settings: { foreground: v("token-inserted") } },
	{ scope: ["markup.deleted", "meta.diff.header.from-file", "punctuation.definition.deleted"], settings: { foreground: v("token-deleted") } },
];

/** One side of the pair. */
export function paperCodeTheme(name: string, type: "light" | "dark") {
	return {
		name,
		type,
		colors: { "editor.foreground": v("foreground"), "editor.background": v("background") },
		tokenColors: TOKEN_COLORS,
	};
}
