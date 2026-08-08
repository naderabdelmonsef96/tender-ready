import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type OAuthClient = { name?: string | null; client_id?: string | null; redirect_uri?: string | null };
type AuthorizationDetails = {
  client?: OAuthClient | null;
  scope?: string | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  user?: { email?: string | null } | null;
};
type OAuthResult = { data: AuthorizationDetails | null; error: { message: string } | null };

// The supabase.auth.oauth namespace is beta; keep a narrow typed wrapper for the
// three methods this route needs instead of reaching into SDK internals.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};

function oauthApi(): OAuthApi {
  const api = (supabase.auth as unknown as { oauth?: OAuthApi }).oauth;
  if (!api) throw new Error("This project's authentication service does not expose the OAuth consent API.");
  return api;
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "Share your email address",
  profile: "Share your basic profile",
};

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase client reads its session from localStorage.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search["authorization_id"] === "string" ? search["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id in the consent URL.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.searchStr).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  head: () => ({
    meta: [
      { title: "Authorize access — TenderReady" },
      { name: "description", content: "Approve or deny an application requesting access to your TenderReady account." },
      { property: "og:title", content: "Authorize access — TenderReady" },
      {
        property: "og:description",
        content: "Approve or deny an application requesting access to your TenderReady account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Authorization request unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Close this window and start the connection again from the application you were using.
        </p>
      </div>
    </main>
  ),
});

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "an application";
  const scopes: string[] = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: decideError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);

    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect was returned by the authorization service.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">Connect {clientName} to TenderReady</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This lets {clientName} use TenderReady as you, limited to the organizations you are a member of.
        </p>

        {details?.client?.redirect_uri && (
          <p className="mt-4 break-all text-xs text-muted-foreground">
            Redirects to <span className="font-mono">{details.client.redirect_uri}</span>
          </p>
        )}

        {scopes.length > 0 && (
          <ul className="mt-6 space-y-2 text-sm text-foreground">
            {scopes.map((scope) => (
              <li key={scope}>• {SCOPE_LABELS[scope] ?? `Additional permission requested: ${scope}`}</li>
            ))}
          </ul>
        )}

        <p className="mt-6 text-sm text-muted-foreground">
          This does not bypass TenderReady's roles, approval rules, or organization access rules.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button className="sm:flex-1" disabled={busy} onClick={() => void decide(true)}>
            {busy ? "Please wait…" : "Approve"}
          </Button>
          <Button variant="outline" className="sm:flex-1" disabled={busy} onClick={() => void decide(false)}>
            Cancel connection
          </Button>
        </div>
      </div>
    </main>
  );
}
