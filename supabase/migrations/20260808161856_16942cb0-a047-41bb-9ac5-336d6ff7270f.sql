INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
VALUES ('11111111-1111-4111-8111-111111111111','1e62fec0-ab05-4dfd-98b3-adf8598d8c36','org_admin','active')
ON CONFLICT DO NOTHING;

DELETE FROM public.organization_memberships
WHERE user_id IN ('68ebf0a2-686c-43b0-ba67-7b0b949ca6e8','b146ab3f-9a36-49d7-80e6-260f1c20ff20');