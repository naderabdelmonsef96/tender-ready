REVOKE ALL ON FUNCTION public.can_edit_intake(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.can_review_technical(uuid) FROM anon, authenticated;