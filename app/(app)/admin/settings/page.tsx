import { redirect } from "next/navigation";
import { Card } from "@/components/brand/Card";
import { getAdminContext } from "@/lib/guards";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminsOnly } from "@/components/admin/content/AdminsOnly";
import { GameSettingsForm } from "@/components/admin/settings/GameSettingsForm";
import { GAME_SETTING_FIELDS, type GameSettingsValues } from "@/lib/game-settings";

export default async function GameSettingsPage() {
  const { supabase, userId, isAdmin } = await getAdminContext();
  if (!userId) redirect("/login");
  if (!isAdmin) return <AdminsOnly />;

  const { data, error } = await supabase
    .from("game_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return (
      <main className="mx-auto max-w-app px-4 py-10">
        <Card className="p-6">
          <h1 className="text-lg font-extrabold text-navy">
            Settings aren&apos;t available
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            We couldn&apos;t read the gamification settings row.
            {error ? ` Detail: ${error.message}` : ""}
          </p>
        </Card>
      </main>
    );
  }

  const row = data as Record<string, unknown>;
  const initial = Object.fromEntries(
    GAME_SETTING_FIELDS.map((f) => [f.key, Number(row[f.key] ?? 0)])
  ) as GameSettingsValues;

  return (
    <main className="mx-auto max-w-app px-4 pb-12 pt-5">
      <AdminPageHeader
        back={{ href: "/admin", label: "Admin" }}
        eyebrow="Admin tools"
        title="Gamification settings"
        subtitle="The engine reads these at runtime — changes take effect on the next completed day, with no deploy. Amounts already awarded stay as they were."
      />

      <GameSettingsForm initial={initial} />
    </main>
  );
}
