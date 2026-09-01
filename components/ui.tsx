import type { ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground font-display break-words">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-surface-border bg-surface backdrop-blur-xl shadow-[0_4px_24px_-8px_rgba(38,35,44,0.14)] overflow-x-auto",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground font-display">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

const BADGE_STYLES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  approved: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  paid: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  processed: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  prospect: "bg-amber-500/10 text-amber-700 ring-amber-600/20",
  pending: "bg-amber-500/10 text-amber-700 ring-amber-600/20",
  draft: "bg-black/5 text-foreground/60 ring-black/10",
  sent: "bg-sky-500/10 text-sky-700 ring-sky-600/20",
  inactive: "bg-black/5 text-foreground/60 ring-black/10",
  overdue: "bg-brand-red/10 text-brand-red-dark ring-brand-red/25",
  void: "bg-black/5 text-foreground/50 ring-black/10",
  not_started: "bg-black/5 text-foreground/60 ring-black/10",
  ongoing: "bg-sky-500/10 text-sky-700 ring-sky-600/20",
  completed: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  blocked_by_client: "bg-brand-red/10 text-brand-red-dark ring-brand-red/25",
  open: "bg-sky-500/10 text-sky-700 ring-sky-600/20",
  in_progress: "bg-amber-500/10 text-amber-700 ring-amber-600/20",
  resolved: "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20",
  closed: "bg-black/5 text-foreground/60 ring-black/10",
  low: "bg-black/5 text-foreground/60 ring-black/10",
  medium: "bg-sky-500/10 text-sky-700 ring-sky-600/20",
  high: "bg-amber-500/10 text-amber-700 ring-amber-600/20",
  urgent: "bg-brand-red/10 text-brand-red-dark ring-brand-red/25",
};

export function Badge({ status }: { status: string }) {
  const style = BADGE_STYLES[status] ?? "bg-black/5 text-foreground/60 ring-black/10";
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset capitalize",
        style
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted">{message}</div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" &&
          "bg-brand-red text-white shadow-[0_4px_16px_-4px_rgba(147,48,75,0.45)] hover:bg-brand-red-dark",
        variant === "secondary" &&
          "bg-white/50 backdrop-blur-md text-foreground ring-1 ring-inset ring-surface-border hover:bg-white/70",
        variant === "ghost" && "text-foreground hover:bg-black/5",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        "w-full rounded-lg border border-border bg-white/60 backdrop-blur-md px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={clsx(
        "w-full rounded-lg border border-border bg-white/60 backdrop-blur-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20",
        props.className
      )}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={clsx(
        "w-full rounded-lg border border-border bg-white/60 backdrop-blur-md px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20",
        props.className
      )}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="block text-xs font-medium text-muted mb-1">{children}</label>;
}
