import {
  CATALOGUE_AI_SYSTEM_PROMPT,
  CATALOGUE_AI_USER_INSTRUCTION,
  mapCatalogueAiPayload,
  parseCatalogueAiJson,
  type MappedCatalogueAiRow,
} from "@/lib/catalogue-doc-ai";
import { classifyDocument } from "@/lib/doc-ai";
import { buildBlocks, GATEWAY_URL, MAX_INLINE_BYTES } from "@/lib/doc-extract.server";

export type CatalogueDocumentExtractionOutcome =
  | { ok: true; rows: MappedCatalogueAiRow[] }
  | { ok: false; status: "failed" | "integration_required"; message: string };

/**
 * Reads a non-spreadsheet catalogue document (PDF, Word, image) with the AI
 * gateway and returns candidate product rows. Mirrors extractDocument in
 * doc-extract.server.ts but targets product rows instead of BOQ items.
 */
export async function extractCatalogueDocument(input: {
  fileName: string;
  mimeType: string | null;
  bytes: ArrayBuffer;
}): Promise<CatalogueDocumentExtractionOutcome> {
  const kind = classifyDocument(input.fileName, input.mimeType);
  if (kind === "unsupported" || kind === "spreadsheet") {
    return {
      ok: false,
      status: "integration_required",
      message:
        "This file type cannot be read yet. It is stored safely and nothing was guessed. Upload a PDF, Word, image or spreadsheet version to extract it.",
    };
  }
  if (input.bytes.byteLength > MAX_INLINE_BYTES) {
    return {
      ok: false,
      status: "failed",
      message: "This document is larger than 18 MB. Split it and upload the parts separately.",
    };
  }

  const apiKey = process.env["GOOGLE_AI_API_KEY"];
  if (!apiKey) {
    return {
      ok: false,
      status: "integration_required",
      message: "Document intelligence is not configured on this workspace yet.",
    };
  }

  let blocks;
  try {
    blocks = buildBlocks(
      kind,
      input.fileName,
      input.mimeType,
      input.bytes,
      CATALOGUE_AI_USER_INSTRUCTION,
    );
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "The document could not be read.",
    };
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: CATALOGUE_AI_SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: blocks }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(
      "[extractCatalogueDocument] gateway error",
      response.status,
      detail.slice(0, 800),
    );
    if (response.status === 429) {
      return {
        ok: false,
        status: "failed",
        message:
          "The document reader is rate limited right now. Retry extraction in a few minutes.",
      };
    }
    if (response.status === 402 || response.status === 403) {
      return {
        ok: false,
        status: "failed",
        message:
          "The document reader's AI quota or billing needs attention. Check the Google AI API key, then retry extraction.",
      };
    }
    return {
      ok: false,
      status: "failed",
      message: `The document reader rejected this file (${response.status}). The file is stored; nothing was extracted.`,
    };
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  if (!content.trim()) {
    return { ok: false, status: "failed", message: "The document reader returned no content." };
  }

  try {
    return { ok: true, rows: mapCatalogueAiPayload(parseCatalogueAiJson(content)) };
  } catch (error) {
    console.error("[extractCatalogueDocument] parse error", error);
    return {
      ok: false,
      status: "failed",
      message:
        "The document was read but the result could not be structured. Retry extraction, or upload a clearer copy.",
    };
  }
}
