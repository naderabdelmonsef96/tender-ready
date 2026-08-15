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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listIntakeTenders } from "@/lib/intake.functions";
import { decideStageApproval } from "@/lib/portfolio.functions";
import { formatMoney } from "@/lib/format";
import {
  getPricingBoard,
  savePricingLine,
  submitPricingForApproval,
} from "@/lib/pricing.functions";
import Decimal from "decimal.js";

const searchSchema = z.object({ tender: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/workbench/pricing")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Pricing builder — TenderReady" },
      {
        name: "description",
        content: "Landed cost and selling price with editable commercial factors.",
      },
      { property: "og:title", content: "Pricing builder — TenderReady" },
      {
        property: "og:description",
        content: "Landed cost and selling price with editable commercial factors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type BoardData = Awaited<ReturnType<typeof getPricingBoard>>;
type BoardItem = BoardData["items"][number];

function Page() {
  const { t, language } = useAppTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchTenders = useServerFn(listIntakeTenders);
  const fetchBoard = useServerFn(getPricingBoard);
  const saveLine = useServerFn(savePricingLine);
  const submitStage = useServerFn(submitPricingForApproval);
  const decideStage = useServerFn(decideStageApproval);

  const [note, setNote] = useState("");
  const [marginByItem, setMarginByItem] = useState<Record<string, string>>({});
  const [fxRateByItem, setFxRateByItem] = useState<Record<string, string>>({});
  const [freightByItem, setFreightByItem] = useState<Record<string, string>>({});
  const [localByItem, setLocalByItem] = useState<Record<string, string>>({});
  const [costAmountByItem, setCostAmountByItem] = useState<Record<string, string>>({});
  const [costCurrencyByItem, setCostCurrencyByItem] = useState<Record<string, string>>({});
  const [freightModeByItem, setFreightModeByItem] = useState<Record<string, "value" | "percent">>(
    {},
  );
  const [localModeByItem, setLocalModeByItem] = useState<Record<string, "value" | "percent">>({});

  const listQuery = useQuery({
    queryKey: ["intake-tenders", activeOrganizationId],
    queryFn: () => fetchTenders({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const tenderId = search.tender ?? listQuery.data?.tenders[0]?.id ?? null;

  const boardQuery = useQuery({
    queryKey: ["pricing-board", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchBoard({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
  });

  const data = boardQuery.data;

  const invalidate = (result?: { invalidatedApprovals?: number } | undefined) => {
    void queryClient.invalidateQueries({ queryKey: ["pricing-board"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
    if (result?.invalidatedApprovals) {
      toast.warning(t("register.invalidated", { count: result.invalidatedApprovals }));
    }
  };

  const saveMutation = useMutation({
    mutationFn: saveLine,
    onSuccess: (result) => {
      toast.success(t("pricing.saved"));
      invalidate(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitMutation = useMutation({
    mutationFn: submitStage,
    onSuccess: () => {
      toast.success(t("pricing.submitted"));
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

  const quoteById = useMemo(() => {
    const map = new Map<string, BoardData["quotes"][number]>();
    for (const quote of data?.quotes ?? []) map.set(quote.id, quote);
    return map;
  }, [data]);

  const productById = useMemo(() => {
    const map = new Map<string, BoardData["products"][number]>();
    for (const product of data?.products ?? []) map.set(product.id, product);
    return map;
  }, [data]);

  const lineByItem = useMemo(() => {
    const map = new Map<string, BoardData["lines"][number]>();
    for (const line of data?.lines ?? []) map.set(line.boq_item_id, line);
    return map;
  }, [data]);

  const pending = (data?.items ?? []).filter((item) => !lineByItem.has(item.id)).length;
  const canPrice =
    data?.myRole === "org_admin" ||
    data?.myRole === "proposal_engineer" ||
    data?.myRole === "commercial_manager";
  const isApprover =
    data?.myRole === "org_admin" ||
    data?.myRole === (data?.pricingStage?.approver_role ?? "commercial_manager");
  const isAdmin = data?.myRole === "org_admin";
  const activeTask = data?.activeTask ?? null;
  const selfSubmitted = activeTask?.submitted_by === data?.userId;
  const locked = Boolean(activeTask) && !isAdmin;

  type CostBasisSource = "landing_cost" | "supplier_price" | "supplier_quote";

  function autoCostBasisFor(
    item: BoardItem,
  ): { amount: string; currency: string; sourceKey: CostBasisSource } | null {
    const route = routeByItem.get(item.id);
    if (!route) return null;
    if (route.route === "ex_stock") {
      const product = route.product_id ? productById.get(route.product_id) : null;
      if (!product?.landing_cost) return null;
      return {
        amount: String(product.landing_cost),
        currency: product.landing_cost_currency ?? product.currency,
        sourceKey: "landing_cost",
      };
    }
    if (route.route === "import") {
      const product = route.product_id ? productById.get(route.product_id) : null;
      if (!product?.base_cost) return null;
      return {
        amount: String(product.base_cost),
        currency: product.currency,
        sourceKey: "supplier_price",
      };
    }
    const quote = route.supplier_quote_id ? quoteById.get(route.supplier_quote_id) : null;
    if (!quote?.unit_cost) return null;
    return {
      amount: String(quote.unit_cost),
      currency: quote.currency,
      sourceKey: "supplier_quote",
    };
  }

  function sourceLabel(key: CostBasisSource | "manual"): string {
    switch (key) {
      case "landing_cost":
        return t("pricing.sourceLandingCost");
      case "supplier_price":
        return t("pricing.sourceSupplierPrice");
      case "supplier_quote":
        return t("pricing.sourceSupplierQuote");
      default:
        return t("pricing.sourceManual");
    }
  }

  function costAmountValue(item: BoardItem): string {
    const draft = costAmountByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    if (existing) return String(existing.cost_basis);
    return autoCostBasisFor(item)?.amount ?? "";
  }

  function costCurrencyValue(item: BoardItem): string {
    const draft = costCurrencyByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    if (existing) return existing.cost_basis_currency;
    return autoCostBasisFor(item)?.currency ?? data?.tender.currency ?? "";
  }

  function costSourceFor(item: BoardItem): CostBasisSource | "manual" {
    const auto = autoCostBasisFor(item);
    if (
      auto &&
      auto.amount === costAmountValue(item) &&
      auto.currency === costCurrencyValue(item)
    ) {
      return auto.sourceKey;
    }
    return "manual";
  }

  function marginValue(item: BoardItem): string {
    const draft = marginByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    return existing ? String(existing.margin_percent) : "";
  }

  function fxRateValue(item: BoardItem): string {
    const draft = fxRateByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    return existing ? String(existing.fx_rate) : "1";
  }

  function freightValue(item: BoardItem): string {
    const draft = freightByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    return existing ? String(existing.freight_input) : "0";
  }

  function localValue(item: BoardItem): string {
    const draft = localByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    return existing ? String(existing.local_input) : "0";
  }

  function freightModeValue(item: BoardItem): "value" | "percent" {
    const draft = freightModeByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    return existing?.freight_mode === "percent" ? "percent" : "value";
  }

  function localModeValue(item: BoardItem): "value" | "percent" {
    const draft = localModeByItem[item.id];
    if (draft !== undefined) return draft;
    const existing = lineByItem.get(item.id);
    return existing?.local_mode === "percent" ? "percent" : "value";
  }

  function landedCurrencyFor(basisCurrency: string, fxRate: number): string {
    return fxRate === 1 ? basisCurrency : (data?.tender.currency ?? basisCurrency);
  }

  function previewPrice(item: BoardItem) {
    const costRaw = costAmountValue(item);
    const currency = costCurrencyValue(item);
    const cost = costRaw.trim() === "" ? null : Number(costRaw);
    const fxRate = Number(fxRateValue(item));
    const freightRaw = Number(freightValue(item));
    const localRaw = Number(localValue(item));
    if (cost === null || Number.isNaN(cost) || cost <= 0 || currency.trim().length !== 3) {
      return null;
    }
    if (!Number.isFinite(fxRate) || fxRate <= 0) return null;
    if (!Number.isFinite(freightRaw) || freightRaw < 0) return null;
    if (!Number.isFinite(localRaw) || localRaw < 0) return null;
    try {
      const costDecimal = new Decimal(cost);
      const qty = item.quantity != null ? new Decimal(item.quantity) : new Decimal(1);
      const converted = costDecimal.times(fxRate);
      const freightAmount =
        freightModeValue(item) === "percent"
          ? converted.times(freightRaw).dividedBy(100)
          : new Decimal(freightRaw);
      const localAmount =
        localModeValue(item) === "percent"
          ? converted.times(localRaw).dividedBy(100)
          : new Decimal(localRaw);
      const landingCost = converted.plus(freightAmount).plus(localAmount);
      const landedCurrency = landedCurrencyFor(currency, fxRate);

      const marginRaw = marginValue(item);
      const margin = marginRaw.trim() === "" ? null : Number(marginRaw);
      if (margin === null || Number.isNaN(margin) || margin < 0 || margin >= 100) {
        return { landingCost, unit: null, total: null, currency: landedCurrency };
      }

      const unit = landingCost.dividedBy(new Decimal(1).minus(margin / 100));
      return {
        landingCost,
        unit,
        total: unit.times(qty),
        currency: landedCurrency,
      };
    } catch {
      return null;
    }
  }

  function saveRow(item: BoardItem) {
    const costRaw = costAmountValue(item);
    const cost = Number(costRaw);
    const currency = costCurrencyValue(item).trim().toUpperCase();
    if (costRaw.trim() === "" || Number.isNaN(cost) || cost <= 0 || currency.length !== 3) {
      toast.error(t("pricing.invalidCostBasis"));
      return;
    }
    const marginRaw = marginValue(item);
    const margin = Number(marginRaw);
    if (marginRaw.trim() === "" || Number.isNaN(margin) || margin < 0 || margin >= 100) {
      toast.error(t("pricing.invalidMargin"));
      return;
    }
    const fxRate = Number(fxRateValue(item));
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      toast.error(t("pricing.invalidFxRate"));
      return;
    }
    const freight = Number(freightValue(item));
    const local = Number(localValue(item));
    if (!Number.isFinite(freight) || freight < 0 || !Number.isFinite(local) || local < 0) {
      toast.error(t("pricing.invalidCharges"));
      return;
    }
    saveMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        tenderId: tenderId ?? "",
        boqItemId: item.id,
        costBasisAmount: cost,
        costBasisCurrency: currency,
        costBasisSource: costSourceFor(item),
        fxRate,
        freightMode: freightModeValue(item),
        freightInput: freight,
        localMode: localModeValue(item),
        localInput: local,
        marginPercent: margin,
        version: lineByItem.get(item.id)?.version,
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("screens.pricing")} subtitle={t("pricing.subtitle")} />
      <GovernanceTracker tenderId={tenderId} currentPath="/workbench/pricing" />

      <Panel title={t("intake.selectTender")} className="mb-4">
        {listQuery.isPending ? (
          <LoadingRows rows={1} />
        ) : (listQuery.data?.tenders.length ?? 0) === 0 ? (
          <EmptyState message={t("dashboard.empty")} />
        ) : (
          <div className="min-w-0 sm:max-w-md">
            <Label htmlFor="pricing-tender">{t("intake.selectTender")}</Label>
            <select
              id="pricing-tender"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={tenderId ?? ""}
              onChange={(event) =>
                void navigate({
                  to: "/workbench/pricing",
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
            message={t("pricing.empty")}
            action={
              <Button
                variant="outline"
                onClick={() =>
                  void navigate({ to: "/workbench/sourcing", search: { tender: tenderId } })
                }
              >
                {t("screens.sourcing")}
              </Button>
            }
          />
        </Panel>
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("register.itemsTab")} value={data.items.length} />
            <StatCard label={t("pricing.priced")} value={data.items.length - pending} tone="info" />
            <StatCard
              label={t("pricing.pending")}
              value={pending}
              tone={pending > 0 ? "warning" : "success"}
            />
            <StatCard
              label={t("approvals.title")}
              value={activeTask ? t(`decision.${activeTask.state}`) : t("common.none")}
              tone="info"
            />
          </div>

          {data.unresolvedCostCount > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              {t("pricing.unresolvedCost", { count: data.unresolvedCostCount })}
            </div>
          )}

          <Panel title={t("screens.pricing")} description={t("pricing.subtitle")}>
            <TableScroll>
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">{t("screens.pricing")}</caption>
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("portfolio.item")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.costBasis")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.conversionRate")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.freightCharges")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.localCharges")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.landingCost")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.marginPercent")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.unitPrice")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("pricing.totalPrice")}
                    </th>
                    <th scope="col" className="px-2 py-2 text-start">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const existingLine = lineByItem.get(item.id);
                    const preview = previewPrice(item);
                    const editable = !locked && canPrice;
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
                        <td className="px-2 py-2" dir="ltr">
                          {editable ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex gap-1">
                                <Input
                                  aria-label={t("pricing.costBasis")}
                                  className="h-8 w-24"
                                  inputMode="decimal"
                                  value={costAmountValue(item)}
                                  onChange={(event) =>
                                    setCostAmountByItem((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  aria-label={t("pricing.costBasisCurrency")}
                                  className="h-8 w-14 uppercase"
                                  maxLength={3}
                                  value={costCurrencyValue(item)}
                                  onChange={(event) =>
                                    setCostCurrencyByItem((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <span className="w-fit rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {sourceLabel(costSourceFor(item))}
                              </span>
                            </div>
                          ) : existingLine ? (
                            <>
                              <span className="tabular-nums">
                                {formatMoney(
                                  existingLine.cost_basis,
                                  existingLine.cost_basis_currency,
                                  language,
                                )}
                              </span>
                              <span className="ms-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {sourceLabel(existingLine.cost_basis_source as CostBasisSource)}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{t("pricing.noCostYet")}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {editable ? (
                            <Input
                              aria-label={t("pricing.conversionRate")}
                              className="h-8 w-24"
                              inputMode="decimal"
                              value={fxRateValue(item)}
                              onChange={(event) =>
                                setFxRateByItem((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {existingLine ? existingLine.fx_rate : "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {editable ? (
                            <div className="flex gap-1">
                              <Input
                                aria-label={t("pricing.freightCharges")}
                                className="h-8 w-20"
                                inputMode="decimal"
                                value={freightValue(item)}
                                onChange={(event) =>
                                  setFreightByItem((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                              />
                              <select
                                aria-label={t("pricing.freightMode")}
                                className="h-8 rounded-lg border border-border bg-background px-1 text-xs"
                                value={freightModeValue(item)}
                                onChange={(event) =>
                                  setFreightModeByItem((current) => ({
                                    ...current,
                                    [item.id]: event.target.value as "value" | "percent",
                                  }))
                                }
                              >
                                <option value="value">{t("pricing.modeValue")}</option>
                                <option value="percent">{t("pricing.modePercent")}</option>
                              </select>
                            </div>
                          ) : (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {existingLine
                                ? `${existingLine.freight_input}${existingLine.freight_mode === "percent" ? "%" : ""}`
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {editable ? (
                            <div className="flex gap-1">
                              <Input
                                aria-label={t("pricing.localCharges")}
                                className="h-8 w-20"
                                inputMode="decimal"
                                value={localValue(item)}
                                onChange={(event) =>
                                  setLocalByItem((current) => ({
                                    ...current,
                                    [item.id]: event.target.value,
                                  }))
                                }
                              />
                              <select
                                aria-label={t("pricing.localMode")}
                                className="h-8 rounded-lg border border-border bg-background px-1 text-xs"
                                value={localModeValue(item)}
                                onChange={(event) =>
                                  setLocalModeByItem((current) => ({
                                    ...current,
                                    [item.id]: event.target.value as "value" | "percent",
                                  }))
                                }
                              >
                                <option value="value">{t("pricing.modeValue")}</option>
                                <option value="percent">{t("pricing.modePercent")}</option>
                              </select>
                            </div>
                          ) : (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {existingLine
                                ? `${existingLine.local_input}${existingLine.local_mode === "percent" ? "%" : ""}`
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums" dir="ltr">
                          {preview
                            ? formatMoney(
                                preview.landingCost.toString(),
                                preview.currency,
                                language,
                              )
                            : existingLine
                              ? formatMoney(
                                  existingLine.landing_cost,
                                  existingLine.unit_price_currency,
                                  language,
                                )
                              : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {locked || !canPrice ? (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {existingLine ? `${existingLine.margin_percent}%` : "—"}
                            </span>
                          ) : (
                            <Input
                              aria-label={t("pricing.marginPercent")}
                              className="h-8 w-24"
                              inputMode="decimal"
                              value={marginValue(item)}
                              onChange={(event) =>
                                setMarginByItem((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums" dir="ltr">
                          {preview?.unit
                            ? formatMoney(preview.unit.toString(), preview.currency, language)
                            : existingLine
                              ? formatMoney(
                                  existingLine.unit_price,
                                  existingLine.unit_price_currency,
                                  language,
                                )
                              : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums" dir="ltr">
                          {preview?.total
                            ? formatMoney(preview.total.toString(), preview.currency, language)
                            : existingLine
                              ? formatMoney(
                                  existingLine.total_price,
                                  existingLine.unit_price_currency,
                                  language,
                                )
                              : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {locked || !canPrice ? (
                            <span className="text-xs text-muted-foreground">
                              {t("common.readOnly")}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={saveMutation.isPending}
                              onClick={() => saveRow(item)}
                            >
                              {t("common.save")}
                            </Button>
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
                  <span className="text-muted-foreground">{t("pricing.awaiting")}</span>
                </div>
              )}
              <div>
                <Label htmlFor="pricing-note">{t("register.note")}</Label>
                <Textarea
                  id="pricing-note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {!activeTask && canPrice && (
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
                    {t("pricing.submit")}
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
    </div>
  );
}
