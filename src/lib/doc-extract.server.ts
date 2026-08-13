import { strFromU8, unzipSync } from "fflate";

import {
  AI_EXTRACTION_SYSTEM_PROMPT,
  AI_EXTRACTION_USER_INSTRUCTION,
  classifyDocument,
  mapAiPayload,
  parseAiJson,
  type DocumentKind,
} from "@/lib/doc-ai";
import type { ExtractionResult } from "@/lib/boq-parse";

export const GATEWAY_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const MODEL = "gemini-3.6-flash";
export const MAX_INLINE_BYTES = 18 * 1024 * 1024;

/** Worker-safe base64 for inline document attachments. */
function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function imageMime(fileName: string, mimeType: string | null): string {
  if (mimeType?.startsWith("image/")) return mimeType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  return "image/jpeg";
}

/** Pulls readable text out of a .docx package (document body, headers, footers). */
export function readDocxText(bytes: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(bytes));
  const parts = Object.keys(files)
    .filter((name) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name))
    .sort();
  const chunks: string[] = [];
  for (const name of parts) {
    const raw = files[name];
    if (!raw) continue;
    const xml = strFromU8(raw);
    const text = xml
      .replace(/<w:tab[^>]*\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x?[0-9a-fA-F]+;/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n");
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export function buildBlocks(
  kind: DocumentKind,
  fileName: string,
  mimeType: string | null,
  bytes: ArrayBuffer,
  instruction: string = AI_EXTRACTION_USER_INSTRUCTION,
): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: "text", text: instruction }];

  if (kind === "pdf") {
    blocks.push({
      type: "file",
      file: {
        filename: fileName,
        file_data: `data:${mimeType || "application/pdf"};base64,${toBase64(bytes)}`,
      },
    });
    return blocks;
  }
  if (kind === "image") {
    blocks.push({
      type: "image_url",
      image_url: { url: `data:${imageMime(fileName, mimeType)};base64,${toBase64(bytes)}` },
    });
    return blocks;
  }

  const text = kind === "word" ? readDocxText(bytes) : new TextDecoder().decode(bytes);
  if (!text.trim()) throw new Error("No readable text could be found in this document.");
  blocks.push({
    type: "text",
    text: `Document: ${fileName}\n\n${text.slice(0, 180_000)}`,
  });
  return blocks;
}

export type DocumentExtractionOutcome =
  | { ok: true; result: ExtractionResult }
  | { ok: false; status: "failed" | "integration_required"; message: string };

/**
 * Reads a non-spreadsheet tender document (PDF, Word, image, text) with the AI
 * gateway and returns rows in the shared extraction contract.
 */
export async function extractDocument(input: {
  fileName: string;
  mimeType: string | null;
  bytes: ArrayBuffer;
}): Promise<DocumentExtractionOutcome> {
  const kind = classifyDocument(input.fileName, input.mimeType);
  if (kind === "unsupported") {
    return {
      ok: false,
      status: "integration_required",
      message:
        "This file type cannot be read yet. It is stored safely and nothing was guessed. Upload a PDF, Word, image, text or spreadsheet version to extract it.",
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

  let blocks: ContentBlock[];
  try {
    blocks = buildBlocks(kind, input.fileName, input.mimeType, input.bytes);
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      message: error instanceof Error ? error.message : "The document could not be read.",
    };
  }

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: AI_EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: blocks },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[extractDocument] gateway error", response.status, detail.slice(0, 800));
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
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    return { ok: false, status: "failed", message: "The document reader returned no content." };
  }

  try {
    return { ok: true, result: mapAiPayload(parseAiJson(content), input.fileName) };
  } catch (error) {
    console.error("[extractDocument] parse error", error);
    return {
      ok: false,
      status: "failed",
      message:
        "The document was read but the result could not be structured. Retry extraction, or upload a clearer copy.",
    };
  }
}
