"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { RANGE_OPTIONS, DEFAULT_RANGE, isRangeKey, type RangeKey } from "@/lib/dashboard";

export function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const paramValue = searchParams.get("range") ?? undefined;
  const active: RangeKey = isRangeKey(paramValue) ? paramValue : DEFAULT_RANGE;

  function select(key: RangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", key);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap gap-1.5">
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => select(option.key)}
          className={clsx(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            active === option.key
              ? "bg-foreground text-white"
              : "bg-black/[0.04] text-muted hover:bg-black/[0.07] hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
