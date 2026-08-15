import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, FileSearch, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAppTranslation } from "@/components/language-provider";
import {
  DecisionBadge,
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Panel,
  StatCard,
  TableScroll,
} from "@/components/ui-blocks";
import { GovernanceTracker } from "@/components/governance-tracker";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  bulkUpdateBoqItems,
  decideTechnicalReview,
  deleteBoqItem,
  getRegister,
  listIntakeTenders,
  resolveException,
  submitTechnicalReview,
  updateBoqItem,
} from "@/lib/intake.functions";

const searchSchema = z.object({ tender: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/workbench/requirements")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "BOQ & requirements register — TenderReady" },
      {
        name: "description",
        content:
          "Normalized BOQ and requirements register where every row traces back to its file, sheet and cell.",
      },
      { property: "og:title", content: "BOQ & requirements register — TenderReady" },
      {
        property: "og:description",
        content:
          "Source-linked requirements register with technical review and maker-checker gates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type RegisterData = Awaited<ReturnType<typeof getRegister>>;
type Item = RegisterData["items"][number];
type Requirement = RegisterData["requirements"][number];
type SourceRef = NonNullable<Item["source_references"]>;

function Page() {
  const { t, language } = useAppTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchTenders = useServerFn(listIntakeTenders);
  const fetchRegister = useServerFn(getRegister);
  const saveItem = useServerFn(updateBoqItem);
  const bulkSave = useServerFn(bulkUpdateBoqItems);
  const removeItem = useServerFn(deleteBoqItem);
  const resolve = useServerFn(resolveException);
  const submitReview = useServerFn(submitTechnicalReview);
  const decideReview = useServerFn(decideTechnicalReview);

  const [tab, setTab] = useState<"items" | "requirements" | "exceptions">("items");
  const [sheet, setSheet] = useState<string>("__all__");
  const [selected, setSelected] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<{ title: string; ref: SourceRef | null } | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [note, setNote] = useState("");

  const listQuery = useQuery({
    queryKey: ["intake-tenders", activeOrganizationId],
    queryFn: () => fetchTenders({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const tenderId = search.tender ?? listQuery.data?.tenders[0]?.id ?? null;

  const registerQuery = useQuery({
    queryKey: ["register", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchRegister({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
  });

  const data = registerQuery.data;

  const invalidate = (result?: { invalidatedApprovals?: number } | undefined) => {
    void queryClient.invalidateQueries({ queryKey: ["register"] });
    void queryClient.invalidateQueries({ queryKey: ["intake"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    if (result?.invalidatedApprovals) {
      toast.warning(t("register.invalidated", { count: result.invalidatedApprovals }));
    }
  };

  const itemMutation = useMutation({
    mutationFn: saveItem,
    onSuccess: (result) => {
      toast.success(t("register.saved"));
      setEditing(null);
      invalidate(result as { invalidatedApprovals?: number });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: removeItem,
    onSuccess: (result, variables) => {
      toast.success(t("register.itemDeleted"));
      const deletedId = (variables as { data: { itemId: string } } | undefined)?.data.itemId;
      setSelected((current) => current.filter((id) => id !== deletedId));
      invalidate(result as { invalidatedApprovals?: number });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkMutation = useMutation({
    mutationFn: bulkSave,
    onSuccess: (result) => {
      toast.success(t("register.saved"));
      setSelected([]);
      invalidate(result as { invalidatedApprovals?: number });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exceptionMutation = useMutation({
    mutationFn: resolve,
    onSuccess: () => {
      toast.success(t("register.saved"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: submitReview,
    onSuccess: () => {
      toast.success(t("register.submitted"));
      setNote("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decideMutation = useMutation({
    mutationFn: decideReview,
    onSuccess: () => {
      toast.success(t("register.decisionSaved"));
      setNote("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sheets = useMemo(() => {
    const names = new Set<string>();
    for (const item of data?.items ?? []) if (item.sheet_name) names.add(item.sheet_name);
    return Array.from(names);
  }, [data]);

  const items = (data?.items ?? []).filter(
    (item) => sheet === "__all__" || item.sheet_name === sheet,
  );
  const openExceptions = (data?.exceptions ?? []).filter((entry) => entry.status === "open");

  const canEditRegister =
    data?.myRole === "org_admin" ||
    data?.myRole === "proposal_engineer" ||
    data?.myRole === "technical_lead";
  const isReviewer =
    data?.myRole === "org_admin" ||
    data?.myRole === (data?.technicalStage?.approver_role ?? "technical_lead");
  const isAdmin = data?.myRole === "org_admin";
  const activeTask = data?.activeTask ?? null;
  const selfSubmitted = activeTask?.submitted_by === data?.userId;

  function openEvidence(title: string, ref: SourceRef | null) {
    setEvidence({ title, ref });
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const allVisibleSelected = items.length > 0 && items.every((item) => selected.includes(item.id));

  function toggleAll() {
    setSelected(allVisibleSelected ? [] : items.map((item) => item.id));
  }

  const nameOf = (ref: SourceRef | null | undefined) =>
    ref?.document_versions?.tender_files?.original_name ?? "—";

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("screens.requirements")} subtitle={t("register.subtitle")} />
      <GovernanceTracker tenderId={tenderId} currentPath="/workbench/requirements" />

      <Panel title={t("intake.selectTender")} className="mb-4">
        {listQuery.isPending ? (
          <LoadingRows rows={1} />
        ) : (listQuery.data?.tenders.length ?? 0) === 0 ? (
          <EmptyState message={t("dashboard.empty")} />
        ) : (
          <div className="min-w-0 sm:max-w-md">
            <Label htmlFor="register-tender">{t("intake.selectTender")}</Label>
            <select
              id="register-tender"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={tenderId ?? ""}
              onChange={(event) =>
                void navigate({
                  to: "/workbench/requirements",
                  search: { tender: event.target.value },
                })
              }
            >
              {(listQuery.data?.tenders ?? []).map((tender) => (
                <option key={tender.id} value={tender.id}>
                  {tender.reference} —{" "}
                  {language === "ar" && tender.title_ar ? tender.title_ar : tender.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </Panel>

      {!tenderId ? (
        <Panel>
          <EmptyState message={t("intake.noTenderSelected")} />
        </Panel>
      ) : registerQuery.isPending ? (
        <Panel>
          <LoadingRows rows={6} />
        </Panel>
      ) : registerQuery.error ? (
        <Panel>
          <ErrorState
            message={(registerQuery.error as Error).message}
            action={
              <Button variant="outline" onClick={() => void registerQuery.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        </Panel>
      ) : data && data.items.length === 0 && data.requirements.length === 0 ? (
        <Panel>
          <EmptyState
            message={t("register.empty")}
            action={
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({ to: "/workbench/intake", search: { tender: tenderId } })
                }
              >
                {t("screens.intake")}
              </Button>
            }
          />
        </Panel>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("register.itemsTab")} value={data.items.length} />
            <StatCard label={t("register.requirementsTab")} value={data.requirements.length} />
            <StatCard
              label={t("register.exceptionsTab")}
              value={openExceptions.length}
              tone={openExceptions.length > 0 ? "warning" : "success"}
            />
            <StatCard
              label={t("approvals.title")}
              value={activeTask ? t(`decisionState.${activeTask.state}`) : t("common.none")}
              tone="info"
            />
          </div>

          <Panel
            title={t("register.sheetNavigator")}
            bodyClassName="p-3"
            actions={
              <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
                <TabsList>
                  <TabsTrigger value="items">{t("register.itemsTab")}</TabsTrigger>
                  <TabsTrigger value="requirements">{t("register.requirementsTab")}</TabsTrigger>
                  <TabsTrigger value="exceptions">{t("register.exceptionsTab")}</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          >
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={sheet === "__all__" ? "secondary" : "ghost"}
                onClick={() => setSheet("__all__")}
              >
                {t("register.allSheets")}
              </Button>
              {sheets.map((name) => (
                <Button
                  key={name}
                  size="sm"
                  variant={sheet === name ? "secondary" : "ghost"}
                  className="max-w-[14rem] truncate"
                  onClick={() => setSheet(name)}
                  title={name}
                >
                  {name}
                </Button>
              ))}
            </div>
          </Panel>

          {tab === "items" && (
            <Panel
              title={t("register.itemsTab")}
              actions={
                selected.length > 0 && canEditRegister ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {t("register.selected", { count: selected.length })}
                    </span>
                    <Button
                      size="sm"
                      disabled={bulkMutation.isPending}
                      onClick={() =>
                        bulkMutation.mutate({
                          data: {
                            organizationId: activeOrganizationId ?? "",
                            itemIds: selected,
                            action: "mark_reviewed",
                          },
                        })
                      }
                    >
                      {t("register.markReviewed")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkMutation.isPending}
                      onClick={() => {
                        const reason = window.prompt(t("register.reason") ?? "");
                        if (!reason) return;
                        bulkMutation.mutate({
                          data: {
                            organizationId: activeOrganizationId ?? "",
                            itemIds: selected,
                            action: "exclude",
                            reason,
                          },
                        });
                      }}
                    >
                      {t("register.exclude")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkMutation.isPending}
                      onClick={() => {
                        const sectionPath = window.prompt(t("register.section") ?? "");
                        if (!sectionPath) return;
                        bulkMutation.mutate({
                          data: {
                            organizationId: activeOrganizationId ?? "",
                            itemIds: selected,
                            action: "reclassify_section",
                            sectionPath,
                          },
                        });
                      }}
                    >
                      {t("register.reclassify")}
                    </Button>
                  </div>
                ) : undefined
              }
            >
              {items.length === 0 ? (
                <EmptyState message={t("register.noItems")} />
              ) : (
                <TableScroll>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="w-8 px-2 py-2">
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={toggleAll}
                            aria-label={t("register.selectAll")}
                          />
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.code")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.description")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.section")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.unit")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-end">
                          {t("register.quantity")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.confidence")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("common.status")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.evidence")}
                        </th>
                        {canEditRegister && (
                          <th scope="col" className="px-2 py-2 text-start">
                            {t("common.actions")}
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-border/70 align-top">
                          <td className="px-2 py-2">
                            <Checkbox
                              checked={selected.includes(item.id)}
                              onCheckedChange={() => toggle(item.id)}
                              aria-label={item.description}
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                            {item.item_code ?? "—"}
                          </td>
                          <td className="max-w-[26rem] px-2 py-2">
                            <button
                              type="button"
                              className="block w-full truncate text-start hover:text-primary"
                              title={item.description}
                              onClick={() => canEditRegister && setEditing(item)}
                            >
                              {language === "ar" && item.description_ar
                                ? item.description_ar
                                : item.description}
                            </button>
                            {item.criticality === "critical" && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs text-warning">
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                {t("register.critical")}
                              </span>
                            )}
                          </td>
                          <td className="max-w-[12rem] px-2 py-2 text-xs text-muted-foreground">
                            {canEditRegister ? (
                              <button
                                type="button"
                                className="block w-full truncate text-start hover:text-primary hover:underline"
                                title={item.section_path ?? ""}
                                onClick={() => setEditing(item)}
                              >
                                {item.section_path ?? "—"}
                              </button>
                            ) : (
                              <span className="block truncate" title={item.section_path ?? ""}>
                                {item.section_path ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {canEditRegister ? (
                              <button
                                type="button"
                                className="hover:text-primary hover:underline"
                                onClick={() => setEditing(item)}
                              >
                                {item.unit ?? "—"}
                              </button>
                            ) : (
                              (item.unit ?? "—")
                            )}
                          </td>
                          <td className="px-2 py-2 text-end tabular-nums" dir="ltr">
                            {item.rate_only ? t("register.rateOnly") : (item.quantity ?? "—")}
                          </td>
                          <td className="px-2 py-2 tabular-nums" dir="ltr">
                            {item.confidence ?? "—"}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                                item.status === "reviewed"
                                  ? "bg-success/12 text-success"
                                  : item.status === "excluded"
                                    ? "bg-muted text-muted-foreground"
                                    : item.status === "exception"
                                      ? "bg-warning/20 text-foreground"
                                      : "bg-info/10 text-info",
                              )}
                            >
                              {t(`itemStatus.${item.status}`)}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEvidence(item.description, item.source_references)}
                            >
                              <FileSearch className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                              {t("register.evidence")}
                            </Button>
                          </td>
                          {canEditRegister && (
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>
                                  <Pencil className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                                  {t("common.edit")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  disabled={deleteMutation.isPending}
                                  onClick={() => {
                                    if (!window.confirm(t("register.confirmDeleteItem"))) return;
                                    deleteMutation.mutate({
                                      data: {
                                        organizationId: activeOrganizationId ?? "",
                                        tenderId: tenderId ?? "",
                                        itemId: item.id,
                                      },
                                    });
                                  }}
                                >
                                  <Trash2 className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                                  {t("common.delete")}
                                </Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}
            </Panel>
          )}

          {tab === "requirements" && (
            <Panel title={t("register.requirementsTab")}>
              {data.requirements.length === 0 ? (
                <EmptyState message={t("register.noRequirements")} />
              ) : (
                <TableScroll>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.category")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.requirementText")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("common.status")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.evidence")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.requirements.map((requirement: Requirement) => (
                        <tr key={requirement.id} className="border-b border-border/70 align-top">
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {requirement.category}
                          </td>
                          <td className="max-w-[38rem] px-2 py-2">
                            <span className="block truncate" title={requirement.text}>
                              {language === "ar" && requirement.text_ar
                                ? requirement.text_ar
                                : requirement.text}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {t(`itemStatus.${requirement.status}`)}
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                openEvidence(
                                  requirement.text,
                                  requirement.source_references as SourceRef | null,
                                )
                              }
                            >
                              {t("register.evidence")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}
            </Panel>
          )}

          {tab === "exceptions" && (
            <Panel title={t("register.exceptionsTab")}>
              {data.exceptions.length === 0 ? (
                <EmptyState message={t("register.noExceptions")} />
              ) : (
                <TableScroll>
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.exceptionKind")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.exceptionMessage")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.sheet")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("register.cell")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("common.status")}
                        </th>
                        <th scope="col" className="px-2 py-2 text-start">
                          {t("common.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.exceptions.map((exception) => (
                        <tr key={exception.id} className="border-b border-border/70 align-top">
                          <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                            {exception.kind}
                          </td>
                          <td className="max-w-[26rem] px-2 py-2">
                            <span className="block truncate" title={exception.message}>
                              {exception.message}
                            </span>
                            {exception.resolution_note && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {exception.resolution_note}
                              </span>
                            )}
                          </td>
                          <td className="max-w-[10rem] px-2 py-2 text-xs">
                            <span className="block truncate">{exception.sheet_name ?? "—"}</span>
                          </td>
                          <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                            {exception.cell_ref ?? "—"}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {t(`exceptionStatus.${exception.status}`)}
                          </td>
                          <td className="px-2 py-2">
                            {canEditRegister && exception.status === "open" ? (
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={exceptionMutation.isPending}
                                  onClick={() =>
                                    exceptionMutation.mutate({
                                      data: {
                                        organizationId: activeOrganizationId ?? "",
                                        exceptionId: exception.id,
                                        status: "resolved",
                                      },
                                    })
                                  }
                                >
                                  {t("register.resolve")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={exceptionMutation.isPending}
                                  onClick={() => {
                                    const reason = window.prompt(
                                      t("register.resolutionNote") ?? "",
                                    );
                                    if (!reason) return;
                                    exceptionMutation.mutate({
                                      data: {
                                        organizationId: activeOrganizationId ?? "",
                                        exceptionId: exception.id,
                                        status: "overridden",
                                        resolutionNote: reason,
                                      },
                                    });
                                  }}
                                >
                                  {t("register.override")}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>
              )}
            </Panel>
          )}

          <Panel title={t("approvals.title")} description={t("approvals.selfBlockedHelp")}>
            <div className="flex flex-col gap-3">
              {activeTask && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <DecisionBadge state={activeTask.state} />
                  <span className="text-muted-foreground">{t("register.awaiting")}</span>
                </div>
              )}
              <div>
                <Label htmlFor="review-note">{t("register.note")}</Label>
                <Textarea
                  id="review-note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!activeTask && canEditRegister && (
                  <Button
                    disabled={submitMutation.isPending || openExceptions.length > 0}
                    onClick={() =>
                      submitMutation.mutate({
                        data: {
                          organizationId: activeOrganizationId ?? "",
                          tenderId: tenderId ?? "",
                          note: note || null,
                        },
                      })
                    }
                  >
                    {t("register.submit")}
                  </Button>
                )}
                {activeTask && isReviewer && !selfSubmitted && (
                  <>
                    {(["approved", "changes_requested", "rejected"] as const).map((decision) => (
                      <Button
                        key={decision}
                        variant={decision === "approved" ? "default" : "outline"}
                        disabled={decideMutation.isPending}
                        onClick={() =>
                          decideMutation.mutate({
                            data: {
                              organizationId: activeOrganizationId ?? "",
                              taskId: activeTask.id,
                              decision,
                              note: note || null,
                            },
                          })
                        }
                      >
                        {decision === "approved"
                          ? t("register.approve")
                          : decision === "changes_requested"
                            ? t("register.requestChanges")
                            : t("register.reject")}
                      </Button>
                    ))}
                  </>
                )}
                {activeTask && selfSubmitted && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-warning">{t("register.selfBlocked")}</p>
                    {isAdmin && (
                      <div className="flex flex-col items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
                        <p className="text-xs text-warning">{t("approvals.overrideWarning")}</p>
                        <div className="flex flex-wrap gap-2">
                          {(["approved", "changes_requested", "rejected"] as const).map(
                            (decision) => (
                              <Button
                                key={decision}
                                variant="outline"
                                size="sm"
                                className="border-warning text-warning hover:bg-warning/10"
                                disabled={decideMutation.isPending || !note.trim()}
                                onClick={() =>
                                  decideMutation.mutate({
                                    data: {
                                      organizationId: activeOrganizationId ?? "",
                                      taskId: activeTask.id,
                                      decision,
                                      note: note || null,
                                    },
                                  })
                                }
                              >
                                {decision === "approved"
                                  ? t("register.approve")
                                  : decision === "changes_requested"
                                    ? t("register.requestChanges")
                                    : t("register.reject")}
                              </Button>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {openExceptions.length > 0 && !activeTask && (
                  <p className="text-xs text-warning">{t("register.noExceptions")}</p>
                )}
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      <Sheet open={Boolean(evidence)} onOpenChange={(open) => !open && setEvidence(null)}>
        <SheetContent className="w-full max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("register.evidenceTitle")}</SheetTitle>
            <SheetDescription className="break-words">{evidence?.title}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {evidence?.ref ? (
              <dl className="grid gap-3 text-sm">
                {[
                  [t("register.file"), nameOf(evidence.ref)],
                  [t("register.sheet"), evidence.ref.sheet_name ?? "—"],
                  [t("register.row"), String(evidence.ref.row_index ?? "—")],
                  [t("register.cell"), evidence.ref.cell_ref || "—"],
                  [t("register.page"), String(evidence.ref.page_number ?? "—")],

                  [t("register.confidence"), String(evidence.ref.confidence ?? "—")],
                  [t("register.rawText"), evidence.ref.raw_text ?? "—"],
                  [t("register.normalizedText"), evidence.ref.normalized_text ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-0.5 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-warning">{t("register.noEvidence")}</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("register.editItem")}</DialogTitle>
            <DialogDescription>{t("register.subtitle")}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const quantity = String(form.get("quantity") ?? "").trim();
                itemMutation.mutate({
                  data: {
                    organizationId: activeOrganizationId ?? "",
                    itemId: editing.id,
                    version: editing.version,
                    description: String(form.get("description") ?? ""),
                    descriptionAr: String(form.get("descriptionAr") ?? "") || null,
                    unit: String(form.get("unit") ?? "") || null,
                    quantity: quantity ? Number(quantity) : null,
                    sectionPath: String(form.get("sectionPath") ?? "") || null,
                    status: form.get("status") as
                      "needs_review" | "reviewed" | "exception" | "excluded",
                    notes: String(form.get("notes") ?? "") || null,
                  },
                });
              }}
            >
              <div>
                <Label htmlFor="edit-description">{t("register.description")}</Label>
                <Textarea
                  id="edit-description"
                  name="description"
                  rows={2}
                  defaultValue={editing.description}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-descriptionAr">{t("register.description")} (AR)</Label>
                <Textarea
                  id="edit-descriptionAr"
                  name="descriptionAr"
                  rows={2}
                  dir="rtl"
                  defaultValue={editing.description_ar ?? ""}
                  className="mt-1"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="edit-unit">{t("register.unit")}</Label>
                  <Input
                    id="edit-unit"
                    name="unit"
                    defaultValue={editing.unit ?? ""}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-quantity">{t("register.quantity")}</Label>
                  <Input
                    id="edit-quantity"
                    name="quantity"
                    type="number"
                    step="0.0001"
                    dir="ltr"
                    defaultValue={editing.quantity ?? ""}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-sectionPath">{t("register.section")}</Label>
                <Input
                  id="edit-sectionPath"
                  name="sectionPath"
                  defaultValue={editing.section_path ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="edit-status">{t("common.status")}</Label>
                <select
                  id="edit-status"
                  name="status"
                  defaultValue={editing.status}
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  {(["needs_review", "reviewed", "exception", "excluded"] as const).map(
                    (status) => (
                      <option key={status} value={status}>
                        {t(`itemStatus.${status}`)}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <Label htmlFor="edit-notes">{t("intake.notes")}</Label>
                <Textarea
                  id="edit-notes"
                  name="notes"
                  rows={2}
                  defaultValue={editing.notes ?? ""}
                  className="mt-1"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={itemMutation.isPending}>
                  {itemMutation.isPending ? t("common.saving") : t("common.save")}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
