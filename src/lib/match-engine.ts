/**
 * Deterministic portfolio matching.
 *
 * Pure functions only — no I/O, no AI, nothing invented. Hard gates exclude a
 * product outright; the weighted score is advisory and always reported next to
 * the fields that matched and the fields that failed, so a human can verify the
 * suggestion before confirming it. Nothing here confirms a match by itself.
 */

export type ProductSpec = {
  key: string;
  value: string;
  unit: string | null;
};

export type MatchProduct = {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  unit: string | null;
  brand: string | null;
  category: string | null;
  specs: ProductSpec[];
  stockQuantity: number;
  leadTimeDays: number;
};

export type MatchItem = {
  description: string;
  unit: string | null;
  sectionPath: string | null;
};

export type MatchDifference = {
  key: string;
  requested: string;
  catalog: string;
};

export type MatchCandidate = {
  productId: string;
  score: number;
  matchedOn: string[];
  failedOn: string[];
  differences: MatchDifference[];
};

/** Score below which the UI marks a suggestion as weak — advisory only, never excludes it. */
export const SUGGEST_FLOOR = 0.25;

const UNIT_ALIASES: Record<string, string> = {
  no: "no",
  nos: "no",
  num: "no",
  pc: "no",
  pcs: "no",
  piece: "no",
  pieces: "no",
  ea: "no",
  each: "no",
  item: "no",
  unit: "no",
  set: "set",
  sets: "set",
  lot: "lot",
  ls: "lot",
  m: "m",
  mt: "m",
  lm: "m",
  meter: "m",
  metre: "m",
  meters: "m",
  m2: "m2",
  sqm: "m2",
  m3: "m3",
  cum: "m3",
  kg: "kg",
  kgs: "kg",
  ton: "ton",
  tons: "ton",
  tonne: "ton",
  l: "l",
  ltr: "l",
  litre: "l",
  liter: "l",
  hr: "hr",
  hour: "hr",
  day: "day",
};

/** Canonical unit family, or null when the unit is unknown/absent. */
export function canonicalUnit(unit: string | null | undefined): string | null {
  if (!unit) return null;
  const cleaned = unit.toLowerCase().replace(/[.\s]/g, "").replace(/²/g, "2").replace(/³/g, "3");
  if (!cleaned) return null;
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "of",
  "to",
  "as",
  "per",
  "including",
  "include",
  "supply",
  "supplying",
  "install",
  "installation",
  "installed",
  "provide",
  "providing",
  "item",
  "items",
  "work",
  "works",
  "complete",
  "all",
  "any",
  "type",
  "approved",
  "من",
  "في",
  "على",
  "مع",
  "الى",
  "إلى",
  "توريد",
  "وتركيب",
  "تركيب",
]);

/** Lowercased, punctuation-free significant tokens (Arabic-safe). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u200f\u200e]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

const MEASURE_UNITS = [
  "mm",
  "cm",
  "m",
  "kw",
  "kva",
  "w",
  "hp",
  "cfm",
  "lps",
  "bar",
  "v",
  "a",
  "mm2",
  "ton",
  "btu",
  "rpm",
  "lpm",
];

export type Measure = { value: number; unit: string };

/** Numeric measurements written in free text, e.g. "100 mm", "36W", "4C x 16 mm2". */
export function extractMeasures(text: string): Measure[] {
  const normalized = text
    .toLowerCase()
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/,(?=\d{3}\b)/g, "");
  const out: Measure[] = [];
  const pattern = /(\d+(?:\.\d+)?)\s*([a-z]+2?)/g;
  let match = pattern.exec(normalized);
  while (match !== null) {
    const value = Number(match[1]);
    const unit = match[2] ?? "";
    if (Number.isFinite(value) && MEASURE_UNITS.includes(unit)) out.push({ value, unit });
    match = pattern.exec(normalized);
  }
  return out;
}

function specMeasure(spec: ProductSpec): Measure | null {
  const unit = (spec.unit ?? "").toLowerCase().replace(/²/g, "2");
  const value = Number(spec.value.replace(/,/g, ""));
  if (!unit || !MEASURE_UNITS.includes(unit) || !Number.isFinite(value)) return null;
  return { value, unit };
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  setA.forEach((token) => {
    if (setB.has(token)) shared += 1;
  });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : shared / union;
}

/**
 * Scores one product against one BOQ item.
 * Returns null when a hard gate excludes the product.
 */
export function scoreProduct(item: MatchItem, product: MatchProduct): MatchCandidate | null {
  const matchedOn: string[] = [];
  const failedOn: string[] = [];
  const differences: MatchDifference[] = [];

  // Hard gate — unit family must be compatible when both sides declare one.
  // A "per metre" item can never be fulfilled by an "each" product, so this
  // is a real exclusion. A conflicting spec value, below, is not: it's
  // recorded and scored down instead, so the closest available product still
  // surfaces with the mismatch spelled out for a human to weigh.
  const itemUnit = canonicalUnit(item.unit);
  const productUnit = canonicalUnit(product.unit);
  if (itemUnit && productUnit && itemUnit !== productUnit) return null;
  if (itemUnit && productUnit) matchedOn.push("unit");

  const itemTokens = tokenize(item.description);
  const productTokens = tokenize(
    [product.name, product.nameAr ?? "", product.brand ?? "", product.category ?? ""].join(" "),
  );

  // A measurement written in the item that contradicts a product spec stated
  // in the same unit counts against the score but does not exclude the
  // product — the exact requested-vs-catalog values are recorded so the
  // reviewer sees precisely what differs before confirming anything.
  const itemMeasures = extractMeasures(item.description);
  let specHits = 0;
  let specChecks = 0;
  for (const spec of product.specs) {
    const measure = specMeasure(spec);
    if (!measure) continue;
    const sameUnit = itemMeasures.filter((candidate) => candidate.unit === measure.unit);
    if (sameUnit.length === 0) continue;
    specChecks += 1;
    const hit = sameUnit.find((candidate) => Math.abs(candidate.value - measure.value) < 1e-6);
    if (hit) {
      specHits += 1;
      matchedOn.push(`spec:${spec.key}`);
    } else {
      failedOn.push(`spec:${spec.key}`);
      const requested = sameUnit[0];
      if (requested) {
        differences.push({
          key: spec.key,
          requested: `${requested.value}${measure.unit}`,
          catalog: `${spec.value}${spec.unit ?? ""}`,
        });
      }
    }
  }

  const textScore = jaccard(itemTokens, productTokens);
  const brandHit = product.brand
    ? tokenize(product.brand).some((token) => itemTokens.includes(token))
    : false;
  if (brandHit) matchedOn.push("brand");
  const categoryHit = product.category
    ? tokenize(product.category).some((token) => itemTokens.includes(token))
    : false;
  if (categoryHit) matchedOn.push("category");
  const codeHit = item.description.toLowerCase().includes(product.code.toLowerCase());
  if (codeHit) matchedOn.push("code");

  const specScore = specChecks === 0 ? 0 : specHits / specChecks;
  if (specChecks === 0 && product.specs.length > 0) failedOn.push("spec:unverified");

  const score = Math.min(
    1,
    textScore * 0.55 +
      specScore * 0.25 +
      (brandHit ? 0.1 : 0) +
      (categoryHit ? 0.05 : 0) +
      (codeHit ? 0.3 : 0),
  );

  return {
    productId: product.id,
    score: Number(score.toFixed(4)),
    matchedOn,
    failedOn,
    differences,
  };
}

/**
 * Ranked candidates for one item. Deterministic ordering: score desc, then
 * product code so repeated runs never shuffle the list.
 */
export function rankCandidates(
  item: MatchItem,
  products: MatchProduct[],
  limit = 5,
): MatchCandidate[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return products
    .map((product) => scoreProduct(item, product))
    .filter((candidate): candidate is MatchCandidate => candidate !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const codeA = byId.get(a.productId)?.code ?? "";
      const codeB = byId.get(b.productId)?.code ?? "";
      return codeA.localeCompare(codeB);
    })
    .slice(0, limit);
}
