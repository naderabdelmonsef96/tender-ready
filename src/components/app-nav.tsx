import { Link, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  Coins,
  FileSignature,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  Package,
  ShieldCheck,
  Truck,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  stage?: string;
};

export type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    labelKey: "nav.dashboard",
    items: [{ to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    labelKey: "nav.workbench",
    items: [
      { to: "/workbench/intake", labelKey: "screens.intake", icon: FileText, stage: "intake" },
      {
        to: "/workbench/requirements",
        labelKey: "screens.requirements",
        icon: FileSpreadsheet,
        stage: "technical",
      },
      {
        to: "/workbench/portfolio",
        labelKey: "screens.portfolioMatch",
        icon: Package,
        stage: "product",
      },
      { to: "/workbench/sourcing", labelKey: "screens.sourcing", icon: Truck, stage: "sourcing" },
      { to: "/workbench/pricing", labelKey: "screens.pricing", icon: Coins, stage: "commercial" },
      {
        to: "/workbench/review",
        labelKey: "screens.commercialReview",
        icon: ClipboardList,
        stage: "release",
      },
    ],
  },
  {
    labelKey: "nav.governance",
    items: [
      { to: "/approvals", labelKey: "nav.approvals", icon: ShieldCheck },
      { to: "/audit", labelKey: "nav.audit", icon: History },
    ],
  },
  {
    labelKey: "nav.administration",
    items: [
      { to: "/settings/company", labelKey: "nav.company", icon: FileText },
      { to: "/settings/users", labelKey: "nav.users", icon: Users },
      { to: "/settings/catalogue", labelKey: "nav.catalogues", icon: Boxes },
      {
        to: "/settings/quotation-template",
        labelKey: "nav.quotationTemplate",
        icon: FileSignature,
      },

      { to: "/admin/workflows", labelKey: "nav.workflows", icon: Workflow },
    ],
  },
];

export function useCurrentPath(): string {
  return useRouterState({ select: (state) => state.location.pathname });
}

export function NavLink({
  item,
  label,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  label: string;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center",
          active
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/60 group-hover:text-sidebar-primary",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
