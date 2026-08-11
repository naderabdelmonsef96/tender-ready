import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { useAppTranslation } from "@/components/language-provider";
import { ErrorState, LoadingRows, PageHeader, Panel } from "@/components/ui-blocks";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getQuotationTemplateInfo,
  quotationTemplatePath,
} from "@/lib/quotation-template.functions";

export const Route = createFileRoute("/_authenticated/settings/quotation-template")({
  head: () => ({
    meta: [
      { title: "Quotation template — TenderReady" },
      {
        name: "description",
        content:
          "The single company-approved quotation document used to generate every released quotation.",
      },
      { property: "og:title", content: "Quotation template — TenderReady" },
      {
        property: "og:description",
        content: "The company-approved quotation document template.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function Page() {
  const { t, language } = useAppTranslation();
  const { activeOrganizationId } = useWorkspace();
  const organizationId = activeOrganizationId ?? "";
  const queryClient = useQueryClient();
  const fetchInfo = useServerFn(getQuotationTemplateInfo);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const query = useQuery({
    queryKey: ["quotation-template", organizationId],
    queryFn: () => fetchInfo({ data: { organizationId } }),
    enabled: Boolean(organizationId),
  });

  const isAdmin = query.data?.isAdmin === true;
  const template = query.data?.template ?? null;

  async function handleFile(file: File) {
    if (!organizationId) return;
    const isDocx =
      file.name.toLowerCase().endsWith(".docx") ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (!isDocx) {
      toast.error(t("settings.invalidTemplateFile"));
      return;
    }
    setIsUploading(true);
    try {
      const path = quotationTemplatePath(organizationId);
      const upload = await supabase.storage.from("quotation-templates").upload(path, file, {
        upsert: true,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (upload.error) throw new Error(upload.error.message);
      toast.success(t("settings.templateUploaded"));
      await queryClient.invalidateQueries({ queryKey: ["quotation-template", organizationId] });
    } catch (error) {
      toast.error((error as Error).message || t("common.unexpectedError"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDownload() {
    if (!organizationId) return;
    const path = quotationTemplatePath(organizationId);
    const signed = await supabase.storage.from("quotation-templates").createSignedUrl(path, 60);
    if (signed.error || !signed.data) {
      toast.error(signed.error?.message || t("common.unexpectedError"));
      return;
    }
    window.open(signed.data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        title={t("nav.quotationTemplate")}
        subtitle={t("settings.quotationTemplateSubtitle")}
        actions={
          !isAdmin && query.data ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {t("common.readOnly")}
            </span>
          ) : undefined
        }
      />

      {query.isPending && <LoadingRows rows={3} />}
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
        <Panel title={t("settings.currentTemplate")}>
          <div className="space-y-4">
            {template ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t("settings.templateUploaded")}
                  </p>
                  {template.uploadedAt && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t("settings.uploadedOn", {
                        date: new Date(template.uploadedAt).toLocaleString(
                          language === "ar" ? "ar-EG" : "en-GB",
                        ),
                      })}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDownload()}
                >
                  {t("settings.downloadTemplate")}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("settings.noTemplate")}</p>
            )}

            {isAdmin ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <Button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading
                    ? t("common.saving")
                    : template
                      ? t("settings.replaceTemplate")
                      : t("settings.uploadTemplate")}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("settings.quotationTemplateHint")}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settings.adminOnly")}</p>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
