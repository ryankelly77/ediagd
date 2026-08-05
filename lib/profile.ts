/* ============================================================================
   EDIAGD — account management shared types and limits
   Client-safe. These live here rather than in the actions file because a
   "use server" module may only export ASYNC FUNCTIONS — exporting a constant
   or a type from it fails the build.
   ============================================================================ */

export type ProfileResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export const NAME_MAX = 80;
export const PASSWORD_MIN = 8;
