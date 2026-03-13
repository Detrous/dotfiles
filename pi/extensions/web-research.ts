/**
 * web_research extension
 *
 * High-level research tool backed by Perplexity Sonar API.
 * Reads credentials from ~/.pi/agent/web-tools.json
 *
 * Queries the web, synthesizes findings across multiple sources,
 * and returns a cited answer. Not a search primitive — produces
 * a ready-to-use researched answer with citations.
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
const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

const MODE_TO_MODEL: Record<string, string> = {
	quick: "sonar",
	balanced: "sonar-pro",
	deep: "sonar-deep-research",
};

const MODE_TO_CONTEXT_SIZE: Record<string, string> = {
	quick: "low",
	balanced: "medium",
	deep: "high",
};

const DEFAULT_MODE = "balanced";

const SYSTEM_PROMPT = `You are a research assistant. Search the web and provide a thorough answer.

Structure your response as:
1. A clear summary answering the query
2. Key findings with supporting details
3. A brief recommendation or conclusion if applicable

Include specific facts, numbers, and dates when available.
Cite sources inline using [1], [2], etc.`;

// ── types ─────────────────────────────────────────────────────────────────────

interface PerplexitySearchResult {
	title: string;
	url: string;
	date?: string;
	last_updated?: string;
	snippet: string;
	source?: string;
}

interface PerplexityUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
}

interface PerplexityResponse {
	id: string;
	model: string;
	choices: Array<{
		index: number;
		message: { role: string; content: string };
		finish_reason: string;
	}>;
	citations?: string[];
	search_results?: PerplexitySearchResult[];
	related_questions?: string[];
	usage: PerplexityUsage;
}

interface ResearchDetails {
	provider: "perplexity";
	model: string;
	mode: "quick" | "balanced" | "deep";
	query: string;
	purpose: string | null;
	applied_filters: {
		allowed_domains: string[];
		blocked_domains: string[];
		freshness: string | null;
		search_context_size: string;
	};
	citations: string[];
	search_results: PerplexitySearchResult[];
	usage: PerplexityUsage;
	truncated: boolean;
	full_output_path: string | null;
}

// ── config ────────────────────────────────────────────────────────────────────

function loadPerplexityApiKey(): string {
	let raw: string;
	try {
		raw = readFileSync(CONFIG_PATH, "utf8");
	} catch (err: any) {
		if (err.code === "ENOENT") {
			throw new Error(
				`Missing config file: ${CONFIG_PATH}\n\n` +
					`Create it with:\n` +
					`{\n  "perplexity": {\n    "apiKey": "YOUR_PERPLEXITY_API_KEY"\n  }\n}\n\n` +
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

	const apiKey = config?.perplexity?.apiKey;
	if (!apiKey || typeof apiKey !== "string") {
		throw new Error(
			`Missing perplexity.apiKey in ${CONFIG_PATH}\n\n` +
				`Expected format:\n` +
				`{\n  "perplexity": {\n    "apiKey": "YOUR_PERPLEXITY_API_KEY"\n  }\n}`,
		);
	}

	return apiKey.trim();
}

// ── perplexity request ────────────────────────────────────────────────────────

async function researchPerplexity(
	apiKey: string,
	query: string,
	options: {
		mode: "quick" | "balanced" | "deep";
		purpose?: string;
		allowed_domains?: string[];
		blocked_domains?: string[];
		freshness?: string;
	},
	signal?: AbortSignal,
): Promise<PerplexityResponse> {
	const model = MODE_TO_MODEL[options.mode];
	const contextSize = MODE_TO_CONTEXT_SIZE[options.mode];

	let systemContent = SYSTEM_PROMPT;
	if (options.purpose) {
		systemContent += `\n\nResearch focus: ${options.purpose}`;
	}

	const body: Record<string, any> = {
		model,
		messages: [
			{ role: "system", content: systemContent },
			{ role: "user", content: query },
		],
		stream: false,
		return_related_questions: false,
		web_search_options: {
			search_context_size: contextSize,
		},
	};

	// Domain filters: allowed as-is, blocked prefixed with "-"
	const domainFilter: string[] = [];
	if (options.allowed_domains?.length) {
		domainFilter.push(...options.allowed_domains);
	}
	if (options.blocked_domains?.length) {
		domainFilter.push(...options.blocked_domains.map((d) => `-${d}`));
	}
	if (domainFilter.length > 0) {
		body.search_domain_filter = domainFilter.slice(0, 20); // API max 20
	}

	if (options.freshness) {
		body.search_recency_filter = options.freshness;
	}

	const response = await fetch(PERPLEXITY_API_URL, {
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
			throw new Error(`Perplexity auth failed (${response.status}). Check your API key in ${CONFIG_PATH}`);
		}
		if (response.status === 429) {
			throw new Error("Perplexity rate limit exceeded (429). Try again shortly.");
		}
		throw new Error(`Perplexity API error ${response.status}: ${text || response.statusText}`);
	}

	return (await response.json()) as PerplexityResponse;
}

// ── formatting ────────────────────────────────────────────────────────────────

function formatResearchText(
	answerContent: string,
	citations: string[],
): string {
	const parts = [answerContent.trim()];

	if (citations.length > 0) {
		parts.push("");
		parts.push("Sources:");
		for (let i = 0; i < citations.length; i++) {
			parts.push(`[${i + 1}] ${citations[i]}`);
		}
	}

	return parts.join("\n");
}

// ── extension ─────────────────────────────────────────────────────────────────

export default function webResearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_research",
		label: "Web Research",
		description:
			"Research a topic using web sources and return a cited synthesized answer. " +
			"Unlike web_search (which returns links) or web_extract (which reads one page), " +
			"web_research produces a ready-to-use researched answer with inline citations. " +
			"Best for broad research questions, comparisons, and current-state summaries.",
		promptSnippet: "Research a topic using web sources and return a cited synthesized answer",
		promptGuidelines: [
			"Use web_research when you need a synthesized answer with citations, not just a list of links.",
			"Use web_search + web_extract for targeted source inspection; use web_research for broad research questions.",
			"web_research is the most expensive web tool — prefer web_search when just finding URLs is sufficient.",
			"Provide a purpose when the query alone doesn't convey what aspects to focus on.",
		],
		parameters: Type.Object({
			query: Type.String({ description: "Research query" }),
			purpose: Type.Optional(
				Type.String({
					description:
						"What the research should focus on — guides synthesis direction (e.g. 'compare pricing tiers', 'find breaking changes since v3')",
				}),
			),
			mode: Type.Optional(
				StringEnum(["quick", "balanced", "deep"] as const, {
					description: "Research depth: quick (fast factual), balanced (standard), deep (multi-step agentic). Default balanced.",
				}),
			),
			allowed_domains: Type.Optional(
				Type.Array(Type.String(), { description: "Only search these domains" }),
			),
			blocked_domains: Type.Optional(
				Type.Array(Type.String(), { description: "Exclude these domains" }),
			),
			freshness: Type.Optional(
				StringEnum(["day", "week", "month", "year"] as const, {
					description: "Only use sources from this time period",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const apiKey = loadPerplexityApiKey();

			const mode = (params.mode ?? DEFAULT_MODE) as "quick" | "balanced" | "deep";
			const purpose = params.purpose?.trim() || undefined;

			const pplxResponse = await researchPerplexity(
				apiKey,
				params.query,
				{
					mode,
					purpose,
					allowed_domains: params.allowed_domains,
					blocked_domains: params.blocked_domains,
					freshness: params.freshness,
				},
				signal,
			);

			const answerContent = pplxResponse.choices?.[0]?.message?.content;
			if (!answerContent) {
				throw new Error("Perplexity returned an empty response");
			}

			const citations = pplxResponse.citations ?? [];
			const searchResults = pplxResponse.search_results ?? [];
			const usage = pplxResponse.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

			const fullOutput = formatResearchText(answerContent, citations);

			const truncation = truncateHead(fullOutput, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let content = truncation.content;
			let fullOutputPath: string | null = null;

			if (truncation.truncated) {
				const tempDir = mkdtempSync(join(tmpdir(), "pi-web-research-"));
				const tempFile = join(tempDir, "research.md");
				writeFileSync(tempFile, fullOutput);
				fullOutputPath = tempFile;

				content += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
				content += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
				content += ` Full output saved to: ${fullOutputPath}]`;
			}

			return {
				content: [{ type: "text", text: content }],
				details: {
					provider: "perplexity",
					model: pplxResponse.model ?? MODE_TO_MODEL[mode],
					mode,
					query: params.query,
					purpose: purpose ?? null,
					applied_filters: {
						allowed_domains: params.allowed_domains ?? [],
						blocked_domains: params.blocked_domains ?? [],
						freshness: params.freshness ?? null,
						search_context_size: MODE_TO_CONTEXT_SIZE[mode],
					},
					citations,
					search_results: searchResults,
					usage,
					truncated: truncation.truncated,
					full_output_path: fullOutputPath,
				} satisfies ResearchDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("web_research "));
			text += theme.fg("accent", `"${args.query}"`);

			const parts: string[] = [];
			if (args.mode) parts.push(args.mode as string);
			if (args.freshness) parts.push(args.freshness as string);
			if (args.purpose) parts.push(`focus: "${args.purpose}"`);
			if ((args.allowed_domains as string[])?.length) {
				parts.push(`in ${(args.allowed_domains as string[]).join(", ")}`);
			}
			if (parts.length) {
				text += " " + theme.fg("dim", parts.join(" · "));
			}

			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("muted", "Researching…"), 0, 0);
			}

			if (result.isError) {
				const msg = result.content?.[0];
				const errText = msg?.type === "text" ? msg.text : "Research failed";
				return new Text(theme.fg("error", errText), 0, 0);
			}

			const details = result.details as ResearchDetails | undefined;
			if (!details) {
				return new Text(theme.fg("warning", "No research results"), 0, 0);
			}

			let text = theme.fg("success", "✓ ");
			text += theme.fg("text", details.model);
			text += theme.fg("dim", ` · ${details.citations.length} source${details.citations.length !== 1 ? "s" : ""}`);
			text += theme.fg("dim", ` · ${details.usage.total_tokens} tokens`);

			if (details.truncated) {
				text += theme.fg("warning", " · truncated");
			}

			if (expanded) {
				if (details.purpose) {
					text += "\n" + theme.fg("dim", `Focus: ${details.purpose}`);
				}
				for (const url of details.citations.slice(0, 5)) {
					text += "\n  " + theme.fg("accent", url);
				}
				if (details.citations.length > 5) {
					text += "\n  " + theme.fg("dim", `… and ${details.citations.length - 5} more`);
				}
				if (details.full_output_path) {
					text += "\n" + theme.fg("dim", `Full output: ${details.full_output_path}`);
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
