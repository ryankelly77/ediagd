# A `for all` policy is a write policy, and the obvious check misses it

**A main concern, raised from the `ediagd-manager` branch and handed to the Sync
agent via Ryan.** Found while writing `0182`; it is not confined to that
migration and nothing on this branch can fix it.

Nothing is swept here. This document states the defect, bounds the exposure, and
lists what needs auditing. The audit is somebody else's to run, deliberately —
every table named below is reachable from migrations this branch does not own.

---

## The defect, in one query

The natural way to assert "this migration gave nobody a write" — and the way the
codebase currently writes it — is:

```sql
select count(*) into _writes
  from pg_policy
 where polrelid = '<table>'::regclass
   and polcmd in ('a', 'w', 'd');
if _writes <> 0 then
  raise exception '<table> gained % write policies', _writes;
end if;
```

`pg_policy.polcmd` holds a single character: `r` select, `a` insert, `w` update,
`d` delete, and **`*` for a policy declared `for all`**. A `for all` policy grants
all three writes, and it reports `*` — which is **not in that list**.

So on any table whose write access arrives through a `for all` policy, that query
returns **zero**, the assertion passes, and the migration reports that nobody can
write a table whose admins have had full write access for a hundred migrations.

**This is a false pass, which is the dangerous direction.** `AGENTS.md` already
records why: a false refusal survives review because it wears the costume of
care, and *a false pass survives because it looks like success*. Nobody
investigates a green check.

---

## Where it actually bites today, measured

**Scope stated before the finding.** Measured by listing `pg_policy` joined to
`pg_class` on the local Supabase database at migration `0180`, over schema
`public` only. The policy *set* comes from the migration chain, so it is a fact
about the chain rather than about local data — but it was read from one database
at one version, and a table added after `0180` is outside it.

**One migration uses the idiom:** `0179_managers_read_their_advisors_completions`,
at line 194.

**On its own table, `0179` is correct.** `module_completion` carries exactly one
policy and it is select-only, so there was no `for all` policy to miss. The
assertion is right, and it is right by luck of the subject rather than by
construction.

**That makes this a propagation risk rather than a live wrong answer**, and the
propagation is already in motion: `0179` is the newest and cleanest policy
migration in the tree, it is explicitly the shape `reports/MANAGER-MEETINGS-PLAN.md`
tells slice 1 to copy, and the plan's own instruction was to copy its assertion
block. `0182` was written from it and inherited the bug, which is how this was
found — the check failed against a correct schema on the first replay.

### `0179` already knows `*` matters, twenty lines earlier

This is the sharpest part and the reason it is worth a document. The same `do`
block contains both of these:

```sql
   and polcmd in ('r', '*');     -- counting SELECT policies  — correct
   and polcmd in ('a', 'w', 'd') -- counting WRITE policies   — misses '*'
```

The first one is right: a `for all` policy *does* grant select, so it must count
as a select policy. The second forgets the identical fact about writes. The
knowledge was present in the file and was applied to one half of the question.

A convention closes a case; a construction closes a class. Two hand-written
character lists twenty lines apart, which must agree about what `*` means and
do not, is the convention.

---

## The 25 tables that carry a `for all` policy

Any assertion of the form above, run against one of these, returns zero and means
nothing. **25 tables, 27 policies** — `content` and `game_settings` carry two
each.

| table | `for all` policy |
|---|---|
| `advisor_focus_family` | `advisor_focus_family_admin_write` |
| `certification` | `certification_write` |
| `certification_course` | `certification_course_write` |
| `certification_prerequisite` | `certification_prerequisite_write` |
| `coaching_block` | `coaching_block_admin_write` |
| `content` | `content_admin_all` |
| `content` | `content_platform_all` |
| `content_review` | `content_review_admin_all` |
| `content_text_version` | `content_text_version_admin` |
| `content_version` | `content_version_admin` |
| `course` | `course_write` |
| `dms_op_code_map` | `dms_op_code_map_owner` |
| `game_settings` | `game_settings_admin_write` |
| `game_settings` | `game_settings_platform_write` |
| `mapping_alias` | `mapping_alias_admin_write` |
| `module` | `module_write` |
| `mux_upload` | `mux_upload_admin_all` |
| `op_code_catalog` | `op_code_catalog_admin` |
| `op_code_family` | `op_code_family_admin_write` |
| `op_text_rule` | `op_text_rule_admin_write` |
| `quiz_question` | `quiz_question_admin` |
| `quiz_question_text_version` | `quiz_question_text_version_admin` |
| `quote_duplicate_group` | `quote_duplicate_group_admin_all` |
| `quote_duplicate_member` | `quote_duplicate_member_admin_all` |
| `quote_duplicate_suppression` | `quote_duplicate_suppression_admin_all` |
| `saved_content` | `saved_self_all` |
| `swag_item` | `swag_item_admin_write` |

Two are worth calling out because a false "nobody can write this" about them
would be worse than average:

- **`content`** carries two `for all` policies, and `0178` has just finished a
  whole migration about the cost of touching its RLS. An assertion that reported
  `content` as unwritable would be wrong about the most heavily policed table in
  the schema.
- **`game_settings`** is the single row the gamification economy reads. `0182`'s
  sibling slices add a column to it (`manager_meeting_repeat_weeks`), so a future
  slice on this branch will be writing assertions against a table on this list.

---

## What `0182` does, and it is not the general fix

`0182_a_manager_reads_the_op_code_catalog.sql` counts `'*'` as a write:

```sql
   and polcmd in ('a', 'w', 'd', '*');
```

and expects **exactly one** — `op_code_catalog_admin`, still keyed on
`membership.role = 'admin'` — rather than zero, because admin write on that table
is correct and pre-existing. It also asserts the write policy's *predicate* has
not acquired `managed_rooftops()`, so a read widening cannot leak into the write
side. Both arms were proved to fire by deliberately breaking them in rolled-back
transactions.

**That fixes one migration. It does not fix the idiom**, and a per-migration
character list is the thing that produced the defect. The general fix belongs
where the question is asked, not in each asker.

---

## Recommendation, for the Sync agent

1. **Audit the write-count assertions.** Today that is `0179` line 194. It is
   correct on its own table, so this is a correctness-preserving edit, and the
   reason to make it anyway is that `0179` is the file everybody copies.
2. **Prefer a helper over a character list.** A single
   `policy_write_count(regclass)` — or a documented snippet — that enumerates
   `('a','w','d','*')` once removes the chance of the two lists disagreeing. The
   same argument applies to the select side: `('r','*')`.
3. **Take permission claims from a listing, never from a grep.** The companion
   error that found this one: the plan asserted `op_code_catalog_read` was the
   only select policy on its table, having grepped for that policy's *name*.
   `select polname, polcmd from pg_policy where polrelid = '<t>'::regclass`
   returns two rows. A grep for a name can only find the name you already thought
   of.
4. **The open question, recorded so it survives:** *which other assertions in the
   chain count policies by `polcmd` without accounting for `*`?*

   Answered for `supabase/migrations/`: one, `0179` line 194, and it is correct on
   its own table. Answered for `scripts/entitlement-parity.{sql,body.sql,run.sh}`:
   **not exposed** — checked, and they contain no reference to `pg_policy` or
   `polcmd` at all. They compare what the policies on `content` *let an advisor
   read* against `content_entitled_for`, which is behaviour rather than a
   catalogue count, so the idiom does not appear there.

   **Not** answered for the other 23 tables, in the sense that no assertion has
   been written about them yet — the exposure is future migrations copying `0179`,
   which is the whole reason this is a document and not a one-line patch.

---

*Written 11 November 2026 from `~/ediagd-manager`, branch `ediagd-manager`.
Nothing here was applied: `0182` is unapplied on every database, and the local
Supabase used to measure this was restored to its as-found state at `0180`
(policy body and table comment both verified identical to `origin/main`).*
