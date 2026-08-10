import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { WorkbenchStepper } from "@/components/workbench-stepper";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listIntakeTenders } from "@/lib/intake.functions";
import { decideStageApproval } from "@/lib/portfolio.functions";
import { formatMoney } from "@/lib/format";
import {
  getQuotationBoard,
  releaseQuotation,
  submitFinanceForApproval,
  submitReleaseForApproval,
} from "@/lib/pricing.functions";

const searchSchema = z.object({ tender: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/workbench/review")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Commercial review & quotation — TenderReady" },
      {
        name: "description",
        content: "Final review, maker-checker approval and quotation release.",
      },
      { property: "og:title", content: "Commercial review & quotation — TenderReady" },
      {
        property: "og:description",
        content: "Final review, maker-checker approval and quotation release.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type BoardData = Awaited<ReturnType<typeof getQuotationBoard>>;

function Page() {
  const { t, language } = useAppTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchTenders = useServerFn(listIntakeTenders);
  const fetchBoard = useServerFn(getQuotationBoard);
  const submitFinance = useServerFn(submitFinanceForApproval);
  const submitRelease = useServerFn(submitReleaseForApproval);
  const decideStage = useServerFn(decideStageApproval);
  const release = useServerFn(releaseQuotation);

  const [note, setNote] = useState("");
  const [releaseCurrencyDraft, setReleaseCurrencyDraft] = useState("");
  const [vatPercent, setVatPercent] = useState("0");
  const [fxRates, setFxRates] = useState<Record<string, string>>({});

  const listQuery = useQuery({
    queryKey: ["intake-tenders", activeOrganizationId],
    queryFn: () => fetchTenders({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const tenderId = search.tender ?? listQuery.data?.tenders[0]?.id ?? null;

  const boardQuery = useQuery({
    queryKey: ["quotation-board", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchBoard({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
  });

  const data = boardQuery.data;
  const releaseCurrency = releaseCurrencyDraft || data?.tender.currency || "";

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["quotation-board"] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  const resetForm = () => {
    setNote("");
    setReleaseCurrencyDraft("");
    setVatPercent("0");
    setFxRates({});
  };

  const submitFinanceMutation = useMutation({
    mutationFn: submitFinance,
    onSuccess: () => {
      toast.success(t("quotation.financeSubmitted"));
      resetForm();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submitReleaseMutation = useMutation({
    mutationFn: submitRelease,
    onSuccess: () => {
      toast.success(t("quotation.releaseSubmitted"));
      resetForm();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const stageMutation = useMutation({
    mutationFn: decideStage,
    onSuccess: () => {
      toast.success(t("register.decisionSaved"));
      resetForm();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const releaseMutation = useMutation({
    mutationFn: release,
    onSuccess: () => {
      toast.success(t("quotation.released"));
      resetForm();
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeTask = data?.activeTask ?? null;
  const canManage =
    data?.myRole === "org_admin" ||
    data?.myRole === "commercial_manager" ||
    data?.myRole === "finance_manager" ||
    data?.myRole === "signatory";
  const isApprover = data?.myRole === "org_admin" || data?.myRole === activeTask?.approver_role;
  const selfSubmitted = activeTask?.submitted_by === data?.userId;

  function submitReleaseDecision() {
    if (!activeTask || !data) return;
    const vat = Number(vatPercent);
    if (vatPercent.trim() === "" || Number.isNaN(vat) || vat < 0 || vat > 100) {
      toast.error(t("quotation.invalidVat"));
      return;
    }
    const missing = data.currenciesInUse.filter(
      (currency) => currency !== releaseCurrency && !fxRates[currency]?.trim(),
    );
    if (missing.length > 0) {
      toast.error(t("quotation.missingRates"));
      return;
    }
    const rates: Record<string, number> = {};
    for (const currency of data.currenciesInUse) {
      if (currency === releaseCurrency) continue;
      rates[currency] = Number(fxRates[currency]);
    }
    releaseMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        taskId: activeTask.id,
        currency: releaseCurrency.trim().toUpperCase(),
        fxRates: rates,
        vatPercent: vat,
        note: note || null,
      },
    });
  }

  function statusLabel(board: BoardData) {
    if (board.quotation) return t("quotation.releasedBadge");
    if (board.activeTask) return t(`decision.${board.activeTask.state}`);
    return t("quotation.notSubmitted");
  }

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader title={t("screens.commercialReview")} subtitle={t("quotation.subtitle")} />
      <WorkbenchStepper currentPath="/workbench/review" />

      <Panel title={t("intake.selectTender")} className="mb-4">
        {listQuery.isPending ? (
          <LoadingRows rows={1} />
        ) : (listQuery.data?.tenders.length ?? 0) === 0 ? (
          <EmptyState message={t("dashboard.empty")} />
        ) : (
          <div className="min-w-0 sm:max-w-md">
            <Label htmlFor="review-tender">{t("intake.selectTender")}</Label>
            <select
              id="review-tender"
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              value={tenderId ?? ""}
              onChange={(event) =>
                void navigate({
                  to: "/workbench/review",
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
      ) : data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("register.itemsTab")} value={data.lines.length} />
            <StatCard label={t("quotation.currencies")} value={data.currenciesInUse.length} />
            <StatCard
              label={t("quotation.stage")}
              value={t(`stage.${data.tender.current_stage}`)}
            />
            <StatCard
              label={t("quotation.status")}
              value={statusLabel(data)}
              tone={data.quotation ? "success" : activeTask ? "info" : "default"}
            />
          </div>

          {data.quotation ? (
            <Panel
              title={t("quotation.quotationNumber")}
              description={data.quotation.quotation_number}
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label={t("quotation.subtotal")}
                  value={formatMoney(data.quotation.subtotal, data.quotation.currency, language)}
                />
                <StatCard
                  label={t("quotation.vatAmount")}
                  value={formatMoney(data.quotation.vat_amount, data.quotation.currency, language)}
                />
                <StatCard
                  label={t("quotation.total")}
                  value={formatMoney(data.quotation.total, data.quotation.currency, language)}
                  tone="success"
                />
                <StatCard
                  label={t("quotation.validUntil")}
                  value={data.quotation.valid_until ?? "—"}
                />
              </div>
              <div className="mt-4">
                {data.quotationLines.length === 0 ? (
                  <EmptyState message={t("quotation.noLines")} />
                ) : (
                  <TableScroll>
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">{t("quotation.quotationNumber")}</caption>
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="px-2 py-2 text-start">
                            {t("register.description")}
                          </th>
                          <th scope="col" className="px-2 py-2 text-start">
                            {t("register.unit")}
                          </th>
                          <th scope="col" className="px-2 py-2 text-start">
                            {t("register.quantity")}
                          </th>
                          <th scope="col" className="px-2 py-2 text-start">
                            {t("pricing.unitPrice")}
                          </th>
                          <th scope="col" className="px-2 py-2 text-start">
                            {t("pricing.totalPrice")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.quotationLines.map((line) => (
                          <tr key={line.id} className="border-b border-border/70 align-top">
                            <td className="max-w-[24rem] px-2 py-2">
                              <p className="line-clamp-3 break-words font-medium text-foreground">
                                {language === "ar" && line.description_ar
                                  ? line.description_ar
                                  : line.description}
                              </p>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-xs">
                              {line.unit ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums">
                              {line.quantity ?? "—"}
                            </td>
                            <td
                              className="whitespace-nowrap px-2 py-2 text-xs tabular-nums"
                              dir="ltr"
                            >
                              {formatMoney(line.unit_price, data.quotation!.currency, language)}
                            </td>
                            <td
                              className="whitespace-nowrap px-2 py-2 text-xs tabular-nums"
                              dir="ltr"
                            >
                              {formatMoney(line.total_price, data.quotation!.currency, language)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                )}
              </div>
            </Panel>
          ) : (
            <Panel title={t("approvals.title")} description={t("approvals.selfBlockedHelp")}>
              <div className="flex flex-col gap-3">
                {activeTask && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <DecisionBadge state={activeTask.state} />
                    <span className="text-muted-foreground">
                      {t(
                        activeTask.stage === "release"
                          ? "quotation.releaseStage"
                          : "quotation.financeStage",
                      )}
                    </span>
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

                {activeTask && isApprover && !selfSubmitted && activeTask.stage === "release" && (
                  <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="release-currency">{t("quotation.currency")}</Label>
                      <Input
                        id="release-currency"
                        className="mt-1 uppercase"
                        maxLength={3}
                        list="release-currency-options"
                        value={releaseCurrency}
                        onChange={(event) => setReleaseCurrencyDraft(event.target.value)}
                      />
                      <datalist id="release-currency-options">
                        {Array.from(new Set([data.tender.currency, ...data.currenciesInUse])).map(
                          (currency) => (
                            <option key={currency} value={currency} />
                          ),
                        )}
                      </datalist>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("quotation.currencyHint", {
                          currencies: data.currenciesInUse.join(", "),
                        })}
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="release-vat">{t("quotation.vatPercent")}</Label>
                      <Input
                        id="release-vat"
                        className="mt-1"
                        inputMode="decimal"
                        value={vatPercent}
                        onChange={(event) => setVatPercent(event.target.value)}
                      />
                    </div>
                    {data.currenciesInUse
                      .filter((currency) => currency !== releaseCurrency)
                      .map((currency) => (
                        <div key={currency}>
                          <Label htmlFor={`fx-${currency}`}>
                            {t("quotation.fxRate", {
                              currency,
                              target: releaseCurrency || "?",
                            })}
                          </Label>
                          <Input
                            id={`fx-${currency}`}
                            className="mt-1"
                            inputMode="decimal"
                            value={fxRates[currency] ?? ""}
                            onChange={(event) =>
                              setFxRates((current) => ({
                                ...current,
                                [currency]: event.target.value,
                              }))
                            }
                          />
                        </div>
                      ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {!activeTask && data.tender.current_stage === "commercial" && (
                    <p className="text-xs text-muted-foreground">
                      {t("quotation.awaitingCommercial")}
                    </p>
                  )}
                  {!activeTask && data.tender.current_stage === "finance" && canManage && (
                    <Button
                      disabled={submitFinanceMutation.isPending}
                      onClick={() =>
                        submitFinanceMutation.mutate({
                          data: {
                            organizationId: activeOrganizationId ?? "",
                            tenderId: tenderId ?? "",
                            note: note || null,
                          },
                        })
                      }
                    >
                      {t("quotation.submitFinance")}
                    </Button>
                  )}
                  {!activeTask && data.tender.current_stage === "release" && (
                    <>
                      {canManage ? (
                        <Button
                          disabled={submitReleaseMutation.isPending}
                          onClick={() =>
                            submitReleaseMutation.mutate({
                              data: {
                                organizationId: activeOrganizationId ?? "",
                                tenderId: tenderId ?? "",
                                note: note || null,
                              },
                            })
                          }
                        >
                          {t("quotation.submitRelease")}
                        </Button>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {t("quotation.awaitingFinance")}
                        </p>
                      )}
                    </>
                  )}

                  {activeTask && isApprover && !selfSubmitted && (
                    <>
                      <Button
                        disabled={
                          activeTask.stage === "release"
                            ? releaseMutation.isPending
                            : stageMutation.isPending
                        }
                        onClick={() =>
                          activeTask.stage === "release"
                            ? submitReleaseDecision()
                            : stageMutation.mutate({
                                data: {
                                  organizationId: activeOrganizationId ?? "",
                                  taskId: activeTask.id,
                                  decision: "approved",
                                  note: note || null,
                                },
                              })
                        }
                      >
                        {activeTask.stage === "release"
                          ? t("quotation.approveRelease")
                          : t("register.approve")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={stageMutation.isPending}
                        onClick={() =>
                          stageMutation.mutate({
                            data: {
                              organizationId: activeOrganizationId ?? "",
                              taskId: activeTask.id,
                              decision: "changes_requested",
                              note: note || null,
                            },
                          })
                        }
                      >
                        {t("register.requestChanges")}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={stageMutation.isPending}
                        onClick={() =>
                          stageMutation.mutate({
                            data: {
                              organizationId: activeOrganizationId ?? "",
                              taskId: activeTask.id,
                              decision: "rejected",
                              note: note || null,
                            },
                          })
                        }
                      >
                        {t("register.reject")}
                      </Button>
                    </>
                  )}
                  {activeTask && selfSubmitted && (
                    <p className="text-xs text-warning">{t("register.selfBlocked")}</p>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </div>
      ) : null}
    </div>
  );
}
