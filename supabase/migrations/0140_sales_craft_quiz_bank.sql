/* ===========================================================================
   0140 — THE SALES CRAFT MASTER QUIZ BANK: 114 QUESTIONS, 35 FILMS
   ===========================================================================

   `data/Sales_Craft_Master_Quiz_Bank.xlsx` — three series, none of which had a
   single question in the bank before this. Checked first: zero of the 114 match
   anything in `quiz_question` on deck or film, so all 114 are additions and none
   is a re-import.

   The workbook is internally consistent, which is worth recording because most
   spreadsheets in this project have not been: 114 rows, 35 films, every row has
   four options, a `correct` in A–D, and an explanation, and the Film Index sheet's
   per-film counts agree with its own rows exactly. Nothing had to be repaired.

     CSI                   12 films   41 questions
     4-Step Close          11 films   35 questions
     Lasting Impressions   12 films   38 questions

   ---------------------------------------------------------------------------
   WHY module_id IS NULL ON ALL 114
   ---------------------------------------------------------------------------

   There is no module to assign them to. Checked rather than assumed:

     CSI                   no course, no modules, and no films
     Lasting Impressions   no course, no modules — its 12 films are published
                           and attached to nothing
     Four Step Close       a course with exactly two modules, "Knowledge Notes 1"
                           and "Knowledge Notes 2", which hold cues and are not
                           per-part modules

   Creating a module per part is the routing decision, and routing a series to a
   track is Mitch's confirmation, not an inference from a matching title. So these
   land the way the other 485 un-routed questions already sit — keyed by `deck` and
   `film` text, `status='draft'` — with one improvement below.

   ---------------------------------------------------------------------------
   content_id IS SET WHERE THE FILM EXISTS, BECAUSE THAT IS A FACT
   ---------------------------------------------------------------------------

   "Which film is this question about" is not a routing decision — it is a
   statement about the question. So 70 of the 114 are joined to the published film
   they examine, which means they survive a rename and can be attached to a module
   with one UPDATE the moment Mitch rules. The other 44 have no film to point at.

   ---------------------------------------------------------------------------
   THE NUMBERING DISAGREEMENT, AND WHY IT IS NOT RESOLVED HERE
   ---------------------------------------------------------------------------

   4-Step Close parts 1–9 agree exactly between the workbook and the films. From
   part 10 they diverge:

     quiz Part 10  "Fit the Close to the Customer"   -> NO FILM EXISTS
     quiz Part 11  "After the Close"                 -> the film numbered Part 10

   Joining on the part number alone would have attached the "Fit the Close"
   questions to a film about "After the Close" — a plausible match on a derived
   key, and wrong. The subjects were compared instead: the film at Part 10 opens
   "Four step close part 10 after the close", so quiz Part 11 is joined to it and
   quiz Part 10's three questions are left with no film.

   Either a film is missing or the series was renumbered. Not decided here; the
   film is not renumbered and the questions are not reassigned.

   Lasting Impressions 1–12 were checked the same way and all twelve agree. Two
   needed reading rather than word-matching: film Part 6 is slated "the next time
   packet" and the quiz calls it "Your Card and a Token" — the body is "your
   business card… and a QR code", so it matches. Film Part 12 is slated "prospect"
   against "Ask for the Family"; the body is "ask for business… anybody else in
   your house drive something?", so it matches too.

   ---------------------------------------------------------------------------
   CSI IS 41 QUESTIONS ABOUT 12 FILMS THAT DO NOT EXIST
   ---------------------------------------------------------------------------

   Worth stating plainly rather than leaving in a count. CSI is a core track with
   no films, no cues and no course — and now the most thoroughly quizzed series in
   the library. Several of its parts also name the same lessons as the Name Tag
   series, which is published and unattached: "Active Listening" is Name Tag
   Part 9, "Why They Come Here" is Name Tag Part 1. That is evidence for the
   routing conversation and nothing more; whether Name Tag IS CSI is Mitch's call.

   `correct` is lower-cased on the way in — the column's CHECK accepts only
   'a'..'d' and the workbook uses capitals.
   =========================================================================== */

create temporary table _scmqb (
  source_id   text,
  deck        text,
  film        text,
  question    text,
  option_a    text,
  option_b    text,
  option_c    text,
  option_d    text,
  correct     char(1),
  explanation text,
  qno         int,
  film_title  text
);

insert into _scmqb values
    ('SCMQB:CSI:P1:Q1', 'CSI', 'Part 1 — CSI Is Not a Score', 'What is the difference between customer service and customer experience?', 'There is none', 'Service is what you do; experience is how it feels', 'Service is measured, experience is not', 'Service happens before the visit', 'b', 'Two advisors can do identical work and get different scores. The work wasn''t different. The experience was.', 1, null),
    ('SCMQB:CSI:P1:Q2', 'CSI', 'Part 1 — CSI Is Not a Score', 'Which phrase should be retired from an advisor''s vocabulary?', 'Taking care of', 'Dealing with', 'Following up', 'Checking in', 'b', 'You''re not handling a problem. You''re caring for a person.', 2, null),
    ('SCMQB:CSI:P1:Q3', 'CSI', 'Part 1 — CSI Is Not a Score', 'What are the three phases of CSI?', 'Phone, drive, delivery', 'Prepare, connect, leave a lasting impression', 'Greet, sell, close', 'Before, during, survey', 'b', 'Before they arrive, while they''re here, and as they leave.', 3, null),
    ('SCMQB:CSI:P1:Q4', 'CSI', 'Part 1 — CSI Is Not a Score', 'What is true about CSI as a score?', 'It''s something that happens to you', 'It''s something you build one interaction at a time', 'It''s controlled by the technicians', 'It''s mostly luck of the draw', 'b', 'CSI is not something that happens to you.', 4, null),
    ('SCMQB:CSI:P2:Q1', 'CSI', 'Part 2 — Two Customers, One Visit', 'What is the difference between efficiency and efficacy?', 'They are the same thing', 'Efficiency is how fast you produce; efficacy is how well', 'Efficacy is speed; efficiency is quality', 'Efficiency applies to techs, efficacy to advisors', 'b', 'Ryan measures efficiency. His mom measures efficacy.', 1, null),
    ('SCMQB:CSI:P2:Q2', 'CSI', 'Part 2 — Two Customers, One Visit', 'What separates good from great in the Ryan example?', 'Satisfying the faster customer', 'Satisfying both Ryan and his mom', 'Satisfying whoever spends more', 'Getting both out quickly', 'b', 'To be good you satisfy one. To be great you satisfy both.', 2, null),
    ('SCMQB:CSI:P2:Q3', 'CSI', 'Part 2 — Two Customers, One Visit', 'What are the five words that resolve the tension?', 'Under promise, over deliver', 'Be quick. Don''t hurry.', 'Speed is the service', 'Time is the enemy', 'b', 'Quick respects their time. Hurried tells them they aren''t worth yours.', 3, null),
    ('SCMQB:CSI:P2:Q4', 'CSI', 'Part 2 — Two Customers, One Visit', 'How should you treat every person you meet?', 'According to what they spend', 'Like they''re either the first human you ever met or the last one you ever will', 'Exactly the same way every time', 'Based on how they treat you', 'b', 'Do that with everybody and customer satisfaction gets easy.', 4, null),
    ('SCMQB:CSI:P3:Q1', 'CSI', 'Part 3 — Why They Come Here', 'What are the four things on a name tag?', 'Store, brand, title, name', 'Name, number, title, logo', 'Brand, model, name, store', 'Store, department, title, name', 'a', 'And they''re the four biggest reasons people come to you.', 1, null),
    ('SCMQB:CSI:P3:Q2', 'CSI', 'Part 3 — Why They Come Here', 'How should you learn what''s new about your brand?', 'Wait for the factory bulletin', 'Learn the way your customers learn — YouTube and TikTok', 'Ask the parts department', 'Read the owner''s manual', 'b', 'If a customer saw something about their own car that you haven''t, you lost credibility you didn''t have to lose.', 2, null),
    ('SCMQB:CSI:P3:Q3', 'CSI', 'Part 3 — Why They Come Here', 'What does your title obligate you to do?', 'Process the ticket', 'Give advice and have an opinion', 'Qualify the customer''s budget', 'Explain the technical detail', 'b', 'You''re a service advisor, not a financial advisor.', 3, null),
    ('SCMQB:CSI:P4:Q1', 'CSI', 'Part 4 — Prepare to Win', 'What goes into the packet before a customer arrives?', 'Only the repair order', 'VIN campaigns, deferred items, visit count, and what the reservation is for', 'A coupon sheet', 'The technician''s notes', 'b', 'Five minutes that completely changes the energy when they walk in.', 1, null),
    ('SCMQB:CSI:P4:Q2', 'CSI', 'Part 4 — Prepare to Win', 'What does the confirmation text need to do?', 'Confirm the time only', 'Set expectations — check-in time and the brief safety inspection', 'Include the price', 'Request a review', 'b', 'That''s how you meet expectations. You set them first.', 2, null),
    ('SCMQB:CSI:P4:Q3', 'CSI', 'Part 4 — Prepare to Win', 'Which question tells you where you stand with a customer?', 'How did we do last time?', 'Have you been anywhere else since your last visit?', 'Are you happy with us?', 'Would you recommend us?', 'b', 'Asked kindly, it tells you everything.', 3, null),
    ('SCMQB:CSI:P5:Q1', 'CSI', 'Part 5 — The Phone Is the First Impression', 'How often should a voicemail be updated?', 'Monthly', 'Every morning', 'When something changes', 'Annually', 'b', 'It tells a customer you''re available, organized, and you care — and it cuts repeat callbacks.', 1, null),
    ('SCMQB:CSI:P5:Q2', 'CSI', 'Part 5 — The Phone Is the First Impression', 'Why steer customers to text?', 'It''s easier for them', 'It''s easier for YOU — you can''t be by the phone with twenty customers', 'It''s cheaper', 'It''s required', 'b', 'Text lets you respond when you can.', 2, null),
    ('SCMQB:CSI:P5:Q3', 'CSI', 'Part 5 — The Phone Is the First Impression', 'How should a call end?', 'Okay, bye', 'Repeat the key information, confirm, set expectations, and be memorable', 'With the price', 'With a survey request', 'b', '"We''ll see you Friday. I''ll have your packet ready."', 3, null),
    ('SCMQB:CSI:P6:Q1', 'CSI', 'Part 6 — Active Listening', 'What happens physiologically when somebody feels heard?', 'Nothing measurable', 'Cortisol drops and oxytocin rises — they become more cooperative and open', 'Blood pressure rises', 'They talk longer', 'b', 'That''s the customer you want, and you create them by listening.', 1, null),
    ('SCMQB:CSI:P6:Q2', 'CSI', 'Part 6 — Active Listening', 'In the daughter''s Camry scenario, what is the most important thing the customer said?', 'It''s due for a 20,000', 'Friday works best', 'It''s their daughter''s car', 'There are no big issues', 'c', 'Your first sentence back should prove you heard that.', 2, null),
    ('SCMQB:CSI:P6:Q3', 'CSI', 'Part 6 — Active Listening', 'What is reflecting?', 'Repeating word for word', 'Giving back their core message — not parroting it', 'Summarizing the repair order', 'Asking a follow-up question', 'b', 'Attending, following, and reflecting are the three core skills.', 3, null),
    ('SCMQB:CSI:P6:Q4', 'CSI', 'Part 6 — Active Listening', 'What do you address first?', 'The concern', 'The emotion', 'The price', 'The timeline', 'b', 'Emotion first, then the vehicle.', 4, null),
    ('SCMQB:CSI:P7:Q1', 'CSI', 'Part 7 — Dissuade Them From Waiting', 'By how much do people overestimate their wait?', 'About 10%', 'About 30 to 40%', 'About 60%', 'They underestimate it', 'b', 'Forty-five minutes in the lounge feels like over an hour.', 1, null),
    ('SCMQB:CSI:P7:Q2', 'CSI', 'Part 7 — Dissuade Them From Waiting', 'What do you call the place customers wait?', 'The waiting area', 'The lounge', 'The customer area', 'Reception', 'b', 'Waiting areas are at the doctor''s office.', 2, null),
    ('SCMQB:CSI:P7:Q3', 'CSI', 'Part 7 — Dissuade Them From Waiting', 'How often should you touch base in the lounge?', 'Once an hour', 'Twice an hour — 27 and 57 past', 'Every fifteen minutes', 'Only if somebody looks upset', 'b', 'Walk through, make eye contact, ask if everyone''s good — then leave. Don''t linger.', 3, null),
    ('SCMQB:CSI:P7:Q4', 'CSI', 'Part 7 — Dissuade Them From Waiting', 'Where does the loaner belong in your transportation options?', 'First', 'Last', 'Second, after shuttle', 'It depends on the customer', 'b', 'They''re expensive and they carry liability.', 4, null),
    ('SCMQB:CSI:P8:Q1', 'CSI', 'Part 8 — Duke''s Steakhouse', 'What is the difference between the two waiters?', 'Speed', 'One takes an order; the other leads an experience and gives choices', 'Price', 'Menu knowledge', 'b', 'Same table, same drinks, same amount of time.', 1, null),
    ('SCMQB:CSI:P8:Q2', 'CSI', 'Part 8 — Duke''s Steakhouse', 'What does the second waiter do instead of asking a blank question?', 'Recommends the most expensive item', 'Offers something off menu and gives a choice — sugar or sweetener', 'Brings water automatically', 'Lists the whole menu', 'b', 'Two options beat a yes-or-no every time.', 2, null),
    ('SCMQB:CSI:P8:Q3', 'CSI', 'Part 8 — Duke''s Steakhouse', 'How does this apply on the drive?', 'Ask what they''re here for', 'Share what you''re doing, what you recommend, and your favorite part of it', 'Give them a printed menu', 'Quote the lowest price first', 'b', 'Give every customer the chance to buy a strawberry lemonade.', 3, null),
    ('SCMQB:CSI:P9:Q1', 'CSI', 'Part 9 — Upon Arrival — Connect', 'What is the absolute rule on the walk-around?', 'Document everything', 'Never mention anything negative without a positive solution in the same breath', 'Never mention damage', 'Always take photos', 'b', 'Same scratch. Completely different experience.', 1, null),
    ('SCMQB:CSI:P9:Q2', 'CSI', 'Part 9 — Upon Arrival — Connect', 'Why have the customer run the walk-around with you?', 'It saves you time', 'You check four items while they feel in control', 'It''s required for liability', 'It shortens the write-up', 'b', 'Every wall you take down is a connection you make.', 2, null),
    ('SCMQB:CSI:P9:Q3', 'CSI', 'Part 9 — Upon Arrival — Connect', 'What does a customer think when you point out a scratch with no solution?', 'That you''re thorough', 'That you''re covering yourself', 'That it''s their fault', 'That it can''t be fixed', 'b', 'Customers can smell self-protection from a mile away.', 3, null),
    ('SCMQB:CSI:P10:Q1', 'CSI', 'Part 10 — Fall on the Sword', 'In the steakhouse example, who does the customer complain to about an overcooked steak?', 'The kitchen', 'The server', 'The manager', 'Nobody', 'b', 'They''re the face of the experience — and how they respond decides whether you leave happy.', 1, null),
    ('SCMQB:CSI:P10:Q2', 'CSI', 'Part 10 — Fall on the Sword', 'What do you do when something went wrong that wasn''t your fault?', 'Explain who dropped it', 'Own it, apologize, and fix it', 'Discount the ticket', 'Let the manager handle it', 'b', 'That''s not fair. And it''s completely true — you are the face of this experience.', 2, null),
    ('SCMQB:CSI:P10:Q3', 'CSI', 'Part 10 — Fall on the Sword', 'What do customers remember longest?', 'A perfect visit', 'The visit where something went wrong and somebody made it right', 'The price', 'The wait time', 'b', 'Same steak. Same kitchen. Different response.', 3, null),
    ('SCMQB:CSI:P11:Q1', 'CSI', 'Part 11 — Upon Departure — Active Delivery', 'Why walk the vehicle before you call the customer over?', 'To check for damage you caused', 'To catch anything that would distract from a good send-off', 'To verify the work', 'To take photos', 'b', 'Water spots, grease on the handle, something left in the seat — catch it before they do.', 1, null),
    ('SCMQB:CSI:P11:Q2', 'CSI', 'Part 11 — Upon Departure — Active Delivery', 'When should the completion text go out?', 'When the vehicle is parked', 'As it enters the wash', 'When the invoice is printed', 'At the end of the day', 'b', 'It sets expectations and quietly tells them they''re getting a complimentary wash.', 2, null),
    ('SCMQB:CSI:P11:Q3', 'CSI', 'Part 11 — Upon Departure — Active Delivery', 'Which customer always gets a scheduled delivery?', 'The biggest ticket', 'A heat case — delayed parts, or a second visit for the same thing', 'The first one of the day', 'A new customer', 'b', 'We have to take the most time with the customers we''ve frustrated.', 3, null),
    ('SCMQB:CSI:P12:Q1', 'CSI', 'Part 12 — Survey Talk — Three Moments', 'When does survey talk begin?', 'At delivery', 'At write-up', 'When the survey arrives', 'After payment', 'b', 'Three moments, and the first one is a promise with recourse.', 1, null),
    ('SCMQB:CSI:P12:Q2', 'CSI', 'Part 12 — Survey Talk — Three Moments', 'What is moment two?', 'Asking for five stars', 'After payment — "I noticed you never texted me today"', 'Handing them a card', 'Emailing a reminder', 'b', 'Let them answer. They just said out loud that they had a good experience.', 2, null),
    ('SCMQB:CSI:P12:Q3', 'CSI', 'Part 12 — Survey Talk — Three Moments', 'What should you tell them in moment three?', 'To mark everything high', 'When it''s coming, who it''s from, the subject line, and that it''s okay to be perfect', 'To call you first', 'To ignore the low scores', 'b', 'Some folks mark something low just so it looks real.', 3, null),
    ('SCMQB:CSI:P12:Q4', 'CSI', 'Part 12 — Survey Talk — Three Moments', 'Why share your own survey numbers?', 'To brag', 'Social proof — people who hear others had a great experience are primed to have one', 'It''s required', 'To justify the price', 'b', '"Thirty-eight of my last forty customers gave me a perfect survey."', 4, null),
    ('SCMQB:4-Step Close:P1:Q1', 'Four Step Close', 'Part 1 — Ends the Same Way', 'What are the four steps in order?', 'Price, need, time, ask', 'What they need, how much, when, all I need is your authorization', 'Greet, present, price, close', 'Need, urgency, value, ask', 'b', 'Same four, same order, every time.', 1, 'Four Step Close, Part 1'),
    ('SCMQB:4-Step Close:P1:Q2', 'Four Step Close', 'Part 1 — Ends the Same Way', 'What happens when an advisor trails off?', 'The customer thinks it over', 'The customer has to do all the work — and saying no is easier', 'They usually still buy', 'It feels less pushy', 'b', '"So... yeah. What do you think?"', 2, 'Four Step Close, Part 1'),
    ('SCMQB:4-Step Close:P1:Q3', 'Four Step Close', 'Part 1 — Ends the Same Way', 'What does closing the same way every time do for you?', 'Saves time', 'You stop thinking about the close and start listening to the customer', 'Raises the ticket', 'Reduces comebacks', 'b', 'And the customer starts to trust it — they know what''s coming.', 3, 'Four Step Close, Part 1'),
    ('SCMQB:4-Step Close:P2:Q1', 'Four Step Close', 'Part 2 — What They Need', 'How technical should step one be?', 'As technical as the multi-point', 'Simple enough for the eight-year-old and the eighty-eight-year-old', 'Whatever the customer asks for', 'Match their vocabulary exactly', 'b', 'The technical version doesn''t make you sound smart. It makes the customer feel behind.', 1, 'Four Step Close, Part 2'),
    ('SCMQB:4-Step Close:P2:Q2', 'Four Step Close', 'Part 2 — What They Need', 'What goes in the same sentence as the item?', 'The price', 'The reason', 'The technician''s name', 'The warranty', 'b', 'One sentence. The item, and why.', 2, 'Four Step Close, Part 2'),
    ('SCMQB:4-Step Close:P2:Q3', 'Four Step Close', 'Part 2 — What They Need', 'Why avoid alphabet soup?', 'It takes too long', 'People don''t authorize things they feel behind on', 'It''s inaccurate', 'Customers find it rude', 'b', 'Say it simply.', 3, 'Four Step Close, Part 2'),
    ('SCMQB:4-Step Close:P3:Q1', 'Four Step Close', 'Part 3 — How Much', 'How should the number be presented?', 'Itemized so they see the value', 'One number — total investment, out the door', 'By part and labor', 'With a range', 'b', 'Break it into parts and you''ve handed them a menu of things to take off.', 1, 'Four Step Close, Part 3'),
    ('SCMQB:4-Step Close:P3:Q2', 'Four Step Close', 'Part 3 — How Much', 'What is wrong with "two-fifty per side"?', 'It''s too high', 'It makes the customer do math', 'It''s not accurate', 'It''s fine', 'b', 'The whole enchilada. One number.', 2, 'Four Step Close, Part 3'),
    ('SCMQB:4-Step Close:P3:Q3', 'Four Step Close', 'Part 3 — How Much', 'What should you never say on the call?', 'Total investment', 'I''ll get back to you with a total', 'All I need is your authorization', 'Done by twelve forty-five', 'b', 'Know your out-the-door number before you dial.', 3, 'Four Step Close, Part 3'),
    ('SCMQB:4-Step Close:P3:Q4', 'Four Step Close', 'Part 3 — How Much', 'Why say total investment instead of cost or price?', 'It sounds more professional', 'Cost and price make people think something is expensive', 'It''s required language', 'It avoids tax questions', 'b', 'An investment is something you put in to get something back.', 4, 'Four Step Close, Part 3'),
    ('SCMQB:4-Step Close:P4:Q1', 'Four Step Close', 'Part 4 — When', 'Why give a time instead of a number of minutes?', 'It''s more accurate', 'People are three times more anxious waiting on minutes than on a time on their phone', 'It''s shorter to say', 'It avoids commitment', 'b', '"About an hour" starts a clock in their head.', 1, 'Four Step Close, Part 4'),
    ('SCMQB:4-Step Close:P4:Q2', 'Four Step Close', 'Part 4 — When', 'What should you do after committing to a time?', 'Add a buffer out loud', 'Quietly aim to beat it by twenty minutes', 'Avoid calling until then', 'Recheck with the technician', 'b', 'An advisor who commits and then calls early looks like a hero.', 2, 'Four Step Close, Part 4'),
    ('SCMQB:4-Step Close:P4:Q3', 'Four Step Close', 'Part 4 — When', 'What if the time is going to slip?', 'Call after the promised time', 'Call before it — a heads-up is service', 'Wait until they call', 'Send the invoice early', 'b', 'A late vehicle with no call is a broken promise.', 3, 'Four Step Close, Part 4'),
    ('SCMQB:4-Step Close:P5:Q1', 'Four Step Close', 'Part 5 — Authorization', 'What is the repair-call version of the ask?', 'Do you want to move forward?', 'All I need is your approval to get started and get the parts pulled right now', 'Should I go ahead?', 'Let me know what you decide', 'b', 'It asks for the yes and shares that the clock starts on it.', 1, 'Four Step Close, Part 5'),
    ('SCMQB:4-Step Close:P5:Q2', 'Four Step Close', 'Part 5 — Authorization', 'Why does "all I need" work?', 'It sounds humble', 'It puts you on their side — everything else is handled', 'It''s shorter', 'It avoids the price', 'b', 'You''re naming the one small thing between them and a finished vehicle.', 2, 'Four Step Close, Part 5'),
    ('SCMQB:4-Step Close:P5:Q3', 'Four Step Close', 'Part 5 — Authorization', 'Is step four a question?', 'Yes', 'No — it''s a statement about what happens next', 'Only on the phone', 'Only on large tickets', 'b', 'That''s the difference between closing and hoping.', 3, 'Four Step Close, Part 5'),
    ('SCMQB:4-Step Close:P6:Q1', 'Four Step Close', 'Part 6 — Then Stop Talking', 'What do you do after the ask?', 'Recap the benefit', 'Nothing — let the quiet sit', 'Offer a discount', 'Ask if it sounds good', 'b', 'The first person to talk loses.', 1, 'Four Step Close, Part 6'),
    ('SCMQB:4-Step Close:P6:Q2', 'Four Step Close', 'Part 6 — Then Stop Talking', 'Which sentence has cost more sales than any price?', 'It''s needed today', 'But if you want to think about it, that''s fine too', 'That''s the total investment', 'We can have it done by three', 'b', 'Don''t soften the ask.', 2, 'Four Step Close, Part 6'),
    ('SCMQB:4-Step Close:P6:Q3', 'Four Step Close', 'Part 6 — Then Stop Talking', 'Which of these breaks two rules at once?', 'All I need is your authorization', 'Is that something you''d want to do?', 'We need to get you a new set', 'Done by twelve forty-five', 'b', 'It ends on a question and it uses want.', 3, 'Four Step Close, Part 6'),
    ('SCMQB:4-Step Close:P7:Q1', 'Four Step Close', 'Part 7 — Assume the Yes', 'Why is want treated like a cuss word?', 'It''s unprofessional', 'Nobody wanted to talk about brake fluid — it hands them an easy no', 'It''s too casual', 'Customers find it pushy', 'b', 'They''re doing it because you shared that it''s needed.', 1, 'Four Step Close, Part 7'),
    ('SCMQB:4-Step Close:P7:Q2', 'Four Step Close', 'Part 7 — Assume the Yes', 'How should the wiper recommendation sound?', 'Would you like new blades?', 'You''ve got some bad streaking — we need to get you a new set', 'Do you want me to add wipers?', 'Should I check on wipers?', 'b', 'A recommendation, stated as a recommendation.', 2, 'Four Step Close, Part 7'),
    ('SCMQB:4-Step Close:P7:Q3', 'Four Step Close', 'Part 7 — Assume the Yes', 'What is the smallest close in the building?', 'Anything else today?', '...and rotate?', 'Let me know', 'Want the package?', 'b', 'Two words, off their own sentence — about five percent say yes.', 3, 'Four Step Close, Part 7'),
    ('SCMQB:4-Step Close:P8:Q1', 'Four Step Close', 'Part 8 — The Close in Four Places', 'Which four places use the same close?', 'Phone, kiosk, lounge, cashier', 'At the car, at the kiosk, the maintenance call, the repair call', 'Write-up, MPI, delivery, follow-up', 'Drive, phone, email, text', 'b', 'Four different conversations. Same four steps.', 1, 'Four Step Close, Part 8'),
    ('SCMQB:4-Step Close:P8:Q2', 'Four Step Close', 'Part 8 — The Close in Four Places', 'What makes it a success cycle?', 'Selling more per ticket', 'Saying it enough that you stop thinking about it', 'Using different words each time', 'Closing faster', 'b', 'And the customer hears somebody who does this for a living.', 2, 'Four Step Close, Part 8'),
    ('SCMQB:4-Step Close:P8:Q3', 'Four Step Close', 'Part 8 — The Close in Four Places', 'How does the kiosk version open?', 'With the price', 'With your favorite part of the package', 'With the warranty', 'With the technician''s name', 'b', 'My favorite part of the fifteen-thousand-mile package is…', 3, 'Four Step Close, Part 8'),
    ('SCMQB:4-Step Close:P9:Q1', 'Four Step Close', 'Part 9 — The Close You Never Have to Make', 'What is the best close in the building?', 'The takeaway', 'The one where the customer selects the green approve button', 'The bundle', 'The financing offer', 'b', 'A sale you never had to call about, price, or close.', 1, 'Four Step Close, Part 9'),
    ('SCMQB:4-Step Close:P9:Q2', 'Four Step Close', 'Part 9 — The Close You Never Have to Make', 'About what share of customers approve from the video?', 'About 1%', 'About 5%', 'About 20%', 'About half', 'b', 'And every one of those is money you made before you picked up the phone.', 2, 'Four Step Close, Part 9'),
    ('SCMQB:4-Step Close:P9:Q3', 'Four Step Close', 'Part 9 — The Close You Never Have to Make', 'What should you do when a customer approves on their phone?', 'Just start the work', 'Close the loop — confirm it and give them a time', 'Call to upsell', 'Send the invoice immediately', 'b', 'A customer who approved and heard nothing still wonders whether it went through.', 3, 'Four Step Close, Part 9'),
    ('SCMQB:4-Step Close:P10:Q1', 'Four Step Close', 'Part 10 — Fit the Close to the Customer', 'What version fits a customer who likes control?', 'By letting us complete this today', 'If you handle this today', 'If you''d allow us', 'We''ll take care of it for you', 'b', 'Handle. That''s their word.', 1, null),
    ('SCMQB:4-Step Close:P10:Q2', 'Four Step Close', 'Part 10 — Fit the Close to the Customer', 'How do you know which customer you have?', 'Ask them', 'Listen on the drive — they show you in the first two minutes', 'Check the history', 'By the vehicle they drive', 'b', '"Whatever you think" is the other one.', 2, null),
    ('SCMQB:4-Step Close:P10:Q3', 'Four Step Close', 'Part 10 — Fit the Close to the Customer', 'What should you NOT ask the customer who has to check at home?', 'Would you like the details texted?', 'Is there anything I can do to make this easier?', 'Do you want me to write it down?', 'Can I send the video?', 'b', 'That hands away control. Give them information instead.', 3, null),
    ('SCMQB:4-Step Close:P11:Q1', 'Four Step Close', 'Part 11 — After the Close', 'What is the redirect?', 'Offering a discount', '"I wouldn''t be doing my job if I didn''t share this with you"', 'Repeating the price', 'Handing it to a manager', 'b', 'It says maybe it''s me — and it earns you one more try.', 1, 'Four Step Close, Part 10'),
    ('SCMQB:4-Step Close:P11:Q2', 'Four Step Close', 'Part 11 — After the Close', 'When does "if left ignored" belong?', 'In the first presentation', 'After the first no', 'Never', 'At delivery', 'b', 'Think about the dentist. That''s advising, not selling.', 2, 'Four Step Close, Part 10'),
    ('SCMQB:4-Step Close:P11:Q3', 'Four Step Close', 'Part 11 — After the Close', 'What happens after the second no?', 'One more attempt', 'Note it deferred, and book it sooner if it won''t wait', 'Discount it', 'Have a manager call', 'b', 'Deferred, not declined. "Let''s set you up to come back in about a thousand miles."', 3, 'Four Step Close, Part 10'),
    ('SCMQB:4-Step Close:P11:Q4', 'Four Step Close', 'Part 11 — After the Close', 'What is the takeaway close on a safety item?', 'You really should do this', 'If you don''t do it here, please get it done somewhere. I want you safe', 'This is your last chance', 'I''ll note that you declined', 'b', 'You just gave up the sale out loud. That''s exactly why it works.', 4, 'Four Step Close, Part 10'),
    ('SCMQB:Lasting Impressions:P1:Q1', 'Lasting Impressions', 'Part 1 — It Starts at Write-Up', 'When does active delivery actually begin?', 'At the cashier', 'At write-up', 'When the vehicle is ready', 'At the escort', 'b', 'The five-star speech happens before they ever leave.', 1, 'Lasting Impressions, Part 1'),
    ('SCMQB:Lasting Impressions:P1:Q2', 'Lasting Impressions', 'Part 1 — It Starts at Write-Up', 'Why ask them to text rather than call?', 'It''s more polite', 'You might not be near your phone — a text you can handle immediately', 'It creates a record', 'It''s faster to type', 'b', 'Give them a chance to tell you while you can still fix it.', 2, 'Lasting Impressions, Part 1'),
    ('SCMQB:Lasting Impressions:P1:Q3', 'Lasting Impressions', 'Part 1 — It Starts at Write-Up', 'What is wrong with the waiter''s comment card at the end?', 'Nothing', 'It''s based on a hope — he finds out after it''s too late to fix', 'It''s too long', 'Customers ignore it', 'b', 'You just did the opposite.', 3, 'Lasting Impressions, Part 1'),
    ('SCMQB:Lasting Impressions:P2:Q1', 'Lasting Impressions', 'Part 2 — Mobile Pay and the Link', 'Why is mobile pay where active delivery begins?', 'It''s faster to process', 'The customer doesn''t have to do anything but talk to you and leave', 'It reduces errors', 'It''s required', 'b', 'That''s what buys you the five minutes this whole class is about.', 1, 'Lasting Impressions, Part 2'),
    ('SCMQB:Lasting Impressions:P2:Q2', 'Lasting Impressions', 'Part 2 — Mobile Pay and the Link', 'Who gets the financing link?', 'Customers who ask', 'Everyone', 'Customers over a certain ticket', 'Customers with a payment history', 'b', 'Offer it selectively and you''ve stigmatized somebody.', 2, 'Lasting Impressions, Part 2'),
    ('SCMQB:Lasting Impressions:P2:Q3', 'Lasting Impressions', 'Part 2 — Mobile Pay and the Link', 'Which item follows the same everyone-or-nobody rule?', 'Coupons', 'Air fresheners', 'Loaners', 'Tire quotes', 'b', 'Not just to the folks whose cars smell.', 3, 'Lasting Impressions, Part 2'),
    ('SCMQB:Lasting Impressions:P3:Q1', 'Lasting Impressions', 'Part 3 — Before You Say It''s Ready', 'What should you do before texting that the vehicle is ready?', 'Print the invoice', 'Put your eyes on the vehicle', 'Call the technician', 'Check the schedule', 'b', 'Never deliver a vehicle that isn''t actually ready to be delivered.', 1, 'Lasting Impressions, Part 3'),
    ('SCMQB:Lasting Impressions:P3:Q2', 'Lasting Impressions', 'Part 3 — Before You Say It''s Ready', 'What goes into special instructions?', 'The repair history', 'Something personal you learned today', 'The deferred items', 'The promise time', 'b', '"Dad of a high school football player. Ask about the playoffs next visit."', 2, 'Lasting Impressions, Part 3'),
    ('SCMQB:Lasting Impressions:P3:Q3', 'Lasting Impressions', 'Part 3 — Before You Say It''s Ready', 'What should you note about a customer who gives a perfect survey?', 'Nothing', 'Note it, and thank them or give a token next visit', 'Send a gift card', 'Call to confirm', 'b', 'A customer who finds out it meant something has a reason to do it again.', 3, 'Lasting Impressions, Part 3'),
    ('SCMQB:Lasting Impressions:P4:Q1', 'Lasting Impressions', 'Part 4 — Schedule the Delivery', 'Why schedule a delivery time?', 'To manage the cashier line', 'So everybody isn''t arriving at 5:30 and nobody gets a real delivery', 'To close the RO faster', 'Policy', 'b', 'I want five minutes with that customer.', 1, 'Lasting Impressions, Part 4'),
    ('SCMQB:Lasting Impressions:P4:Q2', 'Lasting Impressions', 'Part 4 — Schedule the Delivery', 'How does it sound?', 'Come whenever you''re free', 'It''s 3:09 — can you be here by 3:45?', 'We close at six', 'Your car is ready', 'b', 'A time, not a window.', 2, 'Lasting Impressions, Part 4'),
    ('SCMQB:Lasting Impressions:P4:Q3', 'Lasting Impressions', 'Part 4 — Schedule the Delivery', 'Why does this matter even more in a body shop?', 'Higher tickets', 'You walk the vehicle together, so there''s never a "you scratched my car" later', 'Longer repairs', 'Insurance rules', 'b', 'Ask them when they want to pick it up, because you need ten minutes.', 3, 'Lasting Impressions, Part 4'),
    ('SCMQB:Lasting Impressions:P5:Q1', 'Lasting Impressions', 'Part 5 — Review the Vehicle Report', 'What order do you review the report in?', 'Reds first', 'The same order you pitched in — technician, two greens, today''s work, yellows, reds', 'Cheapest to most expensive', 'Whatever they ask about', 'b', 'Two greens before anything else.', 1, 'Lasting Impressions, Part 5'),
    ('SCMQB:Lasting Impressions:P5:Q2', 'Lasting Impressions', 'Part 5 — Review the Vehicle Report', 'What word replaces "declined"?', 'Refused', 'Deferred', 'Postponed', 'Skipped', 'b', 'Declined is final. That''s not what we''re doing.', 2, 'Lasting Impressions, Part 5'),
    ('SCMQB:Lasting Impressions:P5:Q3', 'Lasting Impressions', 'Part 5 — Review the Vehicle Report', 'Why say Hector completed the service rather than worked on it?', 'It''s more accurate', 'Work has turned into a negative word', 'It''s shorter', 'The factory requires it', 'b', 'Completing sounds like a process about to be finished.', 3, 'Lasting Impressions, Part 5'),
    ('SCMQB:Lasting Impressions:P6:Q1', 'Lasting Impressions', 'Part 6 — Your Card and a Token', 'Why give a business card or QR code?', 'Policy', 'So they remember you and can find you', 'For the survey', 'For financing', 'b', 'You want them coming back to you — give them a way to find you.', 1, 'Lasting Impressions, Part 6'),
    ('SCMQB:Lasting Impressions:P6:Q2', 'Lasting Impressions', 'Part 6 — Your Card and a Token', 'What is the rule on giving away gum?', 'Never give gum', 'Make sure it''s wrapped or they unwrap it themselves', 'Only in winter', 'Only to regulars', 'b', 'This is like Halloween. Nobody wants the loose stuff.', 2, 'Lasting Impressions, Part 6'),
    ('SCMQB:Lasting Impressions:P6:Q3', 'Lasting Impressions', 'Part 6 — Your Card and a Token', 'What made the turkey jerky advisor effective?', 'The cost', 'It made him memorable', 'Customers were hungry', 'It replaced a discount', 'b', 'That''s the whole reason you hand somebody a business card.', 3, 'Lasting Impressions, Part 6'),
    ('SCMQB:Lasting Impressions:P7:Q1', 'Lasting Impressions', 'Part 7 — Warranty and What''s Next', 'What do you do with the warranty brochure?', 'Hand it over', 'Circle the service they bought and write in when coverage expires', 'File it with the RO', 'Mail it later', 'b', '"You''re at seventy-two thousand — so you''re covered through a hundred and two."', 1, 'Lasting Impressions, Part 7'),
    ('SCMQB:Lasting Impressions:P7:Q2', 'Lasting Impressions', 'Part 7 — Warranty and What''s Next', 'Should a customer who bought nothing still get the brochure?', 'No', 'Yes — that''s next visit''s conversation sitting in their kitchen', 'Only if they ask', 'Only on high mileage', 'b', 'What you hope to hear is "wait, I can get a warranty on all of these?"', 2, 'Lasting Impressions, Part 7'),
    ('SCMQB:Lasting Impressions:P7:Q3', 'Lasting Impressions', 'Part 7 — Warranty and What''s Next', 'What is the maintenance card used to introduce?', 'The coupon book', 'The stagger — brake at 30, diff at 35, power steering at 40, transmission at 45, coolant at 49,999', 'The warranty claim process', 'The accessory catalog', 'b', 'It sets the whole next year of visits.', 3, 'Lasting Impressions, Part 7'),
    ('SCMQB:Lasting Impressions:P7:Q4', 'Lasting Impressions', 'Part 7 — Warranty and What''s Next', 'What is "next next time"?', 'The following year', 'The visit after the next one', 'A second opinion', 'The deferred list', 'b', '"Next visit is your fifteen. The one after that, we''ll add a tire balance."', 4, 'Lasting Impressions, Part 7'),
    ('SCMQB:Lasting Impressions:P8:Q1', 'Lasting Impressions', 'Part 8 — Accessories and a Tire Quote', 'Who gets a tire quote?', 'Customers with red tread', 'Every single customer', 'Customers who ask', 'Customers over 50,000 miles', 'b', 'Sometimes life happens — and they remember you just quoted them a tire.', 1, 'Lasting Impressions, Part 8'),
    ('SCMQB:Lasting Impressions:P8:Q2', 'Lasting Impressions', 'Part 8 — Accessories and a Tire Quote', 'What is the point of the motion-light example?', 'It''s high margin', 'Accessories are about making things cool enough that they love the place', 'It''s easy to install', 'It''s seasonal', 'b', 'Accessories aren''t just about making money. Neither is the service experience.', 2, 'Lasting Impressions, Part 8'),
    ('SCMQB:Lasting Impressions:P8:Q3', 'Lasting Impressions', 'Part 8 — Accessories and a Tire Quote', 'What does a tire quote on a green set tell the customer?', 'That they need tires', 'That you''re in the tire business and not only talking tires when something''s wrong', 'That prices are rising', 'That the tread was measured', 'b', 'A quote on a green set is just information.', 3, 'Lasting Impressions, Part 8'),
    ('SCMQB:Lasting Impressions:P9:Q1', 'Lasting Impressions', 'Part 9 — The Escort', 'What should you do before walking them out?', 'Print the invoice', 'Go start the vehicle and get the air or heat going', 'Call the porter', 'Check the wash', 'b', 'Nobody wants to climb into a freezing car after spending three hundred dollars.', 1, 'Lasting Impressions, Part 9'),
    ('SCMQB:Lasting Impressions:P9:Q2', 'Lasting Impressions', 'Part 9 — The Escort', 'What should never be said at delivery?', 'Thank you for coming in', 'Your car''s in stall eighteen', 'That was a smart decision today', 'Let me walk you out', 'b', 'Escort them. Don''t point.', 2, 'Lasting Impressions, Part 9'),
    ('SCMQB:Lasting Impressions:P9:Q3', 'Lasting Impressions', 'Part 9 — The Escort', 'How is the PPE handled?', 'Leave it for the customer', 'Remove it yourself, in front of them, before they get in', 'Remove it before they arrive', 'Leave it as proof', 'b', 'Let them see it was in there — but don''t make them do it.', 3, 'Lasting Impressions, Part 9'),
    ('SCMQB:Lasting Impressions:P10:Q1', 'Lasting Impressions', 'Part 10 — The White Rag', 'What do you wipe, and when?', 'The windshield, before they arrive', 'The driver''s side mirror, after they''re in and the door is shut', 'The dash, during the review', 'The door handle, on arrival', 'b', 'Then you wave and walk away.', 1, 'Lasting Impressions, Part 10'),
    ('SCMQB:Lasting Impressions:P10:Q2', 'Lasting Impressions', 'Part 10 — The White Rag', 'What is the last thing the customer remembers?', 'The total they paid', 'The free car wash', 'The wait', 'The technician''s name', 'b', 'That''s the lasting impression.', 2, 'Lasting Impressions, Part 10'),
    ('SCMQB:Lasting Impressions:P10:Q3', 'Lasting Impressions', 'Part 10 — The White Rag', 'What lift has this habit produced?', 'About 1%', 'About 4%', 'About 10%', 'No measurable change', 'b', 'Four percent, from a rag and four seconds.', 3, 'Lasting Impressions, Part 10'),
    ('SCMQB:Lasting Impressions:P11:Q1', 'Lasting Impressions', 'Part 11 — Survey Talk', 'How do you open survey talk at delivery?', 'Please give me five stars', 'Remember when I asked you to text me if you didn''t get five-star treatment? You didn''t text me', 'Did we do okay?', 'The survey is important to me', 'b', 'Let them answer it — they just told you out loud.', 1, 'Lasting Impressions, Part 11'),
    ('SCMQB:Lasting Impressions:P11:Q2', 'Lasting Impressions', 'Part 11 — Survey Talk', 'What three details should you give them about the survey?', 'Length, reward, deadline', 'When it''s coming, who it''s from, and the subject line', 'Score scale, sender, deadline', 'Nothing — let it arrive', 'b', 'They get a lot of email.', 2, 'Lasting Impressions, Part 11'),
    ('SCMQB:Lasting Impressions:P11:Q3', 'Lasting Impressions', 'Part 11 — Survey Talk', 'Why does the Mimi story exist?', 'To be funny', 'People mark something low so it looks real — tell them it''s okay not to', 'To explain scoring', 'To justify follow-up', 'b', 'All nines cost five hundred dollars.', 3, 'Lasting Impressions, Part 11'),
    ('SCMQB:Lasting Impressions:P11:Q4', 'Lasting Impressions', 'Part 11 — Survey Talk', 'What does sharing your own average do?', 'Sounds like bragging', 'Sets the expectation you''ll be graded against — and it''s social proof', 'Confuses the customer', 'Nothing measurable', 'b', '"That''s the standard I hold myself to."', 4, 'Lasting Impressions, Part 11'),
    ('SCMQB:Lasting Impressions:P12:Q1', 'Lasting Impressions', 'Part 12 — Ask for the Family', 'What should you ask before they pull out?', 'How did we do?', 'Anybody else in the house driving something?', 'Do you need anything else?', 'Can I get a review?', 'b', 'You want to be the one vendor for the whole family.', 1, 'Lasting Impressions, Part 12'),
    ('SCMQB:Lasting Impressions:P12:Q2', 'Lasting Impressions', 'Part 12 — Ask for the Family', 'What must you know before asking?', 'Their budget', 'Whether your store services other brands', 'Their next service date', 'Their insurance', 'b', 'Being wrong about it is worse than not asking.', 2, 'Lasting Impressions, Part 12'),
    ('SCMQB:Lasting Impressions:P12:Q3', 'Lasting Impressions', 'Part 12 — Ask for the Family', 'How should the next visit get booked?', 'They call back in', 'Scan the QR code on the sticker straight to your scheduler', 'Mail a reminder', 'At the cashier', 'b', 'And it''s a reservation — not an appointment.', 3, 'Lasting Impressions, Part 12')
;

do $$
declare
  _have int;
  _ins int;
  _linked int;
begin
  select count(*) into _have from _scmqb;
  if _have <> 114 then
    raise exception '0140: expected 114 workbook rows, staged % — refusing', _have;
  end if;

  /*
   * IDEMPOTENT ON source_id. A second run must add nothing rather than duplicate
   * the bank, and "nothing to do" must be distinguishable from "wrong count".
   */
  select count(*) into _have from quiz_question where source_id like 'SCMQB:%';
  if _have = 114 then
    raise notice '0140: all 114 questions already present — nothing to add';
    return;
  end if;
  if _have <> 0 then
    raise exception '0140: % of 114 already present — refusing a partial re-import', _have;
  end if;

  insert into quiz_question (
    source_id, deck, film, question, option_a, option_b, option_c, option_d,
    correct, explanation, sort_order, status, source, question_type, shared_pool,
    volume, content_id
  )
  select s.source_id, s.deck, s.film, s.question,
         s.option_a, s.option_b, s.option_c, s.option_d,
         s.correct, s.explanation, s.qno, 'draft', 'authored', 'Multiple Choice',
         false, 'Sales Craft',
         c.id
    from _scmqb s
    left join content c
      on s.film_title is not null
     and c.title = s.film_title
     and c.type = 'advisor_video'
     and c.status = 'published'
     and c.retired_at is null;

  get diagnostics _ins = row_count;
  if _ins <> 114 then
    raise exception '0140: inserted % rows, expected 114', _ins;
  end if;

  /* ---- ASSERT BOTH HALVES ---------------------------------------------- */

  /*
   * SCOPED TO THE DATABASE IT IS ON (repaired 30 Sep, found by the full local
   * replay for 0144/0145). On production the 70 films exist and the join must
   * find all 70. On a fresh local none of the films exist — they arrived
   * through Mux, which no migration replays — so the correct count there is 0,
   * and asserting 70 made the whole chain unreplayable from 0140 on. Same
   * population statement 0142 makes with its "no films present" skip.
   * Production already holds all 114 and takes the early return above, so this
   * edit cannot re-run there.
   */
  select count(*) into _linked from quiz_question
   where source_id like 'SCMQB:%' and content_id is not null;
  if exists (select 1 from content
              where title = 'Lasting Impressions, Part 1'
                and type = 'advisor_video' and status = 'published'
                and retired_at is null) then
    if _linked <> 70 then
      raise exception
        '0140: % questions joined to a film, expected 70 (38 Lasting Impressions + 32 Four Step Close)', _linked;
    end if;
  else
    if _linked <> 0 then
      raise exception
        '0140: % questions joined to a film on a database with no films', _linked;
    end if;
    raise notice '0140: films not present on this database — all 114 land with content_id null';
  end if;

  /*
   * AND THE UNJOINED ONES ARE THE RIGHT ONES. A join that silently matched CSI to
   * something would satisfy the count above while attaching questions to films
   * about other subjects.
   */
  select count(*) into _have from quiz_question
   where source_id like 'SCMQB:CSI:%' and content_id is not null;
  if _have <> 0 then
    raise exception '0140: % CSI question(s) joined to a film — CSI has no films', _have;
  end if;

  select count(*) into _have from quiz_question
   where source_id like 'SCMQB:4-Step Close:P10:%' and content_id is not null;
  if _have <> 0 then
    raise exception
      '0140: quiz Part 10 "Fit the Close to the Customer" joined to a film — no such film exists';
  end if;

  /* Nothing is routed. If a later change attaches these, this stops being true. */
  select count(*) into _have from quiz_question
   where source_id like 'SCMQB:%' and module_id is not null;
  if _have <> 0 then
    raise exception '0140: % question(s) carry a module_id — routing is Mitch''s call', _have;
  end if;

  raise notice '0140: added 114 questions (41 CSI, 35 Four Step Close, 38 Lasting Impressions); 70 joined to a film, 44 awaiting one';
end
$$;
