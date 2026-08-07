import Form from "next/form";
import Link from "next/link";

/* ============================================================================
   EDIAGD — admin search box

   Two states in one row, because there isn't room for both:

     idle      [ Search rooftops or people          ] [ Search ]
     searching [ “Kiel” ✕ ]

   Once a search is running, the field has done its job and the term is what
   matters — so it collapses to a pill that says what's being filtered and
   clears it in one tap. Tapping ✕ brings the field back, empty and ready.

   Both states are plain links and a GET form: no client component, no state,
   no fetch. The server filters (0026 views + ilike), so this works with
   JavaScript off and every view is a shareable URL.

   next/form rather than a bare <form> so submitting is a client-side
   navigation, which is what lets scroll={false} hold your place in the list.
   Without JavaScript it degrades to an ordinary GET form.
   ============================================================================ */

export function AdminSearch({
  action,
  placeholder,
  value,
  band,
}: {
  action: string;
  placeholder: string;
  value: string;
  /** Preserved across a search so the band filter isn't silently dropped. */
  band: string | null;
}) {
  if (value) {
    // Deliberately rebuilt from scratch rather than dropping q from the current
    // params: clearing the search should also reset paging, since "show 60"
    // was a decision about a result set that no longer exists.
    const params = new URLSearchParams();
    if (band) params.set("band", band);
    const qs = params.toString();

    return (
      <div className="mt-3 flex min-h-[3rem] items-center gap-2">
        <Link
          href={qs ? `${action}?${qs}` : action}
          scroll={false}
          aria-label={`Clear search: ${value}`}
          className="inline-flex min-h-[2.5rem] max-w-full items-center gap-2 rounded-pill border border-line bg-surface-card py-1.5 pl-3.5 pr-3 transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <span className="truncate text-sm font-bold text-navy">
            {`“${value}”`}
          </span>
          <span
            aria-hidden="true"
            className="text-base leading-none text-ink-soft"
          >
            &#10005;
          </span>
        </Link>
      </div>
    );
  }

  return (
    <Form action={action} scroll={false} className="mt-3 flex gap-2">
      {band && <input type="hidden" name="band" value={band} />}
      <input
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-[3rem] w-full flex-1 rounded-xl border border-line bg-surface-card px-4 text-navy outline-none focus:ring-2 focus:ring-gold"
      />
      <button
        type="submit"
        className="min-h-[3rem] shrink-0 rounded-xl border border-line bg-surface-card px-4 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        Search
      </button>
    </Form>
  );
}

export default AdminSearch;
