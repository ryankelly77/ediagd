import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
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

      <ul className="mt-4 space-y-2">
        <li>
          <LinkRow
            href="/swag"
            label="Swag Shack"
            hint="Spend your Sand Dollars on the gear"
          />
        </li>
      </ul>

      {isAdmin && (
        <ul className="mt-4 space-y-2">
          <li>
            <LinkRow href="/admin" label="Admin" hint="Engagement across rooftops" />
          </li>
          <li>
            <LinkRow
              href="/admin/content"
              label="Coaching Content"
              hint="Manage cues and videos"
            />
          </li>
          <li>
            <LinkRow
              href="/admin/settings"
              label="Gamification Settings"
              hint="Sand Dollars and streak grace days"
            />
          </li>
          <li>
            <LinkRow
              href="/admin/swag"
              label="Swag Shack"
              hint="Fulfillment queue and catalog"
            />
          </li>
        </ul>
      )}

      <h2 className="mt-6 px-1 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
        Coming soon
      </h2>
      <ul className="mt-2 space-y-2">
        <li>
          <SoonRow label="Lessons" hint="Guided courses and certifications" />
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
