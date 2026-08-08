import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getMyContext, type AppRole } from "@/lib/org.functions";

const STORAGE_KEY = "tenderready.activeOrganization";

export type Membership = {
  id: string;
  role: AppRole;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    name_ar: string | null;
    slug: string;
    base_currency: string;
  } | null;
};

type WorkspaceContextValue = {
  isLoading: boolean;
  error: Error | null;
  userId: string | null;
  fullName: string | null;
  fullNameAr: string | null;
  email: string | null;
  memberships: Membership[];
  activeMembership: Membership | null;
  activeOrganizationId: string | null;
  role: AppRole | null;
  isAdmin: boolean;
  baseCurrency: string;
  setActiveOrganization: (organizationId: string) => void;
  refetch: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const fetchContext = useServerFn(getMyContext);
  const [preferredOrgId, setPreferredOrgId] = useState<string | null>(null);

  useEffect(() => {
    setPreferredOrgId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const query = useQuery({
    queryKey: ["my-context"],
    queryFn: () => fetchContext(),
    staleTime: 60_000,
  });

  const value = useMemo<WorkspaceContextValue>(() => {
    const memberships: Membership[] = (query.data?.memberships ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      organizationId: m.organizationId,
      organization: m.organization ?? null,
    }));

    const activeMembership =
      memberships.find((m) => m.organizationId === preferredOrgId) ?? memberships[0] ?? null;

    return {
      isLoading: query.isPending,
      error: (query.error as Error | null) ?? null,
      userId: query.data?.userId ?? null,
      fullName: query.data?.profile?.full_name ?? null,
      fullNameAr: query.data?.profile?.full_name_ar ?? null,
      email: query.data?.profile?.email ?? null,
      memberships,
      activeMembership,
      activeOrganizationId: activeMembership?.organizationId ?? null,
      role: activeMembership?.role ?? null,
      isAdmin: activeMembership?.role === "org_admin",
      baseCurrency: activeMembership?.organization?.base_currency ?? "EGP",
      setActiveOrganization: (organizationId: string) => {
        window.localStorage.setItem(STORAGE_KEY, organizationId);
        setPreferredOrgId(organizationId);
      },
      refetch: () => void query.refetch(),
    };
  }, [query, preferredOrgId]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
