-- Admin override: org_admin may approve/decide a stage they submitted
-- themselves, but only with a documented reason, and it is permanently
-- distinguishable from a genuine second-party decision.
ALTER TABLE public.approval_decisions ADD COLUMN is_override boolean NOT NULL DEFAULT false;
