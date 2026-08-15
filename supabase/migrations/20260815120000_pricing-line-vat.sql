-- Each pricing line can be marked taxable/exempt and optionally override the
-- blanket VAT rate entered at release. A null vat_percent means "use the
-- rate entered at release"; taxable = false always contributes zero VAT
-- regardless of any rate. releaseQuotation sums VAT per line instead of
-- applying one rate to the whole quotation.
ALTER TABLE public.pricing_lines
  ADD COLUMN taxable boolean NOT NULL DEFAULT true,
  ADD COLUMN vat_percent numeric(5,2) CHECK (vat_percent IS NULL OR (vat_percent >= 0 AND vat_percent <= 100));
