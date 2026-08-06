-- ============================================================================
-- EDIAGD — 0020 Backfill existing Paddle Back Out purchases
--
-- Must run AFTER 0019 has committed — see the note there.
--
-- The backfill is safe because the match is exact rather than a guess. Only
-- buyPaddleOut() ever wrote the note 'Paddle Back Out day', and it always
-- wrote it as a debit, so the three conditions together identify grace-day
-- purchases and nothing else. Genuine manual corrections (the test top-up, the
-- swag cancellation refunds, which carry 'Refund — <item>') don't match and
-- stay 'adjustment', which is now an accurate label for them.
--
-- The note is cleared at the same time. Under the new display rules the note
-- on a paddle_out_purchase row is the DETAIL line ("Bought — now holding 3
-- (was 2)"), while the title comes from the reason. Leaving the old note in
-- place would render the row as "Paddle Back Out day / Paddle Back Out day".
-- The historical bank counts weren't recorded, so there is no detail to
-- reconstruct — these rows simply show the title and the date, which is
-- exactly what they showed before, only now correctly named.
-- ============================================================================

update sand_dollar_entry
   set reason = 'paddle_out_purchase',
       note   = null
 where reason = 'adjustment'
   and amount < 0
   and note = 'Paddle Back Out day';
