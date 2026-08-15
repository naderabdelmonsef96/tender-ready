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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { listIntakeTenders } from "@/lib/intake.functions";
import { decideStageApproval } from "@/lib/portfolio.functions";
import {
  getSourcingBoard,
  saveSupplierQuote,
  setSourcingRoute,
  submitSourcingForApproval,
} from "@/lib/sourcing.functions";

const searchSchema = z.object({ tender: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/workbench/sourcing")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Supply route — TenderReady" },
      {
        name: "description",
        content:
          "Send every tender item down one supply route: ex-stock, import, local supplier or foreign RFQ.",
      },
      { property: "og:title", content: "Supply route — TenderReady" },
      {
        property: "og:description",
        content: "Branching supply routes with supplier quotes and sourcing approval.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type BoardData = Awaited<ReturnType<typeof getSourcingBoard>>;
type BoardItem = BoardData["items"][number];
type RouteKind = "ex_stock" | "import" | "local_supplier" | "foreign_rfq";

type QuoteForm = {
  boqItemId: string;
  supplierName: string;
  kind: "local" | "foreign";
  currency: string;
  unitCost: string;
  incoterm: string;
  leadTimeDays: string;
  validUntil: string;
  note: string;
};

function Page() {
  const { t, language } = useAppTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchTenders = useServerFn(listIntakeTenders);
  const fetchBoard = useServerFn(getSourcingBoard);
  const setRoute = useServerFn(setSourcingRoute);
  const saveQuote = useServerFn(saveSupplierQuote);
  const submitStage = useServerFn(submitSourcingForApproval);
  const decideStage = useServerFn(decideStageApproval);

  const [note, setNote] = useState("");
  const [quoteForm, setQuoteForm] = useState<QuoteForm | null>(null);

  const listQuery = useQuery({
    queryKey: ["intake-tenders", activeOrganizationId],
    queryFn: () => fetchTenders({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const tenderId = search.tender ?? listQuery.data?.tenders[0]?.id ?? null;

  const boardQuery = useQuery({
    queryKey: ["sourcing-board", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchBoard({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
  });

  const data = boardQuery.data;

  const invalidate = (result?: { invalidatedApprovals?: number } | undefined) => {
    void queryClient.invalidateQueries({ queryKey: ["sourcing-board"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    if (result?.invalidatedApprovals) {
      toast.warning(t("register.invalidated", { count: result.invalidatedApprovals }));
    }
  };

  const routeMutation = useMutation({
    mutationFn: setRoute,
    onSuccess: (result) => {
      toast.success(t("sourcing.saved"));
      invalidate(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const quoteMutation = useMutation({
    mutationFn: saveQuote,
    onSuccess: () => {
      toast.success(t("sourcing.quoteSaved"));
      setQuoteForm(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: submitStage,
    onSuccess: () => {
      toast.success(t("sourcing.submitted"));
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

  const routeByItem = useMemo(() => {
    const map = new Map<string, BoardData["routes"][number]>();
    for (const route of data?.routes ?? []) map.set(route.boq_item_id, route);
    return map;
  }, [data]);

  const matchByItem = useMemo(() => {
    const map = new Map<string, BoardData["matches"][number]>();
    for (const match of data?.matches ?? []) map.set(match.boq_item_id, match);
    return map;
  }, [data]);

  const productById = useMemo(() => {
    const map = new Map<string, BoardData["products"][number]>();
    for (const product of data?.products ?? []) map.set(product.id, product);
    return map;
  }, [data]);

  const quotesByItem = useMemo(() => {
    const map = new Map<string, BoardData["quotes"]>();
    for (const quote of data?.quotes ?? []) {
      const list = map.get(quote.boq_item_id) ?? [];
      list.push(quote);
      map.set(quote.boq_item_id, list);
    }
    return map;
  }, [data]);

  const pending = (data?.items ?? []).filter((item) => !routeByItem.has(item.id)).length;
  const canRoute =
    data?.myRole === "org_admin" ||
    data?.myRole === "proposal_engineer" ||
    data?.myRole === "sourcing_manager";
  const isApprover =
    data?.myRole === "org_admin" ||
    data?.myRole === (data?.sourcingStage?.approver_role ?? "sourcing_manager");
  const isAdmin = data?.myRole === "org_admin";
  const activeTask = data?.activeTask ?? null;
  const selfSubmitted = activeTask?.submitted_by === data?.userId;
  const locked = Boolean(activeTask) && !isAdmin;

  function applyRoute(item: BoardItem, kind: RouteKind) {
    const match = matchByItem.get(item.id);
    const quotes = quotesByItem.get(item.id) ?? [];
    if (kind === "ex_stock" || kind === "import") {
      if (!match?.product_id) {
        toast.error(t("sourcing.needsProduct"));
        return;
      }
      routeMutation.mutate({
        data: {
          organizationId: activeOrganizationId ?? "",
          boqItemId: item.id,
          route: kind,
          productId: match.product_id,
          version: routeByItem.get(item.id)?.version,
        },
      });
      return;
    }
    const quote = quotes.find((entry) =>
      kind === "local_supplier" ? entry.kind === "local" : entry.kind === "foreign",
    );
    if (!quote) {
      setQuoteForm({
        boqItemId: item.id,
        supplierName: "",
        kind: kind === "local_supplier" ? "local" : "foreign",
        currency: data?.tender.currency ?? "EGP",
        unitCost: "",
        incoterm: "",
        leadTimeDays: "",
        validUntil: "",
        note: "",
      });
      toast.info(t("sourcing.needsQuote"));
      return;
    }
    routeMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        boqItemId: item.id,
        route: kind,
        supplierQuoteId: quote.id,
        version: routeByItem.get(item.id)?.version,
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("screens.sourcing")} subtitle={t("sourcing.subtitle")} />
      <GovernanceTracker tenderId={tenderId} currentPath="/workbench/sourcing" />

      <Panel title={t("intake.selectTender")} className="mb-4">
        {listQuery.isPending ? (
          <LoadingRows rows={1} />
        ) : (listQuery.data?.tenders.length ?? 0) === 0 ? (
          <EmptyState message={t("dashboard.empty")} />
        ) : (
          <div className="min-w-0 sm:max-w-md">
            <Label htmlFor="sourcing-tender">{t("intake.selectTender")}</Label>
            <select
              id="sourcing-tender"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={tenderId ?? ""}
              onChange={(event) =>
                void navigate({
                  to: "/workbench/sourcing",
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
            message={t("sourcing.empty")}
            action={
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({ to: "/workbench/portfolio", search: { tender: tenderId } })
                }
              >
                {t("screens.portfolioMatch")}
              </Button>
            }
          />
        </Panel>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("register.itemsTab")} value={data.items.length} />
            <StatCard label={t("sourcing.quotes")} value={data.quotes.length} tone="info" />
            <StatCard
              label={t("sourcing.pending")}
              value={pending}
              tone={pending > 0 ? "warning" : "success"}
            />
            <StatCard
              label={t("approvals.title")}
              value={activeTask ? t(`decision.${activeTask.state}`) : t("common.none")}
              tone="info"
            />
          </div>

          <Panel title={t("screens.sourcing")} description={t("sourcing.subtitle")}>
            <TableScroll>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{t("screens.sourcing")}</caption>
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.item")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.decision")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("sourcing.route")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("sourcing.quotes")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const route = routeByItem.get(item.id) ?? null;
                    const match = matchByItem.get(item.id) ?? null;
                    const quotes = quotesByItem.get(item.id) ?? [];
                    const inPortfolio = match?.state === "confirmed";
                    const allowed: RouteKind[] = inPortfolio
                      ? ["ex_stock", "import"]
                      : ["local_supplier", "foreign_rfq"];
                    return (
                      <tr key={item.id} className="border-b border-border/70 align-top">
                        <td className="max-w-[22rem] px-2 py-2">
                          <p className="line-clamp-3 break-words font-medium text-foreground">
                            {language === "ar" && item.description_ar
                              ? item.description_ar
                              : item.description}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[item.item_code, item.unit, item.quantity ?? "—"]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                          {t(`matchState.${match?.state ?? "unmatched"}`)}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          {route ? (
                            (() => {
                              const product = route.product_id
                                ? (productById.get(route.product_id) ?? null)
                                : null;
                              const stock = (product?.stock_positions ?? []).filter((position) =>
                                route.warehouse ? position.warehouse === route.warehouse : true,
                              );
                              const quantity = stock.reduce(
                                (total, position) => total + Number(position.quantity ?? 0),
                                0,
                              );
                              const showStock = route.route === "ex_stock" && stock.length > 0;
                              return (
                                <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                                  {showStock ? (
                                    <>
                                      {t("routeKind.ex_stock")}
                                      <span className="tabular-nums" dir="ltr">
                                        {` · ${quantity} · ${product?.unit ?? item.unit ?? "—"}`}
                                      </span>
                                    </>
                                  ) : (
                                    t(`routeKind.${route.route}`)
                                  )}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-[16rem] px-2 py-2 text-xs text-muted-foreground">
                          {quotes.length === 0
                            ? "—"
                            : quotes.map((quote, index) => (
                                <span key={quote.id}>
                                  {index > 0 ? " | " : ""}
                                  {quote.supplier_name} ·{" "}
                                  <span className="tabular-nums" dir="ltr">
                                    {formatMoney(quote.unit_cost, quote.currency, language)}
                                  </span>
                                </span>
                              ))}
                        </td>
                        <td className="px-2 py-2">
                          {locked || !canRoute ? (
                            <span className="text-xs text-muted-foreground">
                              {t("common.readOnly")}
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {allowed.map((kind) => (
                                <Button
                                  key={kind}
                                  size="sm"
                                  variant={route?.route === kind ? "default" : "outline"}
                                  disabled={routeMutation.isPending}
                                  onClick={() => applyRoute(item, kind)}
                                >
                                  {t(`routeKind.${kind}`)}
                                </Button>
                              ))}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setQuoteForm({
                                    boqItemId: item.id,
                                    supplierName: "",
                                    kind: inPortfolio ? "local" : "foreign",
                                    currency: data.tender.currency,
                                    unitCost: "",
                                    incoterm: "",
                                    leadTimeDays: "",
                                    validUntil: "",
                                    note: "",
                                  })
                                }
                              >
                                {t("sourcing.addQuote")}
                              </Button>
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
                  <span className="text-muted-foreground">{t("sourcing.awaiting")}</span>
                </div>
              )}
              <div>
                <Label htmlFor="sourcing-note">{t("register.note")}</Label>
                <Textarea
                  id="sourcing-note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!activeTask && canRoute && (
                  <Button
                    disabled={submitMutation.isPending || pending > 0}
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
                    {t("sourcing.submit")}
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
              </div>
            </div>
          </Panel>
        </div>
      ) : null}

      <Dialog open={Boolean(quoteForm)} onOpenChange={(open) => !open && setQuoteForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sourcing.addQuote")}</DialogTitle>
          </DialogHeader>
          {quoteForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="quote-supplier">{t("sourcing.supplier")}</Label>
                <Input
                  id="quote-supplier"
                  className="mt-1"
                  value={quoteForm.supplierName}
                  onChange={(event) =>
                    setQuoteForm((current) =>
                      current ? { ...current, supplierName: event.target.value } : current,
                    )
                  }
                />
              </div>
              <div>
                <Label htmlFor="quote-kind">{t("sourcing.route")}</Label>
                <select
                  id="quote-kind"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  value={quoteForm.kind}
                  onChange={(event) =>
                    setQuoteForm((current) =>
                      current
                        ? { ...current, kind: event.target.value as "local" | "foreign" }
                        : current,
                    )
                  }
                >
                  <option value="local">{t("routeKind.local_supplier")}</option>
                  <option value="foreign">{t("routeKind.foreign_rfq")}</option>
                </select>
              </div>
              {(
                [
                  ["unitCost", t("sourcing.unitCost")],
                  ["currency", t("sourcing.currency")],
                  ["incoterm", t("sourcing.incoterm")],
                  ["leadTimeDays", t("portfolio.leadTime")],
                  ["validUntil", t("sourcing.validUntil")],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="min-w-0">
                  <Label htmlFor={`quote-${field}`}>{label}</Label>
                  <Input
                    id={`quote-${field}`}
                    // A free-text date reaches Postgres as-is, so the calendar
                    // input keeps it an ISO yyyy-mm-dd value.
                    type={field === "validUntil" ? "date" : "text"}
                    className="mt-1"
                    value={quoteForm[field]}
                    onChange={(event) =>
                      setQuoteForm((current) =>
                        current ? { ...current, [field]: event.target.value } : current,
                      )
                    }
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label htmlFor="quote-note">{t("sourcing.note")}</Label>
                <Textarea
                  id="quote-note"
                  rows={2}
                  className="mt-1"
                  value={quoteForm.note}
                  onChange={(event) =>
                    setQuoteForm((current) =>
                      current ? { ...current, note: event.target.value } : current,
                    )
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={quoteMutation.isPending || !quoteForm?.supplierName.trim()}
              onClick={() => {
                if (!quoteForm) return;
                const numeric = (value: string) => (value.trim() === "" ? null : Number(value));
                quoteMutation.mutate({
                  data: {
                    organizationId: activeOrganizationId ?? "",
                    tenderId: tenderId ?? "",
                    boqItemId: quoteForm.boqItemId,
                    supplierName: quoteForm.supplierName.trim(),
                    kind: quoteForm.kind,
                    currency: quoteForm.currency.trim() || "EGP",
                    unitCost: numeric(quoteForm.unitCost),
                    incoterm: quoteForm.incoterm.trim() || null,
                    leadTimeDays: numeric(quoteForm.leadTimeDays),
                    validUntil: quoteForm.validUntil.trim() || null,
                    note: quoteForm.note.trim() || null,
                  },
                });
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
