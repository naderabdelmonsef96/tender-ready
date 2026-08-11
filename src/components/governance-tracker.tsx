import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, X } from "lucide-react";

import { useAppTranslation } from "@/components/language-provider";
import { Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { getGovernanceTimeline, type GovernanceStage } from "@/lib/governance.functions";
import { cn } from "@/lib/utils";

const STAGE_ROUTES: Record<string, string> = {
  intake: "/workbench/intake",
  technical: "/workbench/requirements",
  product: "/workbench/portfolio",
  sourcing: "/workbench/sourcing",
  commercial: "/workbench/review",
  finance: "/workbench/review",
  release: "/workbench/review",
};

/** Status-aware replacement for the old screen-only WorkbenchStepper: shows
 *  which governance stages actually passed, who decided them, and who the
 *  current stage is waiting on — not just which screen you're on. */
export function GovernanceTracker({
  tenderId,
  currentPath,
}: {
  tenderId: string | null;
  currentPath: string;
}) {
  const { t, language } = useAppTranslation();
  const { activeOrganizationId } = useWorkspace();
  const fetchTimeline = useServerFn(getGovernanceTimeline);

  const query = useQuery({
    queryKey: ["governance-timeline", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchTimeline({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
  });

  const stages = query.data?.stages ?? [];
  const passedCount = stages.filter((s) => s.status === "passed").length;
  const current = stages.find(
    (s) => s.status === "active" || s.status === "in_progress" || s.status === "rejected",
  );

  return (
    <Panel title={t("shell.stageProgress")} className="mb-4">
      {!tenderId ? (
        <p className="text-xs text-muted-foreground">{t("shell.trackerNoTender")}</p>
      ) : stages.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          <ol className="flex items-start">
            {stages.map((stage, index) => {
              const route = STAGE_ROUTES[stage.stage] ?? "/workbench/intake";
              const onThisScreen = route === currentPath;
              return (
                <li key={stage.stage} className="relative flex flex-1 flex-col items-center">
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "absolute end-1/2 top-[13px] h-0.5 w-full",
                        stage.status === "passed" ? "bg-success" : "bg-border",
                      )}
                    />
                  )}
                  <Link
                    to={route}
                    search={{ tender: tenderId }}
                    title={`${language === "ar" && stage.nameAr ? stage.nameAr : stage.name} — ${t(`governance.${stage.status}`)}`}
                    className={cn(
                      "relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-semibold transition-colors",
                      stage.status === "passed" &&
                        "border-success bg-success text-success-foreground",
                      (stage.status === "active" || stage.status === "in_progress") &&
                        "border-info bg-info/10 text-info",
                      stage.status === "rejected" &&
                        "border-destructive bg-destructive/10 text-destructive",
                      stage.status === "pending" && "border-border bg-muted text-muted-foreground",
                      onThisScreen && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    {stage.status === "passed" ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : stage.status === "rejected" ? (
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </Link>
                  <span
                    className={cn(
                      "mt-1.5 max-w-[5.5rem] truncate text-center text-[10.5px]",
                      stage.status === "pending"
                        ? "text-muted-foreground"
                        : "font-medium text-foreground",
                    )}
                  >
                    {language === "ar" && stage.nameAr ? stage.nameAr : stage.name}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-xs">
            <span className="text-muted-foreground">{stageCaption(current, t, language)}</span>
            <span className="tabular-nums text-muted-foreground">
              {t("governance.passedCount", { passed: passedCount, total: stages.length })}
            </span>
          </div>
        </>
      )}
    </Panel>
  );
}

function stageCaption(
  stage: GovernanceStage | undefined,
  t: ReturnType<typeof useAppTranslation>["t"],
  language: string,
): string {
  if (!stage) return t("governance.allPassed");
  const name = language === "ar" && stage.nameAr ? stage.nameAr : stage.name;
  if (stage.status === "rejected") {
    return t("governance.rejectedCaption", { stage: name });
  }
  if (stage.status === "active") {
    const names =
      stage.waitingOnNames.length > 0
        ? stage.waitingOnNames.join(", ")
        : t(`roles.${stage.approverRole}`);
    return t("governance.waitingCaption", { name: names, stage: name });
  }
  return t("governance.inProgressCaption", { stage: name });
}
