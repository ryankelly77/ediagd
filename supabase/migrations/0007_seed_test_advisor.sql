-- ============================================================================
-- EDIAGD — 0007 Test advisor membership (DEV SEED)
-- The test account is an 'admin' with no DMS op code, so /advisor had nothing
-- to resolve once the dev fallback was removed. Give it an advisor membership
-- pointed at Esparza (35122) so the screen renders real numbers for a signed-in
-- advisor.
--
-- This is environment-specific seed data, not schema. Drop it before this
-- migration set is used to stand up a customer database.
-- ============================================================================

-- link the existing test user to Esparza (35122) as an advisor at the test rooftop
insert into membership (user_id, rooftop_id, role, op_code_id)
values ('78929620-f92b-416f-80ac-41fcc3a6e3e8',
        '22222222-2222-2222-2222-222222222222', 'advisor', '35122')
on conflict (user_id, rooftop_id, role) do update set op_code_id = excluded.op_code_id;
