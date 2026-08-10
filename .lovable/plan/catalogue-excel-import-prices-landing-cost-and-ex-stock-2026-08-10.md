# Catalogue Excel import: prices, landing cost and ex-stock

Today the Catalogue Import screen (Settings → Catalogues) already accepts an Excel/CSV file and reads supplier code, name, unit, brand, category, price, currency and incoterm. What it cannot yet read is the **landing cost** and the **ex-stock position** (quantity, warehouse, lead time), so those still have to be typed product by product.

This plan extends the same import flow so one spreadsheet can set selling/base cost, landing cost, and stock for ex-stock items.

## What you'll be able to do

1. Upload one Excel/CSV price list in Settings → Catalogues → Import.
2. The importer recognises extra columns (any of these header wordings):
  - Landing cost: "landing cost", "landed cost", "cost landed", "cost price", "CP"
  - Landing cost currency: "landing currency", "landed cost currency"
  - Stock quantity: "stock", "qty in stock", "on hand", "available quantity"
  - Warehouse: "warehouse", "store", "location"
  - Lead time: "lead time", "lead time days", "delivery days"
3. The preview table shows the new columns alongside price, with a per-row warning when a value can't be read as a number — nothing is invented or silently zeroed.
4. On commit, each row updates the catalogue product's base cost, currency, incoterm, landing cost (+ currency and a landing-cost updated timestamp), and writes/updates the stock position for the given warehouse (defaulting to `main`).
5. A row with stock quantity greater than zero is what makes an item behave as **ex-stock** in matching and supply routing — the same rule the manual product form uses today, so imported rows will flow straight into Screen 04 ex-stock routing, for example, if the item has qty as 4 Each , it should show exstock - 4 - Each, so the formula in the table would be extock-QTY-UOM

## Rules kept

- Rows still require a supplier code and a name; missing either is skipped with a reason, not guessed.
- Blank cells leave the existing value untouched instead of overwriting with zero.
- Unreadable numbers become a row warning, never a silent value.
- Imported products stay inactive until reviewed, as they do now.
- Both English and Arabic labels get the new column names.

## Technical notes

- `src/lib/catalogue-parse.ts`: add `landingCost`, `landingCostCurrency`, `stockQuantity`, `warehouse`, `leadTimeDays` to `ColumnField`, `HEADER_SYNONYMS`, `FIELD_ORDER` and `ParsedCatalogueRow`; reuse `parsePrice` for numeric cells and add an integer parse for lead time. Extend `src/lib/catalogue-parse.test.ts`.
- `src/lib/catalogue-doc-ai.ts` + `catalogue-extract.server.ts`: add the same fields to the extraction schema so PDF/image price lists can carry them too (optional, nullable).
- `src/lib/catalogue-import.functions.ts`: widen `MappedRowData` with the new fields; in `commitCatalogueImportRows` write `landing_cost`, `landing_cost_currency`, `landing_cost_updated_at` on `catalogue_products` and upsert `stock_positions` on `(product_id, warehouse)` — mirroring the logic already in `src/lib/portfolio.functions.ts` around lines 540–600.
- `src/routes/_authenticated/settings.catalogue.tsx`: add preview columns for landing cost, stock and lead time in the import preview table.
- `src/lib/locales.ts`: new `catalogueImport.*` keys in EN and AR.
- No database migration needed — every target column already exists (`catalogue_products.landing_cost`, `landing_cost_currency`, `landing_cost_updated_at`, and the `stock_positions` table).
- Verification: unit tests for the parser, then a real upload of a small sheet with landing cost + stock to confirm commit and that the item shows as ex-stock.