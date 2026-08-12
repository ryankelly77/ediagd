import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import {
  ADMIN_PREVIEWS,
  ADMIN_TOOLS,
  MEMBER_SECTIONS,
} from "@/lib/navigation";
import { BRAND } from "@/lib/brand";
import { signOutAction } from "./actions";

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("membership")
    .select("role, app_user:user_id(full_name)")
    .eq("user_id", user.id)
    .eq("active", true);

  const roles = new Set((memberships ?? []).map((m) => m.role as string));
  const isAdmin = roles.has("admin");

  const embed = memberships?.[0]?.app_user as unknown;
  const appUser = (Array.isArray(embed) ? embed[0] : embed) as
    | { full_name: string | null }
    | null
    | undefined;
  const displayName = appUser?.full_name ?? user.email ?? "Your account";

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        More
      </h1>

      <Card className="mt-3 p-5">
        <p className="text-lg font-extrabold text-navy">{displayName}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{user.email}</p>
        {roles.size > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {[...roles].map((role) => (
              <span
                key={role}
                className="rounded-pill bg-teal-soft/50 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-navy"
              >
                {role}
              </span>
            ))}
          </p>
        )}
      </Card>

      {/* Libraries, from lib/navigation.ts. requiresRole decides whether the
          row is OFFERED; each page re-checks the product entitlement itself and
          RLS enforces it again, so hiding a row is never the control. */}
      <ul className="mt-4 space-y-2">
        {MEMBER_SECTIONS.filter(
          (s) => s.requiresRole == null || roles.has(s.requiresRole)
        ).map((section) => (
          <li key={section.href}>
            <LinkRow {...section} />
          </li>
        ))}
        <li>
          <LinkRow
            href="/swag"
            label="Swag Shack"
            hint="Spend your Sand Dollars on the gear"
          />
        </li>
      </ul>

      {/* THE ADMIN HUB. Six peers, rendered from lib/navigation.ts — the same
          list `npm run check:nav` validates against the routes on disk.
          Engagement sits among them rather than above them: it used to be the
          page you went "into" to reach the rest, which made Impact & ROI look
          like part of engagement instead of the other half of the question. */}
      {isAdmin && (
        <>
          <h2 className="mt-6 px-1 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
            Admin
          </h2>
          <ul className="mt-2 space-y-2">
            {ADMIN_TOOLS.map((tool) => (
              <li key={tool.href}>
                <LinkRow {...tool} />
              </li>
            ))}
          </ul>

          {/* App chrome over fabricated data — kept apart from the working
              tools so a preview is never mistaken for a result. */}
          <h2 className="mt-6 px-1 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
            Previews
          </h2>
          <ul className="mt-2 space-y-2">
            {ADMIN_PREVIEWS.map((tool) => (
              <li key={tool.href}>
                <LinkRow {...tool} />
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-6 px-1 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
        Coming soon
      </h2>
      <ul className="mt-2 space-y-2">
        <li>
          <SoonRow label="Certifications" hint="Guided courses and Big Wave" />
        </li>
      </ul>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-xl border border-line bg-surface-card p-3.5 font-extrabold text-clay transition hover:bg-clay/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Sign out
        </button>
      </form>

      <p
        className="mt-8 text-center text-3xl text-teal"
        style={{ fontFamily: "var(--font-script)" }}
      >
        {BRAND.signoff}
      </p>
    </main>
  );
}

function LinkRow({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <Card>
      <Link
        href={href}
        className="flex items-center gap-3 p-4 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-navy">{label}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
        </span>
        <span aria-hidden="true" className="text-lg text-ink-soft">
          ›
        </span>
      </Link>
    </Card>
  );
}

function SoonRow({ label, hint }: { label: string; hint: string }) {
  return (
    <Card className="flex items-center gap-3 p-4 opacity-70">
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold text-navy">{label}</span>
        <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
      </span>
      <span className="rounded-pill bg-line px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-soft">
        Soon
      </span>
    </Card>
  );
}
