/**
 * AI-assisted fallback for portfolio matching.
 *
 * Only called for BOQ items the deterministic scorer in match-engine.ts could
 * not link to any catalogue product at all. The model may only pick a
 * productId from the catalogue slice it was given, or return null — it can
 * never invent a product, and it never confirms anything by itself: every
 * suggestion still lands as portfolio_matches.state = "suggested" and needs a
 * human decision.
 */

import { z } from "zod";

import { GATEWAY_URL } from "@/lib/doc-extract.server";
import type { MatchProduct } from "@/lib/match-engine";

export type PortfolioAiItem = {
  boqItemId: string;
  description: string;
  unit: string | null;
  sectionPath: string | null;
};

export type PortfolioAiCandidate = {
  boqItemId: string;
  productId: string;
  confidence: number;
  rationale: string;
};

const AI_ITEM_LIMIT = 25;
const AI_CATALOGUE_LIMIT = 300;

const SYSTEM_PROMPT = [
  "You are a procurement matching assistant for an engineering contractor.",
  "You are given tender BOQ items a deterministic matcher could not link to any catalogue product, plus the organization's active product catalogue.",
  "For each tender item, propose the single closest catalogue product for what the item actually is (material, equipment or service), even if the match is imperfect.",
  "Hard rules:",
  "- Only return a productId that appears in the given catalogue list. Never invent one.",
  "- Always propose the closest available product, even at low confidence. Return productId: null only when the catalogue has nothing in even a remotely related category (e.g. the item is plumbing and the whole catalogue is electrical).",
  "- Never pretend an imperfect match is exact. confidence is 0..1 and must honestly reflect how close the product really is.",
  '- rationale is short (under 200 characters) and MUST name the concrete difference in specs, size or rating between what was asked for and the proposed product whenever they are not identical (e.g. "closest available; requested 25mm2, catalogue item is 16mm2"). If the match is exact, say so briefly instead.',
  "- Judge only what the item is, never price, stock or lead time.",
  "- Return ONLY strict JSON matching the schema given by the user.",
].join("\n");

const responseSchema = z.object({
  matches: z.array(
    z.object({
      boqItemId: z.string(),
      productId: z.string().nullable().optional(),
      confidence: z.number().nullable().optional(),
      rationale: z.string().nullable().optional(),
    }),
  ),
});

/** Extracts the first JSON object from a model reply that may be fenced or prefixed. */
function parseResponseJson(content: string): z.infer<typeof responseSchema> {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return JSON.");
  const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
  return responseSchema.parse(parsed);
}

/**
 * Best-effort AI suggestions for items with zero deterministic candidates.
 * Never throws — any failure (missing key, network, bad response) yields an
 * empty array so the deterministic match run always completes regardless of
 * AI availability.
 */
export async function suggestPortfolioMatches(input: {
  items: PortfolioAiItem[];
  catalogue: MatchProduct[];
}): Promise<PortfolioAiCandidate[]> {
  const apiKey = process.env["GOOGLE_AI_API_KEY"];
  if (!apiKey || input.items.length === 0 || input.catalogue.length === 0) return [];

  const items = input.items.slice(0, AI_ITEM_LIMIT);
  const catalogue = input.catalogue.slice(0, AI_CATALOGUE_LIMIT).map((product) => ({
    id: product.id,
    code: product.code,
    name: product.name,
    nameAr: product.nameAr,
    brand: product.brand,
    category: product.category,
    unit: product.unit,
  }));

  const userContent = [
    "Propose the closest catalogue product for each tender item below, even if the match is imperfect.",
    `Catalogue:\n${JSON.stringify(catalogue)}`,
    `Tender items:\n${JSON.stringify(items)}`,
    'Return JSON: {"matches":[{"boqItemId":string,"productId":string|null,"confidence":number,"rationale":string}]}',
  ].join("\n\n");

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userContent }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
    });
  } catch (error) {
    console.error("[suggestPortfolioMatches] network error", error);
    return [];
  }

  if (!response.ok) {
    console.error(
      "[suggestPortfolioMatches] gateway error",
      response.status,
      (await response.text()).slice(0, 500),
    );
    return [];
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (!content.trim()) return [];

  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = parseResponseJson(content);
  } catch (error) {
    console.error("[suggestPortfolioMatches] parse error", error);
    return [];
  }

  const catalogueIds = new Set(catalogue.map((product) => product.id));
  const out: PortfolioAiCandidate[] = [];
  for (const match of parsed.matches) {
    if (!match.productId || !catalogueIds.has(match.productId)) continue;
    out.push({
      boqItemId: match.boqItemId,
      productId: match.productId,
      confidence: Math.min(1, Math.max(0, match.confidence ?? 0.5)),
      rationale: (match.rationale ?? "").slice(0, 300),
    });
  }
  return out;
}
