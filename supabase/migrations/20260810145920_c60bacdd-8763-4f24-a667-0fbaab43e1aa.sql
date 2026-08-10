REVOKE EXECUTE ON FUNCTION public.can_decide_pricing(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_decide_finance(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_release_quotation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_decide_pricing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_decide_finance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_release_quotation(uuid) TO authenticated;