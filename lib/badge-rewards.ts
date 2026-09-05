/* ============================================================================
   EDIAGD — what each badge is worth
   SERVER ONLY (takes a Supabase client).

   Read, never hardcoded. For the badges the engine actually pays, the amount
   comes from game_settings — the same row completeDay() reads at runtime, so
   the wall can't promise a number the engine won't pay. For badges no code path
   awards yet, the catalog's own sand_dollars column is the best available
   figure.
   ============================================================================ */

type Client = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

/** Badge key -> the game_settings column the engine pays it from. */
const SETTINGS_COLUMN: Record<string, string> = {
  first_light: "sand_badge",
  /* completeDay pays this from settings.sandBadge like First Light, so the
     catalog column is the wrong number to quote the moment an admin edits the
     setting. */
  free_surf: "sand_badge",
  swell_7: "sand_swell_7",
  swell_30: "sand_swell_30",
  swell_90: "sand_swell_90",
  swell_365: "sand_swell_365",
};

export async function loadBadgeRewards(
  client: Client
): Promise<Record<string, number>> {
  const [{ data: settings }, { data: catalog }] = await Promise.all([
    client.from("game_settings").select("*").limit(1).maybeSingle(),
    client.from("badge").select("key, sand_dollars"),
  ]);

  const rewards: Record<string, number> = {};

  // Catalog first — covers every badge that has a row.
  for (const row of (catalog ?? []) as { key: string; sand_dollars: number }[]) {
    rewards[row.key] = Number(row.sand_dollars ?? 0);
  }

  // Then let game_settings win wherever the engine actually pays from it.
  if (settings) {
    const row = settings as Record<string, unknown>;
    for (const [key, column] of Object.entries(SETTINGS_COLUMN)) {
      const value = row[column];
      if (value != null) rewards[key] = Number(value);
    }
  }

  return rewards;
}
