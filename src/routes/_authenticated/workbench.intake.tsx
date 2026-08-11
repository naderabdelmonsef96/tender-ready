import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Download, FileUp, Play } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useAppTranslation } from "@/components/language-provider";
import {
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
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  createTender,
  deleteDocumentVersion,
  getIntake,
  getSignedFileUrl,
  listIntakeTenders,
  registerUploadedFile,
  startExtraction,
} from "@/lib/intake.functions";

const searchSchema = z.object({ tender: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/workbench/intake")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Tender intake — TenderReady" },
      {
        name: "description",
        content: "Register a tender, upload the tender files and ingest them with full provenance.",
      },
      { property: "og:title", content: "Tender intake — TenderReady" },
      {
        property: "og:description",
        content: "Register a tender, upload the tender files and start the governed flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

function statusKey(status: string | undefined): string {
  return `jobStatus.${status ?? "none"}`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function Page() {
  const { t, language } = useAppTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeOrganizationId, role, baseCurrency } = useWorkspace();

  const fetchTenders = useServerFn(listIntakeTenders);
  const fetchIntake = useServerFn(getIntake);
  const create = useServerFn(createTender);
  const register = useServerFn(registerUploadedFile);
  const ingest = useServerFn(startExtraction);
  const signUrl = useServerFn(getSignedFileUrl);
  const deleteVersion = useServerFn(deleteDocumentVersion);

  const canEdit = role === "org_admin" || role === "proposal_engineer";
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [dragActive, setDragActive] = useState(false);

  const [replaceFileId, setReplaceFileId] = useState<string | null>(null);
  const [replaceReason, setReplaceReason] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const listQuery = useQuery({
    queryKey: ["intake-tenders", activeOrganizationId],
    queryFn: () => fetchTenders({ data: { organizationId: activeOrganizationId ?? "" } }),
    enabled: Boolean(activeOrganizationId),
  });

  const tenderId = search.tender ?? listQuery.data?.tenders[0]?.id ?? null;

  const intakeQuery = useQuery({
    queryKey: ["intake", activeOrganizationId, tenderId],
    queryFn: () =>
      fetchIntake({
        data: { organizationId: activeOrganizationId ?? "", tenderId: tenderId ?? "" },
      }),
    enabled: Boolean(activeOrganizationId && tenderId),
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs ?? [];
      return jobs.some((job) => job.status === "queued" || job.status === "running") ? 2500 : false;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["intake"] });
    void queryClient.invalidateQueries({ queryKey: ["intake-tenders"] });
    void queryClient.invalidateQueries({ queryKey: ["register"] });
  };

  const createMutation = useMutation({
    mutationFn: create,
    onSuccess: (result) => {
      toast.success(t("intake.created"));
      setShowForm(false);
      invalidate();
      void navigate({ to: "/workbench/intake", search: { tender: result.tenderId } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const ingestMutation = useMutation({
    mutationFn: ingest,
    onSuccess: () => {
      toast.success(t("intake.extracted"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVersion,
    onSuccess: () => {
      toast.success(t("intake.fileDeleted"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function onSubmitTender(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeOrganizationId) return;
    const form = new FormData(event.currentTarget);
    const clientId = String(form.get("clientId") ?? "");
    const estimated = String(form.get("estimatedValue") ?? "").trim();
    createMutation.mutate({
      data: {
        organizationId: activeOrganizationId,
        reference: String(form.get("reference") ?? ""),
        title: String(form.get("title") ?? ""),
        titleAr: String(form.get("titleAr") ?? "") || null,
        clientId: clientId || null,
        newClientName: String(form.get("newClientName") ?? "") || null,
        projectLocation: String(form.get("projectLocation") ?? "") || null,
        submissionDeadline: String(form.get("submissionDeadline") ?? "") || null,
        currency: String(form.get("currency") ?? baseCurrency).toUpperCase(),
        estimatedValue: estimated ? Number(estimated) : null,
        notes: String(form.get("notes") ?? "") || null,
      },
    });
  }

  async function uploadOne(file: File, isReplace: boolean) {
    if (!activeOrganizationId || !tenderId) return;
    const safeName = file.name.replace(/[^\w.\-\u0600-\u06FF]+/g, "_");
    const path = `${activeOrganizationId}/${tenderId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("tender-files").upload(path, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (upload.error) throw new Error(upload.error.message);

    const result = await register({
      data: {
        organizationId: activeOrganizationId,
        tenderId,
        storagePath: path,
        originalName: file.name,
        mimeType: file.type || null,
        byteSize: file.size,
        replaceFileId: isReplace ? replaceFileId : null,
        replaceReason: isReplace ? replaceReason || null : null,
      },
    });
    if (result.duplicate) {
      toast.warning(`${file.name}: ${t("intake.duplicate")}`);
      return;
    }
    ingestMutation.mutate({
      data: {
        organizationId: activeOrganizationId,
        documentVersionId: result.documentVersionId,
        idempotencyKey: `extract:${result.documentVersionId}`,
      },
    });
  }

  async function onUpload(files: FileList | File[]) {
    if (!activeOrganizationId || !tenderId) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    const isReplace = Boolean(replaceFileId);
    const selected = isReplace ? list.slice(0, 1) : list;
    setUploading(true);
    setUploadProgress({ done: 0, total: selected.length });
    let ok = 0;
    try {
      for (const [index, file] of selected.entries()) {
        try {
          await uploadOne(file, isReplace);
          ok += 1;
        } catch (error) {
          toast.error(
            `${file.name}: ${error instanceof Error ? error.message : t("common.unexpectedError")}`,
          );
        }
        setUploadProgress({ done: index + 1, total: selected.length });
      }
      if (ok > 0) toast.success(t("register.saved"));
      setReplaceFileId(null);
      setReplaceReason("");
      invalidate();
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function onDownload(storagePath: string) {
    if (!activeOrganizationId) return;
    try {
      const { url } = await signUrl({
        data: { organizationId: activeOrganizationId, storagePath },
      });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("common.unexpectedError"));
    }
  }

  const intake = intakeQuery.data;
  const jobFor = (versionId: string) =>
    intake?.jobs.find((job) => job.document_version_id === versionId);
  const ingestedCount = (intake?.jobs ?? []).filter(
    (job) => job.status === "complete" || job.status === "partial",
  ).length;

  const checklist = intake
    ? [
        { label: t("intake.checklistClient"), done: Boolean(intake.tender.client_id) },
        { label: t("intake.checklistDeadline"), done: Boolean(intake.tender.submission_deadline) },
        { label: t("intake.checklistCurrency"), done: Boolean(intake.tender.currency) },
        { label: t("intake.checklistFile"), done: ingestedCount > 0 && intake.itemCount > 0 },
      ]
    : [];
  const complete = checklist.every((entry) => entry.done);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title={t("screens.intake")}
        subtitle={t("intake.subtitle")}
        actions={
          canEdit ? (
            <Button onClick={() => setShowForm((value) => !value)} variant="outline">
              {t("intake.newTender")}
            </Button>
          ) : undefined
        }
      />

      <WorkbenchStepper currentPath="/workbench/intake" />

      <Panel title={t("intake.selectTender")} className="mb-4">
        {listQuery.isPending ? (
          <LoadingRows rows={1} />
        ) : listQuery.error ? (
          <ErrorState message={(listQuery.error as Error).message} />
        ) : (listQuery.data?.tenders.length ?? 0) === 0 ? (
          <EmptyState message={t("dashboard.empty")} />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 grow sm:max-w-md">
              <Label htmlFor="tender-select">{t("intake.selectTender")}</Label>
              <select
                id="tender-select"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                value={tenderId ?? ""}
                onChange={(event) =>
                  void navigate({
                    to: "/workbench/intake",
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
            {tenderId && (
              <Button
                variant="secondary"
                disabled={!complete}
                onClick={() =>
                  void navigate({ to: "/workbench/requirements", search: { tender: tenderId } })
                }
              >
                {t("intake.continueToRegister")}
              </Button>
            )}
          </div>
        )}
      </Panel>

      {showForm && canEdit && (
        <Panel title={t("intake.createTender")} className="mb-4">
          <form onSubmit={onSubmitTender} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="reference">{t("intake.reference")}</Label>
              <Input
                id="reference"
                name="reference"
                required
                dir="ltr"
                defaultValue={listQuery.data?.suggestedReference ?? ""}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="title">{t("intake.tenderTitleEn")}</Label>
              <Input id="title" name="title" required className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="titleAr">{t("intake.tenderTitleAr")}</Label>
              <Input id="titleAr" name="titleAr" dir="rtl" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="clientId">{t("intake.clientExisting")}</Label>
              <select
                id="clientId"
                name="clientId"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                defaultValue=""
              >
                <option value="">{t("common.none")}</option>
                {(listQuery.data?.clients ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {language === "ar" && client.name_ar ? client.name_ar : client.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="newClientName">{t("intake.clientNew")}</Label>
              <Input id="newClientName" name="newClientName" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="projectLocation">{t("intake.location")}</Label>
              <Input id="projectLocation" name="projectLocation" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="submissionDeadline">{t("intake.deadline")}</Label>
              <Input
                id="submissionDeadline"
                name="submissionDeadline"
                type="date"
                dir="ltr"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="currency">{t("intake.currency")}</Label>
              <Input
                id="currency"
                name="currency"
                dir="ltr"
                maxLength={3}
                defaultValue={baseCurrency}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="estimatedValue">{t("intake.estimatedValue")}</Label>
              <Input
                id="estimatedValue"
                name="estimatedValue"
                type="number"
                min="0"
                step="0.01"
                dir="ltr"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="notes">{t("intake.notes")}</Label>
              <Textarea id="notes" name="notes" rows={3} className="mt-1" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap gap-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("common.saving") : t("intake.createTender")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {!tenderId ? (
        <Panel>
          <EmptyState message={t("intake.noTenderSelected")} />
        </Panel>
      ) : intakeQuery.isPending ? (
        <Panel>
          <LoadingRows rows={5} />
        </Panel>
      ) : intakeQuery.error ? (
        <Panel>
          <ErrorState
            message={(intakeQuery.error as Error).message}
            action={
              <Button variant="outline" onClick={() => void intakeQuery.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        </Panel>
      ) : intake ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t("intake.client")} value={intake.tender.clients?.name ?? "—"} />
            <StatCard
              label={t("intake.deadline")}
              value={formatDate(intake.tender.submission_deadline, language)}
            />
            <StatCard label={t("intake.currency")} value={intake.tender.currency} />
            <StatCard label={t("intake.items")} value={intake.itemCount} tone="info" />
          </div>

          <Panel title={t("intake.checklist")}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {checklist.map((entry) => (
                <li key={entry.label} className="flex items-start gap-2 text-sm">
                  {entry.done ? (
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span className={entry.done ? "text-foreground" : "text-muted-foreground"}>
                    {entry.label}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title={t("intake.files")}
            description={t("intake.filesHint")}
            actions={
              canEdit ? (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple={!replaceFileId}
                    accept=".xlsx,.xlsm,.xls,.csv,.pdf,.docx,.txt,.md,.rtf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,application/pdf,image/*"
                    className="hidden"
                    aria-label={t("intake.upload")}
                    onChange={(event) => {
                      const files = event.target.files;
                      if (files && files.length > 0) void onUpload(files);
                    }}
                  />
                  <Button
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading || ingestMutation.isPending}
                  >
                    <FileUp className="me-2 h-4 w-4" aria-hidden="true" />
                    {uploading
                      ? uploadProgress
                        ? `${t("intake.uploading")} ${uploadProgress.done}/${uploadProgress.total}`
                        : t("intake.uploading")
                      : t("intake.upload")}
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t("intake.onlyMakers")}</span>
              )
            }
          >
            {replaceFileId && (
              <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
                <Label htmlFor="replaceReason">{t("intake.replaceReason")}</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Input
                    id="replaceReason"
                    value={replaceReason}
                    onChange={(event) => setReplaceReason(event.target.value)}
                    className="min-w-0 grow sm:max-w-md"
                  />
                  <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
                    {t("intake.upload")}
                  </Button>
                  <Button variant="ghost" onClick={() => setReplaceFileId(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}

            {canEdit && !replaceFileId && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  if (event.dataTransfer.files.length > 0) void onUpload(event.dataTransfer.files);
                }}
                onClick={() => fileInput.current?.click()}
                className={`mb-3 cursor-pointer rounded-xl border border-dashed p-4 text-center text-xs transition-colors ${
                  dragActive
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {uploading && uploadProgress
                  ? `${t("intake.uploading")} ${uploadProgress.done}/${uploadProgress.total}`
                  : t("intake.filesHint")}
              </div>
            )}

            {intake.versions.length === 0 ? (
              <EmptyState message={t("intake.noFiles")} />
            ) : (
              <TableScroll>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("intake.fileName")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("intake.version")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("intake.size")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("intake.hash")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("intake.uploadedAt")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("intake.ingestion")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-start">
                        {t("common.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {intake.versions.map((version) => {
                      const file = intake.files.find((entry) => entry.id === version.file_id);
                      const job = jobFor(version.id);
                      return (
                        <tr key={version.id} className="border-b border-border/70 align-top">
                          <td className="max-w-[18rem] px-2 py-2">
                            <span className="block truncate" title={file?.original_name ?? ""}>
                              {file?.original_name ?? "—"}
                            </span>
                          </td>
                          <td className="px-2 py-2 tabular-nums" dir="ltr">
                            v{version.version_no}
                          </td>
                          <td className="px-2 py-2 tabular-nums" dir="ltr">
                            {formatBytes(Number(version.byte_size))}
                          </td>
                          <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                            {version.sha256.slice(0, 10)}
                          </td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">
                            {formatDateTime(version.created_at, language)}
                          </td>
                          <td className="px-2 py-2">
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                              {t(statusKey(job?.status))}
                            </span>
                            {job && (
                              <span className="mt-1 block text-xs text-muted-foreground" dir="ltr">
                                {job.sheets_found} {t("intake.sheets")} · {job.rows_scanned}{" "}
                                {t("intake.rows")} · {job.items_created} {t("intake.items")} ·{" "}
                                {job.exceptions_created} {t("intake.exceptionsFound")}
                              </span>
                            )}
                            {job?.error_summary && (
                              <span className="mt-1 block max-w-[22rem] text-xs text-warning">
                                {job.error_summary}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void onDownload(version.storage_path)}
                              >
                                <Download className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                                {t("intake.download")}
                              </Button>
                              {canEdit && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={ingestMutation.isPending}
                                    onClick={() =>
                                      ingestMutation.mutate({
                                        data: {
                                          organizationId: activeOrganizationId ?? "",
                                          documentVersionId: version.id,
                                          idempotencyKey: `extract:${version.id}:${job ? "retry" : "first"}`,
                                        },
                                      })
                                    }
                                  >
                                    <Play className="me-1 h-3.5 w-3.5" aria-hidden="true" />
                                    {ingestMutation.isPending
                                      ? t("intake.extracting")
                                      : t("intake.startExtraction")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setReplaceFileId(version.file_id)}
                                  >
                                    {t("intake.replace")}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive"
                                    disabled={deleteMutation.isPending}
                                    onClick={() => {
                                      const message =
                                        job &&
                                        (job.items_created > 0 || job.requirements_created > 0)
                                          ? t("intake.confirmDeleteWithData", {
                                              name: file?.original_name ?? "",
                                            })
                                          : t("intake.confirmDelete", {
                                              name: file?.original_name ?? "",
                                            });
                                      if (!window.confirm(message)) return;
                                      deleteMutation.mutate({
                                        data: {
                                          organizationId: activeOrganizationId ?? "",
                                          tenderId: tenderId ?? "",
                                          documentVersionId: version.id,
                                        },
                                      });
                                    }}
                                  >
                                    {t("intake.delete")}
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
