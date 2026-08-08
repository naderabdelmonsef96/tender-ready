import type { ReactNode } from "react";

import { useAppTranslation } from "@/components/language-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DecisionState, TenderStage } from "@/lib/workspace.functions";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn("min-w-0 rounded-xl border border-border bg-card shadow-sm", className)}
    >
      {(title || actions) && (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "warning" | "success" | "info";
}) {
  const toneClass = {
    default: "text-foreground",
    warning: "text-warning",
    success: "text-success",
    info: "text-info",
  }[tone];

  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const decisionTone: Record<DecisionState, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-info/10 text-info",
  in_review: "bg-info/10 text-info",
  changes_requested: "bg-warning/15 text-warning-strong",
  approved: "bg-success/12 text-success",
  rejected: "bg-destructive/12 text-destructive",
  superseded: "bg-muted text-muted-foreground",
  released: "bg-primary/10 text-primary",
};

export function DecisionBadge({ state }: { state: DecisionState }) {
  const { t } = useAppTranslation();
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        decisionTone[state],
      )}
    >
      <span className="truncate">{t(`decision.${state}`)}</span>
    </span>
  );
}

export function StageBadge({ stage }: { stage: TenderStage }) {
  const { t } = useAppTranslation();
  return (
    <span className="inline-flex max-w-full items-center rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-foreground">
      <span className="truncate">{t(`stage.${stage}`)}</span>
    </span>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-8 text-center"
    >
      <p className="max-w-md text-sm text-destructive">{message}</p>
      {action}
    </div>
  );
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Horizontal scroll container so dense commercial tables never get clipped. */
export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="min-w-[46rem]">{children}</div>
    </div>
  );
}
