import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useAppTranslation, useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { safeNext } from "@/lib/auth-redirect";

export const Route = createFileRoute("/auth")({
  // Browser-only: the Supabase client reads its session from localStorage.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ next: safeNext(search["next"]) }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ href: search.next });
  },
  head: () => ({
    meta: [
      { title: "Sign in — TenderReady" },
      {
        name: "description",
        content: "Sign in to TenderReady to manage tenders, requirements, pricing, and approvals.",
      },
      { property: "og:title", content: "Sign in — TenderReady" },
      {
        property: "og:description",
        content: "Secure access to your organization's tender-to-quotation workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useAppTranslation();
  const { language, toggleLanguage } = useLanguage();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") window.location.href = next;
    });
    return () => data.subscription.unsubscribe();
  }, [next]);

  function switchMode(target: Mode) {
    setMode(target);
    setError(null);
    setNotice(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(false);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setNotice(t("auth.resetSent"));
      return;
    }

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}${next}`,
        },
      });
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (!data.session) {
        setNotice(t("auth.checkEmail"));
        setMode("signin");
      }
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    void navigate({ href: next });
  }

  const primaryLabel =
    mode === "signin" ? t("common.signIn") : mode === "signup" ? t("common.signUp") : t("auth.sendReset");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold break-words text-foreground sm:text-2xl">
              {mode === "forgot" ? t("auth.reset") : t("auth.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("auth.subtitle")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            aria-label={t("common.language")}
            onClick={toggleLanguage}
          >
            {language === "ar" ? "EN" : "AR"}
          </Button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("common.fullName")}</Label>
              <Input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("common.email")}</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-2">
              <Label htmlFor="password">{t("common.password")}</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm break-words text-destructive">
              {error}
            </p>
          )}
          {notice && <p className="text-sm break-words text-muted-foreground">{notice}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t("common.loading") : primaryLabel}
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}
          >
            {mode === "signup" ? t("auth.haveAccount") : t("auth.needAccount")}
          </button>
          <button
            type="button"
            className="text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => switchMode(mode === "forgot" ? "signin" : "forgot")}
          >
            {mode === "forgot" ? t("auth.backToSignIn") : t("auth.forgot")}
          </button>
        </div>
      </div>
    </main>
  );
}
