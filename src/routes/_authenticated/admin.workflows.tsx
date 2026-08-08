import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { useAppTranslation } from "@/components/language-provider";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { getWorkflow } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/admin/workflows")({
  head: () => ({
    meta: [
      { title: "Workflow configuration — TenderReady" },
      {
        name: "description",
        content: "The seeded seven-stage maker-checker approval flow with approver roles and SLA targets.",
      },
      { property: "og:title", content: "Workflow configuration — TenderReady" },
      { property: "og:description", content: "Stage order, approver roles and release blocking rules." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkflowsPage,
});

function WorkflowsPage() {
  const { t, language } = useAppTranslation();
  const workspace = useWorkspace();
  const organizationId = workspace.activeOrganizationId!;
  const fetchWorkflow = useServerFn(getWorkflow);

  const query = useQuery({
    queryKey: ["workflow", organizationId],
    queryFn: () => fetchWorkflow({ data: { organizationId } }),
  });

  const roadmapEnabled = query.data?.flags?.["roadmap_features"] === true;

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title={t("workflows.title")}
        subtitle={t("workflows.subtitle")}
        actions={
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {t("common.readOnly")}
          </span>
        }
      />

      {query.isPending && <LoadingRows rows={7} />}
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
          {query.data.templates.map((template) => (
            <Panel
              key={template.id}
              title={language === "ar" ? template.name_ar ?? template.name : template.name}
              description={template.description ?? undefined}
              bodyClassName="p-0"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-sm">
                  <caption className="sr-only">{t("workflows.title")}</caption>
                  <thead>
                    <tr className="border-b border-border bg-surface-muted">
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("workflows.order")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("workflows.stage")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("workflows.approver")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("workflows.sla")}
                      </th>
                      <th scope="col" className="px-4 py-2.5 text-start font-semibold">
                        {t("workflows.blocks")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.stages
                      .filter((stage) => stage.stage !== null)
                      .map((stage) => (
                        <tr key={stage.id} className="border-b border-border/70 last:border-0">
                          <td className="px-4 py-3 tabular-nums text-muted-foreground">{stage.stage_order}</td>
                          <td className="max-w-[18rem] px-4 py-3">
                            <span className="block truncate font-medium">
                              {language === "ar" ? stage.name_ar ?? stage.name : stage.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {t(`stage.${stage.stage}`)}
                            </span>
                          </td>
                          <td className="max-w-[16rem] px-4 py-3">
                            <span className="block truncate">{t(`roles.${stage.approver_role}`)}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                            {stage.sla_hours ?? t("common.none")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {stage.blocks_release ? t("workflows.yes") : t("workflows.no")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}

          {query.data.templates.length === 0 && (
            <Panel>
              <EmptyState message={t("common.noResults")} />
            </Panel>
          )}

          {!roadmapEnabled && (
            <p className="text-xs text-muted-foreground">
              {t("phase.body", { phase: t("phase.phase5") })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
