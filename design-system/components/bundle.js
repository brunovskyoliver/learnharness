/* @ds-bundle: {"format":4,"namespace":"StudyInk","components":[{"name":"PrimaryAction"},{"name":"SendButton"},{"name":"TurnStrip"},{"name":"ChoiceRow"},{"name":"Confidence"},{"name":"AnswerField"},{"name":"PromptToolbar"},{"name":"UserTurn"}]} */
(function () {
	"use strict";
	var React = window.React;
	var h = React.createElement;

	function cx() {
		return Array.prototype.filter.call(arguments, Boolean).join(" ");
	}

	function Icon(props) {
		return h("svg", { "aria-hidden": "true", width: props.size || 16, height: props.size || 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" }, props.children);
	}
	var paths = {
		up: h("path", { d: "M12 19V5M6 11l6-6 6 6" }),
		right: h("path", { d: "M5 12h14M13 6l6 6-6 6" }),
		down: h("path", { d: "m6 9 6 6 6-6" })
	};

	/* The labelled primary action: Submit answer, Next problem, Stop. */
	function PrimaryAction(props) {
		var quiet = props.quiet, icon = props.icon, rest = Object.assign({}, props);
		delete rest.quiet; delete rest.icon;
		return h("button", Object.assign({ type: "button" }, rest, { className: cx("prompt-primary", props.className), "data-quiet": quiet ? "" : undefined }),
			icon === "stop" ? h("svg", { "aria-hidden": "true", width: 10, height: 10, viewBox: "0 0 10 10" }, h("rect", { width: 10, height: 10, rx: 2, fill: "currentColor" })) : null,
			props.children,
			icon === "next" ? h(Icon, { size: 14 }, paths.right) : null);
	}

	/* The plain-chat send: the only fully round control. */
	function SendButton(props) {
		return h("button", { type: "button", className: "prompt-submit", "aria-label": props.label || "Send", title: props.label || "Send", disabled: props.disabled, onClick: props.onClick }, h(Icon, null, paths.up));
	}

	/* Zone 1: whose turn it is and what kind. */
	function TurnStrip(props) {
		return h("div", { className: "turn-strip" },
			h("span", { className: "turn-label" }, "Your turn"),
			props.teaser
				? h("span", { className: "turn-teaser" }, h("span", { style: { color: "var(--foreground)", fontWeight: 500 } }, props.kind + " · "), props.teaser)
				: h("span", { className: "turn-kind" }, props.kind),
			props.teaser ? null : h("span", { style: { flex: 1 } }),
			props.teaser
				? h(PrimaryAction, { quiet: true, onClick: props.onAction }, props.actionLabel || "Answer")
				: props.onCollapse ? h("button", { type: "button", "aria-label": "Collapse", onClick: props.onCollapse, className: "prompt-trigger", style: { width: 36, justifyContent: "center", padding: 0 } }, h(Icon, null, paths.down)) : null);
	}

	/* One answer option. */
	function ChoiceRow(props) {
		return h("button", { type: "button", role: props.multi ? "checkbox" : "radio", "aria-checked": !!props.selected, className: "choice", onClick: props.onSelect },
			h("span", { className: "choice-mark", style: props.multi ? { borderRadius: 4 } : undefined }),
			h("span", null, props.children));
	}

	var STOPS = ["Guessing", "Unsure", "Fairly sure", "Certain"];
	/* Four confidence stops plus the deliberate non-answer. */
	function Confidence(props) {
		var value = props.value == null ? 1 : props.value;
		return h("div", { className: "confidence" },
			h("span", { className: "confidence-label" }, "Confidence"),
			h("div", { role: "radiogroup", "aria-label": "Confidence that your selected answer is correct", className: "confidence-track", style: props.dontKnow ? { opacity: 0.4, pointerEvents: "none" } : undefined },
				STOPS.map(function (label, i) {
					return h("button", { key: label, type: "button", role: "radio", "aria-checked": !props.dontKnow && value === i, onClick: function () { props.onChange && props.onChange(i); } }, label);
				})),
			h("button", { type: "button", className: "dont-know", "aria-pressed": !!props.dontKnow, onClick: props.onDontKnow }, "I don't know"));
	}

	/* Zone 3: the answer field, directly on the shell with a visible label. */
	function AnswerField(props) {
		var id = props.id || "answer";
		return h("div", { className: "answer-field" },
			props.label ? h("label", { htmlFor: id, className: "answer-label" }, props.label) : null,
			h("textarea", { id: id, rows: props.rows || 1, className: "answer-input", "aria-label": props.label || props.placeholder, placeholder: props.label ? undefined : props.placeholder, defaultValue: props.defaultValue }));
	}

	/* Zone 4: controls on the left, one primary action on the right. */
	function PromptToolbar(props) {
		return h("div", { className: "prompt-toolbar" },
			h("div", { className: "prompt-controls" }, props.setup || props.controls),
			props.hint ? h("span", { className: "prompt-hint", "aria-hidden": "true" }, props.hint) : null,
			props.children);
	}

	/* The learner's own message in the transcript. */
	function UserTurn(props) {
		return h("div", { className: "user-turn" },
			h("div", { className: "user-turn-label" }, "You"),
			h("div", { className: "user-turn-text" }, props.children));
	}

	window.StudyInk = { PrimaryAction: PrimaryAction, SendButton: SendButton, TurnStrip: TurnStrip, ChoiceRow: ChoiceRow, Confidence: Confidence, AnswerField: AnswerField, PromptToolbar: PromptToolbar, UserTurn: UserTurn };
})();
