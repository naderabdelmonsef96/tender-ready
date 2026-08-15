import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { useAppTranslation } from "@/components/language-provider";
import {
  DecisionBadge,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Panel,
  StageBadge,
  StatCard,
  TableScroll,
} from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney, daysUntil } from "@/lib/format";
import { getDashboard } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tender portfolio — TenderReady" },
      {
        name: "description",
        content:
          "Live governance status for every tender: stage, decision state, deadlines and estimated value.",
      },
      { property: "og:title", content: "Tender portfolio — TenderReady" },
      {
        property: "og:description",
        content: "Track tender stages, approvals and deadlines across your organization.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { t, language } = useAppTranslation();
  const workspace = useWorkspace();
  const fetchDashboard = useServerFn(getDashboard);
  const organizationId = workspace.activeOrganizationId!;

  const query = useQuery({
    queryKey: ["dashboard", organizationId],
    queryFn: () => fetchDashboard({ data: { organizationId } }),
  });

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <PageHeader title={t("dashboard.title")} subtitle={t("dashboard.subtitle")} />

      {query.isPending && <LoadingRows rows={6} />}

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
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("dashboard.openTenders")} value={query.data.summary.open} />
            <StatCard
              label={t("dashboard.inApproval")}
              value={query.data.summary.awaitingApproval}
              tone="info"
            />
            <StatCard
              label={t("dashboard.deadlineSoon")}
              value={query.data.summary.deadlineSoon}
              tone="warning"
            />
            <StatCard
              label={t("dashboard.releasedQuotes")}
              value={query.data.summary.released}
              tone="success"
            />
          </div>

          <Panel title={t("dashboard.tenderTable")} bodyClassName="p-0">
            {query.data.tenders.length === 0 ? (
              <div className="p-4">
                <EmptyState message={t("dashboard.empty")} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] border-collapse text-sm">
                  <caption className="sr-only">{t("dashboard.tenderTable")}</caption>
                  <thead>
                    <tr className="border-b border-border bg-surface-muted text-start">
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("dashboard.reference")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("dashboard.tenderTitle")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("dashboard.client")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("stage.intake")} / {t("dashboard.stageState")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("dashboard.deadline")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-end font-semibold">
                        {t("dashboard.value")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.tenders.map((tender) => {
                      const remaining = daysUntil(tender.deadline);
                      return (
                        <tr
                          key={tender.id}
                          className="border-b border-border/70 last:border-0 align-top"
                        >
                          <td className="px-4 py-3 font-medium tabular-nums" data-ltr>
                            {tender.reference}
                          </td>
                          <td className="max-w-[22rem] px-4 py-3">
                            <span className="block truncate font-medium" title={tender.title}>
                              {language === "ar" ? (tender.titleAr ?? tender.title) : tender.title}
                            </span>
                            {tender.location && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {tender.location}
                              </span>
                            )}
                          </td>
                          <td className="max-w-[14rem] px-4 py-3">
                            <span className="block truncate">
                              {tender.client
                                ? language === "ar"
                                  ? (tender.client.nameAr ?? tender.client.name)
                                  : tender.client.name
                                : t("common.none")}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StageBadge stage={tender.stage} />
                              <DecisionBadge state={tender.stageState} />
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="block">{formatDate(tender.deadline, language)}</span>
                            {remaining !== null && remaining >= 0 && remaining <= 14 && (
                              <span className="block text-xs font-medium text-warning">
                                {t("approvals.hours", { count: remaining * 24 })}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-end tabular-nums">
                            {tender.tenderValue != null && tender.tenderValueCurrency
                              ? formatMoney(
                                  tender.tenderValue,
                                  tender.tenderValueCurrency,
                                  language,
                                )
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={t("dashboard.alerts")}>
            <p className="text-sm text-muted-foreground">
              {query.data.summary.awaitingApproval > 0 ? (
                <Link
                  to="/approvals"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("approvals.title")}
                </Link>
              ) : (
                t("dashboard.noAlerts")
              )}
            </p>
          </Panel>
        </div>
      )}
    </div>
  );
}
