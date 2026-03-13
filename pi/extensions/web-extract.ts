/**
 * web_extract extension
 *
 * Single-URL content extraction tool backed by Tavily Extract API.
 * Reads credentials from ~/.pi/agent/web-tools.json
 *
 * Returns clean readable page content for a given URL.
 * Supports optional goal-focused extraction via the focus parameter.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

// ── constants ─────────────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".pi", "agent", "web-tools.json");
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
const DEFAULT_FORMAT = "markdown";
const DEFAULT_DEPTH = "basic";
const FOCUSED_CHUNKS_PER_SOURCE = 3;

// ── types ─────────────────────────────────────────────────────────────────────

interface TavilyExtractResult {
	url: string;
	raw_content: string;
	images?: string[];
}

interface TavilyExtractFailure {
	url: string;
	error: string;
}

interface TavilyExtractResponse {
	results: TavilyExtractResult[];
	failed_results: TavilyExtractFailure[];
	response_time?: number;
	request_id?: string;
}

interface ExtractDetails {
	provider: "tavily";
	url: string;
	focus: string | null;
	mode: "full" | "focused";
	format: "markdown" | "text";
	depth: "basic" | "advanced";
	response_time: number | null;
	content_length: number;
	truncated: boolean;
	full_output_path: string | null;
}

// ── config ────────────────────────────────────────────────────────────────────

function loadTavilyApiKey(): string {
	let raw: string;
	try {
		raw = readFileSync(CONFIG_PATH, "utf8");
	} catch (err: any) {
		if (err.code === "ENOENT") {
			throw new Error(
				`Missing config file: ${CONFIG_PATH}\n\n` +
					`Create it with:\n` +
					`{\n  "tavily": {\n    "apiKey": "YOUR_TAVILY_API_KEY"\n  }\n}\n\n` +
					`Then: chmod 600 ${CONFIG_PATH}`,
			);
		}
		throw new Error(`Cannot read ${CONFIG_PATH}: ${err.message}`);
	}

	let config: any;
	try {
		config = JSON.parse(raw);
	} catch {
		throw new Error(`Invalid JSON in ${CONFIG_PATH}`);
	}

	const apiKey = config?.tavily?.apiKey;
	if (!apiKey || typeof apiKey !== "string") {
		throw new Error(
			`Missing tavily.apiKey in ${CONFIG_PATH}\n\n` +
				`Expected format:\n` +
				`{\n  "tavily": {\n    "apiKey": "YOUR_TAVILY_API_KEY"\n  }\n}`,
		);
	}

	return apiKey.trim();
}

// ── helpers ───────────────────────────────────────────────────────────────────

function normalizeUrl(raw: string): string {
	let url = raw.startsWith("@") ? raw.slice(1) : raw;
	if (url.startsWith("<") && url.endsWith(">")) {
		url = url.slice(1, -1);
	}
	return url.trim();
}

function validateUrl(url: string): void {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`Only http and https URLs are supported: ${url}`);
	}

	const hostname = parsed.hostname.toLowerCase();
	if (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1" ||
		hostname === "[::1]" ||
		hostname.endsWith(".local") ||
		/^10\./.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
		/^192\.168\./.test(hostname)
	) {
		throw new Error(`Cannot extract from local/private URLs: ${url}`);
	}
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

// ── tavily request ────────────────────────────────────────────────────────────

async function extractTavily(
	apiKey: string,
	url: string,
	options: {
		format: "markdown" | "text";
		depth: "basic" | "advanced";
		focus?: string;
	},
	signal?: AbortSignal,
): Promise<TavilyExtractResponse> {
	const body: Record<string, any> = {
		urls: [url],
		format: options.format,
		extract_depth: options.depth,
		include_images: false,
	};

	if (options.focus) {
		body.query = options.focus;
		body.chunks_per_source = FOCUSED_CHUNKS_PER_SOURCE;
	}

	const response = await fetch(TAVILY_EXTRACT_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
		signal,
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		if (response.status === 401 || response.status === 403) {
			throw new Error(`Tavily auth failed (${response.status}). Check your API key in ${CONFIG_PATH}`);
		}
		if (response.status === 429) {
			throw new Error("Tavily rate limit exceeded (429). Try again shortly.");
		}
		throw new Error(`Tavily Extract API error ${response.status}: ${text || response.statusText}`);
	}

	return (await response.json()) as TavilyExtractResponse;
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function webExtractExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_extract",
		label: "Web Extract",
		description:
			"Extract clean readable content from a single web page. Returns the page body as markdown or text. " +
			"Use after web_search to inspect a specific URL in detail. " +
			"Optionally provide a focus to extract only the most relevant sections. " +
			`Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}; full content is saved to a temp file when truncated.`,
		promptSnippet: "Extract readable content from a single web page URL",
		promptGuidelines: [
			"Use web_extract to read the content of a specific web page URL.",
			"Use web_search first to find candidate URLs, then web_extract to inspect the best one.",
			"Provide a focus when you only need specific information from a page (e.g. 'breaking changes', 'installation steps').",
			"Do not use shell commands (curl, wget, python requests) for web page fetching — use web_extract instead.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "URL of the page to extract (http or https)" }),
			focus: Type.Optional(
				Type.String({
					description:
						"What to extract from the page — enables targeted extraction of relevant sections only (e.g. 'rate limits', 'installation steps')",
				}),
			),
			format: Type.Optional(
				StringEnum(["markdown", "text"] as const, {
					description: "Output format (default markdown)",
				}),
			),
			depth: Type.Optional(
				StringEnum(["basic", "advanced"] as const, {
					description: "Extraction depth — use advanced for dynamic or complex pages (default basic)",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const url = normalizeUrl(params.url);
			validateUrl(url);

			const apiKey = loadTavilyApiKey();
			const format = (params.format ?? DEFAULT_FORMAT) as "markdown" | "text";
			const depth = (params.depth ?? DEFAULT_DEPTH) as "basic" | "advanced";
			const focus = params.focus?.trim() || undefined;

			const tavilyResponse = await extractTavily(apiKey, url, { format, depth, focus }, signal);

			const failed = tavilyResponse.failed_results ?? [];
			const results = tavilyResponse.results ?? [];

			if (results.length === 0) {
				const reason = failed.length > 0 ? failed[0].error : "No content returned";
				throw new Error(`Extraction failed for ${url}: ${reason}`);
			}

			const result = results[0];
			const rawContent = result.raw_content || "";
			const domain = extractDomain(url);

			const header = `Source: ${url}\nDomain: ${domain}`;
			const fullOutput = `${header}\n\n${rawContent}`;

			const truncation = truncateHead(fullOutput, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let content = truncation.content;
			let fullOutputPath: string | null = null;

			if (truncation.truncated) {
				const tempDir = mkdtempSync(join(tmpdir(), "pi-web-extract-"));
				const tempFile = join(tempDir, `extract.${format === "markdown" ? "md" : "txt"}`);
				writeFileSync(tempFile, fullOutput);
				fullOutputPath = tempFile;

				content += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
				content += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
				content += ` Full output saved to: ${fullOutputPath}]`;
			}

			return {
				content: [{ type: "text", text: content }],
				details: {
					provider: "tavily",
					url,
					focus: focus ?? null,
					mode: focus ? "focused" : "full",
					format,
					depth,
					response_time: tavilyResponse.response_time ?? null,
					content_length: rawContent.length,
					truncated: truncation.truncated,
					full_output_path: fullOutputPath,
				} satisfies ExtractDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("web_extract "));

			const url = typeof args.url === "string" ? args.url : "";
			const domain = extractDomain(normalizeUrl(url));
			text += theme.fg("accent", domain || url);

			const parts: string[] = [];
			if (args.format) parts.push(args.format as string);
			if (args.depth) parts.push(args.depth as string);
			if (args.focus) parts.push(`focus: "${args.focus}"`);
			if (parts.length) {
				text += " " + theme.fg("dim", parts.join(" · "));
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("muted", "Extracting…"), 0, 0);
			}

			if (result.isError) {
				const msg = result.content?.[0];
				const errText = msg?.type === "text" ? msg.text : "Extraction failed";
				return new Text(theme.fg("error", errText), 0, 0);
			}

			const details = result.details as ExtractDetails | undefined;
			if (!details) {
				return new Text(theme.fg("warning", "No content extracted"), 0, 0);
			}

			const domain = extractDomain(details.url);
			let text = theme.fg("success", "✓ ") + theme.fg("text", domain);
			text += theme.fg("dim", ` · ${formatSize(details.content_length)}`);
			if (details.mode === "focused") {
				text += theme.fg("muted", " · focused");
			}
			if (details.truncated) {
				text += theme.fg("warning", " · truncated");
			}

			if (expanded) {
				text += "\n" + theme.fg("dim", details.url);
				if (details.full_output_path) {
					text += "\n" + theme.fg("dim", `Full output: ${details.full_output_path}`);
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
