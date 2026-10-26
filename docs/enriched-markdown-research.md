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

Scrolling behavior and fixes are outside this research's scope.

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
