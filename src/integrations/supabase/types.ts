export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      approval_decisions: {
        Row: {
          decided_at: string;
          decided_by: string;
          decision: Database["public"]["Enums"]["decision_state"];
          id: string;
          note: string | null;
          organization_id: string;
          stage: Database["public"]["Enums"]["tender_stage"];
          task_id: string;
          tender_id: string;
        };
        Insert: {
          decided_at?: string;
          decided_by: string;
          decision: Database["public"]["Enums"]["decision_state"];
          id?: string;
          note?: string | null;
          organization_id: string;
          stage: Database["public"]["Enums"]["tender_stage"];
          task_id: string;
          tender_id: string;
        };
        Update: {
          decided_at?: string;
          decided_by?: string;
          decision?: Database["public"]["Enums"]["decision_state"];
          id?: string;
          note?: string | null;
          organization_id?: string;
          stage?: Database["public"]["Enums"]["tender_stage"];
          task_id?: string;
          tender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "approval_decisions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_decisions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "approval_tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_decisions_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      approval_tasks: {
        Row: {
          approver_role: Database["public"]["Enums"]["app_role"];
          created_at: string;
          due_at: string | null;
          id: string;
          invalidated_reason: string | null;
          object_id: string | null;
          object_type: string;
          object_version: number;
          organization_id: string;
          stage: Database["public"]["Enums"]["tender_stage"];
          state: Database["public"]["Enums"]["decision_state"];
          submitted_at: string;
          submitted_by: string;
          tender_id: string;
          updated_at: string;
          workflow_instance_id: string | null;
        };
        Insert: {
          approver_role: Database["public"]["Enums"]["app_role"];
          created_at?: string;
          due_at?: string | null;
          id?: string;
          invalidated_reason?: string | null;
          object_id?: string | null;
          object_type?: string;
          object_version?: number;
          organization_id: string;
          stage: Database["public"]["Enums"]["tender_stage"];
          state?: Database["public"]["Enums"]["decision_state"];
          submitted_at?: string;
          submitted_by: string;
          tender_id: string;
          updated_at?: string;
          workflow_instance_id?: string | null;
        };
        Update: {
          approver_role?: Database["public"]["Enums"]["app_role"];
          created_at?: string;
          due_at?: string | null;
          id?: string;
          invalidated_reason?: string | null;
          object_id?: string | null;
          object_type?: string;
          object_version?: number;
          organization_id?: string;
          stage?: Database["public"]["Enums"]["tender_stage"];
          state?: Database["public"]["Enums"]["decision_state"];
          submitted_at?: string;
          submitted_by?: string;
          tender_id?: string;
          updated_at?: string;
          workflow_instance_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "approval_tasks_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_tasks_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "approval_tasks_workflow_instance_id_fkey";
            columns: ["workflow_instance_id"];
            isOneToOne: false;
            referencedRelation: "workflow_instances";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          action: string;
          actor_email: string | null;
          actor_id: string | null;
          correlation_id: string | null;
          created_at: string;
          id: string;
          is_material: boolean;
          metadata: Json;
          object_id: string | null;
          object_type: string;
          object_version: number | null;
          organization_id: string;
          summary: string | null;
        };
        Insert: {
          action: string;
          actor_email?: string | null;
          actor_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          is_material?: boolean;
          metadata?: Json;
          object_id?: string | null;
          object_type: string;
          object_version?: number | null;
          organization_id: string;
          summary?: string | null;
        };
        Update: {
          action?: string;
          actor_email?: string | null;
          actor_id?: string | null;
          correlation_id?: string | null;
          created_at?: string;
          id?: string;
          is_material?: boolean;
          metadata?: Json;
          object_id?: string | null;
          object_type?: string;
          object_version?: number | null;
          organization_id?: string;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      boq_items: {
        Row: {
          confidence: number | null;
          created_at: string;
          created_by: string | null;
          criticality: Database["public"]["Enums"]["criticality"];
          description: string;
          description_ar: string | null;
          display_order: number;
          document_version_id: string | null;
          exclusion_reason: string | null;
          id: string;
          item_code: string | null;
          notes: string | null;
          organization_id: string;
          override_reason: string | null;
          quantity: number | null;
          rate_only: boolean;
          reviewed_at: string | null;
          reviewed_by: string | null;
          section_path: string | null;
          sheet_index: number | null;
          sheet_name: string | null;
          source_reference_id: string | null;
          status: Database["public"]["Enums"]["item_review_status"];
          tender_id: string;
          unit: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          confidence?: number | null;
          created_at?: string;
          created_by?: string | null;
          criticality?: Database["public"]["Enums"]["criticality"];
          description: string;
          description_ar?: string | null;
          display_order?: number;
          document_version_id?: string | null;
          exclusion_reason?: string | null;
          id?: string;
          item_code?: string | null;
          notes?: string | null;
          organization_id: string;
          override_reason?: string | null;
          quantity?: number | null;
          rate_only?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          section_path?: string | null;
          sheet_index?: number | null;
          sheet_name?: string | null;
          source_reference_id?: string | null;
          status?: Database["public"]["Enums"]["item_review_status"];
          tender_id: string;
          unit?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          created_by?: string | null;
          criticality?: Database["public"]["Enums"]["criticality"];
          description?: string;
          description_ar?: string | null;
          display_order?: number;
          document_version_id?: string | null;
          exclusion_reason?: string | null;
          id?: string;
          item_code?: string | null;
          notes?: string | null;
          organization_id?: string;
          override_reason?: string | null;
          quantity?: number | null;
          rate_only?: boolean;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          section_path?: string | null;
          sheet_index?: number | null;
          sheet_name?: string | null;
          source_reference_id?: string | null;
          status?: Database["public"]["Enums"]["item_review_status"];
          tender_id?: string;
          unit?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "boq_items_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "boq_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "boq_items_source_reference_id_fkey";
            columns: ["source_reference_id"];
            isOneToOne: false;
            referencedRelation: "source_references";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "boq_items_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          address: string | null;
          contact_person: string | null;
          country: string;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: string;
          name: string;
          name_ar: string | null;
          organization_id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          contact_person?: string | null;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          name: string;
          name_ar?: string | null;
          organization_id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          contact_person?: string | null;
          country?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: string;
          name?: string;
          name_ar?: string | null;
          organization_id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      company_settings: {
        Row: {
          address_line1: string | null;
          address_line2: string | null;
          bank_details: string | null;
          city: string | null;
          commercial_registration: string | null;
          country: string;
          created_at: string;
          default_terms: string | null;
          email: string | null;
          footer_text: string | null;
          id: string;
          legal_name: string;
          legal_name_ar: string | null;
          organization_id: string;
          phone: string | null;
          quotation_number_pattern: string;
          quotation_validity_days: number;
          signature_block: string | null;
          tax_number: string | null;
          updated_at: string;
          version: number;
          website: string | null;
        };
        Insert: {
          address_line1?: string | null;
          address_line2?: string | null;
          bank_details?: string | null;
          city?: string | null;
          commercial_registration?: string | null;
          country?: string;
          created_at?: string;
          default_terms?: string | null;
          email?: string | null;
          footer_text?: string | null;
          id?: string;
          legal_name: string;
          legal_name_ar?: string | null;
          organization_id: string;
          phone?: string | null;
          quotation_number_pattern?: string;
          quotation_validity_days?: number;
          signature_block?: string | null;
          tax_number?: string | null;
          updated_at?: string;
          version?: number;
          website?: string | null;
        };
        Update: {
          address_line1?: string | null;
          address_line2?: string | null;
          bank_details?: string | null;
          city?: string | null;
          commercial_registration?: string | null;
          country?: string;
          created_at?: string;
          default_terms?: string | null;
          email?: string | null;
          footer_text?: string | null;
          id?: string;
          legal_name?: string;
          legal_name_ar?: string | null;
          organization_id?: string;
          phone?: string | null;
          quotation_number_pattern?: string;
          quotation_validity_days?: number;
          signature_block?: string | null;
          tax_number?: string | null;
          updated_at?: string;
          version?: number;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "company_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_versions: {
        Row: {
          byte_size: number;
          created_at: string;
          file_id: string;
          id: string;
          mime_type: string | null;
          organization_id: string;
          replace_reason: string | null;
          sha256: string;
          storage_path: string;
          supersedes_id: string | null;
          tender_id: string;
          uploaded_by: string | null;
          version_no: number;
        };
        Insert: {
          byte_size?: number;
          created_at?: string;
          file_id: string;
          id?: string;
          mime_type?: string | null;
          organization_id: string;
          replace_reason?: string | null;
          sha256: string;
          storage_path: string;
          supersedes_id?: string | null;
          tender_id: string;
          uploaded_by?: string | null;
          version_no?: number;
        };
        Update: {
          byte_size?: number;
          created_at?: string;
          file_id?: string;
          id?: string;
          mime_type?: string | null;
          organization_id?: string;
          replace_reason?: string | null;
          sha256?: string;
          storage_path?: string;
          supersedes_id?: string | null;
          tender_id?: string;
          uploaded_by?: string | null;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_versions_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "tender_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_supersedes_id_fkey";
            columns: ["supersedes_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_versions_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      extraction_exceptions: {
        Row: {
          boq_item_id: string | null;
          cell_ref: string | null;
          created_at: string;
          document_version_id: string | null;
          id: string;
          kind: string;
          message: string;
          organization_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          row_index: number | null;
          sheet_name: string | null;
          status: Database["public"]["Enums"]["exception_status"];
          tender_id: string;
          updated_at: string;
        };
        Insert: {
          boq_item_id?: string | null;
          cell_ref?: string | null;
          created_at?: string;
          document_version_id?: string | null;
          id?: string;
          kind: string;
          message: string;
          organization_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          row_index?: number | null;
          sheet_name?: string | null;
          status?: Database["public"]["Enums"]["exception_status"];
          tender_id: string;
          updated_at?: string;
        };
        Update: {
          boq_item_id?: string | null;
          cell_ref?: string | null;
          created_at?: string;
          document_version_id?: string | null;
          id?: string;
          kind?: string;
          message?: string;
          organization_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          row_index?: number | null;
          sheet_name?: string | null;
          status?: Database["public"]["Enums"]["exception_status"];
          tender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extraction_exceptions_boq_item_id_fkey";
            columns: ["boq_item_id"];
            isOneToOne: false;
            referencedRelation: "boq_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_exceptions_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_exceptions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_exceptions_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      extraction_jobs: {
        Row: {
          created_at: string;
          created_by: string | null;
          document_version_id: string;
          error_summary: string | null;
          exceptions_created: number;
          finished_at: string | null;
          id: string;
          idempotency_key: string;
          items_created: number;
          organization_id: string;
          requirements_created: number;
          rows_scanned: number;
          sheet_summary: Json;
          sheets_found: number;
          started_at: string | null;
          status: Database["public"]["Enums"]["extraction_status"];
          tender_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          document_version_id: string;
          error_summary?: string | null;
          exceptions_created?: number;
          finished_at?: string | null;
          id?: string;
          idempotency_key: string;
          items_created?: number;
          organization_id: string;
          requirements_created?: number;
          rows_scanned?: number;
          sheet_summary?: Json;
          sheets_found?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["extraction_status"];
          tender_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          document_version_id?: string;
          error_summary?: string | null;
          exceptions_created?: number;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string;
          items_created?: number;
          organization_id?: string;
          requirements_created?: number;
          rows_scanned?: number;
          sheet_summary?: Json;
          sheets_found?: number;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["extraction_status"];
          tender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "extraction_jobs_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_jobs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "extraction_jobs_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      feature_flags: {
        Row: {
          created_at: string;
          description: string | null;
          enabled: boolean;
          flag_key: string;
          id: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          flag_key: string;
          id?: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          flag_key?: string;
          id?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feature_flags_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          link_path: string | null;
          organization_id: string;
          read_at: string | null;
          severity: string;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link_path?: string | null;
          organization_id: string;
          read_at?: string | null;
          severity?: string;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          link_path?: string | null;
          organization_id?: string;
          read_at?: string | null;
          severity?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          invited_email: string | null;
          organization_id: string;
          role: Database["public"]["Enums"]["app_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          invited_email?: string | null;
          organization_id: string;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          invited_email?: string | null;
          organization_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          base_currency: string;
          country: string;
          created_at: string;
          id: string;
          logo_url: string | null;
          name: string;
          name_ar: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          base_currency?: string;
          country?: string;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name: string;
          name_ar?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          base_currency?: string;
          country?: string;
          created_at?: string;
          id?: string;
          logo_url?: string | null;
          name?: string;
          name_ar?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          full_name_ar: string | null;
          id: string;
          job_title: string | null;
          phone: string | null;
          preferred_language: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          full_name_ar?: string | null;
          id: string;
          job_title?: string | null;
          phone?: string | null;
          preferred_language?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          full_name_ar?: string | null;
          id?: string;
          job_title?: string | null;
          phone?: string | null;
          preferred_language?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      requirements: {
        Row: {
          category: string;
          confidence: number | null;
          created_at: string;
          created_by: string | null;
          criticality: Database["public"]["Enums"]["criticality"];
          document_version_id: string | null;
          id: string;
          organization_id: string;
          override_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          source_reference_id: string | null;
          status: Database["public"]["Enums"]["item_review_status"];
          tender_id: string;
          text: string;
          text_ar: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          category?: string;
          confidence?: number | null;
          created_at?: string;
          created_by?: string | null;
          criticality?: Database["public"]["Enums"]["criticality"];
          document_version_id?: string | null;
          id?: string;
          organization_id: string;
          override_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_reference_id?: string | null;
          status?: Database["public"]["Enums"]["item_review_status"];
          tender_id: string;
          text: string;
          text_ar?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          category?: string;
          confidence?: number | null;
          created_at?: string;
          created_by?: string | null;
          criticality?: Database["public"]["Enums"]["criticality"];
          document_version_id?: string | null;
          id?: string;
          organization_id?: string;
          override_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          source_reference_id?: string | null;
          status?: Database["public"]["Enums"]["item_review_status"];
          tender_id?: string;
          text?: string;
          text_ar?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "requirements_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_source_reference_id_fkey";
            columns: ["source_reference_id"];
            isOneToOne: false;
            referencedRelation: "source_references";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "requirements_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      source_references: {
        Row: {
          cell_ref: string | null;
          confidence: number | null;
          created_at: string;
          document_version_id: string;
          id: string;
          normalized_text: string | null;
          organization_id: string;
          page_number: number | null;
          raw_text: string | null;
          row_index: number | null;
          sheet_index: number | null;
          sheet_name: string | null;
          tender_id: string;
        };
        Insert: {
          cell_ref?: string | null;
          confidence?: number | null;
          created_at?: string;
          document_version_id: string;
          id?: string;
          normalized_text?: string | null;
          organization_id: string;
          page_number?: number | null;
          raw_text?: string | null;
          row_index?: number | null;
          sheet_index?: number | null;
          sheet_name?: string | null;
          tender_id: string;
        };
        Update: {
          cell_ref?: string | null;
          confidence?: number | null;
          created_at?: string;
          document_version_id?: string;
          id?: string;
          normalized_text?: string | null;
          organization_id?: string;
          page_number?: number | null;
          raw_text?: string | null;
          row_index?: number | null;
          sheet_index?: number | null;
          sheet_name?: string | null;
          tender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "source_references_document_version_id_fkey";
            columns: ["document_version_id"];
            isOneToOne: false;
            referencedRelation: "document_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_references_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "source_references_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      tender_files: {
        Row: {
          created_at: string;
          current_version: number;
          id: string;
          kind: string;
          mime_type: string | null;
          organization_id: string;
          original_name: string;
          tender_id: string;
          updated_at: string;
          uploaded_by: string | null;
        };
        Insert: {
          created_at?: string;
          current_version?: number;
          id?: string;
          kind?: string;
          mime_type?: string | null;
          organization_id: string;
          original_name: string;
          tender_id: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Update: {
          created_at?: string;
          current_version?: number;
          id?: string;
          kind?: string;
          mime_type?: string | null;
          organization_id?: string;
          original_name?: string;
          tender_id?: string;
          updated_at?: string;
          uploaded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tender_files_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tender_files_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: false;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      tenders: {
        Row: {
          client_id: string | null;
          created_at: string;
          created_by: string | null;
          currency: string;
          current_stage: Database["public"]["Enums"]["tender_stage"];
          estimated_value: number | null;
          id: string;
          notes: string | null;
          organization_id: string;
          owner_id: string | null;
          project_location: string | null;
          reference: string;
          stage_state: Database["public"]["Enums"]["decision_state"];
          status: Database["public"]["Enums"]["tender_status"];
          submission_deadline: string | null;
          title: string;
          title_ar: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          current_stage?: Database["public"]["Enums"]["tender_stage"];
          estimated_value?: number | null;
          id?: string;
          notes?: string | null;
          organization_id: string;
          owner_id?: string | null;
          project_location?: string | null;
          reference: string;
          stage_state?: Database["public"]["Enums"]["decision_state"];
          status?: Database["public"]["Enums"]["tender_status"];
          submission_deadline?: string | null;
          title: string;
          title_ar?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          client_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          currency?: string;
          current_stage?: Database["public"]["Enums"]["tender_stage"];
          estimated_value?: number | null;
          id?: string;
          notes?: string | null;
          organization_id?: string;
          owner_id?: string | null;
          project_location?: string | null;
          reference?: string;
          stage_state?: Database["public"]["Enums"]["decision_state"];
          status?: Database["public"]["Enums"]["tender_status"];
          submission_deadline?: string | null;
          title?: string;
          title_ar?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenders_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenders_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_instances: {
        Row: {
          created_at: string;
          current_stage: Database["public"]["Enums"]["tender_stage"];
          id: string;
          organization_id: string;
          state: Database["public"]["Enums"]["decision_state"];
          template_id: string | null;
          tender_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_stage?: Database["public"]["Enums"]["tender_stage"];
          id?: string;
          organization_id: string;
          state?: Database["public"]["Enums"]["decision_state"];
          template_id?: string | null;
          tender_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_stage?: Database["public"]["Enums"]["tender_stage"];
          id?: string;
          organization_id?: string;
          state?: Database["public"]["Enums"]["decision_state"];
          template_id?: string | null;
          tender_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_instances_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_instances_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_instances_tender_id_fkey";
            columns: ["tender_id"];
            isOneToOne: true;
            referencedRelation: "tenders";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_stages: {
        Row: {
          approver_role: Database["public"]["Enums"]["app_role"];
          blocks_release: boolean;
          created_at: string;
          id: string;
          name: string;
          name_ar: string | null;
          organization_id: string;
          requires_note_on_reject: boolean;
          sla_hours: number | null;
          stage: Database["public"]["Enums"]["tender_stage"];
          stage_order: number;
          template_id: string;
          updated_at: string;
        };
        Insert: {
          approver_role: Database["public"]["Enums"]["app_role"];
          blocks_release?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          name_ar?: string | null;
          organization_id: string;
          requires_note_on_reject?: boolean;
          sla_hours?: number | null;
          stage: Database["public"]["Enums"]["tender_stage"];
          stage_order: number;
          template_id: string;
          updated_at?: string;
        };
        Update: {
          approver_role?: Database["public"]["Enums"]["app_role"];
          blocks_release?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          name_ar?: string | null;
          organization_id?: string;
          requires_note_on_reject?: boolean;
          sla_hours?: number | null;
          stage?: Database["public"]["Enums"]["tender_stage"];
          stage_order?: number;
          template_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workflow_stages_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "workflow_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      workflow_templates: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          name_ar: string | null;
          organization_id: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          name_ar?: string | null;
          organization_id: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          name_ar?: string | null;
          organization_id?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "workflow_templates_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_edit_intake: { Args: { _org: string }; Returns: boolean };
      can_review_technical: { Args: { _org: string }; Returns: boolean };
      has_any_org_role: {
        Args: {
          _org: string;
          _roles: Database["public"]["Enums"]["app_role"][];
        };
        Returns: boolean;
      };
      has_org_role: {
        Args: { _org: string; _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      is_org_member: { Args: { _org: string }; Returns: boolean };
    };
    Enums: {
      app_role:
        | "org_admin"
        | "proposal_engineer"
        | "technical_lead"
        | "product_manager"
        | "sourcing_manager"
        | "commercial_manager"
        | "finance_manager"
        | "signatory"
        | "viewer";
      criticality: "standard" | "critical";
      decision_state:
        | "draft"
        | "submitted"
        | "in_review"
        | "changes_requested"
        | "approved"
        | "rejected"
        | "superseded"
        | "released";
      exception_status: "open" | "resolved" | "overridden";
      extraction_status:
        "queued" | "running" | "complete" | "partial" | "failed" | "integration_required";
      item_review_status: "needs_review" | "reviewed" | "exception" | "excluded";
      membership_status: "invited" | "active" | "suspended";
      tender_stage:
        "intake" | "technical" | "product" | "sourcing" | "commercial" | "finance" | "release";
      tender_status: "open" | "won" | "lost" | "cancelled" | "archived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "org_admin",
        "proposal_engineer",
        "technical_lead",
        "product_manager",
        "sourcing_manager",
        "commercial_manager",
        "finance_manager",
        "signatory",
        "viewer",
      ],
      criticality: ["standard", "critical"],
      decision_state: [
        "draft",
        "submitted",
        "in_review",
        "changes_requested",
        "approved",
        "rejected",
        "superseded",
        "released",
      ],
      exception_status: ["open", "resolved", "overridden"],
      extraction_status: [
        "queued",
        "running",
        "complete",
        "partial",
        "failed",
        "integration_required",
      ],
      item_review_status: ["needs_review", "reviewed", "exception", "excluded"],
      membership_status: ["invited", "active", "suspended"],
      tender_stage: [
        "intake",
        "technical",
        "product",
        "sourcing",
        "commercial",
        "finance",
        "release",
      ],
      tender_status: ["open", "won", "lost", "cancelled", "archived"],
    },
  },
} as const;
