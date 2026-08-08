/**
 * Post-authentication redirect targets come from the URL, so they are untrusted.
 * Only same-origin absolute paths are allowed; everything else falls back to "/".
 */
export function safeNext(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  // "//host" and "/\host" are protocol-relative escapes to another origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}
