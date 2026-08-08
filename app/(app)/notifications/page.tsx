import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { markAllRead, setNotificationChannel } from "@/lib/notifications/actions";
import {
  INBOX_PAGE_SIZE,
  loadChannelPreference,
  loadInbox,
} from "@/lib/notifications/service";
import type { Notification, NotificationSeverity } from "@/lib/notifications/types";

/* ============================================================================
   EDIAGD — the inbox

   Wins at the top, always. The brand book's "celebrate up, never punish down"
   is not decoration here: a coach who opens this and sees good news first is
   being handed something to say on the drive. One that opens on a list of
   failings is being handed an inspection round, which is the thing the whole
   product argues against.

   Gold for wins, clay for concerns. Never red — clay is "worth a conversation",
   red is "you are in trouble", and only one of those starts a conversation.
   ============================================================================ */

const SEVERITY_STYLE: Record<
  NotificationSeverity,
  { label: string; color: string; tint: string }
> = {
  win: {
    label: "Worth celebrating",
    color: "rgb(var(--ediagd-gold))",
    tint: "color-mix(in srgb, rgb(var(--ediagd-gold)) 14%, transparent)",
  },
  info: {
    label: "For information",
    color: "rgb(var(--ediagd-ocean))",
    tint: "color-mix(in srgb, rgb(var(--ediagd-ocean)) 12%, transparent)",
  },
  concern: {
    label: "Worth a conversation",
    color: "rgb(var(--ediagd-clay))",
    tint: "color-mix(in srgb, rgb(var(--ediagd-clay)) 12%, transparent)",
  },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { show } = await searchParams;
  const limit = Math.min(200, Math.max(INBOX_PAGE_SIZE, Number(show) || INBOX_PAGE_SIZE));

  const [{ rows, total }, preference] = await Promise.all([
    loadInbox(supabase, limit),
    loadChannelPreference(supabase),
  ]);

  const unread = rows.filter((n) => n.readAt == null).length;
  const wins = rows.filter((n) => n.severity === "win");
  const rest = rows.filter((n) => n.severity !== "win");

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <header className="flex items-baseline gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-extrabold text-navy">
          Notifications
        </h1>
        {unread > 0 && (
          <form action={markAllRead}>
            <button
              type="submit"
              className="text-xs font-bold text-ocean underline underline-offset-2 transition hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Mark all read
            </button>
          </form>
        )}
      </header>

      {rows.length === 0 ? (
        <Card className="mt-4 p-6 text-center">
          <p className="text-base font-extrabold text-navy">Nothing waiting</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            Milestones, team wins and anything worth a conversation will land
            here.
          </p>
        </Card>
      ) : (
        <>
          {wins.length > 0 && (
            <>
              <h2 className="ediagd-eyebrow mt-6 px-1">Worth celebrating</h2>
              <div className="mt-2 space-y-2">
                {wins.map((n) => (
                  <NotificationCard key={n.id} notification={n} />
                ))}
              </div>
            </>
          )}

          {rest.length > 0 && (
            <>
              <h2 className="ediagd-eyebrow mt-8 px-1">Worth a conversation</h2>
              <div className="mt-2 space-y-2">
                {rest.map((n) => (
                  <NotificationCard key={n.id} notification={n} />
                ))}
              </div>
            </>
          )}

          {total > rows.length && (
            <a
              href={`/notifications?show=${limit + INBOX_PAGE_SIZE}`}
              className="mt-3 flex w-full items-center justify-center rounded-xl border border-line bg-surface-card p-3.5 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              Show more ({(total - rows.length).toLocaleString()} left)
            </a>
          )}
        </>
      )}

      {/* ---- Delivery preference ------------------------------------------ */}
      <h2 className="ediagd-eyebrow mt-8 px-1">How you get these</h2>
      <Card className="mt-2 p-4">
        <form action={setNotificationChannel} className="flex flex-wrap items-center gap-2">
          {(
            [
              ["in_app", "In the app"],
              ["email", "Email"],
              ["both", "Both"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`inline-flex min-h-[2.5rem] cursor-pointer items-center gap-2 rounded-pill border px-3.5 text-sm font-bold transition ${
                preference === value
                  ? "border-teal bg-teal-soft/30 text-navy"
                  : "border-line bg-surface-card text-ink-soft hover:bg-teal-soft/15"
              }`}
            >
              <input
                type="radio"
                name="channel"
                value={value}
                defaultChecked={preference === value}
                className="sr-only"
              />
              {label}
            </label>
          ))}
          <button
            type="submit"
            className="min-h-[2.5rem] rounded-pill border border-line bg-surface-card px-4 text-sm font-extrabold text-navy transition hover:bg-teal-soft/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Save
          </button>
        </form>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-soft">
          Email isn&apos;t switched on yet — choosing it saves the preference so
          nothing has to be re-asked when it is.
        </p>
      </Card>
    </main>
  );
}

function NotificationCard({ notification }: { notification: Notification }) {
  const style = SEVERITY_STYLE[notification.severity];
  const unread = notification.readAt == null;

  return (
    <Card className={`p-4 ${unread ? "" : "opacity-70"}`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-pill"
          style={{ background: style.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold leading-snug text-navy">
            {notification.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            {notification.body}
          </p>

          {notification.items.length > 0 && (
            <ul className="mt-2.5 space-y-1 rounded-card p-2.5" style={{ background: style.tint }}>
              {notification.items.slice(0, 6).map((item, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-bold text-navy">
                    {item.name}
                  </span>
                  <span className="ediagd-numeral shrink-0 text-xs text-ink-soft">
                    {item.detail}
                  </span>
                </li>
              ))}
              {notification.items.length > 6 && (
                <li className="text-xs text-ink-soft">
                  and {notification.items.length - 6} more
                </li>
              )}
            </ul>
          )}

          <p className="mt-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: style.color }}>
            {style.label}
          </p>
        </div>
      </div>
    </Card>
  );
}
