import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  bulkItemsSchema,
  createTenderSchema,
  decideReviewSchema,
  orgTenderSchema,
  registerFileSchema,
  resolveExceptionSchema,
  signedUrlSchema,
  startExtractionSchema,
  submitReviewSchema,
  updateItemSchema,
  updateRequirementSchema,
} from "@/lib/intake-schemas";

export const listIntakeTenders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    createTenderSchema.pick({ organizationId: true }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [tenders, clients, settings] = await Promise.all([
      context.supabase
        .from("tenders")
        .select(
          "id, reference, title, title_ar, currency, submission_deadline, current_stage, stage_state, status, client_id, created_by, updated_at",
        )
        .eq("organization_id", data.organizationId)
        .order("updated_at", { ascending: false }),
      context.supabase
        .from("clients")
        .select("id, name, name_ar")
        .eq("organization_id", data.organizationId)
        .order("name"),
      context.supabase
        .from("company_settings")
        .select("quotation_number_pattern")
        .eq("organization_id", data.organizationId)
        .maybeSingle(),
    ]);
    if (tenders.error) throw new Error(tenders.error.message);
    const year = new Date().getFullYear();
    const sequence = String((tenders.data?.length ?? 0) + 1).padStart(4, "0");
    return {
      tenders: tenders.data ?? [],
      clients: clients.data ?? [],
      suggestedReference: `TN-${year}-${sequence}`,
      numberPattern: settings.data?.quotation_number_pattern ?? null,
    };
  });

export const createTender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    let clientId = data.clientId ?? null;
    if (!clientId && data.newClientName) {
      const created = await supabase
        .from("clients")
        .insert({
          organization_id: data.organizationId,
          name: data.newClientName,
          created_by: userId,
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      clientId = created.data.id;
    }

    const { data: tender, error } = await supabase
      .from("tenders")
      .insert({
        organization_id: data.organizationId,
        reference: data.reference,
        title: data.title,
        title_ar: data.titleAr ?? null,
        client_id: clientId,
        project_location: data.projectLocation ?? null,
        submission_deadline: data.submissionDeadline ? data.submissionDeadline : null,
        currency: data.currency,
        estimated_value: data.estimatedValue ?? null,
        notes: data.notes ?? null,
        owner_id: userId,
        created_by: userId,
      })
      .select("id, reference")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("workflow_instances").insert({
      organization_id: data.organizationId,
      tender_id: tender.id,
      current_stage: "intake",
      state: "draft",
    });

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "tender.created",
      objectType: "tender",
      objectId: tender.id,
      isMaterial: true,
      summary: `Tender ${tender.reference} registered`,
    });

    return { tenderId: tender.id, reference: tender.reference };
  });

export const getIntake = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [tender, files, versions, jobs, counts] = await Promise.all([
      supabase
        .from("tenders")
        .select(
          "id, reference, title, title_ar, project_location, submission_deadline, currency, estimated_value, notes, current_stage, stage_state, status, client_id, created_by, clients(id, name, name_ar)",
        )
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("tender_files")
        .select("id, original_name, mime_type, current_version, uploaded_by, created_at")
        .eq("tender_id", data.tenderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_versions")
        .select(
          "id, file_id, version_no, sha256, byte_size, storage_path, replace_reason, created_at, uploaded_by",
        )
        .eq("tender_id", data.tenderId)
        .order("version_no", { ascending: false }),
      supabase
        .from("extraction_jobs")
        .select(
          "id, document_version_id, status, sheets_found, rows_scanned, items_created, requirements_created, exceptions_created, error_summary, sheet_summary, updated_at",
        )
        .eq("tender_id", data.tenderId)
        .order("created_at", { ascending: false }),
      supabase
        .from("boq_items")
        .select("id", { count: "exact", head: true })
        .eq("tender_id", data.tenderId),
    ]);

    if (tender.error) throw new Error(tender.error.message);
    if (!tender.data) throw new Error("Tender not found");

    return {
      tender: tender.data,
      files: files.data ?? [],
      versions: versions.data ?? [],
      jobs: jobs.data ?? [],
      itemCount: counts.count ?? 0,
    };
  });

export const registerUploadedFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerFileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");
    const { sha256Hex } = await import("@/lib/intake.server");

    if (!data.storagePath.startsWith(`${data.organizationId}/${data.tenderId}/`)) {
      throw new Error("Storage path is outside this tender's folder.");
    }

    const download = await supabase.storage.from("tender-files").download(data.storagePath);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "Uploaded file could not be read back.");
    }
    const bytes = await download.data.arrayBuffer();
    const sha256 = await sha256Hex(bytes);

    const duplicate = await supabase
      .from("document_versions")
      .select("id, file_id, version_no, tender_files(original_name)")
      .eq("tender_id", data.tenderId)
      .eq("sha256", sha256)
      .maybeSingle();

    if (duplicate.data) {
      await supabase.storage.from("tender-files").remove([data.storagePath]);
      return {
        duplicate: true as const,
        fileId: duplicate.data.file_id,
        documentVersionId: duplicate.data.id,
        versionNo: duplicate.data.version_no,
      };
    }

    let fileId = data.replaceFileId ?? null;
    let versionNo = 1;
    let supersedes: string | null = null;

    if (fileId) {
      const previous = await supabase
        .from("document_versions")
        .select("id, version_no")
        .eq("file_id", fileId)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      versionNo = (previous.data?.version_no ?? 0) + 1;
      supersedes = previous.data?.id ?? null;
      const updated = await supabase
        .from("tender_files")
        .update({
          current_version: versionNo,
          original_name: data.originalName,
          mime_type: data.mimeType ?? null,
        })
        .eq("id", fileId)
        .select("id")
        .single();
      if (updated.error) throw new Error(updated.error.message);
    } else {
      const created = await supabase
        .from("tender_files")
        .insert({
          organization_id: data.organizationId,
          tender_id: data.tenderId,
          original_name: data.originalName,
          mime_type: data.mimeType ?? null,
          uploaded_by: userId,
        })
        .select("id")
        .single();
      if (created.error) throw new Error(created.error.message);
      fileId = created.data.id;
    }

    const version = await supabase
      .from("document_versions")
      .insert({
        organization_id: data.organizationId,
        tender_id: data.tenderId,
        file_id: fileId,
        version_no: versionNo,
        storage_path: data.storagePath,
        sha256,
        byte_size: data.byteSize,
        mime_type: data.mimeType ?? null,
        supersedes_id: supersedes,
        replace_reason: data.replaceReason ?? null,
        uploaded_by: userId,
      })
      .select("id, version_no")
      .single();
    if (version.error) throw new Error(version.error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: supersedes ? "tender_file.replaced" : "tender_file.uploaded",
      objectType: "document_version",
      objectId: version.data.id,
      objectVersion: version.data.version_no,
      isMaterial: true,
      summary: `${data.originalName} v${version.data.version_no}`,
      metadata: { sha256, tenderId: data.tenderId, replaceReason: data.replaceReason ?? null },
    });

    return {
      duplicate: false as const,
      fileId,
      documentVersionId: version.data.id,
      versionNo: version.data.version_no,
    };
  });

export const getSignedFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signedUrlSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${data.organizationId}/`)) {
      throw new Error("Storage path is outside this organization.");
    }
    const { data: signed, error } = await context.supabase.storage
      .from("tender-files")
      .createSignedUrl(data.storagePath, 120);
    if (error || !signed) throw new Error(error?.message ?? "Could not create a download link.");
    return { url: signed.signedUrl, expiresInSeconds: 120 };
  });

export const startExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startExtractionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { runExtraction, writeAudit } = await import("@/lib/intake-db.server");

    const version = await supabase
      .from("document_versions")
      .select("id, tender_id, storage_path, mime_type, tender_files(original_name)")
      .eq("organization_id", data.organizationId)
      .eq("id", data.documentVersionId)
      .maybeSingle();
    if (version.error) throw new Error(version.error.message);
    if (!version.data) throw new Error("Document version not found");

    const existing = await supabase
      .from("extraction_jobs")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();

    let job = existing.data;
    if (!job) {
      const created = await supabase
        .from("extraction_jobs")
        .insert({
          organization_id: data.organizationId,
          tender_id: version.data.tender_id,
          document_version_id: version.data.id,
          idempotency_key: data.idempotencyKey,
          status: "queued",
          created_by: userId,
        })
        .select("*")
        .single();
      if (created.error) throw new Error(created.error.message);
      job = created.data;
    } else if (job.status !== "queued") {
      return { job, reused: true as const };
    }

    const finished = await runExtraction(supabase, job, {
      id: version.data.id,
      storage_path: version.data.storage_path,
      mime_type: version.data.mime_type,
      file_name: version.data.tender_files?.original_name ?? version.data.storage_path,
    });

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "extraction.completed",
      objectType: "extraction_job",
      objectId: finished.id,
      isMaterial: true,
      summary: `Extraction ${finished.status}: ${finished.items_created} items, ${finished.exceptions_created} exceptions`,
    });

    return { job: finished, reused: false as const };
  });

export const getRegister = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orgTenderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [tender, items, requirements, exceptions, tasks, membership, stages] = await Promise.all([
      supabase
        .from("tenders")
        .select(
          "id, reference, title, title_ar, currency, current_stage, stage_state, created_by, clients(name, name_ar)",
        )
        .eq("organization_id", data.organizationId)
        .eq("id", data.tenderId)
        .maybeSingle(),
      supabase
        .from("boq_items")
        .select(
          "id, sheet_name, sheet_index, display_order, item_code, description, description_ar, unit, quantity, rate_only, section_path, criticality, status, confidence, notes, exclusion_reason, override_reason, version, reviewed_by, source_reference_id, source_references(sheet_name, sheet_index, row_index, cell_ref, page_number, raw_text, normalized_text, confidence, document_versions(version_no, tender_files(original_name)))",
        )
        .eq("tender_id", data.tenderId)
        .order("sheet_index")
        .order("display_order"),
      supabase
        .from("requirements")
        .select(
          "id, category, text, text_ar, criticality, status, confidence, override_reason, version, source_reference_id, source_references(sheet_name, row_index, cell_ref, page_number, raw_text, normalized_text, confidence, document_versions(version_no, tender_files(original_name)))",
        )
        .eq("tender_id", data.tenderId)
        .order("category"),
      supabase
        .from("extraction_exceptions")
        .select(
          "id, kind, message, sheet_name, row_index, cell_ref, status, resolution_note, boq_item_id",
        )
        .eq("tender_id", data.tenderId)
        .order("created_at"),
      supabase
        .from("approval_tasks")
        .select("id, stage, state, approver_role, submitted_by, submitted_at, invalidated_reason")
        .eq("tender_id", data.tenderId)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("organization_memberships")
        .select("role")
        .eq("organization_id", data.organizationId)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("workflow_stages")
        .select("stage, approver_role, name, name_ar")
        .eq("organization_id", data.organizationId)
        .eq("stage", "technical")
        .maybeSingle(),
    ]);

    if (tender.error) throw new Error(tender.error.message);
    if (!tender.data) throw new Error("Tender not found");
    if (items.error) throw new Error(items.error.message);

    const activeTask =
      (tasks.data ?? []).find(
        (task) =>
          task.stage === "technical" &&
          ["submitted", "in_review", "changes_requested"].includes(task.state),
      ) ?? null;

    return {
      tender: tender.data,
      items: items.data ?? [],
      requirements: requirements.data ?? [],
      exceptions: exceptions.data ?? [],
      tasks: tasks.data ?? [],
      activeTask,
      myRole: membership.data?.role ?? null,
      userId,
      technicalStage: stages.data ?? null,
    };
  });

export const updateBoqItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateItemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { invalidateDownstream, writeAudit } = await import("@/lib/intake-db.server");

    const current = await supabase
      .from("boq_items")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("id", data.itemId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) throw new Error("Item not found");
    if (current.data.version !== data.version) {
      throw new Error("This item changed since you loaded it. Reload and try again.");
    }

    const next = {
      description: data.description ?? current.data.description,
      description_ar: data.descriptionAr ?? current.data.description_ar,
      unit: data.unit ?? current.data.unit,
      quantity: data.quantity ?? current.data.quantity,
      rate_only: data.rateOnly ?? current.data.rate_only,
      section_path: data.sectionPath ?? current.data.section_path,
      criticality: data.criticality ?? current.data.criticality,
      status: data.status ?? current.data.status,
      notes: data.notes ?? current.data.notes,
      exclusion_reason: data.exclusionReason ?? current.data.exclusion_reason,
      override_reason: data.overrideReason ?? current.data.override_reason,
    };

    if (
      next.status === "reviewed" &&
      next.criticality === "critical" &&
      !current.data.source_reference_id &&
      !next.override_reason
    ) {
      throw new Error(
        "A critical item without a source reference needs a named reviewer override with a reason.",
      );
    }
    if (next.status === "excluded" && !next.exclusion_reason) {
      throw new Error("Excluding an item from pricing requires a reason.");
    }

    const material =
      next.description !== current.data.description ||
      String(next.quantity ?? "") !== String(current.data.quantity ?? "") ||
      next.unit !== current.data.unit ||
      next.rate_only !== current.data.rate_only ||
      next.status === "excluded";

    const { data: updated, error } = await supabase
      .from("boq_items")
      .update({
        ...next,
        version: current.data.version + 1,
        reviewed_by: next.status === "reviewed" ? userId : current.data.reviewed_by,
        reviewed_at:
          next.status === "reviewed" ? new Date().toISOString() : current.data.reviewed_at,
      })
      .eq("id", data.itemId)
      .eq("version", data.version)
      .select("id, version, status")
      .single();
    if (error) throw new Error(error.message);

    let invalidated = 0;
    if (material) {
      invalidated = await invalidateDownstream(supabase, {
        organizationId: data.organizationId,
        tenderId: current.data.tender_id,
        reason: `BOQ item ${current.data.item_code ?? current.data.description} was materially edited`,
      });
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "boq_item.updated",
      objectType: "boq_item",
      objectId: data.itemId,
      objectVersion: updated.version,
      isMaterial: material,
      summary: `Item updated (${current.data.status} → ${updated.status})`,
      metadata: {
        previous: {
          description: current.data.description,
          unit: current.data.unit,
          quantity: current.data.quantity,
          status: current.data.status,
        },
        invalidatedApprovals: invalidated,
      },
    });

    return { item: updated, invalidatedApprovals: invalidated };
  });

export const bulkUpdateBoqItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkItemsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const rows = await supabase
      .from("boq_items")
      .select("id, tender_id, criticality, source_reference_id, override_reason")
      .eq("organization_id", data.organizationId)
      .in("id", data.itemIds);
    if (rows.error) throw new Error(rows.error.message);

    let eligible = rows.data ?? [];
    let blocked = 0;
    if (data.action === "mark_reviewed") {
      const before = eligible.length;
      eligible = eligible.filter(
        (row) =>
          row.criticality !== "critical" || row.source_reference_id !== null || row.override_reason,
      );
      blocked = before - eligible.length;
    }
    if (data.action === "exclude" && !data.reason) {
      throw new Error("Excluding items from pricing requires a reason.");
    }
    if (data.action === "reclassify_section" && !data.sectionPath) {
      throw new Error("Provide the section to reclassify into.");
    }

    const ids = eligible.map((row) => row.id);
    if (ids.length > 0) {
      const patch =
        data.action === "mark_reviewed"
          ? {
              status: "reviewed" as const,
              reviewed_by: userId,
              reviewed_at: new Date().toISOString(),
            }
          : data.action === "exclude"
            ? { status: "excluded" as const, exclusion_reason: data.reason ?? null }
            : { section_path: data.sectionPath ?? null };
      const { error } = await supabase.from("boq_items").update(patch).in("id", ids);
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: `boq_items.${data.action}`,
      objectType: "boq_item_batch",
      isMaterial: data.action !== "mark_reviewed",
      summary: `${ids.length} items updated (${data.action})`,
      metadata: { blockedWithoutEvidence: blocked },
    });

    return { updated: ids.length, blockedWithoutEvidence: blocked };
  });

export const updateRequirement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateRequirementSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const current = await supabase
      .from("requirements")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("id", data.requirementId)
      .maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) throw new Error("Requirement not found");
    if (current.data.version !== data.version) {
      throw new Error("This requirement changed since you loaded it. Reload and try again.");
    }

    const status = data.status ?? current.data.status;
    const criticality = data.criticality ?? current.data.criticality;
    const overrideReason = data.overrideReason ?? current.data.override_reason;
    if (
      status === "reviewed" &&
      criticality === "critical" &&
      !current.data.source_reference_id &&
      !overrideReason
    ) {
      throw new Error(
        "A critical requirement without a source reference needs a named reviewer override with a reason.",
      );
    }

    const { data: updated, error } = await supabase
      .from("requirements")
      .update({
        text: data.text ?? current.data.text,
        text_ar: data.textAr ?? current.data.text_ar,
        category: data.category ?? current.data.category,
        criticality,
        status,
        override_reason: overrideReason,
        version: current.data.version + 1,
        reviewed_by: status === "reviewed" ? userId : current.data.reviewed_by,
        reviewed_at: status === "reviewed" ? new Date().toISOString() : current.data.reviewed_at,
      })
      .eq("id", data.requirementId)
      .eq("version", data.version)
      .select("id, version, status")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "requirement.updated",
      objectType: "requirement",
      objectId: data.requirementId,
      objectVersion: updated.version,
      isMaterial: Boolean(data.text) || criticality !== current.data.criticality,
      summary: `Requirement updated (${current.data.status} → ${updated.status})`,
    });

    return { requirement: updated };
  });

export const resolveException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resolveExceptionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    if (data.status === "overridden" && !data.resolutionNote) {
      throw new Error("An override needs a named reason.");
    }

    const { data: updated, error } = await supabase
      .from("extraction_exceptions")
      .update({
        status: data.status,
        resolution_note: data.resolutionNote ?? null,
        resolved_by: data.status === "open" ? null : userId,
        resolved_at: data.status === "open" ? null : new Date().toISOString(),
      })
      .eq("organization_id", data.organizationId)
      .eq("id", data.exceptionId)
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: `exception.${data.status}`,
      objectType: "extraction_exception",
      objectId: data.exceptionId,
      isMaterial: data.status === "overridden",
      summary: data.resolutionNote ?? null,
    });

    return { exception: updated };
  });

export const submitTechnicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    const [items, exceptions, stage] = await Promise.all([
      supabase
        .from("boq_items")
        .select("id, status, criticality, source_reference_id, override_reason")
        .eq("tender_id", data.tenderId),
      supabase
        .from("extraction_exceptions")
        .select("id")
        .eq("tender_id", data.tenderId)
        .eq("status", "open"),
      supabase
        .from("workflow_stages")
        .select("approver_role")
        .eq("organization_id", data.organizationId)
        .eq("stage", "technical")
        .maybeSingle(),
    ]);

    const rows = items.data ?? [];
    if (rows.length === 0) {
      throw new Error("There is nothing to submit yet — ingest a tender file first.");
    }
    const missingEvidence = rows.filter(
      (row) => row.criticality === "critical" && !row.source_reference_id && !row.override_reason,
    );
    if (missingEvidence.length > 0) {
      throw new Error(
        `${missingEvidence.length} critical item(s) have no source reference and no named override. Resolve them before submitting.`,
      );
    }

    const { data: task, error } = await supabase
      .from("approval_tasks")
      .insert({
        organization_id: data.organizationId,
        tender_id: data.tenderId,
        stage: "technical",
        object_type: "requirements_register",
        approver_role: stage.data?.approver_role ?? "technical_lead",
        state: "submitted",
        submitted_by: userId,
      })
      .select("id, state, approver_role")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("tenders")
      .update({ current_stage: "technical", stage_state: "submitted" })
      .eq("id", data.tenderId)
      .eq("organization_id", data.organizationId);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: "technical_review.submitted",
      objectType: "requirements_register",
      objectId: data.tenderId,
      isMaterial: true,
      summary: data.note ?? `${rows.length} items submitted for technical review`,
      metadata: { openExceptions: exceptions.data?.length ?? 0 },
    });

    return { task };
  });

export const decideTechnicalReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { writeAudit } = await import("@/lib/intake-db.server");

    if (data.decision !== "approved" && !data.note) {
      throw new Error("A rejection or change request needs a note.");
    }

    const task = await supabase
      .from("approval_tasks")
      .select("id, tender_id, stage, submitted_by, approver_role, state")
      .eq("organization_id", data.organizationId)
      .eq("id", data.taskId)
      .maybeSingle();
    if (task.error) throw new Error(task.error.message);
    if (!task.data) throw new Error("Approval task not found");
    if (task.data.submitted_by === userId) {
      throw new Error(
        "You submitted this register — maker-checker separation blocks self-approval.",
      );
    }

    const updated = await supabase
      .from("approval_tasks")
      .update({ state: data.decision })
      .eq("id", data.taskId)
      .select("id, state")
      .single();
    if (updated.error) throw new Error(updated.error.message);

    const decision = await supabase.from("approval_decisions").insert({
      organization_id: data.organizationId,
      tender_id: task.data.tender_id,
      task_id: data.taskId,
      stage: task.data.stage,
      decision: data.decision,
      note: data.note ?? null,
      decided_by: userId,
    });
    if (decision.error) throw new Error(decision.error.message);

    await supabase
      .from("tenders")
      .update({
        stage_state: data.decision,
        current_stage: data.decision === "approved" ? "product" : "technical",
      })
      .eq("id", task.data.tender_id)
      .eq("organization_id", data.organizationId);

    await writeAudit(supabase, {
      organizationId: data.organizationId,
      actorId: userId,
      action: `technical_review.${data.decision}`,
      objectType: "requirements_register",
      objectId: task.data.tender_id,
      isMaterial: true,
      summary: data.note ?? null,
    });

    return { task: updated.data };
  });
