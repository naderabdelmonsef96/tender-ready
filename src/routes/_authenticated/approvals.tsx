import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert } from "lucide-react";

import { useAppTranslation } from "@/components/language-provider";
import {
  DecisionBadge,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Panel,
  StageBadge,
} from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getApprovalQueue } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({
    meta: [
      { title: "Approval inbox — TenderReady" },
      {
        name: "description",
        content:
          "Stage decisions waiting on your role, with maker-checker separation enforced server-side.",
      },
      { property: "og:title", content: "Approval inbox — TenderReady" },
      { property: "og:description", content: "Tender stage decisions assigned to your role." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { t, language } = useAppTranslation();
  const workspace = useWorkspace();
  const fetchQueue = useServerFn(getApprovalQueue);
  const organizationId = workspace.activeOrganizationId!;

  const query = useQuery({
    queryKey: ["approval-queue", organizationId],
    queryFn: () => fetchQueue({ data: { organizationId } }),
  });

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("approvals.title")} subtitle={t("approvals.subtitle")} />

      {query.isPending && <LoadingRows rows={4} />}

      {query.error && (
        <ErrorState
          message={(query.error as Error).message || t("common.unexpectedError")}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      )}

      {query.data && (
        <div className="space-y-4">
          <Panel bodyClassName="p-0">
            {query.data.items.length === 0 ? (
              <div className="p-4">
                <EmptyState message={t("approvals.empty")} />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {query.data.items.map((item) => (
                  <li
                    key={item.tenderId}
                    className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-xs font-medium tabular-nums text-muted-foreground"
                          data-ltr
                        >
                          {item.reference}
                        </span>
                        <StageBadge stage={item.stage} />
                        <DecisionBadge state={item.stageState} />
                      </p>
                      <p className="mt-1 truncate font-medium text-foreground" title={item.title}>
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {(language === "ar"
                          ? (item.stageNameAr ?? item.stageName)
                          : item.stageName) ?? t("approvals.stage")}
                        {" · "}
                        {t("approvals.waitingOn")}:{" "}
                        {item.approverRole ? t(`roles.${item.approverRole}`) : t("common.none")}
                        {item.slaHours ? ` · ${t("approvals.sla")} ${item.slaHours}h` : ""}
                        {" · "}
                        {formatDateTime(item.updatedAt, language)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={
                          item.isForMyRole
                            ? "rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info"
                            : "rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {item.isForMyRole ? t("approvals.forYou") : t("approvals.otherRole")}
                      </span>
                      {item.selfApprovalBlocked && (
                        <span
                          className="inline-flex max-w-full items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
                          title={t("approvals.selfBlockedHelp")}
                        >
                          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{t("approvals.selfBlocked")}</span>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <p className="text-xs text-muted-foreground">{t("approvals.selfBlockedHelp")}</p>
        </div>
      )}
    </div>
  );
}
