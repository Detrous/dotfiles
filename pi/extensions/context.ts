/**
 * /context extension
 *
 * Opens a context inspector showing what is influencing the agent right now:
 * - Context window usage and top contributors
 * - AGENTS/CLAUDE files in load order
 * - Branch context injections (hidden/visible custom messages, compactions, branch summaries)
 * - Skills (available vs loaded)
 * - Active tools and their estimated token footprint
 * - Extensions (installed on disk vs runtime-visible)
 * - Session token and cost totals
 *
 * Keybindings: q/Esc/Enter close · r refresh · c compact · ↑↓/PgUp/PgDn scroll
 */

import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, normalize, relative, resolve, sep } from "node:path";

// ── constants ─────────────────────────────────────────────────────────────────

const SKILL_LOADED_ENTRY = "context:skill_loaded";

// ── types ─────────────────────────────────────────────────────────────────────

type ContextModalAction = "close" | "refresh" | "compact";

interface AgentFileInfo {
	path: string;
	displayPath: string;
	bytes: number;
	tokens: number;
}

interface ContributorInfo {
	id: string;
	label: string;
	kind: string;
	tokens: number;
	count?: number;
}

interface CustomMessageInfo {
	customType: string;
	display: boolean;
	tokens: number;
	preview: string;
}

interface CompactionInfo {
	summaryPreview: string;
	tokens: number;
	fromHook: boolean;
}

interface BranchSummaryInfo {
	summaryPreview: string;
	tokens: number;
	fromHook: boolean;
}

interface ContextSnapshot {
	usage: {
		reportedTokens: number | null;
		contextWindow: number;
		effectiveTokens: number;
		remainingTokens: number;
		percentUsed: number;
		systemPromptTokens: number;
		toolsTokens: number;
		agentTokens: number;
	} | null;
	contributors: ContributorInfo[];
	agentFiles: AgentFileInfo[];
	customMessages: CustomMessageInfo[];
	compactions: CompactionInfo[];
	branchSummaries: BranchSummaryInfo[];
	skills: { available: string[]; loaded: string[] };
	tools: { active: string[]; tokens: number };
	extensions: { installed: string[]; runtimeVisible: string[] };
	session: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		totalTokens: number;
		totalCost: number;
	};
	notes: string[];
}

// ── formatting helpers ────────────────────────────────────────────────────────

function formatUsd(cost: number): string {
	if (!cost || cost <= 0) return "$0.00";
	if (cost >= 1) return `$${cost.toFixed(2)}`;
	if (cost >= 0.1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(4)}`;
}

function estimateTokens(text: string): number {
	return Math.max(0, Math.ceil(text.length / 4));
}

function formatNum(n: number): string {
	return n.toLocaleString("en-US");
}

// ── path helpers ──────────────────────────────────────────────────────────────

function normalizePath(rawPath: string, cwd: string): string {
	let p = rawPath.replace(/^@/, "");
	if (p.startsWith("~")) p = homedir() + p.slice(1);
	if (!p.startsWith("/")) p = resolve(cwd, p);
	return normalize(p);
}

function displayPath(absPath: string, cwd: string): string {
	const rel = relative(cwd, absPath);
	if (!rel.startsWith("..")) return `./${rel}`;
	const home = homedir();
	if (absPath.startsWith(home + sep) || absPath === home) {
		return `~${absPath.slice(home.length)}`;
	}
	return absPath;
}

function extractPreview(content: unknown, maxLen = 90): string {
	let text = "";
	if (typeof content === "string") {
		text = content;
	} else if (Array.isArray(content)) {
		text = content
			.filter((c: any) => c?.type === "text")
			.map((c: any) => c.text ?? "")
			.join(" ");
	}
	const preview = text.replace(/\s+/g, " ").trim();
	return preview.length > maxLen ? preview.slice(0, maxLen - 1) + "…" : preview;
}

// ── agent dir helper ──────────────────────────────────────────────────────────

function getAgentDir(): string {
	const envKeys = Object.keys(process.env);
	// Prefer PI_, then TAU_, then any other *_CODING_AGENT_DIR
	const order = ["PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR", ...envKeys.filter((k) => k.endsWith("_CODING_AGENT_DIR") && k !== "PI_CODING_AGENT_DIR" && k !== "TAU_CODING_AGENT_DIR")];
	for (const key of order) {
		if (process.env[key]) return process.env[key]!;
	}
	return join(homedir(), ".pi", "agent");
}

// ── AGENTS file discovery ─────────────────────────────────────────────────────

function readFileIfExists(filePath: string): { content: string; bytes: number } | null {
	try {
		if (!existsSync(filePath)) return null;
		const content = readFileSync(filePath, "utf8");
		return { content, bytes: Buffer.byteLength(content, "utf8") };
	} catch {
		return null;
	}
}

function collectAgentFiles(cwd: string): AgentFileInfo[] {
	const agentDir = getAgentDir();
	const results: AgentFileInfo[] = [];
	const seen = new Set<string>();

	function tryDir(dir: string) {
		if (seen.has(dir)) return;
		seen.add(dir);
		for (const fname of ["AGENTS.md", "CLAUDE.md"]) {
			const fullPath = join(dir, fname);
			const file = readFileIfExists(fullPath);
			if (file) {
				results.push({
					path: fullPath,
					displayPath: displayPath(fullPath, cwd),
					bytes: file.bytes,
					tokens: estimateTokens(file.content),
				});
				break;
			}
		}
	}

	// 1. global agent dir
	tryDir(agentDir);

	// 2. ancestors from / down to cwd
	const parts = cwd.split(sep).filter(Boolean);
	for (let i = 0; i <= parts.length; i++) {
		const dir = sep + parts.slice(0, i).join(sep);
		tryDir(dir);
	}

	return results;
}

// ── extension filesystem discovery ───────────────────────────────────────────

async function collectInstalledExtensions(cwd: string): Promise<string[]> {
	const agentDir = getAgentDir();
	const locations = [join(agentDir, "extensions"), join(cwd, ".pi", "extensions")];
	const names: string[] = [];

	for (const dir of locations) {
		try {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isFile() && entry.name.endsWith(".ts")) {
					names.push(entry.name);
				} else if (entry.isDirectory()) {
					const indexPath = join(dir, entry.name, "index.ts");
					if (existsSync(indexPath)) names.push(`${entry.name}/index.ts`);
				}
			}
		} catch {
			// directory doesn't exist or unreadable
		}
	}

	return [...new Set(names)].sort();
}

// ── branch contributor extraction ────────────────────────────────────────────

function collectBranchContributors(ctx: ExtensionCommandContext) {
	const customMessages: CustomMessageInfo[] = [];
	const compactions: CompactionInfo[] = [];
	const branchSummaries: BranchSummaryInfo[] = [];

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom_message") {
			const raw = entry as any;
			const tokens = estimateTokens(typeof raw.content === "string" ? raw.content : JSON.stringify(raw.content ?? ""));
			customMessages.push({
				customType: raw.customType ?? "",
				display: raw.display === true,
				tokens,
				preview: extractPreview(raw.content),
			});
		} else if (entry.type === "compaction") {
			const raw = entry as any;
			compactions.push({
				summaryPreview: extractPreview(raw.summary ?? ""),
				tokens: estimateTokens(raw.summary ?? ""),
				fromHook: raw.fromHook === true,
			});
		} else if (entry.type === "branch_summary") {
			const raw = entry as any;
			branchSummaries.push({
				summaryPreview: extractPreview(raw.summary ?? ""),
				tokens: estimateTokens(raw.summary ?? ""),
				fromHook: raw.fromHook === true,
			});
		}
	}

	return { customMessages, compactions, branchSummaries };
}

// ── session totals ────────────────────────────────────────────────────────────

function collectSessionTotals(ctx: ExtensionCommandContext) {
	let input = 0,
		output = 0,
		cacheRead = 0,
		cacheWrite = 0,
		totalCost = 0;

	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "message") continue;
		const msg = entry.message as any;
		if (msg.role !== "assistant" || !msg.usage) continue;
		input += msg.usage.input ?? 0;
		output += msg.usage.output ?? 0;
		cacheRead += msg.usage.cacheRead ?? 0;
		cacheWrite += msg.usage.cacheWrite ?? 0;
		totalCost += msg.usage.cost?.total ?? 0;
	}

	return { input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite, totalCost };
}

// ── tool footprint ────────────────────────────────────────────────────────────

function collectToolInfo(pi: ExtensionAPI): { active: string[]; tokens: number } {
	const activeNames = pi.getActiveTools().sort();
	const descMap = new Map(pi.getAllTools().map((t) => [t.name, t.description ?? ""]));
	let tokens = 0;
	for (const name of activeNames) {
		const desc = descMap.get(name) ?? "";
		tokens += Math.ceil(estimateTokens(name + " " + desc) * 1.5);
	}
	return { active: activeNames, tokens };
}

// ── snapshot builder ──────────────────────────────────────────────────────────

async function buildContextSnapshot(pi: ExtensionAPI, ctx: ExtensionCommandContext, loadedSkills: Set<string>): Promise<ContextSnapshot> {
	const agentFiles = collectAgentFiles(ctx.cwd);
	const agentTokens = agentFiles.reduce((sum, f) => sum + f.tokens, 0);

	const { customMessages, compactions, branchSummaries } = collectBranchContributors(ctx);

	const toolInfo = collectToolInfo(pi);
	const contextUsage = ctx.getContextUsage();
	const systemPrompt = ctx.getSystemPrompt();
	const systemPromptTokens = estimateTokens(systemPrompt);

	const hiddenMsgTokens = customMessages.filter((m) => !m.display).reduce((s, m) => s + m.tokens, 0);
	const visibleMsgTokens = customMessages.filter((m) => m.display).reduce((s, m) => s + m.tokens, 0);
	const compactionTokens = compactions.reduce((s, c) => s + c.tokens, 0);
	const branchSummaryTokens = branchSummaries.reduce((s, b) => s + b.tokens, 0);

	let usage: ContextSnapshot["usage"] = null;
	if (contextUsage) {
		const reportedTokens = contextUsage.tokens;
		const contextWindow = contextUsage.contextWindow;
		const effectiveTokens = (reportedTokens ?? 0) + toolInfo.tokens;
		const remainingTokens = Math.max(0, contextWindow - effectiveTokens);
		const percentUsed = contextWindow > 0 ? (effectiveTokens / contextWindow) * 100 : 0;
		usage = { reportedTokens, contextWindow, effectiveTokens, remainingTokens, percentUsed, systemPromptTokens, toolsTokens: toolInfo.tokens, agentTokens };
	}

	const contributors: ContributorInfo[] = [
		{ id: "system", label: "System prompt", kind: "system", tokens: systemPromptTokens },
		{ id: "agents", label: "AGENTS files", kind: "agents", tokens: agentTokens, count: agentFiles.length },
		{ id: "tools", label: "Tool definitions", kind: "tools", tokens: toolInfo.tokens },
		{ id: "hidden-msgs", label: "Hidden messages", kind: "hidden-custom-message", tokens: hiddenMsgTokens, count: customMessages.filter((m) => !m.display).length },
		{ id: "compactions", label: "Compactions", kind: "compaction", tokens: compactionTokens, count: compactions.length },
		{ id: "branch-summaries", label: "Branch summaries", kind: "branch-summary", tokens: branchSummaryTokens, count: branchSummaries.length },
		{ id: "visible-msgs", label: "Visible messages", kind: "visible-custom-message", tokens: visibleMsgTokens, count: customMessages.filter((m) => m.display).length },
	];

	const allCommands = pi.getCommands();
	const skillCommands = allCommands.filter((c) => c.source === "skill");
	const availableSkills = skillCommands.map((c) => c.name.replace(/^skill:/, "")).sort();
	const loaded = Array.from(loadedSkills)
		.filter((s) => availableSkills.includes(s))
		.sort();

	const extensionCommands = allCommands.filter((c) => c.source === "extension");
	const runtimeVisible = [...new Set(extensionCommands.map((c) => (c.path ? basename(c.path, ".ts") : c.name)))].sort();
	const installed = await collectInstalledExtensions(ctx.cwd);

	const session = collectSessionTotals(ctx);

	const notes = [
		"Top contributors are approximate.",
		"Reported message tokens come from Pi runtime; itemized subtotals are estimated from text.",
		"Tool schema overhead is approximated (1.5× name+description estimate).",
		"Runtime-visible extensions are inferred from extension commands; commandless extensions may be missing.",
	];

	return { usage, contributors, agentFiles, customMessages, compactions, branchSummaries, skills: { available: availableSkills, loaded }, tools: toolInfo, extensions: { installed, runtimeVisible }, session, notes };
}

// ── text renderer ─────────────────────────────────────────────────────────────

function renderContextText(snapshot: ContextSnapshot): string {
	const lines: string[] = ["=== Context Inspector ===", ""];

	lines.push("WINDOW");
	if (snapshot.usage) {
		const u = snapshot.usage;
		const reported = u.reportedTokens !== null ? `~${formatNum(u.reportedTokens)}` : "unknown";
		lines.push(`  ${reported} / ${formatNum(u.contextWindow)} tokens (${u.percentUsed.toFixed(1)}% used)`);
		lines.push(`  ~${formatNum(u.remainingTokens)} tokens remaining`);
	} else {
		lines.push("  Window: unknown");
	}
	lines.push("");

	lines.push("TOP CONTRIBUTORS (approx)");
	const maxLabel = Math.max(...snapshot.contributors.map((c) => c.label.length));
	for (const c of snapshot.contributors) {
		const countStr = c.count !== undefined ? ` (${c.count})` : "";
		lines.push(`  ${(c.label + countStr).padEnd(maxLabel + 5)} ~${formatNum(c.tokens)}`);
	}
	lines.push("");

	lines.push("AGENTS LOAD ORDER");
	if (snapshot.agentFiles.length === 0) {
		lines.push("  (none)");
	} else {
		for (const f of snapshot.agentFiles) {
			lines.push(`  ${f.displayPath}   ${formatNum(f.bytes)} B   ~${formatNum(f.tokens)} tokens`);
		}
	}
	lines.push("");

	lines.push("BRANCH INJECTIONS");
	const hidden = snapshot.customMessages.filter((m) => !m.display);
	const visible = snapshot.customMessages.filter((m) => m.display);

	lines.push(`  Hidden messages (${hidden.length})`);
	if (hidden.length === 0) lines.push("    (none)");
	else hidden.forEach((m) => lines.push(`    [${m.customType}] ~${formatNum(m.tokens)} tokens: ${m.preview}`));

	lines.push(`  Visible messages (${visible.length})`);
	if (visible.length === 0) lines.push("    (none)");
	else visible.forEach((m) => lines.push(`    [${m.customType}] ~${formatNum(m.tokens)} tokens: ${m.preview}`));

	lines.push(`  Compactions (${snapshot.compactions.length})`);
	if (snapshot.compactions.length === 0) lines.push("    (none)");
	else snapshot.compactions.forEach((c) => lines.push(`    ~${formatNum(c.tokens)} tokens: ${c.summaryPreview}`));

	lines.push(`  Branch summaries (${snapshot.branchSummaries.length})`);
	if (snapshot.branchSummaries.length === 0) lines.push("    (none)");
	else snapshot.branchSummaries.forEach((b) => lines.push(`    ~${formatNum(b.tokens)} tokens: ${b.summaryPreview}`));
	lines.push("");

	lines.push("SKILLS");
	if (snapshot.skills.available.length === 0) {
		lines.push("  Available: (none)");
	} else {
		lines.push(`  Available (${snapshot.skills.available.length}): ${snapshot.skills.available.join(", ")}`);
		lines.push(`  Loaded (${snapshot.skills.loaded.length}): ${snapshot.skills.loaded.join(", ") || "(none)"}`);
		const unloaded = snapshot.skills.available.filter((s) => !snapshot.skills.loaded.includes(s));
		if (unloaded.length > 0) lines.push(`  Not loaded: ${unloaded.join(", ")}`);
	}
	lines.push("");

	lines.push(`ACTIVE TOOLS (~${formatNum(snapshot.tools.tokens)} tokens est.)`);
	lines.push(`  ${snapshot.tools.active.join(", ") || "(none)"}`);
	lines.push("");

	lines.push("EXTENSIONS");
	lines.push(`  Installed (${snapshot.extensions.installed.length}): ${snapshot.extensions.installed.join(", ") || "(none)"}`);
	lines.push(`  Runtime-visible (${snapshot.extensions.runtimeVisible.length}, best-effort): ${snapshot.extensions.runtimeVisible.join(", ") || "(none)"}`);
	lines.push("");

	lines.push("SESSION TOTALS");
	const s = snapshot.session;
	lines.push(`  Input: ${formatNum(s.input)}   Output: ${formatNum(s.output)}   Cache read: ${formatNum(s.cacheRead)}   Cache write: ${formatNum(s.cacheWrite)}`);
	lines.push(`  Total tokens: ${formatNum(s.totalTokens)}   Total cost: ${formatUsd(s.totalCost)}`);
	lines.push("");

	lines.push("NOTES");
	for (const note of snapshot.notes) {
		lines.push(`  ~ ${note}`);
	}

	return lines.join("\n");
}

// ── TUI component ─────────────────────────────────────────────────────────────

class ContextView {
	private snapshot: ContextSnapshot;
	private theme: Theme;
	private done: (action: ContextModalAction) => void;
	private tui: { requestRender(): void };
	private scrollOffset = 0;
	private cachedAllLines?: string[];
	private cachedWidth?: number;

	constructor(snapshot: ContextSnapshot, theme: Theme, done: (action: ContextModalAction) => void, tui: { requestRender(): void }) {
		this.snapshot = snapshot;
		this.theme = theme;
		this.done = done;
		this.tui = tui;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, "q") || matchesKey(data, Key.enter)) {
			this.done("close");
			return;
		}
		if (matchesKey(data, "r")) {
			this.done("refresh");
			return;
		}
		if (matchesKey(data, "c")) {
			this.done("compact");
			return;
		}
		const allLines = this.cachedAllLines ?? [];
		const visible = this.visibleHeight();
		const maxScroll = Math.max(0, allLines.length - visible);

		if (matchesKey(data, Key.up)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - visible);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.scrollOffset = Math.min(maxScroll, this.scrollOffset + visible);
			this.tui.requestRender();
			return;
		}
	}

	render(width: number): string[] {
		const th = this.theme;
		const allLines = this.getAllLines(width);
		const visible = this.visibleHeight();
		const total = allLines.length;
		const maxScroll = Math.max(0, total - visible);
		if (this.scrollOffset > maxScroll) this.scrollOffset = maxScroll;

		const sliced = allLines.slice(this.scrollOffset, this.scrollOffset + visible);
		const scrollInfo = maxScroll > 0 ? ` ${this.scrollOffset + 1}-${Math.min(this.scrollOffset + visible, total)}/${total}` : "";
		const helpText = `q/Esc close · r refresh · c compact · ↑↓/PgUp/PgDn scroll${scrollInfo}`;
		const titleText = " Context Inspector ";
		const titleWidth = titleText.length + 3;
		const remainingForBorder = Math.max(0, width - titleWidth);

		return [
			truncateToWidth(th.fg("accent", "───") + th.fg("accent", th.bold(titleText)) + th.fg("accent", "─".repeat(remainingForBorder)), width),
			...sliced,
			truncateToWidth(th.fg("accent", "─── ") + th.fg("dim", helpText) + th.fg("accent", " " + "─".repeat(Math.max(0, width - helpText.length - 5))), width),
		];
	}

	invalidate(): void {
		this.cachedAllLines = undefined;
		this.cachedWidth = undefined;
	}

	private visibleHeight(): number {
		const rows = (process.stdout as any).rows ?? 40;
		return Math.max(5, rows - 4);
	}

	private getAllLines(width: number): string[] {
		if (this.cachedAllLines && this.cachedWidth === width) return this.cachedAllLines;
		this.cachedAllLines = this.buildAllLines(width);
		this.cachedWidth = width;
		return this.cachedAllLines;
	}

	private add(lines: string[], s: string, width: number): void {
		lines.push(truncateToWidth(s, width));
	}

	private sectionHeader(title: string, width: number): string {
		const th = this.theme;
		const dots = Math.max(0, width - title.length - 2);
		return th.fg("accent", th.bold(` ${title}`)) + " " + th.fg("dim", "·".repeat(dots));
	}

	private buildAllLines(width: number): string[] {
		const th = this.theme;
		const snap = this.snapshot;
		const lines: string[] = [];
		const add = (s: string) => this.add(lines, s, width);
		const blank = () => lines.push("");

		blank();

		// ── Window ──────────────────────────────────────────────────────────────
		add(this.sectionHeader("Window", width));
		blank();

		if (snap.usage) {
			const u = snap.usage;
			const reported = u.reportedTokens !== null ? `~${formatNum(u.reportedTokens)}` : "unknown";
			const pct = u.percentUsed;
			const pctColor: string = pct >= 90 ? "error" : pct >= 70 ? "warning" : "success";
			add(`  ${th.fg("text", `${reported} / ${formatNum(u.contextWindow)}`)} ${th.fg("muted", "tokens")} ${th.fg(pctColor as any, `(${pct.toFixed(1)}% used)`)}  ${th.fg("dim", `·  ~${formatNum(u.remainingTokens)} remaining`)}`);
			blank();
			const barWidth = Math.max(10, width - 4);
			const usedCells = Math.max(0, Math.min(barWidth, Math.round((pct / 100) * barWidth)));
			const bar = th.fg(pctColor as any, "█".repeat(usedCells)) + th.fg("dim", "░".repeat(barWidth - usedCells));
			add(`  ${bar}`);
		} else {
			add(`  ${th.fg("muted", "Window: unknown")}`);
		}
		blank();

		// ── Top contributors ─────────────────────────────────────────────────────
		add(this.sectionHeader("Top contributors (approx)", width));
		blank();

		const maxLabel = Math.max(...snap.contributors.map((c) => c.label.length));
		for (const c of snap.contributors) {
			const countStr = c.count !== undefined ? th.fg("dim", ` (${c.count})`) : "";
			const isHiddenWithContent = c.kind === "hidden-custom-message" && c.tokens > 0;
			const tokenColor: string = isHiddenWithContent ? "warning" : c.tokens > 5000 ? "accent" : "muted";
			const label = th.fg("muted", c.label.padEnd(maxLabel));
			const tokens = th.fg(tokenColor as any, `~${formatNum(c.tokens)}`);
			add(`  ${label}${countStr}  ${tokens}`);
		}
		blank();

		// ── AGENTS load order ────────────────────────────────────────────────────
		add(this.sectionHeader("AGENTS load order", width));
		blank();

		if (snap.agentFiles.length === 0) {
			add(`  ${th.fg("dim", "(none)")}`);
		} else {
			for (const f of snap.agentFiles) {
				const dp = th.fg("accent", f.displayPath);
				const info = th.fg("muted", `  ${formatNum(f.bytes)} B  ~${formatNum(f.tokens)} tokens`);
				add(`  ${dp}${info}`);
			}
		}
		blank();

		// ── Branch injections ────────────────────────────────────────────────────
		add(this.sectionHeader("Branch injections", width));
		blank();

		const hidden = snap.customMessages.filter((m) => !m.display);
		const visible = snap.customMessages.filter((m) => m.display);

		const hiddenTitle = hidden.length > 0 ? th.fg("warning", th.bold(`  Hidden messages (${hidden.length})`)) : th.fg("muted", `  Hidden messages (0)`);
		add(hiddenTitle);
		if (hidden.length === 0) {
			add(`    ${th.fg("dim", "(none)")}`);
		} else {
			for (const m of hidden) {
				add(`    ${th.fg("warning", `[${m.customType}]`)} ${th.fg("muted", `~${formatNum(m.tokens)} tokens`)}${th.fg("dim", `: ${m.preview}`)}`);
			}
		}
		blank();

		add(`  ${th.fg("muted", `Visible messages (${visible.length})`)}`);
		if (visible.length === 0) {
			add(`    ${th.fg("dim", "(none)")}`);
		} else {
			for (const m of visible) {
				add(`    ${th.fg("accent", `[${m.customType}]`)} ${th.fg("muted", `~${formatNum(m.tokens)} tokens`)}${th.fg("dim", `: ${m.preview}`)}`);
			}
		}
		blank();

		add(`  ${th.fg("muted", `Compactions (${snap.compactions.length})`)}`);
		if (snap.compactions.length === 0) {
			add(`    ${th.fg("dim", "(none)")}`);
		} else {
			for (const c of snap.compactions) {
				const hook = c.fromHook ? th.fg("dim", " [ext]") : "";
				add(`    ${th.fg("muted", `~${formatNum(c.tokens)} tokens`)}${hook}${th.fg("dim", `: ${c.summaryPreview}`)}`);
			}
		}
		blank();

		add(`  ${th.fg("muted", `Branch summaries (${snap.branchSummaries.length})`)}`);
		if (snap.branchSummaries.length === 0) {
			add(`    ${th.fg("dim", "(none)")}`);
		} else {
			for (const b of snap.branchSummaries) {
				const hook = b.fromHook ? th.fg("dim", " [ext]") : "";
				add(`    ${th.fg("muted", `~${formatNum(b.tokens)} tokens`)}${hook}${th.fg("dim", `: ${b.summaryPreview}`)}`);
			}
		}
		blank();

		// ── Skills ───────────────────────────────────────────────────────────────
		add(this.sectionHeader("Skills", width));
		blank();

		if (snap.skills.available.length === 0) {
			add(`  ${th.fg("dim", "Available: (none)")}`);
		} else {
			const loadedSet = new Set(snap.skills.loaded);
			const skillItems = snap.skills.available
				.map((s) => (loadedSet.has(s) ? th.fg("success", `${s} ✓`) : th.fg("muted", s)))
				.join(th.fg("dim", ", "));
			add(`  ${th.fg("dim", "Available:")} ${skillItems}`);

			const loadedStr =
				snap.skills.loaded.length > 0
					? snap.skills.loaded
							.map((s) => th.fg("success", s))
							.join(th.fg("dim", ", "))
					: th.fg("dim", "(none)");
			add(`  ${th.fg("dim", "Loaded:")} ${loadedStr}`);
		}
		blank();

		// ── Active tools ─────────────────────────────────────────────────────────
		add(this.sectionHeader("Active tools", width));
		blank();

		add(`  ${th.fg("dim", `${snap.tools.active.length} tools · ~${formatNum(snap.tools.tokens)} tokens est.`)}`);
		if (snap.tools.active.length === 0) {
			add(`  ${th.fg("dim", "(none)")}`);
		} else {
			const toolStr = snap.tools.active.map((t) => th.fg("accent", t)).join(th.fg("dim", ", "));
			add(`  ${toolStr}`);
		}
		blank();

		// ── Extensions ───────────────────────────────────────────────────────────
		add(this.sectionHeader("Extensions", width));
		blank();

		const installedStr = snap.extensions.installed.length > 0 ? snap.extensions.installed.join(", ") : "(none)";
		add(`  ${th.fg("muted", `Installed (${snap.extensions.installed.length}):`)} ${th.fg("text", installedStr)}`);

		const runtimeStr = snap.extensions.runtimeVisible.length > 0 ? snap.extensions.runtimeVisible.join(", ") : "(none)";
		add(`  ${th.fg("muted", `Runtime-visible (${snap.extensions.runtimeVisible.length}, best-effort):`)} ${th.fg("text", runtimeStr)}`);
		add(`  ${th.fg("dim", "Commandless extensions may not appear in runtime-visible list.")}`);
		blank();

		// ── Session totals ───────────────────────────────────────────────────────
		add(this.sectionHeader("Session totals", width));
		blank();

		const s = snap.session;
		add(`  ${th.fg("muted", "Input:")} ${th.fg("text", formatNum(s.input))}  ${th.fg("muted", "Output:")} ${th.fg("text", formatNum(s.output))}  ${th.fg("muted", "Cache read:")} ${th.fg("text", formatNum(s.cacheRead))}  ${th.fg("muted", "Cache write:")} ${th.fg("text", formatNum(s.cacheWrite))}`);
		add(`  ${th.fg("muted", "Total tokens:")} ${th.fg("accent", formatNum(s.totalTokens))}  ${th.fg("muted", "Cost:")} ${th.fg("accent", formatUsd(s.totalCost))}`);
		blank();

		// ── Notes ────────────────────────────────────────────────────────────────
		add(this.sectionHeader("Notes", width));
		blank();

		for (const note of snap.notes) {
			add(`  ${th.fg("dim", `~ ${note}`)}`);
		}
		blank();

		return lines;
	}
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function contextExtension(pi: ExtensionAPI) {
	const loadedSkillsCache = new Set<string>();
	let sessionCwd = process.cwd();

	function buildSkillIndex(): Map<string, { name: string; dir: string }> {
		const index = new Map<string, { name: string; dir: string }>();
		for (const cmd of pi.getCommands()) {
			if (cmd.source !== "skill" || !cmd.path) continue;
			const name = cmd.name.replace(/^skill:/, "");
			const filePath = normalize(cmd.path.startsWith("/") ? cmd.path : resolve(sessionCwd, cmd.path));
			const dir = dirname(filePath);
			index.set(filePath, { name, dir });
		}
		return index;
	}

	function reconstructLoadedSkills(ctx: { sessionManager: { getBranch(): any[] } }) {
		loadedSkillsCache.clear();
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "custom" && entry.customType === SKILL_LOADED_ENTRY) {
				const skill = entry.data?.skill;
				if (typeof skill === "string") loadedSkillsCache.add(skill);
			}
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		sessionCwd = ctx.cwd;
		reconstructLoadedSkills(ctx);
	});
	pi.on("session_switch", async (_event, ctx) => {
		sessionCwd = ctx.cwd;
		reconstructLoadedSkills(ctx);
	});
	pi.on("session_fork", async (_event, ctx) => reconstructLoadedSkills(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructLoadedSkills(ctx));

	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName !== "read" || event.isError) return;
		const rawPath = event.input?.path;
		if (typeof rawPath !== "string") return;

		const skillIndex = buildSkillIndex();
		if (skillIndex.size === 0) return;

		const normalized = normalizePath(rawPath, sessionCwd);

		let bestMatch: string | null = null;
		let bestLen = -1;
		for (const [filePath, info] of skillIndex) {
			if (normalized === filePath || normalized.startsWith(info.dir + sep)) {
				if (info.dir.length > bestLen) {
					bestLen = info.dir.length;
					bestMatch = info.name;
				}
			}
		}

		if (bestMatch && !loadedSkillsCache.has(bestMatch)) {
			loadedSkillsCache.add(bestMatch);
			pi.appendEntry(SKILL_LOADED_ENTRY, { skill: bestMatch });
		}
	});

	pi.registerCommand("context", {
		description: "Show current context, prompt contributors, skills, tools, and session usage",
		handler: async (_args, ctx) => {
			let action: ContextModalAction = "refresh";

			while (action === "refresh") {
				const snapshot = await buildContextSnapshot(pi, ctx, loadedSkillsCache);

				if (!ctx.hasUI) {
					const text = renderContextText(snapshot);
					pi.sendMessage({ customType: "context-report", content: text, display: true });
					return;
				}

				action =
					(await ctx.ui.custom<ContextModalAction>((tui, theme, _kb, done) => {
						const view = new ContextView(snapshot, theme, done, tui);
						return {
							render: (w: number) => view.render(w),
							handleInput: (data: string) => view.handleInput(data),
							invalidate: () => view.invalidate(),
						};
					})) ?? "close";

				if (action === "compact") {
					ctx.compact({
						onComplete: () => ctx.ui.notify("Compaction complete", "success"),
						onError: (err) => ctx.ui.notify(`Compaction failed: ${err.message}`, "error"),
					});
					ctx.ui.notify("Compaction started…", "info");
					return;
				}
			}
		},
	});
}
