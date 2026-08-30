import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/brand/Card";
import { SaveHeart } from "@/components/daily/SaveHeart";
import { LongCopy } from "@/components/brand/LongCopy";

/* ============================================================================
   EDIAGD — the things you kept

   THE SHELF THE HEART PUTS THINGS ON. Saving shipped before this did, which
   made the control a gesture with no destination: an advisor could keep a quote
   and then had no way in the app to ever see it again. A save that cannot be
   revisited is not a save, it is a write.

   Quotes and cues both, in one list, newest first. They are different content
   types but the same act — "I want this again" — and splitting them would make
   an advisor remember which kind of thing a line was before they could find it.
   ============================================================================ */

export default async function SavedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /*
   * The embed carries everything the card renders, so this is one round trip.
   * RLS does the scoping: the policy in 0059 is `user_id = auth.uid()` with no
   * manager or admin read at all, so there is no filter here that could be
   * forgotten and no way for this list to show somebody else's shelf.
   */
  const { data } = await supabase
    .from("saved_content")
    .select(
      "id, saved_at, content:content_id(id, type, title, body, voice, coaching_nugget)"
    )
    .order("saved_at", { ascending: false })
    .limit(200);

  const items = (data ?? []).map((r) => {
    const embed = r.content as unknown;
    const c = (Array.isArray(embed) ? embed[0] : embed) as {
      id: string;
      type: string;
      title: string;
      body: string | null;
      voice: string | null;
      coaching_nugget: string | null;
    } | null;
    return { savedAt: r.saved_at as string, content: c };
  }).filter((i) => i.content);

  return (
    <main className="mx-auto max-w-app px-4 pb-8 pt-6">
      <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-ink-soft">
        Saved
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        {items.length === 0
          ? "Nothing kept yet."
          : `${items.length} ${items.length === 1 ? "thing" : "things"} you wanted again.`}
      </p>

      {items.length === 0 ? (
        <Card className="mt-4 p-6">
          <p className="text-base font-extrabold text-navy">
            Tap the heart on anything worth keeping
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Quotes and coaching cues from the daily loop land here, so a line
            that hits on a Tuesday is still there on a Friday.
          </p>
        </Card>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map(({ savedAt, content: c }) => (
            <li key={c!.id}>
              <Card className="p-5">
                {c!.type === "quote" ? (
                  <>
                    {/* A quote is the words. Its `title` is a filing label
                        ("Never Quit"), not something to read, so it does not
                        go on screen — the same reason the daily loop leads
                        with the body. */}
                    <p className="text-lg font-semibold leading-relaxed text-navy">
                      {c!.body ?? c!.title}
                    </p>
                    {c!.voice && (
                      <p className="mt-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">
                        {c!.voice}
                      </p>
                    )}
                    {c!.coaching_nugget && (
                      <div className="mt-4 border-t border-line pt-3">
                        <LongCopy text={c!.coaching_nugget} className="text-sm" />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-base font-extrabold text-navy">{c!.title}</p>
                    {c!.body && <LongCopy text={c!.body} className="mt-2 text-sm" />}
                  </>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                  {/* Filled, and un-tapping it removes the row on the next
                      load. The heart is the only control here on purpose:
                      this is a shelf, not an editor. */}
                  <SaveHeart contentId={c!.id} initialSaved label="Keep this" />
                  <span className="text-xs text-ink-soft">
                    {new Date(savedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
