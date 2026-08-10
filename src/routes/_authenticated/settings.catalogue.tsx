import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useAppTranslation } from "@/components/language-provider";
import {
  EmptyState,
  ErrorState,
  LoadingRows,
  PageHeader,
  Panel,
  TableScroll,
} from "@/components/ui-blocks";
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
import { supabase } from "@/integrations/supabase/client";
import {
  commitCatalogueImportRows,
  discardCatalogueImportBatch,
  getCatalogueImportRows,
  listCatalogueImportBatches,
  registerCatalogueImportFile,
  startCatalogueImportExtraction,
} from "@/lib/catalogue-import.functions";
import { formatMoney } from "@/lib/format";
import {
  deleteCatalogueProduct,
  listCatalogueProducts,
  upsertCatalogueProduct,
} from "@/lib/portfolio.functions";

const IMPORT_ACCEPT = ".xlsx,.xlsm,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp";

export const Route = createFileRoute("/_authenticated/settings/catalogue")({
  head: () => ({
    meta: [
      { title: "Product catalogue — TenderReady" },
      {
        name: "description",
        content:
          "Maintain the product portfolio, specifications and stock positions that drive tender matching.",
      },
      { property: "og:title", content: "Product catalogue — TenderReady" },
      {
        property: "og:description",
        content: "Portfolio products, specifications and stock that drive assistive matching.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

type CatalogueData = Awaited<ReturnType<typeof listCatalogueProducts>>;
type Product = CatalogueData["products"][number];

type FormState = {
  productId: string | null;
  code: string;
  supplierCode: string;
  name: string;
  nameAr: string;
  unit: string;
  brand: string;
  category: string;
  baseCost: string;
  currency: string;
  incoterm: string;
  landingCost: string;
  isActive: boolean;
  stockQuantity: string;
  leadTimeDays: string;
  specs: { key: string; value: string; unit: string }[];
};

const emptyForm: FormState = {
  productId: null,
  code: "",
  supplierCode: "",
  name: "",
  nameAr: "",
  unit: "",
  brand: "",
  category: "",
  baseCost: "",
  currency: "EGP",
  incoterm: "",
  landingCost: "",
  isActive: true,
  stockQuantity: "",
  leadTimeDays: "",
  specs: [{ key: "", value: "", unit: "" }],
};

type StatusFilter = "all" | "active" | "inactive";

function Page() {
  const { t, language } = useAppTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchProducts = useServerFn(listCatalogueProducts);
  const save = useServerFn(upsertCatalogueProduct);
  const deactivate = useServerFn(deleteCatalogueProduct);

  const [form, setForm] = useState<FormState | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const registerImport = useServerFn(registerCatalogueImportFile);
  const startExtraction = useServerFn(startCatalogueImportExtraction);
  const commitRows = useServerFn(commitCatalogueImportRows);
  const discardBatch = useServerFn(discardCatalogueImportBatch);
  const fetchBatches = useServerFn(listCatalogueImportBatches);
  const fetchImportRows = useServerFn(getCatalogueImportRows);

  const importFileInput = useRef<HTMLInputElement | null>(null);
  const [uploadingImport, setUploadingImport] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["catalogue", activeOrganizationId],
    queryFn: () => fetchProducts({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const canManage = query.data?.myRole === "org_admin" || query.data?.myRole === "product_manager";

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: () => {
      toast.success(t("catalogue.saved"));
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ["catalogue"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio-board"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deactivate,
    onSuccess: () => {
      toast.success(t("catalogue.deactivated"));
      void queryClient.invalidateQueries({ queryKey: ["catalogue"] });
      void queryClient.invalidateQueries({ queryKey: ["portfolio-board"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const batchesQuery = useQuery({
    queryKey: ["catalogue-imports", activeOrganizationId],
    queryFn: () => fetchBatches({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId) && canManage,
    refetchInterval: (query) =>
      (query.state.data?.batches ?? []).some((batch) => batch.status === "parsing") ? 2000 : false,
  });

  const rowsQuery = useQuery({
    queryKey: ["catalogue-import-rows", selectedBatchId],
    queryFn: () =>
      fetchImportRows({
        data: { organizationId: activeOrganizationId ?? "", importBatchId: selectedBatchId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && selectedBatchId),
  });

  const commitMutation = useMutation({
    mutationFn: commitRows,
    onSuccess: (result) => {
      toast.success(`${result.committed} ${t("catalogueImport.committedToast")}`);
      setSelectedRowIds(new Set());
      void queryClient.invalidateQueries({ queryKey: ["catalogue-import-rows"] });
      void queryClient.invalidateQueries({ queryKey: ["catalogue-imports"] });
      void queryClient.invalidateQueries({ queryKey: ["catalogue"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const discardMutation = useMutation({
    mutationFn: discardBatch,
    onSuccess: () => {
      toast.success(t("catalogueImport.discarded"));
      if (selectedBatchId) setSelectedBatchId(null);
      void queryClient.invalidateQueries({ queryKey: ["catalogue-imports"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function uploadImportFile(file: File) {
    if (!activeOrganizationId) return;
    const safeName = file.name.replace(/[^\w.\-؀-ۿ]+/g, "_");
    const path = `${activeOrganizationId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("catalogue-files").upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (upload.error) throw new Error(upload.error.message);

    const registered = await registerImport({
      data: {
        organizationId: activeOrganizationId,
        storagePath: path,
        originalName: file.name,
        mimeType: file.type || null,
        byteSize: file.size,
      },
    });
    await startExtraction({
      data: { organizationId: activeOrganizationId, importBatchId: registered.importBatchId },
    });
    setSelectedBatchId(registered.importBatchId);
  }

  async function onImportFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploadingImport(true);
    try {
      for (const file of list) {
        try {
          await uploadImportFile(file);
        } catch (error) {
          toast.error(
            `${file.name}: ${error instanceof Error ? error.message : t("common.unexpectedError")}`,
          );
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["catalogue-imports"] });
    } finally {
      setUploadingImport(false);
      if (importFileInput.current) importFileInput.current.value = "";
    }
  }

  function toggleRowSelected(rowId: string) {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function openEdit(product: Product) {
    setForm({
      productId: product.id,
      code: product.code ?? "",
      supplierCode: product.supplier_code,
      name: product.name,
      nameAr: product.name_ar ?? "",
      unit: product.unit ?? "",
      brand: product.brand ?? "",
      category: product.category ?? "",
      baseCost: product.base_cost === null ? "" : String(product.base_cost),
      currency: product.currency,
      incoterm: product.incoterm ?? "",
      landingCost: product.landing_cost === null ? "" : String(product.landing_cost),
      isActive: product.is_active,
      stockQuantity: String(product.stock_positions?.[0]?.quantity ?? ""),
      leadTimeDays: String(product.stock_positions?.[0]?.lead_time_days ?? ""),
      specs:
        (product.product_specifications ?? []).length > 0
          ? (product.product_specifications ?? []).map((spec) => ({
              key: spec.spec_key,
              value: spec.spec_value,
              unit: spec.unit ?? "",
            }))
          : [{ key: "", value: "", unit: "" }],
    });
  }

  function submit() {
    if (!form) return;
    const numeric = (value: string) => (value.trim() === "" ? null : Number(value));
    saveMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        productId: form.productId,
        code: form.code.trim() || null,
        supplierCode: form.supplierCode.trim(),
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        unit: form.unit.trim() || null,
        brand: form.brand.trim() || null,
        category: form.category.trim() || null,
        baseCost: numeric(form.baseCost),
        currency: form.currency.trim().toUpperCase() || "EGP",
        incoterm: form.incoterm.trim() || null,
        landingCost: numeric(form.landingCost),
        isActive: form.isActive,
        stockQuantity: numeric(form.stockQuantity),
        leadTimeDays: numeric(form.leadTimeDays),
        specs: form.specs
          .filter((spec) => spec.key.trim() && spec.value.trim())
          .map((spec) => ({
            key: spec.key.trim(),
            value: spec.value.trim(),
            unit: spec.unit.trim() || null,
          })),
      },
    });
  }

  function toggleActive(product: Product) {
    saveMutation.mutate({
      data: {
        organizationId: activeOrganizationId ?? "",
        productId: product.id,
        code: product.code ?? null,
        supplierCode: product.supplier_code,
        name: product.name,
        nameAr: product.name_ar ?? null,
        unit: product.unit ?? null,
        brand: product.brand ?? null,
        category: product.category ?? null,
        baseCost: product.base_cost === null ? null : Number(product.base_cost),
        currency: product.currency,
        incoterm: product.incoterm ?? null,
        landingCost: product.landing_cost === null ? null : Number(product.landing_cost),
        isActive: !product.is_active,
      },
    });
  }

  const filteredProducts = (query.data?.products ?? []).filter((product) => {
    if (statusFilter === "active" && !product.is_active) return false;
    if (statusFilter === "inactive" && product.is_active) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [product.code, product.supplier_code, product.name, product.name_ar, product.brand]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title={t("catalogue.title")}
        subtitle={t("catalogue.subtitle")}
        actions={
          canManage ? (
            <Button onClick={() => setForm({ ...emptyForm })}>{t("catalogue.addProduct")}</Button>
          ) : undefined
        }
      />

      <Panel title={t("catalogue.title")}>
        {query.isPending ? (
          <LoadingRows rows={5} />
        ) : query.error ? (
          <ErrorState
            message={(query.error as Error).message}
            action={
              <Button variant="outline" onClick={() => void query.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : (query.data?.products.length ?? 0) === 0 ? (
          <EmptyState message={t("catalogue.empty")} />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input
                aria-label={t("catalogue.search")}
                placeholder={t("catalogue.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="sm:max-w-xs"
              />
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                {(["all", "active", "inactive"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStatusFilter(option)}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                      statusFilter === option
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground"
                    }`}
                  >
                    {t(
                      `catalogue.filter${option === "all" ? "All" : option === "active" ? "Active" : "Inactive"}`,
                    )}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {filteredProducts.length} / {query.data?.products.length ?? 0}
              </span>
            </div>
            {filteredProducts.length === 0 ? (
              <EmptyState message={t("catalogue.empty")} />
            ) : (
              <TableScroll>
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">{t("catalogue.title")}</caption>
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.icode")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.supplierCode")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.name")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.unit")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.baseCost")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.landingCost")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("portfolio.stock")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("catalogue.active")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("common.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const stock = product.stock_positions?.[0]?.quantity ?? 0;
                      return (
                        <tr key={product.id} className="border-b border-border/70 align-top">
                          <td className="whitespace-nowrap px-2 py-2 font-medium">
                            {product.code ?? (
                              <span className="text-muted-foreground">
                                {t("catalogue.notEnlisted")}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                            {product.supplier_code}
                          </td>
                          <td className="max-w-[18rem] px-2 py-2">
                            <p className="break-words">
                              {language === "ar" && product.name_ar
                                ? product.name_ar
                                : product.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {[product.brand, product.category].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                            {product.unit ?? "—"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 tabular-nums" dir="ltr">
                            {product.base_cost === null
                              ? "—"
                              : formatMoney(product.base_cost, product.currency, language)}
                            {product.incoterm && (
                              <span className="ms-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                {product.incoterm}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 tabular-nums" dir="ltr">
                            {stock > 0 && product.landing_cost !== null ? (
                              formatMoney(
                                product.landing_cost,
                                product.landing_cost_currency ?? product.currency,
                                language,
                              )
                            ) : (
                              <span className="text-muted-foreground">
                                {t("catalogue.notStocked")}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 tabular-nums">{stock}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[11px] ${
                                product.is_active
                                  ? "bg-success/10 text-success"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {product.is_active ? t("catalogue.active") : t("catalogue.inactive")}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {canManage ? (
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEdit(product)}
                                >
                                  {t("common.save").replace("…", "")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={saveMutation.isPending || deleteMutation.isPending}
                                  onClick={() =>
                                    product.is_active
                                      ? deleteMutation.mutate({
                                          data: {
                                            organizationId: activeOrganizationId ?? "",
                                            productId: product.id,
                                          },
                                        })
                                      : toggleActive(product)
                                  }
                                >
                                  {product.is_active
                                    ? t("catalogue.deactivate")
                                    : t("catalogue.activate")}
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {t("common.readOnly")}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </>
        )}
        {!canManage && (
          <p className="mt-3 text-xs text-muted-foreground">{t("catalogue.onlyAdmin")}</p>
        )}
      </Panel>

      {canManage && (
        <Panel title={t("catalogueImport.title")} className="mt-4">
          <p className="mb-3 text-xs text-muted-foreground">{t("catalogueImport.subtitle")}</p>
          <div className="mb-4 flex items-center gap-2">
            <input
              ref={importFileInput}
              type="file"
              accept={IMPORT_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => event.target.files && void onImportFiles(event.target.files)}
            />
            <Button onClick={() => importFileInput.current?.click()} disabled={uploadingImport}>
              {uploadingImport ? t("catalogueImport.uploading") : t("catalogueImport.upload")}
            </Button>
          </div>

          {batchesQuery.isPending ? (
            <LoadingRows rows={2} />
          ) : (batchesQuery.data?.batches.length ?? 0) === 0 ? (
            <EmptyState message={t("catalogueImport.noBatches")} />
          ) : (
            <div className="space-y-2">
              {(batchesQuery.data?.batches ?? []).map((batch) => {
                const statusKey =
                  batch.status === "uploaded"
                    ? "statusUploaded"
                    : batch.status === "parsing"
                      ? "statusParsing"
                      : batch.status === "parsed"
                        ? "statusParsed"
                        : batch.status === "partial"
                          ? "statusPartial"
                          : batch.status === "integration_required"
                            ? "statusIntegrationRequired"
                            : "statusFailed";
                return (
                  <div
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {batch.file_name ?? t("catalogueImport.title")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(`catalogueImport.${statusKey}`)}
                        {batch.total_rows > 0 &&
                          ` · ${batch.total_rows} ${t("catalogueImport.rows")}`}
                        {batch.imported_rows > 0 &&
                          ` · ${batch.imported_rows} ${t("catalogueImport.committedCount")}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {batch.status !== "parsing" && batch.status !== "uploaded" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedBatchId(batch.id)}
                        >
                          {t("catalogueImport.review")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={discardMutation.isPending}
                        onClick={() =>
                          discardMutation.mutate({
                            data: {
                              organizationId: activeOrganizationId ?? "",
                              importBatchId: batch.id,
                            },
                          })
                        }
                      >
                        {t("catalogueImport.discard")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      <Dialog
        open={Boolean(selectedBatchId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedBatchId(null);
            setSelectedRowIds(new Set());
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("catalogueImport.review")}</DialogTitle>
          </DialogHeader>
          {rowsQuery.isPending ? (
            <LoadingRows rows={5} />
          ) : (
            (() => {
              const importRows = rowsQuery.data?.rows ?? [];
              const pendingRowIds = importRows
                .filter((row) => row.status === "pending")
                .map((row) => row.id);
              return (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{t("catalogueImport.commitHint")}</p>
                  <TableScroll>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-2 text-start">
                            <input
                              type="checkbox"
                              aria-label={t("catalogueImport.selectAll")}
                              checked={
                                pendingRowIds.length > 0 &&
                                pendingRowIds.every((id) => selectedRowIds.has(id))
                              }
                              onChange={(event) =>
                                setSelectedRowIds(
                                  event.target.checked ? new Set(pendingRowIds) : new Set(),
                                )
                              }
                            />
                          </th>
                          <th className="px-2 py-2 text-start">{t("catalogueImport.code")}</th>
                          <th className="px-2 py-2 text-start">{t("catalogue.name")}</th>
                          <th className="px-2 py-2 text-start">{t("catalogue.baseCost")}</th>
                          <th className="px-2 py-2 text-start">
                            {t("catalogueImport.confidence")}
                          </th>
                          <th className="px-2 py-2 text-start">{t("catalogueImport.issue")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row) => {
                          const mapped = (row.mapped_data ?? {}) as {
                            supplierCode?: string | null;
                            name?: string | null;
                            price?: number | null;
                            currency?: string | null;
                            confidence?: number;
                            matchedProductId?: string | null;
                          };
                          return (
                            <tr key={row.id} className="border-b border-border/70 align-top">
                              <td className="px-2 py-2">
                                <input
                                  type="checkbox"
                                  disabled={row.status !== "pending"}
                                  checked={selectedRowIds.has(row.id)}
                                  onChange={() => toggleRowSelected(row.id)}
                                />
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-xs">
                                {mapped.supplierCode ?? "—"}
                              </td>
                              <td className="max-w-[16rem] px-2 py-2">
                                <p className="break-words">{mapped.name ?? "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {row.status === "committed"
                                    ? t("catalogueImport.committedCount")
                                    : mapped.matchedProductId
                                      ? t("catalogueImport.willUpdate")
                                      : t("catalogueImport.newSku")}
                                </p>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 tabular-nums" dir="ltr">
                                {mapped.price == null
                                  ? "—"
                                  : formatMoney(mapped.price, mapped.currency ?? "EGP", language)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                                {mapped.confidence != null
                                  ? `${Math.round(mapped.confidence * 100)}%`
                                  : "—"}
                              </td>
                              <td className="max-w-[14rem] px-2 py-2 text-xs text-warning">
                                {row.error_message ?? "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableScroll>
                </div>
              );
            })()
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedBatchId(null);
                setSelectedRowIds(new Set());
              }}
            >
              {t("catalogueImport.close")}
            </Button>
            <Button
              disabled={selectedRowIds.size === 0 || commitMutation.isPending}
              onClick={() =>
                selectedBatchId &&
                commitMutation.mutate({
                  data: {
                    organizationId: activeOrganizationId ?? "",
                    importBatchId: selectedBatchId,
                    rowIds: Array.from(selectedRowIds),
                  },
                })
              }
            >
              {t("catalogueImport.commitSelected")} ({selectedRowIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.productId ? t("catalogue.editProduct") : t("catalogue.addProduct")}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-border p-3">
                <input
                  id="product-isActive"
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, isActive: event.target.checked } : current,
                    )
                  }
                />
                <Label htmlFor="product-isActive" className="cursor-pointer">
                  {t("catalogue.active")}
                </Label>
                {form.isActive && (
                  <span className="text-xs text-muted-foreground">{t("catalogue.icodeHint")}</span>
                )}
              </div>
              {(
                [
                  ["code", t("catalogue.icode"), t("catalogue.icodeHint")],
                  ["supplierCode", t("catalogue.supplierCode"), t("catalogue.supplierCodeHint")],
                  ["name", t("catalogue.name"), null],
                  ["nameAr", t("catalogue.nameAr"), null],
                  ["unit", t("catalogue.unit"), null],
                  ["brand", t("catalogue.brand"), null],
                  ["category", t("catalogue.category"), null],
                  ["baseCost", t("catalogue.baseCost"), null],
                  ["currency", t("catalogue.currency"), null],
                  ["incoterm", t("catalogue.incoterm"), null],
                  ["landingCost", t("catalogue.landingCost"), t("catalogue.landingCostHint")],
                  ["stockQuantity", t("portfolio.stock"), null],
                  ["leadTimeDays", t("portfolio.leadTime"), null],
                ] as const
              ).map(([field, label, hint]) => (
                <div key={field} className="min-w-0">
                  <Label htmlFor={`product-${field}`}>{label}</Label>
                  <Input
                    id={`product-${field}`}
                    className="mt-1"
                    value={form[field]}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, [field]: event.target.value } : current,
                      )
                    }
                  />
                  {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
                </div>
              ))}
              <div className="sm:col-span-2">
                <Label>{t("catalogue.specs")}</Label>
                <div className="mt-1 space-y-2">
                  {form.specs.map((spec, index) => (
                    <div key={index} className="grid gap-2 sm:grid-cols-3">
                      <Input
                        aria-label={t("catalogue.specKey")}
                        placeholder={t("catalogue.specKey")}
                        value={spec.key}
                        onChange={(event) =>
                          setForm((current) => {
                            if (!current) return current;
                            const specs = [...current.specs];
                            specs[index] = { ...spec, key: event.target.value };
                            return { ...current, specs };
                          })
                        }
                      />
                      <Input
                        aria-label={t("catalogue.specValue")}
                        placeholder={t("catalogue.specValue")}
                        value={spec.value}
                        onChange={(event) =>
                          setForm((current) => {
                            if (!current) return current;
                            const specs = [...current.specs];
                            specs[index] = { ...spec, value: event.target.value };
                            return { ...current, specs };
                          })
                        }
                      />
                      <Input
                        aria-label={t("catalogue.unit")}
                        placeholder={t("catalogue.unit")}
                        value={spec.unit}
                        onChange={(event) =>
                          setForm((current) => {
                            if (!current) return current;
                            const specs = [...current.specs];
                            specs[index] = { ...spec, unit: event.target.value };
                            return { ...current, specs };
                          })
                        }
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              specs: [...current.specs, { key: "", value: "", unit: "" }],
                            }
                          : current,
                      )
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={
                saveMutation.isPending ||
                !form?.supplierCode.trim() ||
                !form?.name.trim() ||
                (form?.isActive && !form?.code.trim())
              }
              onClick={submit}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
