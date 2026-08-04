-- 0014_timezone_check.sql
-- Validate rooftop.timezone is a real IANA zone at write time. Postgres forbids
-- subqueries in CHECK constraints, so we use a trigger against pg_timezone_names.
-- A typo like 'America/Chicargo' now fails on insert/update, not later inside
-- rooftop_today().
create or replace function validate_rooftop_timezone()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
	raise exception 'invalid timezone: %  (must be a valid IANA zone name)', new.timezone;
  end if;
  return new;
end $$;

drop trigger if exists rooftop_tz_validate on rooftop;
create trigger rooftop_tz_validate
  before insert or update of timezone on rooftop
  for each row execute function validate_rooftop_timezone();