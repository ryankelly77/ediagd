/* ============================================================================
   EDIAGD — the provisioning checks, in one place

   Lifted out of scripts/provision-advisor.ts and scripts/grant-beaumont-roles.ts
   so that scripts/provision-roster.ts can run the SAME checks over a whole store
   rather than carrying a second copy of them. All three import this; none of
   them re-implements any of it.

   ---------------------------------------------------------------------------
   EVERY CHECK RETURNS A RESULT. NOTHING HERE EXITS THE PROCESS.
   ---------------------------------------------------------------------------
   That is the one behavioural change the lift required, and it is the reason
   the lift is worth doing. The two original scripts provision ONE person, so a
   refusal there is the end of the run and `process.exit(1)` was a fair way to
   say so. The roster runner provisions a store: one bad op code in row four
   must refuse row four and still report rows five to nine, or a store launch
   becomes nine separate investigations.

   So the checks answer `{ ok: true, value }` or `{ ok: false, reason, hint }`,
   and each caller decides what a refusal means. provision:advisor still dies on
   the first one; the roster runner records it, skips the row, and carries on.

   ---------------------------------------------------------------------------
   THE DANGEROUS CHECK IS THE OP CODE, AND IT IS WHY THIS FILE EXISTS
   ---------------------------------------------------------------------------
   The failure these guard against is not a write that fails. It is a write that
   SUCCEEDS and silently binds an advisor to a stranger's DMS book — which is
   indistinguishable, from inside the product, from a deliberate test account.
   `membership.op_code_id` pointed four accounts at other people's books exactly
   this way. Three checks stand between a roster row and that outcome:

     resolveRooftop      the store exists and is named unambiguously
     resolveOperator     the op code is a real operator AT THAT ROOFTOP, and
                         has not departed
     opCodeHeldByOthers  nobody else already holds it

   and then `whoseBook()` reads the name back, because a check that passes is
   not the same as a mapping somebody has looked at.
   ============================================================================ */
import type { SupabaseClient } from "@supabase/supabase-js";

/* The service-role client. Typed loosely on purpose: these scripts predate any
   generated types and inventing them here would be a third thing to keep in
   step with the schema. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sb = SupabaseClient<any, any, any>;

export type Ok<T> = { ok: true; value: T };
export type Refusal = { ok: false; reason: string; hint?: string };
export type Result<T> = Ok<T> | Refusal;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const refuse = (reason: string, hint?: string): Refusal => ({ ok: false, reason, hint });

/* ---------------------------------------------------------------------------
   Auth
--------------------------------------------------------------------------- */

export type AuthUser = {
  id: string;
  email: string | null;
  /** Null until they have set a password / confirmed. */
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
};

/**
 * Find an auth user by email.
 *
 * PAGED, because there is no server-side email filter on listUsers. Lifted
 * verbatim from provision-advisor.ts, where the comment said the same thing.
 *
 * Matching is on the lowercased address, which is why the roster file asks for
 * lowercase emails: Supabase stores what it was given and two spellings of one
 * address would be two accounts.
 */
export async function findAuthUserByEmail(sb: Sb, email: string): Promise<AuthUser | null> {
  const wanted = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === wanted);
    if (hit) {
      return {
        id: hit.id,
        email: hit.email ?? null,
        emailConfirmedAt: hit.email_confirmed_at ?? null,
        lastSignInAt: hit.last_sign_in_at ?? null,
      };
    }
    if (data.users.length < 1000) return null;
  }
}

/* ---------------------------------------------------------------------------
   The rooftop
--------------------------------------------------------------------------- */

export type Rooftop = { id: string; name: string; orgId: string | null };

/**
 * Resolve a rooftop BY NAME, refusing ambiguity.
 *
 * A name is for printing, never for matching — so this is the one place a name
 * is allowed to be a key, it asserts exactly one row came back, and everything
 * downstream carries the id. Two rooftops sharing a name is a refusal, not a
 * first-match.
 */
export async function resolveRooftop(sb: Sb, name: string): Promise<Result<Rooftop>> {
  const { data, error } = await sb.from("rooftop").select("id, name, org_id").eq("name", name);
  if (error) return refuse(`rooftop lookup failed: ${error.message}`);
  if (!data?.length) return refuse(`no rooftop named ${JSON.stringify(name)}`);
  if (data.length > 1) {
    return refuse(
      `${data.length} rooftops named ${JSON.stringify(name)}`,
      "Rooftop names are not unique in the data; this needs an id, not a name."
    );
  }
  return ok({ id: data[0].id as string, name: data[0].name as string, orgId: (data[0].org_id as string) ?? null });
}

/** Every rooftop in an org, for an `admin:org` grant. Read from the org, never
    from a list that goes stale — eleven today, and that number is not ours. */
export async function orgRooftops(sb: Sb, orgId: string): Promise<Result<Rooftop[]>> {
  const { data, error } = await sb
    .from("rooftop")
    .select("id, name, org_id")
    .eq("org_id", orgId)
    .order("name");
  if (error) return refuse(`org rooftops: ${error.message}`);
  if (!data?.length) return refuse(`no rooftops in org ${orgId}`);
  return ok(data.map((r) => ({ id: r.id as string, name: r.name as string, orgId: (r.org_id as string) ?? null })));
}

/* ---------------------------------------------------------------------------
   The op code — the dangerous one
--------------------------------------------------------------------------- */

export type Operator = {
  opId: string;
  displayName: string | null;
  lastSeen: string | null;
  departedOn: string | null;
};

/** The op code must be a real, undeparted operator AT THIS ROOFTOP. An op code
    from another store resolves to nothing and the pitch slot stays empty for
    ever — silently, which is the whole problem. */
export async function resolveOperator(
  sb: Sb,
  rooftop: Rooftop,
  op: string
): Promise<Result<Operator>> {
  const { data, error } = await sb
    .from("dms_advisor")
    .select("advisor_op_id, display_name, last_seen, departed_on")
    .eq("rooftop_id", rooftop.id)
    .eq("advisor_op_id", op)
    .maybeSingle();
  if (error) return refuse(`dms_advisor: ${error.message}`);
  if (!data) {
    return refuse(
      `op code ${op} is not an operator at ${rooftop.name}`,
      "An op code from another rooftop resolves to nothing and the pitch slot stays empty forever."
    );
  }
  if (data.departed_on) {
    return refuse(`op code ${op} (${data.display_name}) departed on ${data.departed_on}`);
  }
  return ok({
    opId: data.advisor_op_id as string,
    displayName: (data.display_name as string) ?? null,
    lastSeen: (data.last_seen as string) ?? null,
    departedOn: null,
  });
}

/** Already held by somebody else? Two accounts on one book is legitimate for
    owners, but it has to be said explicitly rather than happen by accident. */
export async function opCodeHeldByOthers(
  sb: Sb,
  op: string,
  exceptUserId: string | null
): Promise<Result<null>> {
  const { data, error } = await sb
    .from("membership")
    .select("user_id, app_user:user_id(full_name)")
    .eq("op_code_id", op)
    .eq("active", true);
  if (error) return refuse(`membership check: ${error.message}`);
  const others = (data ?? []).filter((h) => h.user_id !== exceptUserId);
  if (others.length) {
    const who = others
      .map((h) => (h.app_user as { full_name?: string } | null)?.full_name ?? String(h.user_id).slice(0, 8))
      .join(", ");
    return refuse(
      `op code ${op} is already held by ${who}`,
      "Two accounts on one book is legitimate for owners, but say so explicitly rather than by accident."
    );
  }
  return ok(null);
}

/**
 * Whose numbers this mapping will show, and whether that looks like the right
 * person.
 *
 * THE READ-BACK IS THE POINT, NOT THE WRITES. A provisioning tool that cannot
 * answer "whose book is this" has not solved the problem, it has industrialised
 * it. Ryan reads sixty of these and spots the wrong one; nothing else in the
 * system can.
 *
 * `nameMatches` is deliberately a weak, generous test — any word over two
 * characters appearing in the DMS display name. It exists to make a MISMATCH
 * loud, not to certify a match, and a false "matches" is worse than a false
 * "does not", so it errs toward the louder answer.
 */
export function whoseBook(
  operator: Operator,
  accountName: string | null
): { line: string; nameMatches: boolean } {
  const words = (accountName ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const display = (operator.displayName ?? "").toLowerCase();
  const nameMatches = words.some((w) => display.includes(w));
  return {
    nameMatches,
    line:
      `op ${operator.opId} = ${operator.displayName ?? "(no name)"}` +
      `  last seen ${operator.lastSeen ?? "never"}` +
      `  ${nameMatches ? "name matches" : "NAME DOES NOT MATCH — deliberate borrow, or a mistake?"}`,
  };
}

/* ---------------------------------------------------------------------------
   The writes
--------------------------------------------------------------------------- */

export type WriteOutcome = "created" | "exists" | "updated";

/**
 * `app_user`, keyed on the AUTH id.
 *
 * That key is why the auth user has to exist first and cannot be created
 * afterwards: `app_user.id` IS the auth id, so there is no row to write until
 * Supabase has minted one.
 */
export async function ensureAppUser(
  sb: Sb,
  userId: string,
  fullName: string | null,
  dry: boolean
): Promise<Result<WriteOutcome>> {
  const { data, error } = await sb.from("app_user").select("id, full_name").eq("id", userId).maybeSingle();
  if (error) return refuse(`app_user read: ${error.message}`);
  if (data) return ok("exists");
  if (dry) return ok("created");
  const { error: insErr } = await sb.from("app_user").insert({ id: userId, full_name: fullName });
  if (insErr) return refuse(`app_user insert: ${insErr.message}`);
  return ok("created");
}

/**
 * One membership row.
 *
 * NEVER REPOINTS A BOOK — but MAPPING ONE IS NOT REPOINTING, and the
 * difference is the whole rule:
 *
 *   current === target            exists, writes nothing
 *   current is null, target set   UPDATES — this is mapping a book onto a
 *                                 membership that never had one
 *   anything else                 REFUSES, including set -> null
 *
 * THE ASYMMETRY IS DELIBERATE AND IT WAS NEARLY WRONG. The first version of
 * this refused every change, which reads like the safer rule and is not: the
 * documented job of `provision:advisor` includes exactly the null -> op code
 * step. beaumont-first.md has two people waiting on it — "one provision:advisor
 * run maps Sztaba when a period carries 831000", and Pinder maps to 500573 once
 * the light-track floor is live. Both of those advisors hold a membership with
 * no op code today. A blanket refusal would have broken the script's purpose
 * while looking like caution, and the dry run is what caught it.
 *
 * What stays refused is the dangerous direction: moving somebody who already
 * reads one operator's numbers onto another's, which is the failure
 * `membership.op_code_id` already produced four times. Clearing a book is
 * refused too — it is reachable by a typo'd re-run and silently empties
 * somebody's pitch slot.
 */
export async function ensureMembership(
  sb: Sb,
  userId: string,
  rooftopId: string,
  role: string,
  opCodeId: string | null,
  dry: boolean
): Promise<Result<WriteOutcome>> {
  const { data, error } = await sb
    .from("membership")
    .select("id, op_code_id, active")
    .eq("user_id", userId)
    .eq("rooftop_id", rooftopId)
    .eq("role", role)
    .maybeSingle();
  if (error) return refuse(`membership read: ${error.message}`);

  if (data) {
    const current = (data.op_code_id as string | null) ?? null;
    const mapping = current === null && opCodeId !== null;

    if (current !== opCodeId && !mapping) {
      return refuse(
        `a ${role} membership already exists with op code ${current ?? "none"}, not ${opCodeId ?? "none"}`,
        current === null
          ? "Nothing to clear."
          : "This never repoints a book — moving somebody onto another operator's numbers is the failure every check here guards. Clear the membership deliberately if that is really the intent."
      );
    }

    const needsWrite = mapping || !data.active;
    if (!needsWrite) return ok("exists");
    if (dry) return ok("updated");
    const { error: upErr } = await sb
      .from("membership")
      .update({ ...(mapping ? { op_code_id: opCodeId } : {}), active: true })
      .eq("id", data.id);
    if (upErr) return refuse(`membership update: ${upErr.message}`);
    return ok("updated");
  }

  if (dry) return ok("created");
  const { error: insErr } = await sb.from("membership").insert({
    user_id: userId,
    rooftop_id: rooftopId,
    role,
    op_code_id: opCodeId,
    active: true,
  });
  if (insErr) return refuse(`membership insert: ${insErr.message}`);
  return ok("created");
}

/** `advisor_base` on the rooftop, or the advisor sees no content at all. */
export async function ensureRooftopProduct(
  sb: Sb,
  rooftopId: string,
  dry: boolean
): Promise<Result<WriteOutcome>> {
  const { data, error } = await sb
    .from("rooftop_product")
    .select("product")
    .eq("rooftop_id", rooftopId)
    .eq("product", "advisor_base")
    .maybeSingle();
  if (error) return refuse(`rooftop_product read: ${error.message}`);
  if (data) return ok("exists");
  if (dry) return ok("created");
  const { error: insErr } = await sb
    .from("rooftop_product")
    .insert({ rooftop_id: rooftopId, product: "advisor_base" });
  if (insErr) return refuse(`rooftop_product insert: ${insErr.message}`);
  return ok("created");
}

/* ---------------------------------------------------------------------------
   The roles column
--------------------------------------------------------------------------- */

export type Role =
  | { kind: "advisor"; opCode: string | null }
  | { kind: "manager" }
  | { kind: "admin"; scope: "rooftop" | "org" };

/**
 * Parse the roster's `roles` cell.
 *
 * The grammar is the one grant-beaumont-roles already thinks in, written down:
 *
 *   advisor                 advisor, no op code — the two-slot morning, by design
 *   advisor:500570          advisor mapped to that operator's book
 *   manager                 manager at the row's rooftop
 *   admin                   admin at the row's rooftop
 *   admin:org               admin at EVERY rooftop in the row's rooftop's org
 *   manager;advisor:500570  several, separated by semicolons
 *
 * UNKNOWN ROLES ARE A REFUSAL, not a skip. A typo'd role in a store launch is a
 * person who quietly gets nothing, and the roster is the one artefact where
 * that has to be impossible.
 *
 * `admin:org` is never `is_platform_owner` — that flag is Ryan and Mitch and
 * sees every customer on the platform. There is deliberately no spelling of it
 * in this grammar.
 */
export function parseRoles(spec: string): Result<Role[]> {
  const parts = spec.split(";").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return refuse("no roles given");
  const out: Role[] = [];
  for (const part of parts) {
    const [rawKind, rawArg] = part.split(":").map((s) => s.trim());
    const kind = rawKind.toLowerCase();
    if (kind === "advisor") {
      if (rawArg && !/^[0-9]+$/.test(rawArg)) {
        return refuse(`advisor op code ${JSON.stringify(rawArg)} is not numeric`);
      }
      out.push({ kind: "advisor", opCode: rawArg || null });
    } else if (kind === "manager") {
      if (rawArg) return refuse(`manager takes no argument, got ${JSON.stringify(rawArg)}`);
      out.push({ kind: "manager" });
    } else if (kind === "admin") {
      if (rawArg && rawArg.toLowerCase() !== "org") {
        return refuse(`admin takes no argument or ':org', got ${JSON.stringify(rawArg)}`);
      }
      out.push({ kind: "admin", scope: rawArg?.toLowerCase() === "org" ? "org" : "rooftop" });
    } else {
      return refuse(
        `unknown role ${JSON.stringify(part)}`,
        "Known: advisor, advisor:<opcode>, manager, admin, admin:org — separated by ';'."
      );
    }
  }
  /* The same role twice would make the second write a no-op that reads as a
     success; say so instead. */
  const seen = new Set<string>();
  for (const r of out) {
    const key = r.kind === "admin" ? `admin:${r.scope}` : r.kind;
    if (seen.has(key)) return refuse(`role ${key} appears twice`);
    seen.add(key);
  }
  return ok(out);
}

/** How a role is written back out, for a plan line. */
export function describeRole(r: Role): string {
  if (r.kind === "advisor") {
    return r.opCode ? `advisor on op ${r.opCode}` : "advisor (no op code — two-slot morning by design)";
  }
  if (r.kind === "manager") return "manager";
  return r.scope === "org" ? "admin at every rooftop in the org" : "admin at this rooftop";
}
