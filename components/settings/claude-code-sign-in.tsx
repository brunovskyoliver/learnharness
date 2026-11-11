"use client";
/**
 * Hosted Claude Code sign-in (feature 029, US2b; contracts/settings-ui.md,
 * owner copy O1). A `ConnectionRow` with the current user's status and the
 * lazy `ConnectionDialog`: choose a method, open Anthropic's page, paste the
 * code. The code lives only in the uncontrolled field until it is sent in a
 * POST body; the field is emptied on submit and unmounts on close, so it is
 * never kept in state, a URL, storage or a log.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { RadioGroup } from "radix-ui";
import type { ClaudeCodeAuthStatus, ClaudeCodePendingSignIn, ClaudeCodeSignInMethod } from "@/src/core";
import { notifySettingsSaved } from "@/components/settings-signal";
import { InkWait } from "@/components/paper/blot";
import { useArrowChoice } from "@/components/paper/shared";
import { ConnectionDialog, ConnectionFooter, ConnectionRow } from "./connection-controls";

const HEADERS = { "x-learnharness-claude-code": "1" } as const;
const ENDPOINT = "/api/claude-code/auth";
export const SIGN_IN_COPY = {
	row: "Claude account",
	title: "Sign in to Claude Code",
	instructions: "Open Anthropic's sign-in page, sign in, then paste the code it shows.",
	expired: "This sign-in expired. Start again.",
	notStarted: "Sign-in could not be started.",
	signOutFailed: "Sign-out could not be completed.",
	statusFailed: "Sign-in status could not be checked",
} as const;
/** Not owner-approved wording (reported): a code request that got no reply. */
const NO_REPLY = "Sign-in failed: no reply from the server.";
const METHODS: { value: ClaudeCodeSignInMethod; name: string; hint: string }[] = [
	{ value: "claudeai", name: "Claude subscription", hint: "Pro or Max plan" },
	{ value: "console", name: "Anthropic Console", hint: "API usage billing" },
];

type RowState = { kind: "checking" } | { kind: "failed" } | { kind: "known"; auth: ClaudeCodeAuthStatus };
type Step = { kind: "method"; starting: boolean; error: string | null }
	| { kind: "code"; pending: ClaudeCodePendingSignIn; submitting: boolean; error: string | null; restart: boolean };

/** "12 Dec" in the viewer's zone, or null when the CLI gave no expiry. */
export function signInExpiry(expiresAt: string | null): string | null {
	if (!expiresAt) return null;
	const time = Date.parse(expiresAt);
	return Number.isFinite(time) ? new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
}

/** The row's status words (O1). Method `other` reads plain "Signed in" (orchestrator, progress.md). */
export function signInStatusLabel(row: RowState): string {
	if (row.kind === "checking") return "Checking…";
	if (row.kind === "failed" || row.auth.state === "unchecked") return SIGN_IN_COPY.statusFailed;
	if (row.auth.state === "signed-out") return "Signed out";
	const method = row.auth.method === "claude-subscription" ? "Claude subscription" : row.auth.method === "console" ? "Anthropic Console" : null;
	const until = signInExpiry(row.auth.expiresAt);
	return ["Signed in", method, until && `until ${until}`].filter(Boolean).join(" · ");
}

function isAuth(value: unknown): value is ClaudeCodeAuthStatus {
	if (!value || typeof value !== "object") return false;
	const auth = value as ClaudeCodeAuthStatus;
	return ["signed-in", "signed-out", "unchecked"].includes(auth.state)
		&& (auth.method === null || ["claude-subscription", "console", "other"].includes(auth.method))
		&& (auth.expiresAt === null || typeof auth.expiresAt === "string");
}
/** Only an https page on Anthropic's hosts is ever linked (the server checked it too). */
function isPending(value: unknown): value is ClaudeCodePendingSignIn {
	if (!value || typeof value !== "object") return false;
	const pending = value as ClaudeCodePendingSignIn;
	if (!["claudeai", "console"].includes(pending.method) || typeof pending.url !== "string" || typeof pending.expiresAt !== "string") return false;
	try {
		const url = new URL(pending.url);
		return url.protocol === "https:" && ["claude.com", "claude.ai", "console.anthropic.com", "platform.claude.com"].includes(url.hostname);
	} catch { return false; }
}
async function post(body: Record<string, string>, signal?: AbortSignal): Promise<{ status: number; json: Record<string, unknown> | null }> {
	const response = await fetch(ENDPOINT, { method: "POST", cache: "no-store", headers: { ...HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
	let json: Record<string, unknown> | null = null;
	try { json = await response.json() as Record<string, unknown>; } catch { /* not JSON */ }
	return { status: response.status, json };
}
const errorOf = (json: Record<string, unknown> | null) => typeof json?.error === "string" ? json.error : null;

export function ClaudeCodeSignIn() {
	const [row, setRow] = useState<RowState>({ kind: "checking" });
	const [rowError, setRowError] = useState<string | null>(null);
	const [signingOut, setSigningOut] = useState(false);
	const [step, setStep] = useState<Step | null>(null);
	const read = useRef<AbortController | null>(null);
	const mounted = useRef(true);
	// Bumped on close: a start that resolves after it is cancelled, not shown.
	const attempt = useRef(0);
	const startAfterClose = useRef(false);

	const refresh = useCallback(async () => {
		read.current?.abort();
		const controller = new AbortController();
		read.current = controller;
		setRow({ kind: "checking" });
		try {
			const response = await fetch(ENDPOINT, { cache: "no-store", headers: HEADERS, signal: controller.signal });
			const body = await response.json() as { auth?: unknown };
			if (!response.ok || !isAuth(body.auth)) throw new Error("status unavailable");
			if (!controller.signal.aborted) setRow({ kind: "known", auth: body.auth });
		} catch {
			if (!controller.signal.aborted) setRow({ kind: "failed" });
		}
	}, []);
	useEffect(() => {
		mounted.current = true;
		void refresh();
		return () => { mounted.current = false; read.current?.abort(); };
	}, [refresh]);

	/** O6: the model picker and the installation row refetch; then this row re-reads. */
	const settle = (auth: ClaudeCodeAuthStatus) => {
		setRow({ kind: "known", auth });
		notifySettingsSaved("claudeCode");
		void refresh();
	};

	const signedIn = row.kind === "known" && row.auth.state === "signed-in";
	const signOut = async () => {
		if (signingOut) return;
		setSigningOut(true); setRowError(null);
		read.current?.abort();
		setRow({ kind: "checking" });
		try {
			const { status, json } = await post({ action: "sign-out" });
			if (!mounted.current) return;
			if (status !== 200) setRowError(errorOf(json) ?? SIGN_IN_COPY.signOutFailed);
			if (isAuth(json?.auth)) settle(json.auth);
			else void refresh();
		} catch {
			if (mounted.current) { setRowError(SIGN_IN_COPY.signOutFailed); void refresh(); }
		} finally {
			if (mounted.current) setSigningOut(false);
		}
	};

	const close = () => {
		if (!step || (step.kind === "code" && step.submitting)) return;
		const starting = step.kind === "method" && step.starting;
		attempt.current++;
		setStep(null);
		void post({ action: "cancel" }).catch(() => {});
		// A start still in flight registers its pending sign-in after this cancel: cancel it again then.
		if (starting) startAfterClose.current = true;
	};

	const start = async (method: ClaudeCodeSignInMethod) => {
		const mine = ++attempt.current;
		setStep({ kind: "method", starting: true, error: null });
		let next: Step;
		try {
			const { status, json } = await post({ action: "start", method });
			next = status === 200 && isPending(json?.pending)
				? { kind: "code", pending: json.pending, submitting: false, error: null, restart: false }
				: { kind: "method", starting: false, error: errorOf(json) ?? SIGN_IN_COPY.notStarted };
		} catch {
			next = { kind: "method", starting: false, error: SIGN_IN_COPY.notStarted };
		}
		if (!mounted.current || mine !== attempt.current) {
			if (startAfterClose.current) { startAfterClose.current = false; void post({ action: "cancel" }).catch(() => {}); }
			return;
		}
		setStep(next);
	};

	const submit = async (code: string) => {
		if (step?.kind !== "code" || step.submitting) return;
		const mine = attempt.current;
		const pending = step.pending;
		setStep({ kind: "code", pending, submitting: true, error: null, restart: false });
		let failure: { error: string; restart: boolean } | null = null;
		try {
			const { status, json } = await post({ action: "code", code });
			if (!mounted.current || mine !== attempt.current) return;
			if (status === 200 && isAuth(json?.auth)) { setStep(null); settle(json.auth); return; }
			if (status === 409) failure = { error: SIGN_IN_COPY.expired, restart: true };
			else failure = { error: errorOf(json) ?? NO_REPLY, restart: status !== 400 };
		} catch {
			if (!mounted.current || mine !== attempt.current) return;
			failure = { error: NO_REPLY, restart: true };
		}
		setStep({ kind: "code", pending, submitting: false, ...failure });
	};

	const expire = useCallback(() => setStep((current) => current?.kind === "code" && !current.submitting ? { ...current, error: SIGN_IN_COPY.expired, restart: true } : current), []);
	const busy = step?.kind === "code" ? step.submitting : step?.starting === true;
	return <>
		<ConnectionRow label={SIGN_IN_COPY.row} testid="claude-code-sign-in-row" actionTestid={signedIn ? "claude-code-sign-out" : "claude-code-sign-in"}
			action={signedIn ? "Sign out" : "Sign in"} actionVariant={signedIn ? "ghost" : "outline"} disabled={false}
			onAction={() => { if (signingOut) return; if (signedIn) void signOut(); else { setRowError(null); setStep({ kind: "method", starting: false, error: null }); } }}>
			<span role="status" className="text-meta text-graphite" data-testid="claude-code-sign-in-status">{signInStatusLabel(row)}</span>
		</ConnectionRow>
		{rowError && <p role="alert" className="pb-3 text-meta text-red" data-testid="claude-code-sign-in-row-error">{rowError}</p>}
		{step && <ConnectionDialog label={SIGN_IN_COPY.title} testid="claude-code-sign-in-dialog" backdropTestid="claude-code-sign-in-backdrop" busy={busy} onClose={close}>
			<SignInSteps step={step} onStart={(method) => void start(method)} onSubmit={(code) => void submit(code)} onRestart={() => setStep({ kind: "method", starting: false, error: null })} onCancel={close} onExpired={expire} />
		</ConnectionDialog>}
	</>;
}

function SignInSteps({ step, onStart, onSubmit, onRestart, onCancel, onExpired }: {
	step: Step; onStart: (method: ClaudeCodeSignInMethod) => void; onSubmit: (code: string) => void; onRestart: () => void; onCancel: () => void; onExpired: () => void;
}) {
	const titleId = useId(), fieldId = useId(), errorId = useId();
	const [method, setMethod] = useState<ClaudeCodeSignInMethod>("claudeai");
	// Arrows choose as well as move (the option cards' rule), as in the export dialog.
	const arrows = useArrowChoice(method, setMethod);
	const [hasCode, setHasCode] = useState(false);
	const field = useRef<HTMLInputElement>(null);
	const link = useRef<HTMLAnchorElement>(null);
	const methodGroup = useRef<HTMLDivElement>(null);
	const codeStep = step.kind === "code" ? step : null;
	const expired = codeStep?.restart === true;
	const expiresAt = codeStep?.pending.expiresAt;

	// Entering a step moves focus into it: the link first (it opens Anthropic's page), the chosen method on a restart.
	const kind = step.kind;
	useEffect(() => {
		if (kind === "code") link.current?.focus();
		else methodGroup.current?.querySelector<HTMLElement>('[data-state="checked"]')?.focus();
	}, [kind]);
	// The pending sign-in ends server-side at expiresAt; say so then, without a request.
	useEffect(() => {
		if (!expiresAt) return;
		const left = Date.parse(expiresAt) - Date.now();
		if (!Number.isFinite(left)) return;
		const timer = window.setTimeout(onExpired, Math.max(0, left));
		return () => window.clearTimeout(timer);
	}, [expiresAt, onExpired]);
	// Focus the failure's way forward once it shows.
	const restartButton = useRef<HTMLButtonElement>(null);
	// After a failure: the way forward (Start again), else back to the field for another paste.
	const failed = codeStep && !codeStep.submitting ? codeStep.error : null;
	useEffect(() => {
		if (!failed) return;
		if (expired) restartButton.current?.focus(); else field.current?.focus();
	}, [failed, expired]);

	const send = () => {
		const input = field.current;
		const code = input?.value.trim() ?? "";
		if (!input || !code || codeStep?.submitting || expired) return;
		input.value = "";
		setHasCode(false);
		onSubmit(code);
	};

	return <>
		<h2 id={titleId} className="lh-dialog-title">{SIGN_IN_COPY.title}</h2>
		{step.kind === "method" ? <>
			<RadioGroup.Root ref={methodGroup} aria-labelledby={titleId} value={method} onValueChange={(next) => setMethod(next as ClaudeCodeSignInMethod)} {...arrows}
				disabled={step.starting} loop className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2" data-testid="claude-code-sign-in-methods">
				{METHODS.map((m) => <RadioGroup.Item key={m.value} value={m.value} className="nb-option-card nb-set-card min-h-0" data-testid={`claude-code-method-${m.value}`}>
					<span className="nb-option-title">{m.name}</span>
					<span className="nb-option-description">{m.hint}</span>
				</RadioGroup.Item>)}
			</RadioGroup.Root>
			{step.error && <p role="alert" className="mt-3 text-meta text-red" data-testid="claude-code-sign-in-error">{step.error}</p>}
			<ConnectionFooter testid="claude-code-sign-in-footer">
				<button type="button" className="lh-text-action pointer-coarse:min-h-11" onClick={onCancel}>Cancel</button>
				<button type="button" className="nb-pill gap-1.5 pointer-coarse:min-h-11" aria-disabled={step.starting || undefined} data-testid="claude-code-sign-in-continue"
					onClick={() => { if (!step.starting) onStart(method); }}>{step.starting && <InkWait label="Checking…" size={12} />}Continue</button>
			</ConnectionFooter>
		</> : <form noValidate onSubmit={(event) => { event.preventDefault(); send(); }} data-testid="claude-code-sign-in-code-step">
			<p className="lh-dialog-text">{SIGN_IN_COPY.instructions}</p>
			<a ref={link} href={step.pending.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-md text-ink underline underline-offset-2 pointer-coarse:min-h-11" data-testid="claude-code-sign-in-link">
				Open sign-in page<span aria-hidden="true">&nbsp;↗</span>
			</a>
			<div className="mt-4 flex flex-col gap-1">
				<label htmlFor={fieldId} className="nb-set-row-label">Code</label>
				<input ref={field} id={fieldId} name="claude-code-sign-in-code" type="text" className="nb-set-input nb-set-mono" autoComplete="off" spellCheck={false} autoCapitalize="off" autoCorrect="off"
					data-1p-ignore data-lpignore="true" disabled={step.submitting || expired} aria-invalid={step.error ? true : undefined} aria-describedby={step.error ? errorId : undefined}
					onInput={(event) => setHasCode(event.currentTarget.value.trim() !== "")} data-testid="claude-code-sign-in-code" />
			</div>
			{step.error && <p id={errorId} role="alert" className="mt-3 text-meta text-red" data-testid="claude-code-sign-in-error">
				{step.error}
				{/* Its own line: inline, the focus ring crossed the wrapped message above. */}
				{step.restart && <> <span className="mt-1.5 block"><button ref={restartButton} type="button" className="lh-text-action underline underline-offset-2 pointer-coarse:min-h-11" onClick={onRestart} data-testid="claude-code-sign-in-restart">Start again</button></span></>}
			</p>}
			<ConnectionFooter testid="claude-code-sign-in-footer">
				<button type="button" className="lh-text-action pointer-coarse:min-h-11" disabled={step.submitting} onClick={onCancel}>Cancel</button>
				<button type="submit" className="nb-pill gap-1.5 pointer-coarse:min-h-11" disabled={!hasCode || step.submitting || expired} data-testid="claude-code-sign-in-submit">{step.submitting && <InkWait label="Checking…" size={12} />}Sign in</button>
			</ConnectionFooter>
		</form>}
	</>;
}
