import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

/**
 * Tenancy guard: with no session (anon role) the Data API must expose no
 * business rows at all. Every table is org-scoped behind `is_org_member`,
 * so an anonymous caller is the strongest cross-tenant probe we can run
 * without provisioning two live users.
 */
const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];

const TABLES = [
  "organizations",
  "organization_memberships",
  "profiles",
  "company_settings",
  "clients",
  "tenders",
  "feature_flags",
  "notifications",
  "audit_events",
  "workflow_templates",
  "workflow_stages",
] as const;

describe.runIf(url && key)("anonymous access is denied on every business table", () => {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key!.startsWith("sb_")) headers.delete("Authorization");
        headers.set("apikey", key!);
        return fetch(input, { ...init, headers });
      },
    },
  });

  for (const table of TABLES) {
    it(`${table} returns no rows to an anonymous caller`, async () => {
      const { data, error } = await client.from(table).select("*").limit(1);
      // Either a permission error or an empty set is acceptable; leaked rows are not.
      if (!error) expect(data ?? [], table).toHaveLength(0);
    });
  }

  it("audit_events cannot be written anonymously", async () => {
    const { error } = await client
      .from("audit_events")
      .insert({ organization_id: "11111111-1111-4111-8111-111111111111", action: "probe", object_type: "test" });
    expect(error).not.toBeNull();
  });
});
