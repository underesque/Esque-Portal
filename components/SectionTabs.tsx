"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";

export function SectionTabs({
  options,
  paramName = "section",
  defaultValue,
}: {
  options: { key: string; label: string }[];
  paramName?: string;
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(paramName) ?? defaultValue;

  function select(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramName, key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => select(option.key)}
          className={clsx(
            "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            active === option.key ? "border-brand-red text-foreground" : "border-transparent text-muted hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
