import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAppTranslation } from "@/components/language-provider";
import { ErrorState, LoadingRows, PageHeader, Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCompanySettings } from "@/lib/org.functions";
import { getCompanySettings } from "@/lib/workspace.functions";

export const Route = createFileRoute("/_authenticated/settings/company")({
  head: () => ({
    meta: [
      { title: "Company settings — TenderReady" },
      {
        name: "description",
        content: "Legal identity, contact details and quotation defaults used on every client-facing document.",
      },
      { property: "og:title", content: "Company settings — TenderReady" },
      { property: "og:description", content: "Manage the identity printed on your quotations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CompanySettingsPage,
});

type FormState = {
  legal_name: string;
  legal_name_ar: string;
  tax_number: string;
  commercial_registration: string;
  address_line1: string;
  address_line2: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  bank_details: string;
  quotation_number_pattern: string;
  quotation_validity_days: string;
  default_terms: string;
  footer_text: string;
  signature_block: string;
};

const emptyForm: FormState = {
  legal_name: "",
  legal_name_ar: "",
  tax_number: "",
  commercial_registration: "",
  address_line1: "",
  address_line2: "",
  city: "",
  country: "EG",
  phone: "",
  email: "",
  website: "",
  bank_details: "",
  quotation_number_pattern: "QT-{YYYY}-{SEQ:4}",
  quotation_validity_days: "30",
  default_terms: "",
  footer_text: "",
  signature_block: "",
};

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function CompanySettingsPage() {
  const { t } = useAppTranslation();
  const workspace = useWorkspace();
  const organizationId = workspace.activeOrganizationId!;
  const fetchSettings = useServerFn(getCompanySettings);
  const saveSettings = useServerFn(updateCompanySettings);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);

  const query = useQuery({
    queryKey: ["company-settings", organizationId],
    queryFn: () => fetchSettings({ data: { organizationId } }),
  });

  useEffect(() => {
    const settings = query.data?.settings;
    if (!settings) return;
    setForm({
      legal_name: settings.legal_name ?? "",
      legal_name_ar: settings.legal_name_ar ?? "",
      tax_number: settings.tax_number ?? "",
      commercial_registration: settings.commercial_registration ?? "",
      address_line1: settings.address_line1 ?? "",
      address_line2: settings.address_line2 ?? "",
      city: settings.city ?? "",
      country: settings.country ?? "EG",
      phone: settings.phone ?? "",
      email: settings.email ?? "",
      website: settings.website ?? "",
      bank_details: settings.bank_details ?? "",
      quotation_number_pattern: settings.quotation_number_pattern ?? "QT-{YYYY}-{SEQ:4}",
      quotation_validity_days: String(settings.quotation_validity_days ?? 30),
      default_terms: settings.default_terms ?? "",
      footer_text: settings.footer_text ?? "",
      signature_block: settings.signature_block ?? "",
    });
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          organizationId,
          legal_name: form.legal_name.trim(),
          legal_name_ar: orNull(form.legal_name_ar),
          tax_number: orNull(form.tax_number),
          commercial_registration: orNull(form.commercial_registration),
          address_line1: orNull(form.address_line1),
          address_line2: orNull(form.address_line2),
          city: orNull(form.city),
          country: form.country.trim().toUpperCase().slice(0, 2) || "EG",
          phone: orNull(form.phone),
          email: orNull(form.email),
          website: orNull(form.website),
          bank_details: orNull(form.bank_details),
          quotation_number_pattern: form.quotation_number_pattern.trim(),
          quotation_validity_days: Number(form.quotation_validity_days) || 30,
          default_terms: orNull(form.default_terms),
          footer_text: orNull(form.footer_text),
          signature_block: orNull(form.signature_block),
        },
      }),
    onSuccess: () => {
      toast.success(t("settings.saved"));
      void queryClient.invalidateQueries({ queryKey: ["company-settings", organizationId] });
    },
    onError: (error: Error) => toast.error(error.message || t("common.unexpectedError")),
  });

  const isAdmin = query.data?.isAdmin === true;
  const set = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title={t("settings.companyTitle")}
        subtitle={t("settings.companySubtitle")}
        actions={
          !isAdmin && query.data ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t("common.readOnly")}
            </span>
          ) : undefined
        }
      />

      {query.isPending && <LoadingRows rows={6} />}
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
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!isAdmin) {
              toast.error(t("common.notAuthorized"));
              return;
            }
            mutation.mutate();
          }}
        >
          <fieldset disabled={!isAdmin} className="space-y-4">
            <Panel title={t("settings.identity")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="legal_name" label={t("settings.legalName")}>
                  <Input id="legal_name" required value={form.legal_name} onChange={set("legal_name")} />
                </Field>
                <Field id="legal_name_ar" label={t("settings.legalNameAr")}>
                  <Input
                    id="legal_name_ar"
                    dir="rtl"
                    value={form.legal_name_ar}
                    onChange={set("legal_name_ar")}
                  />
                </Field>
              </div>
            </Panel>

            <Panel title={t("settings.contact")}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field id="address_line1" label={t("settings.address1")}>
                  <Input id="address_line1" value={form.address_line1} onChange={set("address_line1")} />
                </Field>
                <Field id="address_line2" label={t("settings.address2")}>
                  <Input id="address_line2" value={form.address_line2} onChange={set("address_line2")} />
                </Field>
                <Field id="city" label={t("settings.city")}>
                  <Input id="city" value={form.city} onChange={set("city")} />
                </Field>
                <Field id="country" label={t("settings.country")}>
                  <Input id="country" maxLength={2} value={form.country} onChange={set("country")} />
                </Field>
                <Field id="phone" label={t("settings.phone")}>
                  <Input id="phone" dir="ltr" value={form.phone} onChange={set("phone")} />
                </Field>
                <Field id="email" label={t("common.email")}>
                  <Input id="email" type="email" dir="ltr" value={form.email} onChange={set("email")} />
                </Field>
                <Field id="website" label={t("settings.website")}>
                  <Input id="website" dir="ltr" value={form.website} onChange={set("website")} />
                </Field>
              </div>
            </Panel>

            <Panel title={t("settings.finance")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="tax_number" label={t("settings.taxNumber")}>
                  <Input id="tax_number" dir="ltr" value={form.tax_number} onChange={set("tax_number")} />
                </Field>
                <Field id="commercial_registration" label={t("settings.commercialRegistration")}>
                  <Input
                    id="commercial_registration"
                    dir="ltr"
                    value={form.commercial_registration}
                    onChange={set("commercial_registration")}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="bank_details" label={t("settings.bankDetails")}>
                    <Textarea
                      id="bank_details"
                      rows={3}
                      value={form.bank_details}
                      onChange={set("bank_details")}
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title={t("settings.quotation")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="quotation_number_pattern" label={t("settings.numberPattern")}>
                  <Input
                    id="quotation_number_pattern"
                    dir="ltr"
                    value={form.quotation_number_pattern}
                    onChange={set("quotation_number_pattern")}
                  />
                </Field>
                <Field id="quotation_validity_days" label={t("settings.validityDays")}>
                  <Input
                    id="quotation_validity_days"
                    type="number"
                    min={1}
                    max={365}
                    dir="ltr"
                    value={form.quotation_validity_days}
                    onChange={set("quotation_validity_days")}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field id="default_terms" label={t("settings.defaultTerms")}>
                    <Textarea
                      id="default_terms"
                      rows={4}
                      value={form.default_terms}
                      onChange={set("default_terms")}
                    />
                  </Field>
                </div>
                <Field id="footer_text" label={t("settings.footerText")}>
                  <Textarea id="footer_text" rows={2} value={form.footer_text} onChange={set("footer_text")} />
                </Field>
                <Field id="signature_block" label={t("settings.signatureBlock")}>
                  <Textarea
                    id="signature_block"
                    rows={2}
                    value={form.signature_block}
                    onChange={set("signature_block")}
                  />
                </Field>
              </div>
            </Panel>
          </fieldset>

          {isAdmin ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("settings.adminOnly")}</p>
          )}
        </form>
      )}
    </div>
  );
}
