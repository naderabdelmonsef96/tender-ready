import type { MatchProduct } from "@/lib/match-engine";

export type ProductRow = {
  id: string;
  code: string | null;
  supplier_code: string;
  name: string;
  name_ar: string | null;
  unit: string | null;
  brand: string | null;
  category: string | null;
  base_cost: number | string | null;
  currency: string;
  incoterm: string | null;
  landing_cost: number | string | null;
  landing_cost_currency: string | null;
  is_active: boolean;
  product_specifications?: { spec_key: string; spec_value: string; unit: string | null }[] | null;
  stock_positions?:
    { warehouse: string; quantity: number | string; lead_time_days: number }[] | null;
};

/** Maps a catalogue row (with joined specs/stock) onto the pure engine shape. */
export function toMatchProduct(row: ProductRow): MatchProduct {
  const stock = row.stock_positions ?? [];
  const quantity = stock.reduce((total, position) => total + Number(position.quantity ?? 0), 0);
  const leadTimes = stock.map((position) => position.lead_time_days ?? 0);
  return {
    id: row.id,
    code: row.code ?? row.supplier_code,
    name: row.name,
    nameAr: row.name_ar,
    unit: row.unit,
    brand: row.brand,
    category: row.category,
    specs: (row.product_specifications ?? []).map((spec) => ({
      key: spec.spec_key,
      value: spec.spec_value,
      unit: spec.unit,
    })),
    stockQuantity: quantity,
    leadTimeDays: leadTimes.length === 0 ? 0 : Math.min(...leadTimes),
  };
}

export const PRODUCT_SELECT =
  "id, catalogue_id, code, supplier_code, name, name_ar, unit, brand, category, base_cost, currency, incoterm, landing_cost, landing_cost_currency, is_active, product_specifications(spec_key, spec_value, unit), stock_positions(warehouse, quantity, lead_time_days)";

/** Stage the tender moves to when a stage approval is granted. */
export const NEXT_STAGE: Record<
  string,
  "technical" | "product" | "sourcing" | "commercial" | "finance" | "release"
> = {
  technical: "product",
  product: "sourcing",
  sourcing: "commercial",
  commercial: "finance",
  finance: "release",
};
