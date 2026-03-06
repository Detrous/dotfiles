/**
 * ask_user tool
 *
 * Gives the model a structured, interactive way to ask the user questions
 * instead of writing them as plain text in a response.
 *
 * - Single question  → simple option list or freeform input
 * - Multiple questions → tabbed interface, one tab per question + a Submit tab
 *
 * Non-interactive fallback: returns the questions as text so the model can
 * at least read the answers from the user's next message.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ─── types ────────────────────────────────────────────────────────────────────

interface Option {
	value: string;
	label: string;
	description?: string;
}

type RenderOption = Option & { isOther?: boolean };

interface NormalizedQuestion {
	id: string;
	label: string; // short tab label, always set after normalization
	prompt: string;
	options?: Option[];
	allow_other: boolean;
}

interface Answer {
	id: string;
	value: string;
	label: string;
	was_custom: boolean;
	index?: number;
}

interface AskResult {
	answers: Answer[];
	cancelled: boolean;
}

// ─── schema ───────────────────────────────────────────────────────────────────

const OptionSchema = Type.Object({
	value: Type.String({ description: "Value returned when this option is selected" }),
	label: Type.String({ description: "Text shown in the list" }),
	description: Type.Optional(Type.String({ description: "Hint shown below the label" })),
});

const QuestionSchema = Type.Object({
	id: Type.String({
		description: "Unique key for this question, used as the answer key in results",
	}),
	label: Type.Optional(
		Type.String({
			description: "Short tab label for multi-question forms, e.g. 'Framework'. Defaults to truncated prompt.",
		}),
	),
	prompt: Type.String({ description: "The question text shown to the user" }),
	options: Type.Optional(
		Type.Array(OptionSchema, {
			description: "Choices to show. Omit for freeform text only.",
		}),
	),
	allow_other: Type.Optional(
		Type.Boolean({
			description:
				"Add a 'Type something…' freeform option alongside the provided choices. Default: true when options are given.",
		}),
	),
});

const Params = Type.Object({
	questions: Type.Array(QuestionSchema, {
		description:
			"One or more questions to ask. A single question shows a simple list; multiple show a tabbed interface.",
	}),
});

// ─── extension ────────────────────────────────────────────────────────────────

export default function askUserExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ask_user",
		label: "Ask User",
		description:
			"Ask the user one or more questions via an interactive TUI form. Use this instead of writing questions in your response. Supports option lists and freeform answers.",
		promptSnippet: "Ask the user one or more questions via interactive form (option list or freeform)",
		promptGuidelines: [
			"Use ask_user instead of writing clarification questions in plain text — it gives the user a proper interactive form.",
			"Batch all related questions into a single ask_user call rather than asking one at a time.",
			"Provide explicit options when the answer is likely one of a few known values; set allow_other=true to also accept freeform input.",
			"Omit options entirely when the answer is open-ended — the user will get a text input.",
			"Call ask_user before starting work whenever the task requirements are ambiguous.",
		],
		parameters: Params,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (params.questions.length === 0) {
				return {
					content: [{ type: "text", text: "Error: no questions provided" }],
					details: { answers: [], cancelled: true } as AskResult,
				};
			}

			const questions: NormalizedQuestion[] = params.questions.map((q) => ({
				id: q.id,
				label: q.label ?? shorten(q.prompt, 20),
				prompt: q.prompt,
				options: q.options,
				allow_other: q.allow_other ?? true,
			}));

			// ── non-interactive fallback ─────────────────────────────────────────
			if (!ctx.hasUI) {
				const text = questions
					.map((q) => {
						const opts = q.options?.map((o, i) => `  ${i + 1}. ${o.label}`).join("\n") ?? "";
						return opts ? `${q.prompt}\n${opts}` : q.prompt;
					})
					.join("\n\n");
				return {
					content: [
						{
							type: "text",
							text: `Questions (non-interactive — please answer in your next message):\n\n${text}`,
						},
					],
					details: { answers: [], cancelled: false } as AskResult,
				};
			}

			const isMulti = questions.length > 1;
			const totalTabs = questions.length + 1; // questions + Submit tab

			const result = await ctx.ui.custom<AskResult | null>((tui, theme, _kb, done) => {
				let currentTab = 0;
				let optionIndex = 0;
				let inputMode = false;
				let inputQid: string | null = null;
				let cachedLines: string[] | undefined;
				const answers = new Map<string, Answer>();

				// ── inline editor for "Type something…" ──────────────────────────
				const editorTheme: EditorTheme = {
					borderColor: (s) => theme.fg("accent", s),
					selectList: {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					},
				};
				const editor = new Editor(tui, editorTheme);

				// ── helpers ───────────────────────────────────────────────────────
				function refresh() {
					cachedLines = undefined;
					tui.requestRender();
				}

				function currentQ(): NormalizedQuestion | undefined {
					return questions[currentTab];
				}

				function currentOpts(): RenderOption[] {
					const q = currentQ();
					if (!q) return [];
					// No options at all → freeform only
					if (!q.options || q.options.length === 0) {
						return [{ value: "__other__", label: "Type something…", isOther: true }];
					}
					const base: RenderOption[] = [...q.options];
					if (q.allow_other) base.push({ value: "__other__", label: "Type something…", isOther: true });
					return base;
				}

				function allAnswered() {
					return questions.every((q) => answers.has(q.id));
				}

				function saveAnswer(qid: string, value: string, label: string, wasCustom: boolean, index?: number) {
					answers.set(qid, { id: qid, value, label, was_custom: wasCustom, index });
				}

				function advance() {
					if (!isMulti) {
						done({ answers: Array.from(answers.values()), cancelled: false });
						return;
					}
					currentTab = currentTab < questions.length - 1 ? currentTab + 1 : questions.length;
					optionIndex = 0;
					refresh();
				}

				editor.onSubmit = (value) => {
					if (!inputQid) return;
					const trimmed = value.trim() || "(no response)";
					saveAnswer(inputQid, trimmed, trimmed, true);
					inputMode = false;
					inputQid = null;
					editor.setText("");
					advance();
				};

				// ── input handler ─────────────────────────────────────────────────
				function handleInput(data: string) {
					// Edit mode: route to inline editor
					if (inputMode) {
						if (matchesKey(data, Key.escape)) {
							inputMode = false;
							inputQid = null;
							editor.setText("");
							refresh();
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					// Tab navigation (multi-question only)
					if (isMulti) {
						if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
							currentTab = (currentTab + 1) % totalTabs;
							optionIndex = 0;
							refresh();
							return;
						}
						if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
							currentTab = (currentTab - 1 + totalTabs) % totalTabs;
							optionIndex = 0;
							refresh();
							return;
						}
					}

					// Submit tab
					if (currentTab === questions.length) {
						if (matchesKey(data, Key.enter) && allAnswered()) {
							done({ answers: Array.from(answers.values()), cancelled: false });
						} else if (matchesKey(data, Key.escape)) {
							done(null);
						}
						return;
					}

					// Option list navigation
					const opts = currentOpts();
					if (matchesKey(data, Key.up)) {
						optionIndex = Math.max(0, optionIndex - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						optionIndex = Math.min(opts.length - 1, optionIndex + 1);
						refresh();
						return;
					}

					// Select option / enter freeform
					if (matchesKey(data, Key.enter)) {
						const q = currentQ();
						const opt = opts[optionIndex];
						if (!q || !opt) return;
						if (opt.isOther) {
							inputMode = true;
							inputQid = q.id;
							refresh();
						} else {
							saveAnswer(q.id, opt.value, opt.label, false, optionIndex + 1);
							advance();
						}
						return;
					}

					if (matchesKey(data, Key.escape)) done(null);
				}

				// ── render ────────────────────────────────────────────────────────
				function render(width: number): string[] {
					if (cachedLines) return cachedLines;
					const lines: string[] = [];
					const add = (s: string) => lines.push(truncateToWidth(s, width));

					add(theme.fg("accent", "─".repeat(width)));

					// Tab bar (multi-question only)
					if (isMulti) {
						const parts: string[] = ["  "];
						for (let i = 0; i < questions.length; i++) {
							const active = i === currentTab;
							const done_ = answers.has(questions[i].id);
							const lbl = questions[i].label;
							const box = done_ ? "■" : "□";
							const text = ` ${box} ${lbl} `;
							parts.push(
								active
									? theme.bg("selectedBg", theme.fg("text", text)) + " "
									: theme.fg(done_ ? "success" : "muted", text) + " ",
							);
						}
						const isSubmitTab = currentTab === questions.length;
						const canSubmit = allAnswered();
						const submitText = " ✓ Submit ";
						parts.push(
							isSubmitTab
								? theme.bg("selectedBg", theme.fg("text", submitText))
								: theme.fg(canSubmit ? "success" : "dim", submitText),
						);
						add(parts.join(""));
						lines.push("");
					}

					const q = currentQ();
					const opts = currentOpts();

					if (currentTab === questions.length) {
						// ── Summary / submit tab ───────────────────────────────────
						add(theme.fg("accent", theme.bold(" Summary")));
						lines.push("");
						for (const question of questions) {
							const ans = answers.get(question.id);
							const key = theme.fg("muted", ` ${question.label}: `);
							if (ans) {
								const val = ans.was_custom
									? theme.fg("muted", "(wrote) ") + theme.fg("accent", ans.label)
									: theme.fg("accent", `${ans.index}. ${ans.label}`);
								add(key + val);
							} else {
								add(key + theme.fg("warning", "—"));
							}
						}
						lines.push("");
						if (allAnswered()) {
							add(theme.fg("success", " Enter to submit · Esc to cancel"));
						} else {
							const missing = questions
								.filter((qq) => !answers.has(qq.id))
								.map((qq) => qq.label)
								.join(", ");
							add(theme.fg("warning", ` Still needed: ${missing}`));
						}
					} else if (q) {
						// ── Question tab ───────────────────────────────────────────
						add(theme.fg("text", ` ${q.prompt}`));
						lines.push("");

						for (let i = 0; i < opts.length; i++) {
							const opt = opts[i];
							const sel = i === optionIndex;
							const prefix = sel ? theme.fg("accent", "> ") : "  ";
							const optLabel =
								opt.isOther && inputMode
									? theme.fg("accent", `${i + 1}. ${opt.label} ✎`)
									: theme.fg(sel ? "accent" : "text", `${i + 1}. ${opt.label}`);
							add(prefix + optLabel);
							if (opt.description) add(`     ${theme.fg("muted", opt.description)}`);
						}

						if (inputMode) {
							lines.push("");
							add(theme.fg("muted", " Your answer:"));
							for (const l of editor.render(width - 2)) add(` ${l}`);
						}
					}

					// Help line
					lines.push("");
					if (inputMode) {
						add(theme.fg("dim", " Enter to submit · Esc to go back"));
					} else if (isMulti) {
						add(theme.fg("dim", " Tab/←→ switch · ↑↓ navigate · Enter select · Esc cancel"));
					} else {
						add(theme.fg("dim", " ↑↓ navigate · Enter select · Esc cancel"));
					}
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => {
						cachedLines = undefined;
					},
					handleInput,
				};
			});

			// Cancelled, or custom() returned undefined (RPC mode / unsupported context)
			if (!result) {
				return {
					content: [{ type: "text", text: "User cancelled" }],
					details: { answers: [], cancelled: true } as AskResult,
				};
			}

			const lines = result.answers.map((a) => {
				const q = questions.find((qq) => qq.id === a.id);
				const label = q?.label ?? a.id;
				return a.was_custom
					? `${label}: user wrote: ${a.label}`
					: `${label}: user selected option ${a.index}: ${a.label}`;
			});

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: result,
			};
		},

		// ── renderCall ───────────────────────────────────────────────────────────
		renderCall(args, theme) {
			const qs = (args.questions as Array<{ id: string; label?: string; prompt: string }>) ?? [];
			const labels = qs.map((q) => q.label ?? shorten(q.prompt, 25)).join(", ");
			return new Text(
				theme.fg("toolTitle", theme.bold("ask_user ")) +
					theme.fg("muted", `${qs.length} question${qs.length !== 1 ? "s" : ""}`) +
					(labels ? theme.fg("dim", ` · ${labels}`) : ""),
				0,
				0,
			);
		},

		// ── renderResult ─────────────────────────────────────────────────────────
		renderResult(result, _opts, theme) {
			const details = result.details as AskResult | undefined;
			if (!details || details.cancelled || details.answers.length === 0) {
				return new Text(theme.fg("warning", "✗ cancelled"), 0, 0);
			}
			const lines = details.answers.map((a) => {
				const val = a.was_custom
					? theme.fg("muted", "(wrote) ") + theme.fg("accent", a.label)
					: theme.fg("accent", `${a.index !== undefined ? `${a.index}. ` : ""}${a.label}`);
				return `${theme.fg("success", "✓ ")}${theme.fg("dim", a.id + ": ")}${val}`;
			});
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}

function shorten(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
