/**
 * web_search extension
 *
 * Live web source discovery tool backed by Tavily Search API.
 * Reads credentials from ~/.pi/agent/web-tools.json
 *
 * Returns concise ranked results for the agent to inspect further.
 * Not a research tool — finds sources, doesn't synthesize answers.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── constants ─────────────────────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".pi", "agent", "web-tools.json");
const TAVILY_API_URL = "https://api.tavily.com/search";
const MAX_RESULTS_CAP = 8;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TOPIC = "general";
const DEFAULT_DEPTH = "balanced";

// ── types ─────────────────────────────────────────────────────────────────────

interface TavilyResult {
	title: string;
	url: string;
	content: string;
	score: number;
	published_date?: string;
}

interface TavilyResponse {
	results: TavilyResult[];
	query: string;
}

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	domain: string;
	published_at: string | null;
	score: number;
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

function extractDomain(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function truncateSnippet(text: string, maxLen = 200): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > maxLen ? clean.slice(0, maxLen - 1) + "…" : clean;
}

function dedupeResults(results: TavilyResult[]): TavilyResult[] {
	const seen = new Set<string>();
	return results.filter((r) => {
		const normalized = r.url.replace(/\/$/, "").toLowerCase();
		if (seen.has(normalized)) return false;
		seen.add(normalized);
		return true;
	});
}

// ── tavily request ────────────────────────────────────────────────────────────

async function searchTavily(
	apiKey: string,
	query: string,
	options: {
		allowed_domains?: string[];
		blocked_domains?: string[];
		freshness?: string;
		max_results: number;
		topic: "general" | "news" | "finance";
		depth: "quick" | "balanced" | "deep";
	},
	signal?: AbortSignal,
): Promise<TavilyResponse> {
	const body: Record<string, any> = {
		query,
		max_results: options.max_results,
		search_depth: options.depth === "quick" ? "basic" : "advanced",
		topic: options.topic,
		include_answer: false,
		include_raw_content: false,
		include_images: false,
	};

	if (options.allowed_domains?.length) {
		body.include_domains = options.allowed_domains;
	}
	if (options.blocked_domains?.length) {
		body.exclude_domains = options.blocked_domains;
	}
	if (options.freshness) {
		body.time_range = options.freshness;
	}

	const response = await fetch(TAVILY_API_URL, {
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
		throw new Error(`Tavily API error ${response.status}: ${text || response.statusText}`);
	}

	return (await response.json()) as TavilyResponse;
}

// ── formatting ────────────────────────────────────────────────────────────────

function formatResultsText(results: SearchResult[], query: string): string {
	if (results.length === 0) {
		return `No results found for "${query}"`;
	}

	const lines = [`Top ${results.length} result${results.length !== 1 ? "s" : ""} for "${query}"`, ""];

	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		lines.push(`${i + 1}. ${r.title}`);
		lines.push(`   ${r.url}`);
		lines.push(`   ${r.snippet}`);
		lines.push("");
	}

	return lines.join("\n").trimEnd();
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web for current information. Returns ranked results with titles, URLs, and snippets. " +
			"Use this to find candidate sources, recent docs, articles, or pages before inspecting them in detail.",
		promptSnippet: "Search the web for current sources, docs, articles, or pages",
		promptGuidelines: [
			"Use web_search when you need current or live web information that may not be in your training data.",
			"Use web_search to find candidate sources — then use web_extract to inspect a specific page in detail.",
			"Do not use shell commands (curl, wget, python requests) for web fetching when web_search is available.",
			"Keep queries concise and specific for best results.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			topic: Type.Optional(
				StringEnum(["general", "news", "finance"] as const, {
					description: "Search topic (default general)",
				}),
			),
			allowed_domains: Type.Optional(Type.Array(Type.String(), { description: "Only return results from these domains" })),
			blocked_domains: Type.Optional(Type.Array(Type.String(), { description: "Exclude results from these domains" })),
			freshness: Type.Optional(
				StringEnum(["day", "week", "month", "year"] as const, {
					description: "Only return results from this time period",
				}),
			),
			max_results: Type.Optional(Type.Number({ description: "Maximum number of results (default 5, max 8)" })),
			depth: Type.Optional(
				StringEnum(["quick", "balanced", "deep"] as const, {
					description: "Search depth (default balanced)",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const apiKey = loadTavilyApiKey();

			const maxResults = Math.min(Math.max(1, params.max_results ?? DEFAULT_MAX_RESULTS), MAX_RESULTS_CAP);
			const topic = (params.topic ?? DEFAULT_TOPIC) as "general" | "news" | "finance";
			const depth = (params.depth ?? DEFAULT_DEPTH) as "quick" | "balanced" | "deep";

			const tavilyResponse = await searchTavily(
				apiKey,
				params.query,
				{
					topic,
					depth,
					allowed_domains: params.allowed_domains,
					blocked_domains: params.blocked_domains,
					freshness: params.freshness,
					max_results: maxResults,
				},
				signal,
			);

			const deduped = dedupeResults(tavilyResponse.results ?? []);
			const results: SearchResult[] = deduped.map((r) => ({
				title: r.title || "(untitled)",
				url: r.url,
				snippet: truncateSnippet(r.content || ""),
				domain: extractDomain(r.url),
				published_at: r.published_date ?? null,
				score: r.score ?? 0,
			}));

			const content = formatResultsText(results, params.query);

			return {
				content: [{ type: "text", text: content }],
				details: {
					provider: "tavily",
					query: params.query,
					applied_filters: {
						topic,
						depth,
						allowed_domains: params.allowed_domains ?? [],
						blocked_domains: params.blocked_domains ?? [],
						freshness: params.freshness ?? null,
						max_results: maxResults,
					},
					results,
				},
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("web_search "));
			text += theme.fg("accent", `"${args.query}"`);

			const parts: string[] = [];
			if (args.topic) parts.push(args.topic as string);
			if (args.depth) parts.push(args.depth as string);
			if (args.freshness) parts.push(args.freshness as string);
			if (args.max_results) parts.push(`max ${args.max_results}`);
			if ((args.allowed_domains as string[])?.length) {
				parts.push(`in ${(args.allowed_domains as string[]).join(", ")}`);
			}
			if (parts.length) {
				text += " " + theme.fg("dim", parts.join(" · "));
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("muted", "Searching…"), 0, 0);
			}

			const details = result.details as { results?: SearchResult[] } | undefined;
			const results = details?.results ?? [];

			if (results.length === 0) {
				return new Text(theme.fg("warning", "No results found"), 0, 0);
			}

			const lines = results.map((r, i) => {
				const num = theme.fg("dim", `${i + 1}.`);
				const title = theme.fg("text", r.title);
				const url = theme.fg("accent", r.url);
				const snippet = theme.fg("muted", r.snippet);
				return `${num} ${title}\n   ${url}\n   ${snippet}`;
			});

			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
