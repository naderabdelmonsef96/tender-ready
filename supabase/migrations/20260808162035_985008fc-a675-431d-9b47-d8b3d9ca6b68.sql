GRANT EXECUTE ON FUNCTION public.can_edit_intake(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_review_technical(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_org_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;