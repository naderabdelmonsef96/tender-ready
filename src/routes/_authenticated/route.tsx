import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { useAppTranslation } from "@/components/language-provider";
import { WorkspaceProvider, useWorkspace } from "@/components/workspace-provider";
import { ErrorState, LoadingRows } from "@/components/ui-blocks";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  // Browser-only: the Supabase session lives in localStorage, so the server
  // cannot evaluate this gate.
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <WorkspaceProvider>
      <WorkspaceGate />
    </WorkspaceProvider>
  );
}

function WorkspaceGate() {
  const { t } = useAppTranslation();
  const workspace = useWorkspace();

  if (workspace.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl p-6">
        <LoadingRows rows={5} />
      </div>
    );
  }

  if (workspace.error) {
    return (
      <div className="mx-auto w-full max-w-xl p-6">
        <ErrorState
          message={workspace.error.message || t("common.unexpectedError")}
          action={
            <Button variant="outline" onClick={workspace.refetch}>
              {t("common.retry")}
            </Button>
          }
        />
      </div>
    );
  }

  if (!workspace.activeMembership) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">{t("auth.noAccess")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.noAccessHelp")}</p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            {t("common.signOut")}
          </Button>
        </div>
      </main>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
