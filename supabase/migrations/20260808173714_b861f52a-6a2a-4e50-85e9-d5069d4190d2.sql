REVOKE EXECUTE ON FUNCTION public.can_decide_match(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_decide_sourcing(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_manage_catalogue(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_decide_match(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_decide_sourcing(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_catalogue(uuid) TO authenticated, service_role;