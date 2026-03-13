/**
 * web_crawl extension
 *
 * Root-first site exploration tool backed by Tavily Crawl API.
 * Reads credentials from ~/.pi/agent/web-tools.json
 *
 * Discovers pages under a known root URL and returns compact previews.
 * Best when the site is known but the exact page is not.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

// ── constants ─────────────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".pi", "agent", "web-tools.json");
const TAVILY_CRAWL_URL = "https://api.tavily.com/crawl";
const DEFAULT_MAX_DEPTH = 1;
const DEFAULT_LIMIT = 10;
const MAX_DEPTH_CAP = 2;
const LIMIT_CAP = 20;
const INTERNAL_MAX_BREADTH = 20;
const GOAL_CHUNKS_PER_SOURCE = 3;
const SNIPPET_MAX_LEN = 200;

// ── types ─────────────────────────────────────────────────────────────────────

interface TavilyCrawlResult {
	url: string;
	raw_content: string;
	images?: string[];
	favicon?: string;
}

interface TavilyCrawlFailure {
	url: string;
	error: string;
}

interface TavilyCrawlResponse {
	base_url: string;
	results: TavilyCrawlResult[];
	failed_results?: TavilyCrawlFailure[];
	response_time?: number;
	request_id?: string;
	usage?: { credits?: number };
}

interface CrawlResult {
	url: string;
	domain: string;
	label: string;
	snippet: string;
	content_length: number;
}

interface CrawlDetails {
	provider: "tavily";
	url: string;
	goal: string | null;
	applied_limits: {
		max_depth: number;
		limit: number;
		max_breadth: number;
		allow_external: boolean;
		extract_depth: "basic";
		format: "markdown";
	};
	applied_filters: {
		include_paths: string[];
		exclude_paths: string[];
	};
	result_count: number;
	failed_count: number;
	results: CrawlResult[];
	failed_results: Array<{ url: string; error: string }>;
	response_time: number | null;
	request_id: string | null;
	usage: { credits?: number } | null;
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
		throw new Error(`Cannot crawl local/private URLs: ${url}`);
	}
}

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function dedupeResults(results: TavilyCrawlResult[]): TavilyCrawlResult[] {
	const seen = new Set<string>();
	return results.filter((r) => {
		const normalized = r.url.replace(/\/$/, "").toLowerCase();
		if (seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

function deriveLabel(rawContent: string, url: string): string {
	if (rawContent) {
		const headingMatch = rawContent.match(/^#{1,6}\s+(.+)$/m);
		if (headingMatch) return headingMatch[1].trim();

		const firstLine = rawContent.split("\n").find((l) => l.trim().length > 0);
		if (firstLine) {
			const clean = firstLine.trim();
			if (clean.length <= 120) return clean;
			return clean.slice(0, 119) + "…";
		}
	}

	try {
		const parsed = new URL(url);
		const segments = parsed.pathname.split("/").filter(Boolean);
		if (segments.length > 0) {
			return decodeURIComponent(segments[segments.length - 1]).replace(/[-_]/g, " ");
		}
		return parsed.hostname;
	} catch {
		return url;
	}
}

function toSnippet(rawContent: string, maxLen = SNIPPET_MAX_LEN): string {
	const clean = rawContent.replace(/\s+/g, " ").trim();
	if (clean.length <= maxLen) return clean;
	return clean.slice(0, maxLen - 1) + "…";
}

// ── tavily request ────────────────────────────────────────────────────────────

async function crawlTavily(
	apiKey: string,
	url: string,
	options: {
		max_depth: number;
		limit: number;
		allow_external: boolean;
		include_paths?: string[];
		exclude_paths?: string[];
		goal?: string;
	},
	signal?: AbortSignal,
): Promise<TavilyCrawlResponse> {
	const body: Record<string, any> = {
		url,
		max_depth: options.max_depth,
		max_breadth: INTERNAL_MAX_BREADTH,
		limit: options.limit,
		allow_external: options.allow_external,
		extract_depth: "basic",
		format: "markdown",
		include_images: false,
	};

	if (options.include_paths?.length) {
		body.select_paths = options.include_paths;
	}
	if (options.exclude_paths?.length) {
		body.exclude_paths = options.exclude_paths;
	}
	if (options.goal) {
		body.instructions = options.goal;
		body.chunks_per_source = GOAL_CHUNKS_PER_SOURCE;
	}

	const response = await fetch(TAVILY_CRAWL_URL, {
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
		throw new Error(`Tavily Crawl API error ${response.status}: ${text || response.statusText}`);
	}

	return (await response.json()) as TavilyCrawlResponse;
}

// ── formatting ────────────────────────────────────────────────────────────────

function formatCrawlText(results: CrawlResult[], url: string, goal: string | null): string {
	if (results.length === 0) {
		return `No pages found under "${url}"${goal ? ` for goal "${goal}"` : ""}`;
	}

	const header = `Found ${results.length} page${results.length !== 1 ? "s" : ""} under "${url}"${goal ? ` for goal "${goal}"` : ""}`;
	const lines = [header, ""];

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		lines.push(`${i + 1}. ${r.label}`);
		lines.push(`   ${r.url}`);
		if (r.snippet) {
			lines.push(`   ${r.snippet}`);
		}
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function webCrawlExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_crawl",
		label: "Web Crawl",
		description:
			"Explore a constrained website or docs area starting from one root URL. " +
			"Returns discovered pages with short previews so the agent can choose what to inspect next. " +
			"Best when the site is known but the exact page is not.",
		promptSnippet: "Explore a website or docs area from a root URL, returning page previews",
		promptGuidelines: [
			"Use web_crawl when you know the site or docs root but not the exact page yet.",
			"Prefer web_search for broad multi-site discovery.",
			"Prefer web_extract when you already have the exact page URL.",
			"Keep crawls bounded with low depth and small limits.",
			"Use path filters when you only need part of a site.",
			"After finding relevant pages, call web_extract on the best URLs.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "Root URL or docs subsection to explore" }),
			goal: Type.Optional(
				Type.String({
					description: "Natural-language instruction describing what relevant pages look like",
				}),
			),
			max_depth: Type.Optional(
				Type.Number({ description: "How far the crawler can move from the root (default 1, max 2)" }),
			),
			limit: Type.Optional(
				Type.Number({ description: "Total pages to process before stopping (default 10, max 20)" }),
			),
			include_paths: Type.Optional(
				Type.Array(Type.String(), { description: "Regex filters for desired path patterns" }),
			),
			exclude_paths: Type.Optional(
				Type.Array(Type.String(), { description: "Regex filters for unwanted path patterns" }),
			),
			allow_external: Type.Optional(
				Type.Boolean({ description: "Whether off-site links may appear in results (default false)" }),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const url = normalizeUrl(params.url);
			validateUrl(url);

			const apiKey = loadTavilyApiKey();

			const maxDepth = Math.min(Math.max(1, params.max_depth ?? DEFAULT_MAX_DEPTH), MAX_DEPTH_CAP);
			const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_LIMIT), LIMIT_CAP);
			const allowExternal = params.allow_external ?? false;
			const goal = params.goal?.trim() || undefined;

			const tavilyResponse = await crawlTavily(
				apiKey,
				url,
				{
					max_depth: maxDepth,
					limit,
					allow_external: allowExternal,
					include_paths: params.include_paths,
					exclude_paths: params.exclude_paths,
					goal,
				},
				signal,
			);

			const deduped = dedupeResults(tavilyResponse.results ?? []);
			const failedResults = tavilyResponse.failed_results ?? [];

			const results: CrawlResult[] = deduped.map((r) => ({
				url: r.url,
				domain: extractDomain(r.url),
				label: deriveLabel(r.raw_content || "", r.url),
				snippet: toSnippet(r.raw_content || ""),
				content_length: (r.raw_content || "").length,
			}));

			if (results.length === 0) {
				const reason = failedResults.length > 0
					? `First failure: ${failedResults[0].error}`
					: "No pages discovered";
				return {
					content: [{ type: "text", text: `No pages found under "${url}". ${reason}` }],
					details: {
						provider: "tavily",
						url,
						goal: goal ?? null,
						applied_limits: {
							max_depth: maxDepth,
							limit,
							max_breadth: INTERNAL_MAX_BREADTH,
							allow_external: allowExternal,
							extract_depth: "basic" as const,
							format: "markdown" as const,
						},
						applied_filters: {
							include_paths: params.include_paths ?? [],
							exclude_paths: params.exclude_paths ?? [],
						},
						result_count: 0,
						failed_count: failedResults.length,
						results: [],
						failed_results: failedResults,
						response_time: tavilyResponse.response_time ?? null,
						request_id: tavilyResponse.request_id ?? null,
						usage: tavilyResponse.usage ?? null,
						truncated: false,
						full_output_path: null,
					} satisfies CrawlDetails,
				};
			}

			const fullOutput = formatCrawlText(results, url, goal ?? null);

			const truncation = truncateHead(fullOutput, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let content = truncation.content;
			let fullOutputPath: string | null = null;

			if (truncation.truncated) {
				const tempDir = mkdtempSync(join(tmpdir(), "pi-web-crawl-"));
				const tempFile = join(tempDir, "crawl.md");
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
					goal: goal ?? null,
					applied_limits: {
						max_depth: maxDepth,
						limit,
						max_breadth: INTERNAL_MAX_BREADTH,
						allow_external: allowExternal,
						extract_depth: "basic" as const,
						format: "markdown" as const,
					},
					applied_filters: {
						include_paths: params.include_paths ?? [],
						exclude_paths: params.exclude_paths ?? [],
					},
					result_count: results.length,
					failed_count: failedResults.length,
					results,
					failed_results: failedResults,
					response_time: tavilyResponse.response_time ?? null,
					request_id: tavilyResponse.request_id ?? null,
					usage: tavilyResponse.usage ?? null,
					truncated: truncation.truncated,
					full_output_path: fullOutputPath,
				} satisfies CrawlDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("web_crawl "));

			const url = typeof args.url === "string" ? args.url : "";
			const domain = extractDomain(normalizeUrl(url));
			text += theme.fg("accent", domain || url);

			const parts: string[] = [];
			if (args.goal) parts.push(args.goal as string);
			if (args.max_depth) parts.push(`depth ${args.max_depth}`);
			if (args.limit) parts.push(`max ${args.limit}`);
			if (parts.length) {
				text += " · " + theme.fg("dim", parts.join(" · "));
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("muted", "Crawling…"), 0, 0);
			}

			if (result.isError) {
				const msg = result.content?.[0];
				const errText = msg?.type === "text" ? msg.text : "Crawl failed";
				return new Text(theme.fg("error", errText), 0, 0);
			}

			const details = result.details as CrawlDetails | undefined;
			if (!details) {
				return new Text(theme.fg("warning", "No pages found"), 0, 0);
			}

			const domain = extractDomain(details.url);
			let text = theme.fg("success", "✓ ");
			text += theme.fg("text", `${details.result_count} page${details.result_count !== 1 ? "s" : ""}`);
			text += theme.fg("dim", ` · ${domain}`);

			if (details.failed_count > 0) {
				text += theme.fg("warning", ` · ${details.failed_count} failed`);
			}
			if (details.truncated) {
				text += theme.fg("warning", " · truncated");
			}

			if (expanded) {
				text += "\n" + theme.fg("dim", details.url);
				if (details.goal) {
					text += "\n" + theme.fg("dim", `Goal: ${details.goal}`);
				}
				for (const r of details.results.slice(0, 5)) {
					text += "\n  " + theme.fg("muted", r.url);
				}
				if (details.results.length > 5) {
					text += "\n  " + theme.fg("dim", `… and ${details.results.length - 5} more`);
				}
				if (details.full_output_path) {
					text += "\n" + theme.fg("dim", `Full output: ${details.full_output_path}`);
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
