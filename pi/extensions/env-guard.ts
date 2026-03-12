/**
 * env-guard extension
 *
 * Blocks the agent from reading .env files, inspecting environment variables
 * via shell commands, or accessing process env through interpreter snippets.
 *
 * Note: This guards tool/subprocess-based access only. It does not prevent
 * direct process.env access from extension code or other extensions.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createBashTool, isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";
import { basename, normalize, resolve } from "node:path";

// ── constants ─────────────────────────────────────────────────────────────────

const ALLOWED_ENV_BASENAMES = new Set([".env.example", ".env.sample", ".env.template", ".env.dist"]);

const SUBPROCESS_ENV_ALLOWLIST = new Set([
	"PATH",
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TERM",
	"TMPDIR",
	"SHELL",
	"USER",
	"LOGNAME",
	"COLORTERM",
	"TERM_PROGRAM",
	"TERM_PROGRAM_VERSION",
]);

const BLOCK_STOP_INSTRUCTION =
	"Environment access is blocked by env-guard. Do not try alternate tools or commands. Stop work and explain to the user exactly what file or variable access you need, why you need it, and what you will do with it. Then wait for approval.";

// ── path helpers ──────────────────────────────────────────────────────────────

function normalizeCandidatePath(rawPath: string, cwd: string): string {
	let p = rawPath.replace(/^@/, "");
	if (p.startsWith("~")) p = homedir() + p.slice(1);
	if (!p.startsWith("/")) p = resolve(cwd, p);
	return normalize(p);
}

interface ProtectedPathMatch {
	blocked: boolean;
	normalizedPath: string;
	reason?: string;
	category?: "env-file" | "envrc" | "proc-environ";
}

function matchProtectedPath(rawPath: string, cwd: string): ProtectedPathMatch {
	const normalizedPath = normalizeCandidatePath(rawPath, cwd);

	// /proc/.../environ
	if (/\/proc\/[^/]+\/environ$/.test(normalizedPath)) {
		return { blocked: true, normalizedPath, reason: `Blocked access to proc environ: ${normalizedPath}`, category: "proc-environ" };
	}

	const base = basename(normalizedPath).toLowerCase();

	// allowlisted templates
	if (ALLOWED_ENV_BASENAMES.has(base)) {
		return { blocked: false, normalizedPath };
	}

	// .env exactly
	if (base === ".env") {
		return { blocked: true, normalizedPath, reason: `Blocked access to env file: ${base}`, category: "env-file" };
	}

	// .env.* (not allowlisted)
	if (base.startsWith(".env.")) {
		return { blocked: true, normalizedPath, reason: `Blocked access to env file: ${base}`, category: "env-file" };
	}

	// .envrc
	if (base === ".envrc") {
		return { blocked: true, normalizedPath, reason: `Blocked access to .envrc: ${base}`, category: "envrc" };
	}

	return { blocked: false, normalizedPath };
}

function stripOuterQuotes(value: string): string {
	return value.trim().replace(/^['"]+|['"]+$/g, "");
}

function targetsProtectedEnvName(value: string): boolean {
	const normalized = stripOuterQuotes(value).toLowerCase();
	const base = basename(normalized);
	if (ALLOWED_ENV_BASENAMES.has(base)) return false;

	return (
		normalized === ".env" ||
		normalized === ".env*" ||
		normalized === ".envrc" ||
		normalized === "environ" ||
		/(^|\/)\.env(?:\.[^/\s'"]*|\*)?(?=$|\/)/.test(normalized) ||
		/(^|\/)\.envrc(?=$|\/)/.test(normalized) ||
		/(^|\/)environ(?=$|\/)/.test(normalized)
	);
}

function isEnvTargetingGlob(pattern: string): boolean {
	return targetsProtectedEnvName(pattern);
}

function containsEnvDiscoveryTarget(segment: string): boolean {
	return segment
		.split(/\s+/)
		.map(stripOuterQuotes)
		.some((token) => targetsProtectedEnvName(token));
}

// ── bash helpers ──────────────────────────────────────────────────────────────

interface BashBlockMatch {
	blocked: boolean;
	reason?: string;
	category?: "env-command" | "env-api" | "env-file-path" | "proc-environ" | "env-file-discovery";
}

function splitCommandSegments(command: string): string[] {
	return command.split(/[;&|]+/).map((s) => s.trim()).filter(Boolean);
}

function matchBlockedBashCommand(command: string): BashBlockMatch {
	const segments = splitCommandSegments(command);

	for (const seg of segments) {
		const s = seg.replace(/\s+/g, " ").trim();

		// 1. /proc/.../environ
		if (/\/proc\/[^/\s]+\/environ/.test(s)) {
			return { blocked: true, reason: "Blocked proc environ access in bash command", category: "proc-environ" };
		}

		// 2. protected env-file path reference (cat .env, source .env, etc.)
		//    Match .env followed by word boundary or end, excluding allowlisted
		const envFileRef = /(?:^|\s|\/)(\.env(?:\.[^\s/]*)?|\.envrc)(?:\s|$|"|'|;)/.exec(s);
		if (envFileRef) {
			const matched = envFileRef[1].toLowerCase();
			if (!ALLOWED_ENV_BASENAMES.has(matched)) {
				return { blocked: true, reason: `Blocked env-file path reference in bash: ${matched}`, category: "env-file-path" };
			}
		}

		// 3. env-file discovery patterns
		if ((/^find(\s|$)/.test(s) && /\s-(?:i)?name\s+/.test(s) && containsEnvDiscoveryTarget(s)) || (/^fd(\s|$)/.test(s) && containsEnvDiscoveryTarget(s)) || (/^rg(\s|$)/.test(s) && /(?:^|\s)--files(?:\s|$)/.test(s) && containsEnvDiscoveryTarget(s)) || (/^ls(\s|$)/.test(s) && containsEnvDiscoveryTarget(s))) {
			return { blocked: true, reason: "Blocked env-file discovery command", category: "env-file-discovery" };
		}

		// 4. direct env-inspection commands
		// Block bare: env, printenv, bare set (not set -e etc.), bare export (not export X=Y), declare -x / declare -xp
		if (/^env$/.test(s) || /^env\s/.test(s)) {
			// Allow "env VAR=val cmd" style? For v1, block all env invocations
			return { blocked: true, reason: "Blocked env inspection command: env", category: "env-command" };
		}
		if (/^printenv(\s|$)/.test(s)) {
			return { blocked: true, reason: "Blocked env inspection command: printenv", category: "env-command" };
		}
		// bare set: "set" alone or "set" not followed by - or + or var=
		if (/^set$/.test(s)) {
			return { blocked: true, reason: "Blocked env inspection command: set", category: "env-command" };
		}
		// bare export: "export" with no arguments or just listing
		if (/^export$/.test(s)) {
			return { blocked: true, reason: "Blocked env inspection command: export", category: "env-command" };
		}
		// declare -x or declare -xp
		if (/^declare\s+-[a-z]*x[a-z]*/.test(s) && !/^declare\s+-[a-z]*x[a-z]*\s+\w+=/.test(s)) {
			return { blocked: true, reason: "Blocked env inspection command: declare -x", category: "env-command" };
		}

		// 5. interpreter env APIs
		if (/process\.env/.test(s)) {
			return { blocked: true, reason: "Blocked process.env access in bash command", category: "env-api" };
		}
		if (/os\.environ/.test(s)) {
			return { blocked: true, reason: "Blocked os.environ access in bash command", category: "env-api" };
		}
		if (/getenv\s*\(/.test(s)) {
			return { blocked: true, reason: "Blocked getenv() access in bash command", category: "env-api" };
		}
		if (/System\.getenv/.test(s)) {
			return { blocked: true, reason: "Blocked System.getenv access in bash command", category: "env-api" };
		}
	}

	return { blocked: false };
}

// ── subprocess env scrubbing ──────────────────────────────────────────────────

function buildScrubbedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const scrubbed: NodeJS.ProcessEnv = {};
	for (const key of SUBPROCESS_ENV_ALLOWLIST) {
		if (env[key] !== undefined) scrubbed[key] = env[key];
	}
	return scrubbed;
}

// ── reporting ─────────────────────────────────────────────────────────────────

function reportBlock(
	pi: ExtensionAPI,
	ctx: { hasUI: boolean; ui: { notify(msg: string, level: string): void }; isIdle?: () => boolean },
	summary: string,
	details: Record<string, unknown>,
): void {
	if (ctx.hasUI) {
		ctx.ui.notify(`env-guard: ${summary}`, "warning");
	}

	const message = {
		customType: "env-guard",
		content: `env-guard blocked: ${summary}`,
		display: true,
		details: { ...details, timestamp: Date.now() },
	};

	if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
		pi.sendMessage(message, { deliverAs: "nextTurn" });
	} else {
		pi.sendMessage(message);
	}
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function envGuard(pi: ExtensionAPI) {
	// Register compact message renderer
	pi.registerMessageRenderer("env-guard", (message, _options, theme) => {
		const content = typeof message.content === "string" ? message.content : "env-guard blocked an action";
		const { Text } = require("@mariozechner/pi-tui");
		const line = theme.fg("warning", "⚠ ") + theme.fg("text", content);
		return new Text(line, 0, 0);
	});

	// Override built-in bash with scrubbed subprocess env
	const cwd = process.cwd();
	const bashTool = createBashTool(cwd, {
		spawnHook: ({ command, cwd: spawnCwd, env }) => ({
			command,
			cwd: spawnCwd,
			env: buildScrubbedEnv(env ?? process.env),
		}),
	});

	pi.registerTool({
		...bashTool,
		execute: async (id, params, signal, onUpdate, _ctx) => {
			return bashTool.execute(id, params, signal, onUpdate);
		},
	});

	// Inject policy reminder before each agent turn
	pi.on("before_agent_start", async (_event, _ctx) => {
		return {
			systemPrompt:
				_event.systemPrompt +
				"\n\n## Environment Access Policy\n" +
				"Reading .env files, inspecting environment variables, and accessing env through interpreter APIs is blocked by policy. " +
				"Do not read .env-style files (except .env.example/.env.sample/.env.template/.env.dist). " +
				"Do not run commands like env, printenv, or set to inspect variables. " +
				"Do not use process.env, os.environ, or similar APIs. " +
				"Do not try alternate methods after a block. " +
				"If you need env access, stop immediately, explain to the user exactly what you need, why, and what you will do with it, then wait for approval.",
		};
	});

	// Block tool calls
	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName;

		// File tools
		if (isToolCallEventType("read", event)) {
			const match = matchProtectedPath(event.input.path, ctx.cwd);
			if (match.blocked) {
				const summary = `read of ${basename(match.normalizedPath)}`;
				reportBlock(pi, ctx, summary, { tool: "read", path: match.normalizedPath, category: match.category });
				return { block: true, reason: `Blocked read of protected env file: ${basename(match.normalizedPath)}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}

		if (isToolCallEventType("write", event)) {
			const match = matchProtectedPath(event.input.path, ctx.cwd);
			if (match.blocked) {
				const summary = `write of ${basename(match.normalizedPath)}`;
				reportBlock(pi, ctx, summary, { tool: "write", path: match.normalizedPath, category: match.category });
				return { block: true, reason: `Blocked write of protected env file: ${basename(match.normalizedPath)}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}

		if (isToolCallEventType("edit", event)) {
			const match = matchProtectedPath(event.input.path, ctx.cwd);
			if (match.blocked) {
				const summary = `edit of ${basename(match.normalizedPath)}`;
				reportBlock(pi, ctx, summary, { tool: "edit", path: match.normalizedPath, category: match.category });
				return { block: true, reason: `Blocked edit of protected env file: ${basename(match.normalizedPath)}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}

		if (isToolCallEventType("ls", event) && event.input.path) {
			const match = matchProtectedPath(event.input.path, ctx.cwd);
			if (match.blocked) {
				const summary = `ls of ${basename(match.normalizedPath)}`;
				reportBlock(pi, ctx, summary, { tool: "ls", path: match.normalizedPath, category: match.category });
				return { block: true, reason: `Blocked ls of protected env path: ${basename(match.normalizedPath)}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}

		if (isToolCallEventType("grep", event)) {
			if (event.input.path) {
				const match = matchProtectedPath(event.input.path, ctx.cwd);
				if (match.blocked) {
					const summary = `grep targeting ${basename(match.normalizedPath)}`;
					reportBlock(pi, ctx, summary, { tool: "grep", path: match.normalizedPath, category: match.category });
					return { block: true, reason: `Blocked grep targeting protected env file: ${basename(match.normalizedPath)}. ${BLOCK_STOP_INSTRUCTION}` };
				}
			}
			if (event.input.glob && isEnvTargetingGlob(event.input.glob)) {
				const summary = `grep with env-targeting glob: ${event.input.glob}`;
				reportBlock(pi, ctx, summary, { tool: "grep", glob: event.input.glob });
				return { block: true, reason: `Blocked grep with env-file glob: ${event.input.glob}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}

		if (isToolCallEventType("find", event)) {
			if (event.input.path) {
				const match = matchProtectedPath(event.input.path, ctx.cwd);
				if (match.blocked) {
					const summary = `find targeting ${basename(match.normalizedPath)}`;
					reportBlock(pi, ctx, summary, { tool: "find", path: match.normalizedPath, category: match.category });
					return { block: true, reason: `Blocked find targeting protected env path: ${basename(match.normalizedPath)}. ${BLOCK_STOP_INSTRUCTION}` };
				}
			}
			if (event.input.pattern && isEnvTargetingGlob(event.input.pattern)) {
				const summary = `find with env-targeting pattern: ${event.input.pattern}`;
				reportBlock(pi, ctx, summary, { tool: "find", pattern: event.input.pattern });
				return { block: true, reason: `Blocked env-file discovery pattern in find: ${event.input.pattern}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}

		// Bash command
		if (toolName === "bash") {
			const command = (event.input as { command: string }).command;
			const bashMatch = matchBlockedBashCommand(command);
			if (bashMatch.blocked) {
				const summary = `bash environment inspection command`;
				reportBlock(pi, ctx, summary, { tool: "bash", command: command.slice(0, 100), category: bashMatch.category, reason: bashMatch.reason });
				return { block: true, reason: `${bashMatch.reason}. ${BLOCK_STOP_INSTRUCTION}` };
			}
		}
	});

	// Block user_bash (!cmd / !!cmd)
	pi.on("user_bash", (event, ctx) => {
		const bashMatch = matchBlockedBashCommand(event.command);
		if (bashMatch.blocked) {
			const summary = `manual shell command: ${event.command.slice(0, 60)}`;
			reportBlock(pi, ctx, summary, { source: "user_bash", command: event.command.slice(0, 100), category: bashMatch.category });
			return {
				result: {
					output: `Blocked by env-guard: ${bashMatch.reason}`,
					exitCode: 1,
					cancelled: false,
					truncated: false,
				},
			};
		}
	});
}
