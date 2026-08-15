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
  getQuotationBoard,
  releaseQuotation,
  submitFinanceForApproval,
  submitReleaseForApproval,
} from "@/lib/pricing.functions";
import { generateQuotationDocument } from "@/lib/quotation-document.functions";

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
  const generateDocument = useServerFn(generateQuotationDocument);

  const [note, setNote] = useState("");
  const [releaseCurrencyDraft, setReleaseCurrencyDraft] = useState("");
  const [vatPercent, setVatPercent] = useState("0");
  const [fxRates, setFxRates] = useState<Record<string, string>>({});
  const [discount, setDiscount] = useState("0");
  const [otherCharges, setOtherCharges] = useState("0");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [warranty, setWarranty] = useState("");
  const [incoterms, setIncoterms] = useState("");
  const [notesAssumptions, setNotesAssumptions] = useState("");

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
    setDiscount("0");
    setOtherCharges("0");
    setPaymentTerms("");
    setDeliveryTerms("");
    setWarranty("");
    setIncoterms("");
    setNotesAssumptions("");
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

  const downloadDocumentMutation = useMutation({
    mutationFn: generateDocument,
    onSuccess: (result) => {
      const bytes = atob(result.base64);
      const buffer = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);
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
  const isAdmin = data?.myRole === "org_admin";
  const selfSubmitted = activeTask?.submitted_by === data?.userId;
  const canDecideRelease = isApprover && !selfSubmitted;
  const canOverride = selfSubmitted && isAdmin;

  function submitReleaseDecision() {
    if (!activeTask || !data) return;
    const vat = Number(vatPercent);
    if (vatPercent.trim() === "" || Number.isNaN(vat) || vat < 0 || vat > 100) {
      toast.error(t("quotation.invalidVat"));
      return;
    }
    const discountValue = Number(discount);
    const otherChargesValue = Number(otherCharges);
    if (!Number.isFinite(discountValue) || discountValue < 0) {
      toast.error(t("quotation.invalidDiscount"));
      return;
    }
    if (!Number.isFinite(otherChargesValue) || otherChargesValue < 0) {
      toast.error(t("quotation.invalidOtherCharges"));
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
        discount: discountValue,
        otherCharges: otherChargesValue,
        paymentTerms: paymentTerms.trim() || null,
        deliveryTerms: deliveryTerms.trim() || null,
        warranty: warranty.trim() || null,
        incoterms: incoterms.trim() || null,
        notesAssumptions: notesAssumptions.trim() || null,
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
      <GovernanceTracker tenderId={tenderId} currentPath="/workbench/review" />

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
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloadDocumentMutation.isPending}
                  onClick={() =>
                    downloadDocumentMutation.mutate({
                      data: {
                        organizationId: activeOrganizationId ?? "",
                        tenderId: tenderId ?? "",
                      },
                    })
                  }
                >
                  {downloadDocumentMutation.isPending
                    ? t("common.saving")
                    : t("quotation.downloadDocument")}
                </Button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label={t("quotation.subtotal")}
                  value={formatMoney(data.quotation.subtotal, data.quotation.currency, language)}
                />
                <StatCard
                  label={t("quotation.discount")}
                  value={formatMoney(data.quotation.discount, data.quotation.currency, language)}
                />
                <StatCard
                  label={t("quotation.vatAmount")}
                  value={formatMoney(data.quotation.vat_amount, data.quotation.currency, language)}
                />
                <StatCard
                  label={t("quotation.otherCharges")}
                  value={formatMoney(
                    data.quotation.other_charges,
                    data.quotation.currency,
                    language,
                  )}
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
              {(data.quotation.payment_terms ||
                data.quotation.delivery_terms ||
                data.quotation.warranty ||
                data.quotation.incoterms ||
                data.quotation.notes_assumptions) && (
                <div className="mt-4 grid gap-3 rounded-lg border border-border bg-surface p-3 text-sm sm:grid-cols-2">
                  {data.quotation.payment_terms && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("quotation.paymentTerms")}</p>
                      <p>{data.quotation.payment_terms}</p>
                    </div>
                  )}
                  {data.quotation.delivery_terms && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t("quotation.deliveryTerms")}
                      </p>
                      <p>{data.quotation.delivery_terms}</p>
                    </div>
                  )}
                  {data.quotation.warranty && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("quotation.warranty")}</p>
                      <p>{data.quotation.warranty}</p>
                    </div>
                  )}
                  {data.quotation.incoterms && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t("quotation.incoterms")}</p>
                      <p>{data.quotation.incoterms}</p>
                    </div>
                  )}
                  {data.quotation.notes_assumptions && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">
                        {t("quotation.notesAssumptions")}
                      </p>
                      <p className="whitespace-pre-line">{data.quotation.notes_assumptions}</p>
                    </div>
                  )}
                </div>
              )}
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

                {activeTask &&
                  activeTask.stage === "release" &&
                  (canDecideRelease || canOverride) && (
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
                      <div>
                        <Label htmlFor="release-discount">{t("quotation.discount")}</Label>
                        <Input
                          id="release-discount"
                          className="mt-1"
                          inputMode="decimal"
                          value={discount}
                          onChange={(event) => setDiscount(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="release-other-charges">{t("quotation.otherCharges")}</Label>
                        <Input
                          id="release-other-charges"
                          className="mt-1"
                          inputMode="decimal"
                          value={otherCharges}
                          onChange={(event) => setOtherCharges(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="release-payment-terms">{t("quotation.paymentTerms")}</Label>
                        <Input
                          id="release-payment-terms"
                          className="mt-1"
                          value={paymentTerms}
                          onChange={(event) => setPaymentTerms(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="release-delivery-terms">
                          {t("quotation.deliveryTerms")}
                        </Label>
                        <Input
                          id="release-delivery-terms"
                          className="mt-1"
                          value={deliveryTerms}
                          onChange={(event) => setDeliveryTerms(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="release-warranty">{t("quotation.warranty")}</Label>
                        <Input
                          id="release-warranty"
                          className="mt-1"
                          value={warranty}
                          onChange={(event) => setWarranty(event.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="release-incoterms">{t("quotation.incoterms")}</Label>
                        <Input
                          id="release-incoterms"
                          className="mt-1"
                          value={incoterms}
                          onChange={(event) => setIncoterms(event.target.value)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="release-notes-assumptions">
                          {t("quotation.notesAssumptions")}
                        </Label>
                        <Textarea
                          id="release-notes-assumptions"
                          className="mt-1"
                          rows={3}
                          value={notesAssumptions}
                          onChange={(event) => setNotesAssumptions(event.target.value)}
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t("quotation.notesAssumptionsHint")}
                        </p>
                      </div>
                    </div>
                  )}

                <div className="flex flex-wrap gap-2">
                  {!activeTask &&
                    data.tender.current_stage !== "finance" &&
                    data.tender.current_stage !== "release" && (
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
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-warning">{t("register.selfBlocked")}</p>
                      {isAdmin && (
                        <div className="flex flex-col items-start gap-1.5 rounded-lg border border-warning/40 bg-warning/10 p-2.5">
                          <p className="text-xs text-warning">{t("approvals.overrideWarning")}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-warning text-warning hover:bg-warning/10"
                              disabled={
                                (activeTask.stage === "release"
                                  ? releaseMutation.isPending
                                  : stageMutation.isPending) || !note.trim()
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
                            {(["changes_requested", "rejected"] as const).map((decision) => (
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
                                {decision === "changes_requested"
                                  ? t("register.requestChanges")
                                  : t("register.reject")}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
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
