import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { useAppTranslation } from "@/components/language-provider";
import { EmptyState, ErrorState, LoadingRows, PageHeader, Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { updateWorkflowStage, type AppRole } from "@/lib/org.functions";
import { getMembers, getWorkflow } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/admin/workflows")({
  head: () => ({
    meta: [
      { title: "Workflow configuration — TenderReady" },
      {
        name: "description",
        content: "The seven-stage maker-checker approval flow with approver roles and SLA targets.",
      },
      { property: "og:title", content: "Workflow configuration — TenderReady" },
      {
        property: "og:description",
        content: "Stage order, approver roles and release blocking rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WorkflowsPage,
});

const roles: AppRole[] = [
  "org_admin",
  "proposal_engineer",
  "technical_lead",
  "product_manager",
  "sourcing_manager",
  "commercial_manager",
  "finance_manager",
  "signatory",
  "viewer",
];

type WorkflowData = Awaited<ReturnType<typeof getWorkflow>>;
type Stage = WorkflowData["stages"][number];

function WorkflowsPage() {
  const { t, language } = useAppTranslation();
  const workspace = useWorkspace();
  const organizationId = workspace.activeOrganizationId!;
  const queryClient = useQueryClient();
  const fetchWorkflow = useServerFn(getWorkflow);
  const fetchMembers = useServerFn(getMembers);
  const saveStage = useServerFn(updateWorkflowStage);

  const query = useQuery({
    queryKey: ["workflow", organizationId],
    queryFn: () => fetchWorkflow({ data: { organizationId } }),
  });
  const membersQuery = useQuery({
    queryKey: ["members", organizationId],
    queryFn: () => fetchMembers({ data: { organizationId } }),
  });

  const [draftByStage, setDraftByStage] = useState<
    Record<string, { approverRole: AppRole; slaHours: string; blocksRelease: boolean }>
  >({});

  const stageMutation = useMutation({
    mutationFn: saveStage,
    onSuccess: (_result, variables) => {
      toast.success(t("workflows.saved"));
      const stageId = (variables as { data: { stageId: string } } | undefined)?.data.stageId;
      setDraftByStage((current) => {
        if (!stageId) return current;
        const next = { ...current };
        delete next[stageId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ["workflow", organizationId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const roadmapEnabled = query.data?.flags?.["roadmap_features"] === true;
  const isAdmin = workspace.isAdmin === true;

  const membersByRole = new Map<string, { name: string; email: string | null }[]>();
  for (const member of membersQuery.data?.members ?? []) {
    if (member.status !== "active" && member.status !== "invited") continue;
    const list = membersByRole.get(member.role) ?? [];
    list.push({
      name:
        (language === "ar" ? member.fullNameAr : null) ??
        member.fullName ??
        member.email ??
        t("common.none"),
      email: member.email,
    });
    membersByRole.set(member.role, list);
  }

  function draftFor(stage: Stage) {
    return (
      draftByStage[stage.id] ?? {
        approverRole: stage.approver_role,
        slaHours: String(stage.sla_hours ?? 24),
        blocksRelease: stage.blocks_release,
      }
    );
  }

  function setDraft(
    stage: Stage,
    patch: Partial<{ approverRole: AppRole; slaHours: string; blocksRelease: boolean }>,
  ) {
    setDraftByStage((current) => ({
      ...current,
      [stage.id]: { ...draftFor(stage), ...patch },
    }));
  }

  function isDirty(stage: Stage) {
    const draft = draftByStage[stage.id];
    if (!draft) return false;
    return (
      draft.approverRole !== stage.approver_role ||
      Number(draft.slaHours) !== stage.sla_hours ||
      draft.blocksRelease !== stage.blocks_release
    );
  }

  function save(stage: Stage) {
    const draft = draftFor(stage);
    const slaHours = Number(draft.slaHours);
    if (!Number.isFinite(slaHours) || slaHours < 1) {
      toast.error(t("workflows.invalidSla"));
      return;
    }
    stageMutation.mutate({
      data: {
        organizationId,
        stageId: stage.id,
        approverRole: draft.approverRole,
        slaHours,
        blocksRelease: draft.blocksRelease,
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title={t("workflows.title")}
        subtitle={t("workflows.subtitle")}
        actions={
          !isAdmin ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t("common.readOnly")}
            </span>
          ) : undefined
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
              title={language === "ar" ? (template.name_ar ?? template.name) : template.name}
              description={template.description ?? undefined}
            >
              <div className="space-y-0">
                {query.data.stages
                  .filter((stage) => stage.stage !== null)
                  .map((stage, index) => {
                    const draft = draftFor(stage);
                    const dirty = isDirty(stage);
                    const people = membersByRole.get(draft.approverRole) ?? [];
                    return (
                      <div
                        key={stage.id}
                        className="grid grid-cols-[28px_1fr] gap-3 border-t border-border py-4 first:border-t-0 first:pt-0"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </div>
                        <div>
                          <p className="mb-2.5 text-sm font-semibold text-foreground">
                            {language === "ar" ? (stage.name_ar ?? stage.name) : stage.name}
                            <span className="ms-2 text-xs font-normal text-muted-foreground">
                              {t(`stage.${stage.stage}`)}
                            </span>
                          </p>

                          <fieldset
                            disabled={!isAdmin}
                            className="mb-3 grid gap-3 sm:grid-cols-[1fr_100px_140px]"
                          >
                            <div>
                              <Label className="text-[10.5px] uppercase text-muted-foreground">
                                {t("workflows.approver")}
                              </Label>
                              <Select
                                value={draft.approverRole}
                                onValueChange={(value) =>
                                  setDraft(stage, { approverRole: value as AppRole })
                                }
                              >
                                <SelectTrigger className="mt-1 h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {roles.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {t(`roles.${role}`)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-[10.5px] uppercase text-muted-foreground">
                                {t("workflows.sla")}
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                className="mt-1 h-9"
                                value={draft.slaHours}
                                onChange={(event) =>
                                  setDraft(stage, { slaHours: event.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-[10.5px] uppercase text-muted-foreground">
                                {t("workflows.blocks")}
                              </Label>
                              <div className="mt-1 flex h-9 items-center gap-2">
                                <Switch
                                  checked={draft.blocksRelease}
                                  onCheckedChange={(checked) =>
                                    setDraft(stage, { blocksRelease: checked })
                                  }
                                />
                                <span className="text-xs text-muted-foreground">
                                  {draft.blocksRelease ? t("workflows.yes") : t("workflows.no")}
                                </span>
                              </div>
                            </div>
                          </fieldset>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {people.length === 0 ? (
                              <span className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-medium text-warning">
                                {t("workflows.noOneAssigned")}
                              </span>
                            ) : (
                              people.map((person, i) => (
                                <span
                                  key={i}
                                  className="rounded-full bg-muted px-2.5 py-1 text-xs text-foreground"
                                  title={person.email ?? undefined}
                                >
                                  {person.name}
                                </span>
                              ))
                            )}
                            <Link
                              to="/settings/users"
                              className="ms-1 text-xs font-medium text-primary hover:underline"
                            >
                              {t("workflows.manageInUsers")}
                            </Link>
                          </div>

                          {isAdmin && dirty && (
                            <div className="mt-3">
                              <Button
                                size="sm"
                                disabled={stageMutation.isPending}
                                onClick={() => save(stage)}
                              >
                                {stageMutation.isPending ? t("common.saving") : t("common.save")}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
