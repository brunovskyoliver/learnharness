"use client";

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, PanelRightOpenIcon, MaximizeIcon, XIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { InvertDiscIcon } from "@/components/artifacts/invert-disc";
import { ChatActionsContext } from "@/components/chat";
import { downloadFile, slugFilename } from "@/components/artifacts/download";
import { DispatchCard } from "@/components/artifacts/dispatch-card";
import { injectDemoTheme, DEMO_APPEARANCE_PROPERTIES, demoAppearanceVars, type ArtifactPartProps, type DemoResult } from "@/src/core";
import { useAppearance } from "@/components/settings/appearance";
import { useDemoPresentation } from "@/components/artifacts/demo-presentation";
import { useDemoPanel } from "@/components/artifacts/demo-panel-context";

/**
 * Demo artifact card (W6): while the part is input-available, a job activity
 * card (the chat view's jobs feed — the job-card idiom); when output-available, the demo
 * runs in a SANDBOXED iframe (sandbox="allow-scripts", no allow-same-origin →
 * no access to app storage/cookies/DOM).
 *
 * The bridge script (contracts.ts "Demo iframe bridge") is auto-injected into
 * every demo by buildDemoSrcDoc — never the model's job: ResizeObserver →
 * postMessage {type:"demo-resize",height} (parent sizes the iframe) and
 * window.onerror → {type:"demo-error",message} (error chip on the card, with
 * a "Send to teacher" button that feeds the error back into the lesson — the
 * fix loop).
 *
 * Bridge message handling is a pure function (reduceDemoBridgeState) so
 * tests cover it without a DOM.
 */

// ─── bridge injection + message handling (pure, testable) ───────────────────

const THEME_PROPERTIES = JSON.stringify([...Object.keys(DEMO_APPEARANCE_PROPERTIES), "--lh-font"]);

export const DEMO_BRIDGE_SCRIPT = `<script>(function(){
var send=function(m){try{parent.postMessage(m,"*")}catch(e){}};
var post=function(){
var b=document.body;
if(!b){send({type:"demo-resize",height:document.documentElement.scrollHeight});return}
var h=Math.max(b.scrollHeight,b.getBoundingClientRect().height);
var cs=getComputedStyle(b);
h+=(parseFloat(cs.marginTop)||0)+(parseFloat(cs.marginBottom)||0);
send({type:"demo-resize",height:Math.ceil(h)})
};
if(typeof ResizeObserver!=="undefined"){new ResizeObserver(post).observe(document.documentElement)}
window.addEventListener("resize",post);
window.addEventListener("load",post);
window.addEventListener("keydown",function(e){if(e.key==="Escape"){e.preventDefault();e.stopPropagation();send({type:"demo-close-focus"})}});
window.addEventListener("message",function(e){if(e.source!==parent||!e.data)return;
if(e.data.type==="lh-demo-theme"&&e.data.vars&&typeof e.data.vars==="object"&&!Array.isArray(e.data.vars)){
var rules=document.querySelector("style[data-lh-theme]");var root=rules&&rules.sheet&&Array.from(rules.sheet.cssRules).find(function(r){return r.selectorText===":root"});
if(root){var allowed=${THEME_PROPERTIES};allowed.forEach(function(k){var v=e.data.vars[k];if(typeof v!=="string"||v.length>512)return;var prop=k==="--lh-font"?"font-family":k==="--lh-heading-weight"?"font-weight":"color";if(CSS.supports(prop,v))root.style.setProperty(k,v)});window.dispatchEvent(new Event("lh-demo-theme"))}
}
if(e.data.type==="lh-demo-size"&&typeof e.data.size==="number"&&e.data.size>=12&&e.data.size<=48)document.documentElement.style.setProperty("--lh-demo-size",e.data.size+"px");
if(e.data.type==="lh-demo-preview"){try{var s=Array.from(document.querySelectorAll("svg")).find(function(x){var r=x.getBoundingClientRect();return r.width>80&&r.height>80}),c=document.querySelector("canvas");var url=s?"data:image/svg+xml;charset=utf-8,"+encodeURIComponent(new XMLSerializer().serializeToString(s)):c?c.toDataURL():null;if(url&&url.length<2000000)send({type:"demo-preview",url:url})}catch(_){}}
});
window.addEventListener("error",function(e){send({type:"demo-error",message:e.message||String(e)})});
setTimeout(post,50);
setTimeout(post,400);
})();</script>`;

/** The app theme first in <head> (src/core/demo-theme.ts), then the bridge
 *  before </body> (or at the end of a body-less document). */
export function buildDemoSrcDoc(html: string): string {
	const themed = injectDemoTheme(html, true);
	if (/<\/body>/i.test(themed)) return themed.replace(/<\/body>/i, `${DEMO_BRIDGE_SCRIPT}</body>`);
	return `${themed}${DEMO_BRIDGE_SCRIPT}`;
}

/** The demo as a file that opens on its own: theme included, and kit
 *  scripts and the font loaded from this app's address. */
export function downloadableDemo(html: string, origin = typeof window === "undefined" ? "" : window.location.origin): string {
	return injectDemoTheme(html, true).replace(/(src="|href="|url\(")\/(demo-kit|fonts)\//g, (_m, lead: string, dir: string) => `${lead}${origin}/${dir}/`);
}

export interface DemoBridgeState {
	height: number | null;
	error: string | null;
}

export const INITIAL_DEMO_BRIDGE_STATE: DemoBridgeState = { height: null, error: null };

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 2400;

/** Pure reducer over incoming postMessage data (contracts.ts DemoBridgeMessage). */
export function reduceDemoBridgeState(state: DemoBridgeState, data: unknown): DemoBridgeState {
	if (typeof data !== "object" || data === null) return state;
	const message = data as { type?: unknown; height?: unknown; message?: unknown };
	if (message.type === "demo-resize") {
		if (typeof message.height !== "number" || !Number.isFinite(message.height) || message.height <= 0) return state;
		const height = Math.min(Math.max(Math.round(message.height), MIN_HEIGHT), MAX_HEIGHT);
		return height === state.height ? state : { ...state, height };
	}
	if (message.type === "demo-error") {
		const text = typeof message.message === "string" && message.message.trim() ? message.message : "unknown error";
		return text === state.error ? state : { ...state, error: text };
	}
	return state;
}

// ─── the demo card ──────────────────────────────────────────────────────────

/** The demo tool-call box: the part's output is the dispatch ack — the box
 * is the DispatchCard (live status via the chat view's jobs feed). The demo
 * itself renders from the steer message via DemoOutputCard. */
export function DemoCard({ part }: ArtifactPartProps) {
	if (part.state !== "output-available") return null;
	return <DispatchCard toolCallId={part.toolCallId} kind="demo" />;
}

/** The demo artifact — exported: the steer card renders the delivered
 *  result. `messageId` + `initialInverted` carry the PERSISTED invert
 *  switch (details.ui.inverted via the artifact-ui route, owner 2026-10-07). */
export function DemoOutputCard({
	output,
	messageId,
	initialInverted = false,
}: {
	output: unknown;
	messageId?: string;
	initialInverted?: boolean;
}) {
	const result = output as DemoResult | undefined;
	if (!result || typeof result.html !== "string" || typeof result.title !== "string") {
		return (
			<div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
				Demo completed, but the result could not be displayed.
			</div>
		);
	}
	const failed = result.html.length === 0;
	if (failed) {
		return (
			<div className="rounded-xl border bg-card p-4 text-card-foreground" data-testid="demo-card-failed">
				<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
					Demo
					<span className="rounded bg-destructive/15 px-1.5 py-0.5 text-destructive">failed</span>
				</div>
				<p className="mt-2 text-sm text-muted-foreground">{result.notes ?? "The demo could not be built."}</p>
			</div>
		);
	}
	return (
		<DemoFrame title={result.title} html={result.html} messageId={messageId} initialInverted={initialInverted} />
	);
}

export function DemoFrame({
	title,
	html,
	messageId,
	initialInverted = false,
	variant = "card",
}: {
	title: string;
	html: string;
	messageId?: string;
	initialInverted?: boolean;
	/** "panel": the side panel supplies its own header; no card frame. */
	variant?: "card" | "panel";
}) {
	const actions = useContext(ChatActionsContext);
	const { appearance } = useAppearance();
	const panel = useDemoPanel();
	const iframeRef = useRef<HTMLIFrameElement | null>(null);
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const focusOrigin = useRef<{ left: number; top: number; width: number; height: number } | null>(null);
	const focusInvoker = useRef<HTMLElement | null>(null);
	const [focused, setFocused] = useState(false);
	const [preview, setPreview] = useState<string | null>(null);
	const [state, setState] = useState<DemoBridgeState>(INITIAL_DEMO_BRIDGE_STATE);
	const inWorkspace = !!messageId && panel?.openId === messageId;
	const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
	useLayoutEffect(() => { setActionsTarget(inWorkspace ? document.querySelector<HTMLElement>("[data-demo-actions]") : null); }, [inWorkspace]);
	const previewHeight = useRef(360);
	useLayoutEffect(() => { if (!inWorkspace && !focused && dialogRef.current) previewHeight.current = dialogRef.current.getBoundingClientRect().height; });
	useEffect(() => {
		if (!inWorkspace || panel?.panelIndex === undefined) return;
		const select = () => iframeRef.current?.contentWindow?.postMessage({ type: "lh-demo-select", panel: panel.panelIndex }, "*");
		select();
		const frame = iframeRef.current;
		frame?.addEventListener("load", select);
		frame?.addEventListener("lh-demo-ready", select);
		return () => { frame?.removeEventListener("load", select); frame?.removeEventListener("lh-demo-ready", select); };
	}, [inWorkspace, panel?.panelIndex]);
	const bounds = useDemoPresentation(dialogRef, iframeRef, inWorkspace, focused, focusOrigin, focusInvoker);
	useEffect(() => {
		if (inWorkspace) iframeRef.current?.contentWindow?.postMessage({ type: "lh-demo-preview" }, "*");
	}, [inWorkspace, state.height]);
	useEffect(() => {
		const sendAppearance = () => {
			const size = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lh-prose-size")) || 17;
			iframeRef.current?.contentWindow?.postMessage({ type: "lh-demo-size", size }, "*");
			const styles = getComputedStyle(document.documentElement);
			const vars = demoAppearanceVars((name) => styles.getPropertyValue(name), appearance.fontFamily);
			iframeRef.current?.contentWindow?.postMessage({ type: "lh-demo-theme", vars }, "*");
		};
		const observer = new MutationObserver(sendAppearance);
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
		iframeRef.current?.addEventListener("load", sendAppearance);
		sendAppearance();
		return () => { observer.disconnect(); iframeRef.current?.removeEventListener("load", sendAppearance); };
	}, [appearance.fontFamily]);
	// Brightness inversion (owner, 2026-10-07): the switch state PERSISTS on
	// the steer record (details.ui.inverted) — seeded here, written through
	// the silent artifact-ui route on toggle. Without a chat page (tests,
	// previews) the toggle stays local-only. Light demos built before the
	// dark default seed inverted (demoPrefersInvert). The filter rides the
	// iframe element, so one filter flips page + content together while
	// hue-rotate(180deg) undoes invert's hue flip.
	const [inverted, setInverted] = useState(initialInverted);
	const toggleInverted = (next: boolean) => {
		setInverted(next);
		if (!actions?.chatId || !messageId) return;
		void fetch(`/api/chats/${actions.chatId}/artifact-ui`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ input: { messageId, inverted: next } }),
		}).catch(() => {});
	};
	const srcDoc = useMemo(() => buildDemoSrcDoc(html), [html]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			// Only messages from THIS demo's iframe (the sandbox gives it an
			// opaque origin; the window reference still matches).
			if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
			if (event.data?.type === "demo-focus" && Number.isInteger(event.data.panel) && event.data.panel >= 0) {
				const box = event.data.bounds;
				const frameBox = iframeRef.current.getBoundingClientRect();
				if (box && [box.left, box.top, box.width, box.height].every((x) => typeof x === "number" && Number.isFinite(x)) && box.width > 0 && box.height > 0) {
					focusOrigin.current = { left: frameBox.left + box.left, top: frameBox.top + box.top, width: box.width, height: box.height };
				}
				focusInvoker.current = iframeRef.current;
				setFocused(true);
			}
			if (event.data?.type === "demo-ready") { iframeRef.current.dispatchEvent(new Event("lh-demo-ready")); iframeRef.current.contentWindow?.postMessage({ type: "lh-demo-preview" }, "*"); }
			if (event.data?.type === "demo-close-focus") setFocused(false);
			if (event.data?.type === "demo-preview" && typeof event.data.url === "string" && event.data.url.length < 2_000_000 && /^data:image\/(png|svg\+xml)/.test(event.data.url)) setPreview(event.data.url);
			setState((prev) => reduceDemoBridgeState(prev, event.data));
		};
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, []);

	const controls = (
		<div className="flex shrink-0 items-center gap-1.5">
			<button type="button" aria-label={focused ? "Close expanded demo" : "Expand demo"} onClick={(event) => { if (!focused) focusInvoker.current = event.currentTarget; focusOrigin.current = dialogRef.current?.getBoundingClientRect() ?? null; setFocused(!focused); }} className="ui-icon-button">{focused ? <XIcon className="ui-icon" /> : <MaximizeIcon className="ui-icon" />}</button>
			<button type="button" aria-label="Invert demo brightness" title="Invert colors" aria-pressed={inverted} onClick={() => toggleInverted(!inverted)} className="ui-icon-button"><InvertDiscIcon className="ui-icon" /></button>
			<button
				type="button"
				aria-label="Download demo as HTML"
				title="Download as HTML"
				onClick={() => downloadFile(`${slugFilename(title)}.html`, downloadableDemo(html), "text/html")}
				data-testid="demo-download"
				className="ui-icon-button"
			>
				<DownloadIcon className="ui-icon" />
			</button>
			{variant === "card" && !inWorkspace && panel && messageId && (
				<button
					type="button"
					aria-label="Open in side panel"
					title="Open in side panel"
					onClick={() => panel.open(messageId)}
					data-testid="demo-open-panel"
					className="ui-icon-button"
				>
					<PanelRightOpenIcon className="ui-icon" />
				</button>
			)}
		</div>
	);

	const frame = (
		<>
			{state.error && (
				<DemoErrorChip
					title={title}
					message={state.error}
					onSend={actions ? () => actions.sendText(`The demo "${title}" threw an error: ${state.error}`) : undefined}
				/>
			)}
			<iframe
				ref={iframeRef}
				title={title}
				// allow-scripts ONLY — no allow-same-origin: the demo can run code
				// but never touch the app's storage, cookies, or DOM.
				sandbox="allow-scripts"
				srcDoc={srcDoc}
				// scrolling OFF (owner, 2026-10-07): the bridge auto-sizes the
				// iframe to its content, so an internal scrollbar can only appear
				// before the first resize lands — and a scrollable iframe TRAPS
				// the wheel (session scrolling stalls over the demo). With
				// scrolling disabled the wheel chains straight to the session.
				scrolling={inWorkspace || focused ? "auto" : "no"}
				// White backing only under inversion (it flips to black); dark
				// demos sit on the card color.
				className={`w-full ${inverted ? "bg-white" : "bg-background"}`}
				// content-box: the bridge reports the CONTENT height — with the
				// preflight's border-box the 2px border would eat into it and clip
				// the bottom of the demo (smoke finding, 2026-10-07).
				style={{
					height: inWorkspace || focused ? "100%" : state.height ?? 360,
					minHeight: 0,
					flex: inWorkspace || focused ? 1 : undefined,
					boxSizing: "content-box",
					filter: inverted ? "invert(1) hue-rotate(180deg)" : undefined,
				}}
				data-testid="demo-iframe"
			/>
		</>
	);

	return (
		<div className="lh-breakout demo-artifact py-4 text-foreground" data-testid="demo-card">
			{(inWorkspace || focused) && <div className="demo-inline-preview" style={{ minHeight: focused && !inWorkspace ? previewHeight.current : undefined }}>
				{/* The image is an in-memory sandbox snapshot, not an optimizable URL. */}
				{/* eslint-disable-next-line @next/next/no-img-element */}
				{preview && <img src={preview} alt={`Preview of ${title}`} className="max-h-48 w-full object-contain" />}
				<p className="text-sm font-medium">{title}</p>
				<button type="button" className="mt-2 text-sm underline underline-offset-4" onClick={() => { setFocused(false); if (messageId) panel?.open(messageId); }}>Open in workspace</button>
			</div>}
			<dialog ref={dialogRef} open aria-label={title} data-demo-live={messageId} data-focused={focused || undefined}
				onCancel={(e) => { e.preventDefault(); setFocused(false); }}
				onKeyDown={(e) => { if (focused) e.stopPropagation(); if (e.key === "Escape" && focused) { e.preventDefault(); e.stopPropagation(); const menu = (e.target as HTMLElement).closest("details[open]"); if (menu) menu.removeAttribute("open"); else setFocused(false); } }}
				className={`demo-live ${focused ? "demo-live-focus" : inWorkspace ? "demo-live-workspace" : "demo-live-inline"}`}
				style={bounds ? { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height } : undefined}>
				{inWorkspace && !focused && actionsTarget ? createPortal(controls, actionsTarget) : <div className="flex shrink-0 items-center justify-between gap-2 pb-2">
					<span className="min-w-0 truncate text-sm font-medium">{title}</span>{controls}
				</div>}
				{frame}
			</dialog>
		</div>
	);

}

export function DemoErrorChip({
	title,
	message,
	onSend,
}: {
	title: string;
	message: string;
	onSend?: () => void;
}) {
	return (
		<div
			className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
			data-testid="demo-error-chip"
		>
			<span className="font-medium">This demo threw an error</span>
			<span className="min-w-0 flex-1 truncate font-mono text-xs" title={message}>
				{message}
			</span>
			{onSend && (
				<button
					type="button"
					onClick={onSend}
					className="rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium hover:bg-destructive/15"
					data-testid="demo-error-send"
				>
					Send to teacher
				</button>
			)}
		</div>
	);
}
