import { createServerFn } from "@tanstack/react-start";
import Decimal from "decimal.js";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { ToWords } from "to-words";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { quotationTemplatePath } from "@/lib/quotation-template.functions";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  tenderId: z.string().uuid(),
});

/** MENA/GCC currencies this app is built for. Falls back to a generic
 *  US-Dollar-shaped reading for anything not listed here rather than
 *  failing the whole document generation over a wording nicety. */
const CURRENCY_WORDS: Record<
  string,
  {
    name: string;
    plural: string;
    symbol: string;
    precision?: number;
    fractionalUnit: { name: string; plural: string; symbol: string };
  }
> = {
  USD: {
    name: "Dollar",
    plural: "Dollars",
    symbol: "$",
    fractionalUnit: { name: "Cent", plural: "Cents", symbol: "¢" },
  },
  EUR: {
    name: "Euro",
    plural: "Euros",
    symbol: "€",
    fractionalUnit: { name: "Cent", plural: "Cents", symbol: "¢" },
  },
  GBP: {
    name: "Pound Sterling",
    plural: "Pounds Sterling",
    symbol: "£",
    fractionalUnit: { name: "Penny", plural: "Pence", symbol: "p" },
  },
  EGP: {
    name: "Egyptian Pound",
    plural: "Egyptian Pounds",
    symbol: "E£",
    fractionalUnit: { name: "Piastre", plural: "Piastres", symbol: "PT" },
  },
  BHD: {
    name: "Bahraini Dinar",
    plural: "Bahraini Dinars",
    symbol: "BD",
    precision: 3,
    fractionalUnit: { name: "Fils", plural: "Fils", symbol: "" },
  },
  KWD: {
    name: "Kuwaiti Dinar",
    plural: "Kuwaiti Dinars",
    symbol: "KD",
    precision: 3,
    fractionalUnit: { name: "Fils", plural: "Fils", symbol: "" },
  },
  OMR: {
    name: "Omani Rial",
    plural: "Omani Rials",
    symbol: "OMR",
    precision: 3,
    fractionalUnit: { name: "Baisa", plural: "Baisa", symbol: "" },
  },
  JOD: {
    name: "Jordanian Dinar",
    plural: "Jordanian Dinars",
    symbol: "JD",
    precision: 3,
    fractionalUnit: { name: "Fils", plural: "Fils", symbol: "" },
  },
  SAR: {
    name: "Saudi Riyal",
    plural: "Saudi Riyals",
    symbol: "SR",
    fractionalUnit: { name: "Halala", plural: "Halalas", symbol: "" },
  },
  AED: {
    name: "UAE Dirham",
    plural: "UAE Dirhams",
    symbol: "AED",
    fractionalUnit: { name: "Fils", plural: "Fils", symbol: "" },
  },
  QAR: {
    name: "Qatari Riyal",
    plural: "Qatari Riyals",
    symbol: "QR",
    fractionalUnit: { name: "Dirham", plural: "Dirhams", symbol: "" },
  },
};

function formatMoneyPlain(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function formatDatePlain(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function amountInWords(total: number, currency: string): string {
  try {
    const toWords = new ToWords({ localeCode: "en-US" });
    const currencyOptions = CURRENCY_WORDS[currency];
    return currencyOptions
      ? toWords.convert(total, { currency: true, currencyOptions })
      : toWords.convert(total, { currency: true });
  } catch {
    return "";
  }
}

export const generateQuotationDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [tenderRes, quotationRes, settingsRes] = await Promise.all([
      supabase
        .from("tenders")
        .select("id, reference, client_id")
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("quotations")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("tender_id", data.tenderId)
        .eq("status", "released")
        .maybeSingle(),
      supabase
        .from("company_settings")
        .select("bank_details, signature_block")
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
    ]);
    if (tenderRes.error) throw new Error(tenderRes.error.message);
    if (!tenderRes.data) throw new Error("Tender not found.");
    if (quotationRes.error) throw new Error(quotationRes.error.message);
    if (!quotationRes.data) throw new Error("This tender has no released quotation yet.");

    const quotation = quotationRes.data;

    const [linesRes, clientRes, preparedByRes, templateFile] = await Promise.all([
      supabase
        .from("quotation_lines")
        .select("description, unit, quantity, unit_price, total_price, sort_order")
        .eq("organization_id", data.organizationId)
        .eq("quotation_id", quotation.id)
        .order("sort_order"),
      tenderRes.data.client_id
        ? supabase
            .from("clients")
            .select("name, contact_person, address, email, phone, tax_no")
            .eq("id", tenderRes.data.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      quotation.released_by
        ? supabase
            .from("profiles")
            .select("full_name")
            .eq("id", quotation.released_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.storage
        .from("quotation-templates")
        .download(quotationTemplatePath(data.organizationId)),
    ]);
    if (linesRes.error) throw new Error(linesRes.error.message);
    if (clientRes.error) throw new Error(clientRes.error.message);
    if (templateFile.error || !templateFile.data) {
      throw new Error(
        "No quotation template has been uploaded yet. Ask an organization admin to upload one in Settings > Quotation template.",
      );
    }

    const templateBuffer = Buffer.from(await templateFile.data.arrayBuffer());
    const zip = new PizZip(templateBuffer);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "",
      delimiters: { start: "{{", end: "}}" },
    });

    const subtotal = new Decimal(quotation.subtotal);
    const discount = new Decimal(quotation.discount ?? 0);
    const taxable = subtotal.minus(discount);
    const vatAmount = new Decimal(quotation.vat_amount ?? 0);
    const vatPercent = taxable.isZero() ? new Decimal(0) : vatAmount.dividedBy(taxable).times(100);

    const items = (linesRes.data ?? []).map((line, i) => ({
      index: i + 1,
      description: line.description ?? "",
      unit: line.unit ?? "",
      qty: line.quantity ?? "",
      unit_price: formatMoneyPlain(Number(line.unit_price), quotation.currency),
      tax_percent: `${vatPercent.toDecimalPlaces(1).toString()}%`,
      total: formatMoneyPlain(Number(line.total_price), quotation.currency),
    }));

    const notes = (quotation.notes_assumptions ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((text, i) => ({ index: i + 1, text }));

    try {
      doc.render({
        quotation_no: quotation.quotation_number,
        date: formatDatePlain(quotation.released_at ?? quotation.created_at),
        valid_until: formatDatePlain(quotation.valid_until),
        currency: quotation.currency,
        prepared_by: preparedByRes.data?.full_name ?? "",
        reference: tenderRes.data.reference,
        customer_name: clientRes.data?.name ?? "",
        contact_name: clientRes.data?.contact_person ?? "",
        billing_address: clientRes.data?.address ?? "",
        customer_email: clientRes.data?.email ?? "",
        customer_phone: clientRes.data?.phone ?? "",
        customer_tax_no: clientRes.data?.tax_no ?? "",
        items,
        amount_in_words: amountInWords(Number(quotation.total), quotation.currency),
        subtotal: formatMoneyPlain(Number(quotation.subtotal), quotation.currency),
        has_discount: Number(quotation.discount ?? 0) > 0,
        discount: formatMoneyPlain(Number(quotation.discount ?? 0), quotation.currency),
        vat_amount: formatMoneyPlain(Number(quotation.vat_amount ?? 0), quotation.currency),
        has_other_charges: Number(quotation.other_charges ?? 0) > 0,
        other_charges: formatMoneyPlain(Number(quotation.other_charges ?? 0), quotation.currency),
        grand_total: formatMoneyPlain(Number(quotation.total), quotation.currency),
        payment_terms: quotation.payment_terms ?? "",
        delivery_terms: quotation.delivery_terms ?? "",
        warranty: quotation.warranty ?? "",
        offer_validity: formatDatePlain(quotation.valid_until),
        notes_assumptions: quotation.notes_assumptions ?? "",
        incoterms: quotation.incoterms ?? "",
        notes,
        bank_details: settingsRes.data?.bank_details ?? "",
        signature_block: settingsRes.data?.signature_block ?? "",
      });
    } catch (error) {
      const message =
        error instanceof Error && "properties" in error
          ? JSON.stringify((error as { properties?: unknown }).properties)
          : (error as Error).message;
      throw new Error(`The quotation template could not be filled: ${message}`);
    }

    const output = doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
    return {
      fileName: `${quotation.quotation_number}.docx`,
      base64: output.toString("base64"),
    };
  });
