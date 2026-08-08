import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { useAppTranslation } from "@/components/language-provider";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { getAuditTrail } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail — TenderReady" },
      {
        name: "description",
        content: "Append-only record of every security and approval relevant action in your organization.",
      },
      { property: "og:title", content: "Audit trail — TenderReady" },
      { property: "og:description", content: "Immutable governance history for tenders and approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

function AuditPage() {
  const { t, language } = useAppTranslation();
  const workspace = useWorkspace();
  const fetchAudit = useServerFn(getAuditTrail);
  const organizationId = workspace.activeOrganizationId!;

  const query = useQuery({
    queryKey: ["audit-trail", organizationId],
    queryFn: () => fetchAudit({ data: { organizationId, limit: 100 } }),
  });

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

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
        <div className="space-y-3">
          <Panel bodyClassName="p-0">
            {query.data.events.length === 0 ? (
              <div className="p-4">
                <EmptyState message={t("audit.empty")} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[54rem] border-collapse text-sm">
                  <caption className="sr-only">{t("audit.title")}</caption>
                  <thead>
                    <tr className="border-b border-border bg-surface-muted">
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("audit.when")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("audit.actor")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("audit.action")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("audit.object")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("audit.summary")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.events.map((event) => (
                      <tr key={event.id} className="border-b border-border/70 align-top last:border-0">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatDateTime(event.created_at, language)}
                        </td>
                        <td className="max-w-[14rem] px-4 py-3">
                          <span className="block truncate" data-ltr title={event.actor_email ?? ""}>
                            {event.actor_email ?? t("common.none")}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="font-medium" data-ltr>
                              {event.action}
                            </span>
                            {event.is_material && (
                              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-medium text-foreground">
                                {t("audit.material")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground" data-ltr>
                          {event.object_type}
                        </td>
                        <td className="max-w-[24rem] px-4 py-3">
                          <span className="block break-words">{event.summary ?? t("common.none")}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <p className="text-xs text-muted-foreground">{t("audit.appendOnly")}</p>
        </div>
      )}
    </div>
  );
}
