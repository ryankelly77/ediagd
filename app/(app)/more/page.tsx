import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import {
  ADMIN_PREVIEWS,
  ADMIN_TOOLS,
  MANAGER_TOOLS,
  MEMBER_SECTIONS,
} from "@/lib/navigation";
import { BRAND } from "@/lib/brand";
import { SandDollarIcon } from "@/components/brand/SandDollarIcon";
import { formatSandDollarsExact } from "@/lib/sand-dollars";
import { signOutAction } from "./actions";

export default async function MorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /* THE BALANCE HAS A HOME HERE NOW. The header pill folds at the largest
     text sizes — the streak chip and the wordmark are the floor — so the
     number has to be reachable without it. Exact, with separators: this is a
     menu you arrive at on the way to spending something. */
  const { data: balanceRow } = await supabase
    .from("sand_dollar_balance")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  /* The same count the More tab's dot is derived from, so the dot and the
     number it resolves to can never disagree. RLS (0030) scopes it to this
     user's own mail without a filter here. */
  const { count: unreadCount } = await supabase
    .from("notification")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  const { data: memberships } = await supabase
    .from("membership")
    .select("role, app_user:user_id(full_name)")
    .eq("user_id", user.id)
    .eq("active", true);

  const roles = new Set((memberships ?? []).map((m) => m.role as string));
  const isAdmin = roles.has("admin");
  /* A MANAGER IS NOT AN ADMIN, and that distinction is the whole reason the
     closure calendar was unreachable for the people who own it. The admin
     block below gates on `admin`; anything a manager owns has to gate on
     this instead. An admin manages too, so the roles are inclusive. */
  const isManager = roles.has("manager") || isAdmin;

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
        <Link
          href="/sand-dollars"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-pill bg-gold-soft/60 px-3 py-1.5 text-navy transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <SandDollarIcon size={18} className="shrink-0" />
          <span className="ediagd-numeral text-sm font-extrabold tabular-nums">
            {formatSandDollarsExact(balanceRow?.balance == null ? 0 : Number(balanceRow.balance))}
          </span>
          <span className="text-sm font-bold text-ink-soft">Sand Dollars</span>
        </Link>

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
        {/*
          THE HEADER'S SECOND HOME.
          The bell and the avatar left the header entirely when the streak chip
          took that slot; the Sand Dollars pill also folds up here at the
          largest text sizes. These rows are listed unconditionally rather than
          only when the header has dropped something: a menu whose contents
          change with the font size is a menu nobody can learn.

          AND THIS IS WHERE THE DOT CASHES OUT. The More tab carries a dot when
          something is unread, which says "there is something here" and then,
          Ryan: "when you go there it doesn't indicate which menu you need to
          click on." A dot that hands you a menu of nine rows and no direction
          has only moved the question.

          A COUNT IS ALLOWED HERE, and that is not a reversal of the no-badge
          rule. The rule is against ambient guilt — a number in the chrome of
          every screen, telling you how far behind you are whether you asked or
          not. This is a screen somebody deliberately opened; by the time they
          are reading it they have asked. The exact figure rather than a capped
          "9+", too: in here there is room, and 14 tells you something about
          your morning that "9+" does not.
        */}
        <li>
          <LinkRow
            href="/notifications"
            label="Alerts"
            hint="Wins, nudges and anything waiting for you"
            count={Number(unreadCount ?? 0)}
          />
        </li>
        <li>
          <LinkRow
            href="/profile"
            label="Your account"
            hint="Name, password, schedule and reminders"
          />
        </li>
      </ul>

      {/* THE MANAGER'S TOOLS. Above the admin block and behind a different
          flag, because a service manager holds neither `admin` nor the
          platform-owner bit and would otherwise see none of this. */}
      {isManager && (
        <>
          <h2 className="mt-6 px-1 text-xs font-bold uppercase tracking-[0.18em] text-ink-soft">
            Your store
          </h2>
          <ul className="mt-2 space-y-2">
            {MANAGER_TOOLS.map((tool) => (
              <li key={tool.href}>
                <LinkRow {...tool} />
              </li>
            ))}
          </ul>
        </>
      )}

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
  count = 0,
}: {
  href: string;
  label: string;
  hint: string;
  /** Unread items behind this row. Rendered only when there are some. */
  count?: number;
}) {
  return (
    <Card>
      <Link
        href={href}
        /* The count goes in the accessible name rather than being left to a
           bubble a screen reader would read as a bare number after the hint. */
        aria-label={count > 0 ? `${label} — ${count} unread` : undefined}
        className="flex items-center gap-3 p-4 transition hover:bg-teal-soft/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold text-navy">{label}</span>
          <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>
        </span>
        {count > 0 && (
          /* Gold because the inbox is win-first — an unread notification here
             is more often a badge earned than a problem, and the chrome should
             not imply otherwise. Same colour as the dot it resolves. */
          <span
            aria-hidden="true"
            className="ediagd-numeral flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-pill bg-gold px-2 text-xs font-extrabold tabular-nums text-navy"
          >
            {count}
          </span>
        )}
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
