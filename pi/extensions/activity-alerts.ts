/**
 * activity-alerts extension
 *
 * Alerts when Pi finishes a run and when ask_user is waiting for input.
 * Also keeps the terminal title and footer status synced with the current
 * repo:branch label, or the current folder name when outside a git repo.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { execFile, execFileSync } from "node:child_process";
import { basename } from "node:path";

const STATUS_KEY = "activity-alerts";
const INPUT_TOOL_NAMES = new Set(["ask_user"]);

type ActivityState = "ready" | "working" | "awaiting-input";

function runDetached(file: string, args: string[]) {
	try {
		const child = execFile(file, args, { windowsHide: true }, () => {});
		child.unref?.();
	} catch {
		// Best-effort only.
	}
}

function bell() {
	process.stdout.write("\x07");
}

function escapeAppleScript(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapePowerShell(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function windowsToastScript(title: string, body: string): string {
	const type = "Windows.UI.Notifications";
	const titleLiteral = escapePowerShell(title);
	const bodyLiteral = escapePowerShell(body);
	return [
		`[${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime] > $null`,
		`$template = [${type}.ToastTemplateType]::ToastText02`,
		`$xml = [${type}.ToastNotificationManager]::GetTemplateContent($template)`,
		`$texts = $xml.GetElementsByTagName('text')`,
		`$texts[0].AppendChild($xml.CreateTextNode(${titleLiteral})) > $null`,
		`$texts[1].AppendChild($xml.CreateTextNode(${bodyLiteral})) > $null`,
		`$toast = [${type}.ToastNotification]::new($xml)`,
		`[${type}.ToastNotificationManager]::CreateToastNotifier('Pi').Show($toast)`,
	].join("; ");
}

function notifySystem(title: string, body: string) {
	bell();

	switch (process.platform) {
		case "darwin":
			runDetached("osascript", [
				"-e",
				`display notification ${escapeAppleScript(body)} with title ${escapeAppleScript(title)} sound name "Glass"`,
			]);
			return;
		case "linux":
			runDetached("notify-send", [title, body]);
			return;
		case "win32":
			runDetached("powershell.exe", ["-NoProfile", "-Command", windowsToastScript(title, body)]);
			return;
		default:
			return;
	}
}

function gitOutput(cwd: string, args: string[]): string {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	}).trim();
}

function getContextLabel(cwd: string): string {
	const fallback = basename(cwd) || cwd;

	try {
		const repoRoot = gitOutput(cwd, ["rev-parse", "--show-toplevel"]);
		const repoName = basename(repoRoot) || fallback;
		const branch = gitOutput(cwd, ["branch", "--show-current"]);
		if (branch) return `${repoName}:${branch}`;

		const commit = gitOutput(cwd, ["rev-parse", "--short", "HEAD"]);
		if (commit) return `${repoName}@${commit}`;

		return repoName;
	} catch {
		return fallback;
	}
}

function stateLabel(state: ActivityState): string {
	switch (state) {
		case "ready":
			return "Ready";
		case "working":
			return "Working";
		case "awaiting-input":
			return "Awaiting input";
	}
}

function updateUi(ctx: ExtensionContext, state: ActivityState) {
	if (!ctx.hasUI) return;

	const label = getContextLabel(ctx.cwd);
	const stateText = stateLabel(state);
	ctx.ui.setTitle(`π — ${label} — ${stateText}`);
	ctx.ui.setStatus(STATUS_KEY, `${stateText} · ${label}`);
}

function notifyActivity(ctx: ExtensionContext, body: string) {
	const label = getContextLabel(ctx.cwd);
	notifySystem(`Pi — ${label}`, body);
}

export default function activityAlerts(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		updateUi(ctx, "ready");
	});

	pi.on("session_switch", async (_event, ctx) => {
		updateUi(ctx, "ready");
	});

	pi.on("session_fork", async (_event, ctx) => {
		updateUi(ctx, "ready");
	});

	pi.on("agent_start", async (_event, ctx) => {
		updateUi(ctx, "working");
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (!ctx.hasUI || !INPUT_TOOL_NAMES.has(event.toolName)) return;
		updateUi(ctx, "awaiting-input");
		notifyActivity(ctx, "Waiting for your input");
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		if (!INPUT_TOOL_NAMES.has(event.toolName)) return;
		updateUi(ctx, ctx.isIdle() ? "ready" : "working");
	});

	pi.on("agent_end", async (_event, ctx) => {
		updateUi(ctx, "ready");
		notifyActivity(ctx, "Finished answering");
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.setTitle(`π — ${getContextLabel(ctx.cwd)}`);
	});
}
