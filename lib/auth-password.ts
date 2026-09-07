/* ============================================================================
   EDIAGD — the password rule, in one place

   Supabase enforces this server-side (supabase/config.toml:
   minimum_password_length = 6). This exists so the SCREEN can say the rule in
   advance rather than letting somebody type a password, submit, and be told by
   an API error what they should have known before they started.

   IT IS NOT THE BOUNDARY. If the two ever disagree the database wins and the
   user sees an error — which is exactly why the number is written down once and
   imported, rather than typed into a form and forgotten when the config moves.
   ============================================================================ */

/** Matches `minimum_password_length` in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 6;

/** Returns a sentence somebody can act on, or null when the pair is fine. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "Those two don't match.";
  }
  return null;
}
