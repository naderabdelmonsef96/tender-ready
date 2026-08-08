import { Link } from "@tanstack/react-router";

import { navGroups } from "@/components/app-nav";
import { useAppTranslation } from "@/components/language-provider";
import { Panel } from "@/components/ui-blocks";
import { cn } from "@/lib/utils";

/** Guided stepper shown on every workbench screen so the governed flow reads correctly. */
export function WorkbenchStepper({ currentPath }: { currentPath: string }) {
  const { t } = useAppTranslation();
  const steps = navGroups.find((group) => group.labelKey === "nav.workbench")?.items ?? [];

  return (
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
  );
}
