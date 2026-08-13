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

import { GATEWAY_URL, MODEL } from "@/lib/doc-extract.server";
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
  "For each tender item, decide whether ANY catalogue product is a plausible match for what the item actually is (material, equipment or service), even if the wording differs.",
  "Hard rules:",
  "- Only return a productId that appears in the given catalogue list. Never invent one.",
  "- If no catalogue product is a plausible match, return productId: null for that item. Do not force a match.",
  "- confidence is 0..1 and must reflect how sure you are the product is the right one.",
  "- rationale is a short (under 200 characters) explanation a human reviewer can quickly verify.",
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
    "Suggest the best catalogue product for each tender item below, if any is a plausible match.",
    `Catalogue:\n${JSON.stringify(catalogue)}`,
    `Tender items:\n${JSON.stringify(items)}`,
    'Return JSON: {"matches":[{"boqItemId":string,"productId":string|null,"confidence":number,"rationale":string}]}',
  ].join("\n\n");

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
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

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content ?? "";
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
