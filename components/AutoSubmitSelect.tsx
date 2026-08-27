"use client";

import type { SelectHTMLAttributes } from "react";

// A <select> that submits its enclosing form on change. Event handlers
// can't be passed as props to a DOM element rendered from a Server
// Component (Next.js 16 rejects it at render time), so this one small
// interactive piece is split into its own Client Component and reused
// everywhere a status/owner dropdown should auto-submit.
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
