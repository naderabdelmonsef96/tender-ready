import { auth, defineMcp } from "@lovable.dev/mcp-js";

import createTenderTool from "./tools/create-tender";
import getTenderTool from "./tools/get-tender";
import listClientsTool from "./tools/list-clients";
import listOrganizationsTool from "./tools/list-organizations";
import listTendersTool from "./tools/list-tenders";

// The OAuth issuer must be the direct Supabase host. VITE_SUPABASE_PROJECT_ID is
// inlined at build time and survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "tender-ready",
  title: "Tender Ready",
  version: "0.1.0",
  instructions:
    "Tools for TenderReady, a tender-to-quotation governance platform. Call list_organizations first to get an organization id, then list_tenders, get_tender, or list_clients to read tender data. create_tender opens a new draft tender header and is limited to organization admins and proposal engineers. All access is scoped to the signed-in user's organization memberships. Never invent prices, quantities, compliance claims, or supplier data.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listOrganizationsTool, listTendersTool, getTenderTool, listClientsTool, createTenderTool],
});
