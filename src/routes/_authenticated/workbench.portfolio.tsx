import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listIntakeTenders } from "@/lib/intake.functions";
import {
  clearMatch,
  decideMatch,
  decideStageApproval,
  getPortfolioBoard,
  runPortfolioMatch,
  submitPortfolioForApproval,
} from "@/lib/portfolio.functions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ tender: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/workbench/portfolio")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Portfolio match — TenderReady" },
      {
        name: "description",
        content:
          "Match every tender item to your product portfolio with assistive scoring and named human decisions.",
      },
      { property: "og:title", content: "Portfolio match — TenderReady" },
      {
        property: "og:description",
        content: "Assistive portfolio matching with hard gates and maker-checker approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type BoardData = Awaited<ReturnType<typeof getPortfolioBoard>>;
type BoardItem = BoardData["items"][number];
type BoardMatch = BoardData["matches"][number];

function Page() {
  const { t, language } = useAppTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchTenders = useServerFn(listIntakeTenders);
  const fetchBoard = useServerFn(getPortfolioBoard);
  const runMatch = useServerFn(runPortfolioMatch);
  const decide = useServerFn(decideMatch);
  const clear = useServerFn(clearMatch);
  const submitStage = useServerFn(submitPortfolioForApproval);
  const decideStage = useServerFn(decideStageApproval);

  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "outside">("all");

  const listQuery = useQuery({
    queryKey: ["intake-tenders", activeOrganizationId],
    queryFn: () => fetchTenders({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const tenderId = search.tender ?? listQuery.data?.tenders[0]?.id ?? null;

  const boardQuery = useQuery({
    queryKey: ["portfolio-board", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchBoard({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
  });

  const data = boardQuery.data;

  const invalidate = (result?: { invalidatedApprovals?: number } | undefined) => {
    void queryClient.invalidateQueries({ queryKey: ["portfolio-board"] });
    void queryClient.invalidateQueries({ queryKey: ["sourcing-board"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    if (result?.invalidatedApprovals) {
      toast.warning(t("register.invalidated", { count: result.invalidatedApprovals }));
    }
  };

  const runMutation = useMutation({
    mutationFn: runMatch,
    onSuccess: (result) => {
      toast.success(t("portfolio.ranSummary", result));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const decideMutation = useMutation({
    mutationFn: decide,
    onSuccess: (result) => {
      toast.success(t("register.saved"));
      invalidate(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearMutation = useMutation({
    mutationFn: clear,
    onSuccess: () => {
      toast.success(t("register.saved"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: submitStage,
    onSuccess: () => {
      toast.success(t("portfolio.submitted"));
      setNote("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stageMutation = useMutation({
    mutationFn: decideStage,
    onSuccess: () => {
      toast.success(t("register.decisionSaved"));
      setNote("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const matchByItem = useMemo(() => {
    const map = new Map<string, BoardMatch>();
    for (const match of data?.matches ?? []) map.set(match.boq_item_id, match);
    return map;
  }, [data]);

  const productById = useMemo(() => {
    const map = new Map<string, BoardData["products"][number]>();
    for (const product of data?.products ?? []) map.set(product.id, product);
    return map;
  }, [data]);

  const counts = useMemo(() => {
    let confirmed = 0;
    let outside = 0;
    let pending = 0;
    for (const item of data?.items ?? []) {
      const state = matchByItem.get(item.id)?.state;
      if (state === "confirmed") confirmed += 1;
      else if (state === "out_of_portfolio") outside += 1;
      else pending += 1;
    }
    return { confirmed, outside, pending };
  }, [data, matchByItem]);

  const rows = (data?.items ?? []).filter((item) => {
    const state = matchByItem.get(item.id)?.state;
    if (filter === "confirmed") return state === "confirmed";
    if (filter === "outside") return state === "out_of_portfolio";
    if (filter === "pending") return state !== "confirmed" && state !== "out_of_portfolio";
    return true;
  });

  const canDecide =
    data?.myRole === "org_admin" ||
    data?.myRole === "proposal_engineer" ||
    data?.myRole === "product_manager";
  const isApprover =
    data?.myRole === "org_admin" ||
    data?.myRole === (data?.productStage?.approver_role ?? "product_manager");
  const isAdmin = data?.myRole === "org_admin";
  const activeTask = data?.activeTask ?? null;
  const selfSubmitted = activeTask?.submitted_by === data?.userId;
  const locked = Boolean(activeTask) && !isAdmin;

  function confirmItem(item: BoardItem, productId: string) {
    let overrideReason: string | null = null;
    if (item.criticality === "critical" && !item.source_reference_id) {
      overrideReason = window.prompt(t("portfolio.criticalOverride") ?? "") ?? null;
      if (!overrideReason) return;
    }
    decideMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        boqItemId: item.id,
        state: "confirmed",
        productId,
        overrideReason,
        version: matchByItem.get(item.id)?.version,
      },
    });
  }

  function markOutside(item: BoardItem) {
    const reason = window.prompt(t("portfolio.reason") ?? "");
    if (!reason) {
      toast.error(t("portfolio.reasonRequired"));
      return;
    }
    decideMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        boqItemId: item.id,
        state: "out_of_portfolio",
        overrideReason: reason,
        version: matchByItem.get(item.id)?.version,
      },
    });
  }

  const productLabel = (id: string | null | undefined) => {
    if (!id) return null;
    const product = productById.get(id);
    if (!product) return null;
    const name = language === "ar" && product.name_ar ? product.name_ar : product.name;
    return `${product.code} — ${name}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("screens.portfolioMatch")} subtitle={t("portfolio.subtitle")} />
      <GovernanceTracker tenderId={tenderId} currentPath="/workbench/portfolio" />

      <Panel title={t("intake.selectTender")} className="mb-4">
        {listQuery.isPending ? (
          <LoadingRows rows={1} />
        ) : (listQuery.data?.tenders.length ?? 0) === 0 ? (
          <EmptyState message={t("dashboard.empty")} />
        ) : (
          <div className="min-w-0 sm:max-w-md">
            <Label htmlFor="portfolio-tender">{t("intake.selectTender")}</Label>
            <select
              id="portfolio-tender"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={tenderId ?? ""}
              onChange={(event) =>
                void navigate({
                  to: "/workbench/portfolio",
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
      ) : boardQuery.isPending ? (
        <Panel>
          <LoadingRows rows={6} />
        </Panel>
      ) : boardQuery.error ? (
        <Panel>
          <ErrorState
            message={(boardQuery.error as Error).message}
            action={
              <Button variant="outline" onClick={() => void boardQuery.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        </Panel>
      ) : data && data.items.length === 0 ? (
        <Panel>
          <EmptyState
            message={t("portfolio.empty")}
            action={
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({ to: "/workbench/requirements", search: { tender: tenderId } })
                }
              >
                {t("screens.requirements")}
              </Button>
            }
          />
        </Panel>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("portfolio.matched")} value={counts.confirmed} tone="success" />
            <StatCard label={t("portfolio.outside")} value={counts.outside} tone="info" />
            <StatCard
              label={t("portfolio.pending")}
              value={counts.pending}
              tone={counts.pending > 0 ? "warning" : "success"}
            />
            <StatCard
              label={t("approvals.title")}
              value={activeTask ? t(`decision.${activeTask.state}`) : t("common.none")}
              tone="info"
            />
          </div>

          {data.products.length === 0 && (
            <Panel>
              <ErrorState
                message={t("portfolio.catalogueEmpty")}
                action={
                  <Button
                    variant="outline"
                    onClick={() => void navigate({ to: "/settings/catalogue" })}
                  >
                    {t("catalogue.title")}
                  </Button>
                }
              />
            </Panel>
          )}

          <Panel
            title={t("screens.portfolioMatch")}
            description={t("portfolio.subtitle")}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                  {(["all", "pending", "confirmed", "outside"] as const).map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={filter === key ? "secondary" : "ghost"}
                      onClick={() => setFilter(key)}
                    >
                      {key === "all"
                        ? t("register.allSheets")
                        : key === "pending"
                          ? t("portfolio.pending")
                          : key === "confirmed"
                            ? t("portfolio.matched")
                            : t("portfolio.outside")}
                    </Button>
                  ))}
                </div>
                {canDecide && !locked && (
                  <Button
                    size="sm"
                    disabled={runMutation.isPending || data.products.length === 0}
                    onClick={() =>
                      runMutation.mutate({
                        data: {
                          organizationId: activeOrganizationId ?? "",
                          tenderId: tenderId ?? "",
                          idempotencyKey: `match-${tenderId}-${Date.now()}`,
                        },
                      })
                    }
                  >
                    {runMutation.isPending ? t("portfolio.running") : t("portfolio.runMatch")}
                  </Button>
                )}
              </div>
            }
          >
            <TableScroll>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{t("screens.portfolioMatch")}</caption>
                <thead>
                  <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.item")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("register.unit")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.suggestion")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.score")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.decision")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const match = matchByItem.get(item.id) ?? null;
                    const suggestion = productLabel(match?.product_id);
                    const score =
                      match?.score === null || match?.score === undefined
                        ? "—"
                        : `${Math.round(Number(match.score) * 100)}%`;
                    const decided =
                      match?.state === "confirmed" || match?.state === "out_of_portfolio";
                    return (
                      <tr key={item.id} className="border-b border-border/70 align-top">
                        <td className="max-w-[22rem] px-2 py-2">
                          <p className="line-clamp-3 break-words font-medium text-foreground">
                            {language === "ar" && item.description_ar
                              ? item.description_ar
                              : item.description}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[item.item_code, item.sheet_name].filter(Boolean).join(" · ") || "—"}
                            {item.criticality === "critical" && (
                              <span className="ms-2 rounded bg-warning/20 px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                                {t("register.critical")}
                              </span>
                            )}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {item.unit ?? "—"}
                        </td>
                        <td className="max-w-[20rem] px-2 py-2">
                          {locked || !canDecide ? (
                            <span className="break-words text-foreground">
                              {suggestion ?? t("portfolio.noCandidate")}
                            </span>
                          ) : (
                            <select
                              className="h-9 w-full max-w-[19rem] rounded-lg border border-border bg-background px-2 text-sm"
                              value={match?.product_id ?? ""}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (!value) return;
                                confirmItem(item, value);
                              }}
                            >
                              <option value="">{t("portfolio.chooseProduct")}</option>
                              {data.products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.code} —{" "}
                                  {language === "ar" && product.name_ar
                                    ? product.name_ar
                                    : product.name}
                                </option>
                              ))}
                            </select>
                          )}
                          {(match?.matched_on as string[] | null)?.includes("ai") ? (
                            <div className="mt-1">
                              <span className="inline-flex rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info">
                                {t("portfolio.aiSuggested")}
                              </span>
                              {match?.note ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {t("portfolio.aiRationale")}: {match.note}
                                </p>
                              ) : null}
                            </div>
                          ) : (match?.matched_on as string[] | null)?.length ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t("portfolio.matchedOn")}:{" "}
                              {(match?.matched_on as string[]).join(", ")}
                            </p>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">
                          {score}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              match?.state === "confirmed"
                                ? "bg-success/12 text-success"
                                : match?.state === "out_of_portfolio"
                                  ? "bg-info/10 text-info"
                                  : match?.state === "suggested"
                                    ? "bg-warning/20 text-foreground"
                                    : "bg-muted text-muted-foreground",
                            )}
                          >
                            {t(`matchState.${match?.state ?? "unmatched"}`)}
                          </span>
                          {match?.override_reason && (
                            <p className="mt-1 max-w-[14rem] break-words text-xs text-muted-foreground">
                              {match.override_reason}
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {locked || !canDecide ? (
                            <span className="text-xs text-muted-foreground">
                              {t("common.readOnly")}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {match?.product_id && match.state !== "confirmed" && (
                                <Button
                                  size="sm"
                                  disabled={decideMutation.isPending}
                                  onClick={() => confirmItem(item, match.product_id ?? "")}
                                >
                                  {t("portfolio.confirm")}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={decideMutation.isPending}
                                onClick={() => markOutside(item)}
                              >
                                {t("portfolio.outOfPortfolio")}
                              </Button>
                              {decided && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={clearMutation.isPending}
                                  onClick={() =>
                                    clearMutation.mutate({
                                      data: {
                                        organizationId: activeOrganizationId ?? "",
                                        boqItemId: item.id,
                                      },
                                    })
                                  }
                                >
                                  {t("portfolio.clear")}
                                </Button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </Panel>

          <Panel title={t("approvals.title")} description={t("approvals.selfBlockedHelp")}>
            <div className="flex flex-col gap-3">
              {activeTask && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <DecisionBadge state={activeTask.state} />
                  <span className="text-muted-foreground">{t("portfolio.awaiting")}</span>
                </div>
              )}
              <div>
                <Label htmlFor="portfolio-note">{t("register.note")}</Label>
                <Textarea
                  id="portfolio-note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!activeTask && canDecide && (
                  <Button
                    disabled={submitMutation.isPending || counts.pending > 0}
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
                    {t("portfolio.submit")}
                  </Button>
                )}
                {activeTask &&
                  isApprover &&
                  !selfSubmitted &&
                  (["approved", "changes_requested", "rejected"] as const).map((decision) => (
                    <Button
                      key={decision}
                      variant={decision === "approved" ? "default" : "outline"}
                      disabled={stageMutation.isPending}
                      onClick={() =>
                        stageMutation.mutate({
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
                                disabled={stageMutation.isPending || !note.trim()}
                                onClick={() =>
                                  stageMutation.mutate({
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
                {!activeTask && counts.pending > 0 && (
                  <p className="text-xs text-warning">
                    {t("portfolio.pending")}: {counts.pending}
                  </p>
                )}
              </div>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
