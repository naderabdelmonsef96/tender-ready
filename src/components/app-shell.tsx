import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, Building2, ChevronDown, Languages, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, type ReactNode } from "react";

import { navGroups, NavLink, useCurrentPath } from "@/components/app-nav";
import { useAppTranslation, useLanguage } from "@/components/language-provider";
import { useWorkspace } from "@/components/workspace-provider";
import logo from "@/assets/tenderready-logo.png";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { initialsOf } from "@/lib/format";
import { cn } from "@/lib/utils";

function SidebarBody({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useAppTranslation();
  const pathname = useCurrentPath();

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4" aria-label={t("shell.openMenu")}>
      {navGroups.map((group) => (
        <div key={group.labelKey} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
              {t(group.labelKey)}
            </p>
          )}
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              item={item}
              label={t(item.labelKey)}
              collapsed={collapsed}
              active={pathname === item.to || pathname.startsWith(`${item.to}/`)}
              {...(onNavigate ? { onNavigate } : {})}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function BrandMark({ collapsed }: { collapsed: boolean }) {
  const { t } = useAppTranslation();
  return (
    <Link
      to="/dashboard"
      className="flex items-center gap-2 rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <img src={logo} alt="" className="h-8 w-8 shrink-0 rounded-md bg-white/95 object-contain p-1" />
      {!collapsed && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            {t("brand.name")}
          </span>
          <span className="truncate text-[11px] text-sidebar-foreground/55">{t("brand.tagline")}</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, language, direction } = useAppTranslation();
  const { toggleLanguage } = useLanguage();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = useMutation({
    mutationFn: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
    },
    onSuccess: () => navigate({ to: "/auth", search: { next: "/" }, replace: true }),
  });

  const orgName =
    language === "ar"
      ? workspace.activeMembership?.organization?.name_ar ??
        workspace.activeMembership?.organization?.name ??
        "—"
      : workspace.activeMembership?.organization?.name ?? "—";
  const displayName =
    (language === "ar" ? workspace.fullNameAr ?? workspace.fullName : workspace.fullName) ??
    workspace.email ??
    "";

  return (
    <div className="flex min-h-screen w-full bg-background" dir={direction}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {t("shell.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex",
          direction === "rtl" ? "border-s border-sidebar-border" : "border-e border-sidebar-border",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-3">
          <BrandMark collapsed={collapsed} />
        </div>
        <SidebarBody collapsed={collapsed} />
        <div className="border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label={collapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar")}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                <span className="truncate">{t("shell.collapseSidebar")}</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("shell.openMenu")}>
                <Menu className="h-5 w-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side={direction === "rtl" ? "right" : "left"}
              className="w-72 bg-sidebar p-0 text-sidebar-foreground"
            >
              <SheetTitle className="sr-only">{t("shell.openMenu")}</SheetTitle>
              <div className="flex h-14 items-center border-b border-sidebar-border px-3">
                <BrandMark collapsed={false} />
              </div>
              <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Organization switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 min-w-0 max-w-[15rem] justify-start gap-2 px-2 sm:px-3">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-sm font-medium">{orgName}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t("shell.switchOrganization")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspace.memberships.map((membership) => (
                <DropdownMenuItem
                  key={membership.id}
                  onSelect={() => workspace.setActiveOrganization(membership.organizationId)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="truncate text-sm font-medium">
                    {language === "ar"
                      ? membership.organization?.name_ar ?? membership.organization?.name
                      : membership.organization?.name}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(`roles.${membership.role}`)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ms-auto flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="h-9 gap-1.5 px-2 font-medium"
              aria-label={t("common.language")}
            >
              <Languages className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs" data-ltr>
                {language === "ar" ? "EN" : "AR"}
              </span>
            </Button>

            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("shell.notifications")}>
              <Bell className="h-4 w-4" aria-hidden="true" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 min-w-0 gap-2 px-1.5 sm:px-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {initialsOf(displayName, workspace.email ?? "?")}
                  </span>
                  <span className="hidden min-w-0 flex-col items-start sm:flex">
                    <span className="max-w-[10rem] truncate text-xs font-semibold leading-tight">
                      {displayName || "—"}
                    </span>
                    <span className="max-w-[10rem] truncate text-[11px] leading-tight text-muted-foreground">
                      {workspace.role ? t(`roles.${workspace.role}`) : "—"}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-sm">{displayName || "—"}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground" data-ltr>
                    {workspace.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOut.mutate()} disabled={signOut.isPending}>
                  <LogOut className="me-2 h-4 w-4" aria-hidden="true" />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
