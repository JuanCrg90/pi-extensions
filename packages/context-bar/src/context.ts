/**
 * Pure context-estimation helpers used by the context-bar extension.
 * Kept separate from Pi/TUI imports so they can be unit-tested without
 * loading the extension runtime.
 */

import type { ThemeColor } from "@earendil-works/pi-coding-agent";

export type CategoryKey =
  | "systemPrompt"
  | "tools"
  | "mcpTools"
  | "skills"
  | "projectContext"
  | "messages";

export interface CategoryMeta {
  label: string;
  color: ThemeColor;
}

export const CATEGORY_ORDER: CategoryKey[] = [
  "systemPrompt",
  "tools",
  "mcpTools",
  "skills",
  "projectContext",
  "messages",
];

export const CATEGORY_META: Record<CategoryKey, CategoryMeta> = {
  systemPrompt: { label: "system prompt", color: "accent" },
  tools: { label: "tools", color: "warning" },
  mcpTools: { label: "mcp tools", color: "error" },
  skills: { label: "skills", color: "success" },
  projectContext: { label: "memory files", color: "thinkingMedium" },
  messages: { label: "messages", color: "thinkingHigh" },
};

export interface GenericMessage {
  role: string;
  content?: string | unknown[];
}

export interface SystemPromptOptions {
  contextFiles?: Array<{ content?: string }>;
  skills?: unknown[];
}

export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function contentPartText(part: unknown): string {
  if (!part || typeof part !== "object") return "";
  if ("text" in part) return String((part as { text?: unknown }).text ?? "");
  if ("thinking" in part)
    return String((part as { thinking?: unknown }).thinking ?? "");
  if ("arguments" in part) {
    const name = "name" in part ? String((part as { name?: unknown }).name ?? "") : "";
    return `${name} ${JSON.stringify((part as { arguments: unknown }).arguments)}`;
  }
  return "";
}

export function messageText(message: GenericMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map(contentPartText).join("");
  }
  return "";
}

export function parseSystemPromptSections(
  systemPrompt: string,
): Record<string, string> {
  const sections: Record<string, string> = {};
  const tagRe = /<([a-zA-Z_][a-zA-Z0-9_]*)>\n([\s\S]*?)\n<\/\1>/g;

  let match: RegExpExecArray | null;
  let firstTagIndex = -1;

  while ((match = tagRe.exec(systemPrompt)) !== null) {
    if (firstTagIndex === -1) {
      firstTagIndex = match.index;
      sections.preamble = systemPrompt.slice(0, match.index).trim();
    }
    sections[match[1]] = match[2];
  }

  if (firstTagIndex === -1) {
    sections.preamble = systemPrompt.trim();
  }

  return sections;
}

export function categorizeSections(
  sections: Record<string, string>,
): Partial<Record<CategoryKey, number>> {
  const result: Partial<Record<CategoryKey, number>> = {};
  const add = (key: CategoryKey, tokens: number) => {
    result[key] = (result[key] ?? 0) + tokens;
  };

  for (const [name, text] of Object.entries(sections)) {
    const tokens = estimateTokens(text);
    switch (name) {
      case "preamble":
      case "rules":
      case "docs":
      case "addendum":
      case "cwd":
        add("systemPrompt", tokens);
        break;
      case "tools":
        add("tools", tokens);
        break;
      case "skills":
        add("skills", tokens);
        break;
      case "project_context":
        add("projectContext", tokens);
        break;
      default:
        // Custom prompt sections are folded into the system prompt bucket.
        add("systemPrompt", tokens);
        break;
    }
  }

  return result;
}

export function formatTokens(n: number): string {
  if (n < 1000) return `${Math.round(n)}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function formatPercent(n: number): string {
  const pct = Math.min(100, Math.max(0, n * 100));
  return `${pct.toFixed(0)}%`;
}

export interface DisplayCategory {
  key: CategoryKey;
  tokens: number;
}

export function scaleCategories(
  categories: Record<CategoryKey, number>,
  usedTokens: number | null,
): { used: number; categories: DisplayCategory[] } {
  const rawTotal = CATEGORY_ORDER.reduce(
    (sum, key) => sum + (categories[key] ?? 0),
    0,
  );
  const used = usedTokens ?? rawTotal;
  const ratio = rawTotal > 0 ? used / rawTotal : 1;

  const scaled = CATEGORY_ORDER
    .map((key) => ({ key, tokens: (categories[key] ?? 0) * ratio }))
    .filter((c) => c.tokens > 0);

  return { used, categories: scaled };
}
