"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Search box for the coaching library.
 *
 * Navigates to /admin/content/search?q=… so results are linkable and
 * refreshable. Typing debounces at 300ms; Enter submits immediately. The query
 * itself runs server-side — this only drives the URL.
 */
/** Where "clear" returns to: the full browse-by-service list. */
const BROWSE_HREF = "/admin/content";

export function ContentSearchBar({
  initialQuery = "",
  autoNavigate = true,
}: {
  initialQuery?: string;
  /** False on the results page, where we don't want to navigate mid-typing. */
  autoNavigate?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Don't fire on first render — only once the user actually types.
  const touched = useRef(false);

  useEffect(() => {
    if (!autoNavigate || !touched.current) return;
    if (debounce.current) clearTimeout(debounce.current);

    const trimmed = value.trim();
    debounce.current = setTimeout(() => {
      if (trimmed.length >= 2) {
        router.push(`/admin/content/search?q=${encodeURIComponent(trimmed)}`);
      }
    }, 300);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [value, autoNavigate, router]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    const trimmed = value.trim();
    // Submitting an empty box means "show me everything again", not "do nothing".
    if (trimmed.length === 0) {
      router.push(BROWSE_HREF);
      return;
    }
    router.push(`/admin/content/search?q=${encodeURIComponent(trimmed)}`);
  }

  function clear() {
    if (debounce.current) clearTimeout(debounce.current);
    touched.current = false; // don't let the debounce re-fire on the way out
    setValue("");
    inputRef.current?.focus();
    router.push(BROWSE_HREF);
  }

  return (
    <form onSubmit={submit} role="search" className="mt-4">
      <label htmlFor="content-search" className="sr-only">
        Search all coaching content
      </label>
      <div className="flex gap-2">
        <div className="relative w-full">
          <input
            ref={inputRef}
            id="content-search"
            type="search"
            value={value}
            onChange={(e) => {
              touched.current = true;
              setValue(e.target.value);
            }}
            placeholder="Search all coaching content…"
            // The native WebKit clear button is suppressed in app/globals.css —
            // it can only empty the field, not navigate back to the full list,
            // so the ✕ below replaces it. Two X's side by side is worse than none.
            className="w-full rounded-xl border border-line bg-cream-card p-3 pr-10 text-navy outline-none focus:ring-2 focus:ring-gold"
          />
          {value.length > 0 && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              title="Clear search"
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-lg font-bold text-ink-soft transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-navy px-4 py-3 font-extrabold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Search
        </button>
      </div>
    </form>
  );
}

export default ContentSearchBar;
