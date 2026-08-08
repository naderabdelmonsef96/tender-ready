import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import {
  deleteCatalogueProduct,
  listCatalogueProducts,
  upsertCatalogueProduct,
} from "@/lib/portfolio.functions";

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
  name: string;
  nameAr: string;
  unit: string;
  brand: string;
  category: string;
  baseCost: string;
  stockQuantity: string;
  leadTimeDays: string;
  specs: { key: string; value: string; unit: string }[];
};

const emptyForm: FormState = {
  productId: null,
  code: "",
  name: "",
  nameAr: "",
  unit: "",
  brand: "",
  category: "",
  baseCost: "",
  stockQuantity: "",
  leadTimeDays: "",
  specs: [{ key: "", value: "", unit: "" }],
};

function Page() {
  const { t, language } = useAppTranslation();
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useWorkspace();

  const fetchProducts = useServerFn(listCatalogueProducts);
  const save = useServerFn(upsertCatalogueProduct);
  const deactivate = useServerFn(deleteCatalogueProduct);

  const [form, setForm] = useState<FormState | null>(null);

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

  function openEdit(product: Product) {
    setForm({
      productId: product.id,
      code: product.code,
      name: product.name,
      nameAr: product.name_ar ?? "",
      unit: product.unit ?? "",
      brand: product.brand ?? "",
      category: product.category ?? "",
      baseCost: product.base_cost === null ? "" : String(product.base_cost),
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
        code: form.code.trim(),
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || null,
        unit: form.unit.trim() || null,
        brand: form.brand.trim() || null,
        category: form.category.trim() || null,
        baseCost: numeric(form.baseCost),
        currency: "EGP",
        isActive: true,
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
          <TableScroll>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t("catalogue.title")}</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-2 py-2 text-start">
                    {t("catalogue.code")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t("catalogue.name")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t("catalogue.unit")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t("catalogue.specs")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t("portfolio.stock")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.products ?? []).map((product) => (
                  <tr key={product.id} className="border-b border-border/70 align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-medium">{product.code}</td>
                    <td className="max-w-[20rem] px-2 py-2">
                      <p className="break-words">
                        {language === "ar" && product.name_ar ? product.name_ar : product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[product.brand, product.category].filter(Boolean).join(" · ") || "—"}
                        {!product.is_active && (
                          <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                            {t("catalogue.inactive")}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                      {product.unit ?? "—"}
                    </td>
                    <td className="max-w-[18rem] px-2 py-2 text-xs text-muted-foreground">
                      {(product.product_specifications ?? [])
                        .map((spec) => `${spec.spec_key}: ${spec.spec_value}${spec.unit ?? ""}`)
                        .join(", ") || "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                      {product.stock_positions?.[0]?.quantity ?? 0}
                    </td>
                    <td className="px-2 py-2">
                      {canManage ? (
                        <div className="flex flex-wrap gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openEdit(product)}>
                            {t("common.save").replace("…", "")}
                          </Button>
                          {product.is_active && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deleteMutation.isPending}
                              onClick={() =>
                                deleteMutation.mutate({
                                  data: {
                                    organizationId: activeOrganizationId ?? "",
                                    productId: product.id,
                                  },
                                })
                              }
                            >
                              {t("catalogue.deactivate")}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("common.readOnly")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
        {!canManage && <p className="mt-3 text-xs text-muted-foreground">{t("catalogue.onlyAdmin")}</p>}
      </Panel>

      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {form?.productId ? t("catalogue.editProduct") : t("catalogue.addProduct")}
            </DialogTitle>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["code", t("catalogue.code")],
                  ["name", t("catalogue.name")],
                  ["nameAr", t("catalogue.nameAr")],
                  ["unit", t("catalogue.unit")],
                  ["brand", t("catalogue.brand")],
                  ["category", t("catalogue.category")],
                  ["baseCost", t("catalogue.baseCost")],
                  ["stockQuantity", t("portfolio.stock")],
                  ["leadTimeDays", t("portfolio.leadTime")],
                ] as const
              ).map(([field, label]) => (
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
                          ? { ...current, specs: [...current.specs, { key: "", value: "", unit: "" }] }
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
              disabled={saveMutation.isPending || !form?.code.trim() || !form?.name.trim()}
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
