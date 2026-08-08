import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { useAppTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  // Public route: the recovery link lands here with a hash fragment the
  // Supabase browser client turns into a temporary session.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — TenderReady" },
      {
        name: "description",
        content: "Set a new password for your TenderReady account after using a recovery link.",
      },
      { property: "og:title", content: "Reset password — TenderReady" },
      {
        property: "og:description",
        content: "Choose a new password for your TenderReady workspace account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useAppTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setBusy(false);
      setError(t("common.unexpectedError"));
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold break-words text-foreground sm:text-2xl">
          {t("auth.resetTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("auth.resetSubtitle")}</p>

        {done ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-foreground">{t("auth.passwordUpdated")}</p>
            <Button className="w-full" onClick={() => void navigate({ to: "/dashboard" })}>
              {t("nav.dashboard")}
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm break-words text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("common.loading") : t("auth.reset")}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
