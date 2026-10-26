# Enriched Markdown fit for LearnHarness

Researched 2026-10-26. Recommendation: keep Streamdown for this Next.js/Electron app. Enriched Markdown has a real DOM web renderer, so it is technically relevant, but its web build does not supply the highlighting, clipboard integration, or incomplete-Markdown handling that would justify replacing the current stack. Borrow interaction ideas selectively.

## Evidence and version boundaries

Only official documentation, maintainer source, published package contents, and this app's source were used. The requested [getting-started page](https://docs.swmansion.com/enriched-markdown/getting-started/) returned HTTP 403 to the direct fetch; its [official Markdown source][start] was readable. Documentation references below are pinned to upstream commit `32f6f0c101a75db67f5728f7682d38f28bfd82d8` on 2026-10-26. They describe current source, which can be ahead of a release.

The [publisher's npm metadata][npm] identifies `1.1.1` as the stable release, published 2026-10-06. I also inspected its published tarball in memory. Its web source confirms plain DOM rendering, uncolored code blocks, native-only prop stripping, and asynchronous parsing. Do not assume every feature in current `main` exists in that archive. The package's source-tree manifest and published manifest differ: current source has a `browser` entry, while the published `1.1.1` manifest has neither `browser` nor `exports`. Release selection and bundler resolution need explicit validation. [Published package metadata][npm]; [current source manifest][manifest].

## What this app already has

[package.json](../package.json) declares Next.js `^16.3.2`, React/React DOM `^19.2.8`, Electron `^44.9.3`, Streamdown `^2.5.0`, `@streamdown/code`, `@streamdown/math`, and KaTeX. Installed Streamdown is `2.5.0`. This is a DOM app inside an Electron `BrowserWindow`, not a React Native app. [Electron entry](../electron/main.cjs); [Next configuration](../next.config.ts).

[MessageResponse](../components/ai-elements/message.tsx) combines Streamdown with Shiki code highlighting, KaTeX, CJK handling, hard line breaks, legacy math-delimiter conversion, and separate tool-content math recovery. [md-blocks.tsx](../components/md-blocks.tsx) adds:

- Code line numbers, `startLine`/`noLineNumbers` fence metadata, and source-copy controls.
- App-owned Mermaid rendering, an incomplete-fence placeholder, error recovery, and diagram expansion.
- Markdown table copy, raw TeX copy, semantic emphasis, and custom alert callouts.

At the start of this research, the design removed code headers and large action bars and used a small hover/focus copy button. The owner subsequently approved a frameless code inset with a visible Copy action and no line-number gutter for snippets of ten lines or fewer. Enriched Markdown's native header UI would not provide that chosen design. [Block components](../components/md-blocks.tsx); [code presentation styles](../app/globals.css).

## Documented capabilities and limits

### Platforms and setup

Enriched Markdown ships React Native display/editor components and separate Swift and Kotlin SDKs. The web display emits semantic HTML through React, with md4c compiled to WebAssembly. Its parser is embedded in JavaScript, so consumers do not host a separate `.wasm` asset. React 19 is not excluded by the package's `react: "*"` peer, but that declaration is not a Next.js compatibility test. [Getting started][start]; [web guide][web]; [manifest][manifest].

The web guide calls the output plain React/DOM, but still prescribes `react-native-web` as a bundler shim for shared `Platform` and `processColor` helpers. It documents `.web` resolution, a `react-native` alias, `__DEV__`, and handling for strict ESM, the WASM glue, and KaTeX's CommonJS loader. Some missing rules silently produce raw Markdown or raw math rather than a build error. The older [v1.1.1 web README][release-web] says no React Native Web dependency is needed; the [released style helper][release-style] still imports `react-native`. Treat the newer, more specific setup guide as evidence of integration work, not proof of plug-and-play compatibility.

For this app, the inference is that the DOM build could run in Chromium/Electron once bundling works. Installing the library would not turn Electron into a native React Native text host. No verified Next.js 16.3/Turbopack recipe or Electron-specific test was established by this research. The web component parses in an effect, initially returns `null`, and emits no Markdown during SSR. [Web guide][web]; [web component source][component].

Native adoption has different requirements: Fabric/New Architecture, currently documented React Native 0.83+, Android API 24+, native rebuilding, CocoaPods on iOS, and macOS 14+ through React Native macOS. Expo needs a development build rather than Expo Go. Optional native math/highlighting assets are downloaded by `postinstall`; package-manager script restrictions and Yarn PnP matter. Feature flags live in `package.json`. These native build requirements are not requirements for rendering DOM in Electron, although package installation can still run the asset downloader. [Installation][install]; [compatibility][compat]; [native assets][assets].

### Markdown, math, and customization

The documented web renderer supports headings, emphasis, lists, links, images, blockquotes, code, thematic breaks, and GFM tables/task lists/strikethrough/autolinks. Current source also documents GitHub admonitions and optional underline, superscript, subscript, and highlight extensions. Web always enables GFM; the native `flavor` switch is ignored. Raw HTML is generally unsupported, with a documented block-video exception. Spoiler nodes currently lose their enclosed text on web. [Feature support][features]; [known limitations][limits].

Web math uses the optional KaTeX peer in MathML mode; native math uses RaTeX. Missing KaTeX falls back to TeX source. This app already has KaTeX, but its delimiter compatibility, math recovery, sizing, and copy behavior still need comparison against the new parser/output. Shared engine names do not establish parity. [Web guide][web]; [web math source][math]; [MessageResponse](../components/ai-elements/message.tsx).

The current public custom-renderer API replaces standalone images, links, and video blocks. It is not Streamdown's arbitrary HTML-element override API. No documented code/table/math override or Mermaid renderer was found; the inspected web code renderer produces `<pre><code>`. Porting the app's existing block components would therefore need an integration approach beyond copying its `components` object. [Custom renderer guide][renderers]; [code renderer source][blocks].

### Selection and copying

On native, selection menus support rich-format copy, a separate Copy as Markdown action, image URL copy, and custom actions. Native GitHub-flavor output is segmented, and selection cannot cross segment boundaries; CommonMark uses one text view. These are native behaviors, not web benefits. [Copy guide][copy].

On web, ordinary browser selection remains available. `selectable` and `selectionColor` work; `selectionMenuConfig`, `contextMenuItems`, `enableBlockContextMenu`, and `onCopyPress` are stripped. The library never writes to the clipboard and has no web code-copy button. The native segmentation restriction does not apply to its DOM renderer. The optional code-click callback checks for a noncollapsed selection before activating, a useful interaction detail to borrow. [Web guide][web]; [prop filter][props]; [code renderer source][blocks].

### Highlighting and streaming

Native code highlighting uses tree-sitter with configured grammars and foreground token colors. Untagged or unavailable languages stay plain. The web build has no syntax highlighting, language header, or copy button; `syntaxColors` has no effect. Replacing the current renderer would lose the app's Shiki presentation unless it were reintroduced separately. [Highlighting guide][highlight]; [web guide][web].

Native `streamingAnimation` animates appended text. With GitHub flavor, `streamingConfig` controls progressive or hidden incomplete blocks, and highlighting waits for a closing fence. Both props are ignored on web: updating the Markdown string renders another snapshot without those incomplete-block controls. The source parses the supplied string in an effect; async parsing alone does not establish worker execution or incomplete-syntax repair. [Streaming guide][streaming]; [web component][component]; [parser bridge][parser].

Software Mansion's sibling `react-native-streamdown` adds remend repair and Worklets Bundle Mode for React Native, with its own Metro setup. It is a different package from the Vercel Streamdown already installed here. Vercel's renderer explicitly handles incomplete Markdown, and its code plugin uses Shiki. There is no established reason to replace those working web facilities with the native wrapper. [Official streaming guide][streaming]; [Streamdown docs](https://streamdown.ai/docs); [code plugin docs](https://streamdown.ai/docs/plugins/code).

### License

Enriched Markdown is MIT-licensed; its license requires retaining the copyright and permission notice in copies or substantial portions. Installed Streamdown and its code/math plugin manifests declare Apache-2.0. These are license facts, not a legal compatibility assessment. [Enriched Markdown license][license]; [Streamdown package metadata](https://registry.npmjs.org/streamdown/2.5.0); local plugin manifests under `node_modules/@streamdown/`.

## Recommendations for this app

These are proposals inferred from the evidence, not implementation decisions or measured improvements.

1. Keep Streamdown as the main renderer. Enriched Markdown's strongest selection, highlighting, and streaming capabilities are native-only. Its web renderer adds integration work while leaving this app's important custom blocks to be rebuilt. Consider native SDKs only for a separately chosen native client; this research makes no roadmap assumption.
2. Keep Shiki and source-copy controls while implementing the owner's approved frameless code treatment. Short examples can omit the gutter; longer blocks and explicit numbering metadata can retain it. Borrow the native highlighter's visual principle: token color can distinguish syntax while font size, weight, and line height stay consistent. This is a presentation change in the existing renderer, not a reason to replace it.
3. Protect ordinary selection across prose and code. Borrow the code-click selection guard if future block actions are added. Keep actions on separate buttons, exclude controls and line-number decoration from copied text, and validate whitespace-preserving code selection. These are verification targets; this research did not diagnose a selection defect.
4. If the human wants a learning action on selected text, prototype a small app-owned "Explain selection" or "Ask about selection" action using browser selection. Enriched Markdown does not provide that menu on web. Preserve keyboard copy and browser selection, and distinguish copying rendered text from copying original Markdown or TeX. Mapping an arbitrary rendered selection back to exact source needs explicit work; whole-block source copy already exists.
5. Require a feature-parity trial before any replacement. Pin the candidate release, then validate production bundling and packaged Electron, initial render, progressive incomplete code/links/tables/math, Shiki language coverage, fence metadata, Mermaid, callouts, CJK and hard breaks, math recovery, source copying, and selection across blocks while content updates. Test against the actual installed archive. No benchmark or end-to-end candidate integration was run, so no speed, memory, or selection-stability advantage is claimed.

## 2026-10-26 follow-up: context, wrapping, practice, and links

This pass covers the four requested UI changes, extending the earlier scope to practice placement and overflow. The getting-started URL again failed web fetch; its [official source][start] and the linked upstream docs/source were re-read at the same pinned commit above. These are research proposals for the parent's UI plan, not approved implementation choices. T3 Code Nightly is the user's visual reference; this pass did not inspect its implementation.

Rich Markdown presentation fits these requirements. Adopting Enriched Markdown is optional and does not resolve the app-owned layout and navigation decisions.

| Requested behavior | What Enriched Markdown contributes on web | Recommendation for this app |
| --- | --- | --- |
| Compact collapsible follow-up context, source-session pill, formatted goal/summary | The display renders formatted prose, but its built-in pills work only on iOS/Android. Web ignores `linkVariants[pattern].pill` and `linkPillContent`. `renderers.link` can replace a standalone link paragraph, not an inline link in surrounding prose. [Pill guide][pills]; [custom renderers][renderers]. | Propose an app-owned disclosure and source-link pill, with the existing Markdown renderer for goal/summary. The current working-tree [follow-up marker](../src/core/followup-session.ts) already carries `sourceChatId`, `sourceTitle`, `goal`, and `context`; use those fields rather than parsing its generated prose. The human still chooses disclosure defaults, labels, and pill appearance. |
| Long URLs/text stay within the column | DOM rendering does not itself guarantee wrapping. The inspected [web styles][web-styles] set typography, but supply no general long-token wrapping rule; code, display math, and table wrappers use horizontal overflow. Native pill truncation is unavailable on web. | Propose CSS containment and wrapping in the current renderer and its flex/grid ancestors, with `min-width: 0` where needed and `overflow-wrap: anywhere` for prose/link text. The [CSS specification][wrap-spec] defines emergency breaks and their contribution to intrinsic sizing. Installed Streamdown already puts `wrap-anywhere` on links, so check ancestors and computed styles before attributing overflow to the renderer. Review `white-space` overrides separately. Decide wide table/equation/code behavior explicitly; prose wrapping cannot guarantee those structures fit. |
| Practice tables/equations in the main lesson, without a nested vertical dock scroller | The display supports GFM tables and KaTeX math. Tables still scroll horizontally on web, and `table.horizontalOverflow` is ignored. It does not determine where the practice statement lives. [Web guide][web]; [math renderer][math]. | This is a placement change. [ProblemCard](../components/practice-cards.tsx) already renders the statement with `ToolContentResponse` in the transcript; [PracticeDock](../components/practice-dock.tsx) renders it again inside a capped `overflow-y-auto` area. Propose making the transcript statement the reading location and revising dock contents in the human-approved plan. Keep the existing [table and equation components](../components/md-blocks.tsx), including source-copy actions. |
| Direct new-tab links, without Streamdown's confirmation dialog | Default web links use `target="_blank"` and `rel="noopener noreferrer"`, with no confirmation UI in the [link renderer][web-inline]. | Keep Streamdown and propose `linkSafety={{ enabled: false }}`, the [documented direct-opening setting][link-safety]. Installed `2.5.0` exposes this API and, when disabled, renders an anchor targeting `_blank`. Replacing the renderer is unnecessary. |

### Link interception and caller-owned components

Enriched Markdown's `onLinkPress` is navigation interception, not a custom inline React renderer. On web, providing it makes the default anchor call `preventDefault()` and invoke the callback with `{ url }`; omitting it preserves the anchor's new-tab behavior. A handler intended only for source-session links must also handle other URLs, since registering it intercepts ordinary clicks on all default links. `linkRecognition` can recognize extra text/code patterns as links, but does not create DOM pills. [Inline source][web-inline]; [API reference][display-api].

A replacement standalone-link component handles its own presses; `onLinkPress`/`onLinkLongPress` do not fire for it. A source pill rendered beside the Markdown by the caller likewise owns its navigation. With Streamdown, `components.a` can replace inline anchors if a pill really must occur inside prose; the override then owns the anchor attributes, styles, and click behavior. [Enriched API][display-api]; [Streamdown component contract][streamdown-components].

Electron needs a separate decision. This app's [window handler](../electron/main.cjs) denies child windows and sends their URLs to `shell.openExternal`. Thus `_blank` requests go to the system browser; neither Markdown library supplies internal application tabs. Agree how internal `/chat/...` source links should navigate and what "new tab" means in the packaged app before implementation.

### Limits that matter for this decision

- These are display requirements. `EnrichedMarkdownText` consumes Markdown; `EnrichedMarkdownTextInput` is a separate experimental `contentEditable` web editor with a smaller feature set and no working link/mention creation commands. An editor migration adds no required capability here. [Getting started][start]; [web editor][web-editor].
- Ordinary DOM selection is available, but native selection menus, rich-copy integration, and `onCopyPress` are absent on web. A new disclosure/pill still needs keyboard operation and selection checks. No evidence here establishes more stable selection during updates. [Web guide][web].
- Native streaming animation and incomplete-block controls are ignored on web; updated Markdown is parsed asynchronously, initially rendering nothing, including during SSR. Code highlighting is also absent. The documented bundler rules do not establish a tested Next.js 16/Turbopack integration. Retain the earlier release/source caveat. [Web guide][web]; [component source][component].
- Streamdown's available incomplete-Markdown support should not be confused with this app's active settings: [MessageResponse](../components/ai-elements/message.tsx) explicitly passes `parseIncompleteMarkdown={false}` and selects static mode while `streaming` is true. Preserve or change that policy only through the UI plan. No candidate integration, browser reproduction, or performance measurement was run.

Recommend keeping Streamdown/KaTeX/Shiki and proposing the app-component, CSS, practice-placement, and link-setting changes above. Before approval, settle disclosure defaults, source-link navigation, and overflow behavior for wide structured content. Verification should cover long unbroken text at narrow widths, formatted goal/summary, selection across blocks, practice tables/math in the main scroller, and ordinary/modifier clicks in both browser and packaged Electron. Only this research note was changed.

[start]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/introduction/getting-started.mdx
[npm]: https://registry.npmjs.org/react-native-enriched-markdown
[manifest]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/package.json
[web]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/guides/web-support.md
[release-web]: https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/docs/WEB.md
[release-style]: https://github.com/software-mansion/enriched-markdown/blob/v1.1.1/packages/react-native-enriched-markdown/src/styleUtils.ts
[component]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/EnrichedMarkdownText.tsx
[install]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/basics/installation.mdx
[compat]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/misc/compatibility.mdx
[assets]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/guides/native-assets.md
[features]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/introduction/supported-features.md
[limits]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/misc/known-limitations.md
[math]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/renderers/KaTeXRenderer.tsx
[renderers]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/guides/custom-block-renderers.md
[blocks]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/renderers/BlockRenderers.tsx
[copy]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/user-experience/copy-options.md
[props]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/nativeProps.ts
[highlight]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/rich-text-formatting/code-highlighting.md
[streaming]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/rich-text-formatting/markdown-streaming.md
[parser]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/parseMarkdown.ts
[license]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/LICENSE
[pills]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/guides/link-pills.md
[web-inline]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/renderers/InlineRenderers.tsx
[web-styles]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/packages/react-native-enriched-markdown/src/web/styles.ts
[display-api]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/api-reference/enriched-markdown-text.md
[web-editor]: https://github.com/software-mansion/enriched-markdown/blob/32f6f0c101a75db67f5728f7682d38f28bfd82d8/docs/docs/react-native/guides/web-editor.md
[wrap-spec]: https://drafts.csswg.org/css-text-3/#overflow-wrap-property
[link-safety]: https://streamdown.ai/docs/link-safety
[streamdown-components]: https://streamdown.ai/docs/components
