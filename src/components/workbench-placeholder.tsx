import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { useAppTranslation } from "@/components/language-provider";
import { PageHeader, Panel } from "@/components/ui-blocks";
import { navGroups } from "@/components/app-nav";
import { cn } from "@/lib/utils";

type PhaseKey = "phase2" | "phase3" | "phase4" | "phase5";

/**
 * Placeholder for an approved screen whose data layer arrives in a later phase.
 * It keeps the guided stepper visible so the governed flow reads correctly.
 */
export function WorkbenchPlaceholder({
  screenKey,
  phase,
  currentPath,
}: {
  screenKey: string;
  phase: PhaseKey;
  currentPath: string;
}) {
  const { t } = useAppTranslation();
  const steps = navGroups.find((group) => group.labelKey === "nav.workbench")?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title={t(screenKey)}
        subtitle={t("common.comingIn", { phase: t(`phase.${phase}`) })}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("phase.notice")}
          </span>
        }
      />

      <Panel title={t("shell.stageProgress")} className="mb-4">
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map((step, index) => {
            const active = step.to === currentPath;
            return (
              <li key={step.to} className="flex min-w-0 items-center gap-2">
                <Link
                  to={step.to}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border bg-surface text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="tabular-nums opacity-70">{index + 1}</span>
                  <span className="truncate">{t(step.labelKey)}</span>
                </Link>
                {index < steps.length - 1 && (
                  <span aria-hidden="true" className="text-border">
                    /
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("phase.body", { phase: t(`phase.${phase}`) })}
        </p>
      </Panel>
    </div>
  );
}
