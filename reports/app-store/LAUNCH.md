# App Store launch: the tasks, in order

Everything the listing needs already exists: build 12 (version 1.0.0) is uploaded and TestFlight-approved, the app is iPhone-only so no iPad screenshots are asked for, the export compliance flag is already set in the build so that question never appears, the six screenshots are in `reports/app-store/` in the repo, and ediagd.ai/privacy and ediagd.ai/terms are live. What remains is App Store Connect form-filling plus one check of the review account. About an hour, then Apple's one to three days.

## 1. The review account — CHECKED 26 October, and it was broken

The account is **`appdeveloper@peartreecompanies.com`** (`app_user.full_name` "App Review", id `c2e634da…`). It was **not** going to land in a morning, and this is the most common first rejection:

| | before | now |
|---|---|---|
| `work_schedule` row | **absent** → `app/(app)/layout.tsx:52` redirects every screen to `/onboarding` | present, **all seven days** |
| `email_confirmed_at` | **null**, never signed in | confirmed |
| book (op 500242, Doggett Ford) | fine all along | **12 families above the floor of 5** → pitch slot fills, three-slot morning |
| roster row | not departed, `advisor_base` present | unchanged |

**The schedule is deliberately all seven days, including `saturday_mode: 'every'`.** A Mon–Fri schedule would have been worse than no schedule: `lib/work-schedule.ts:217` records that a **null schedule means every day is a work day**, so the account had no rest-card risk while it had no row — and giving it a weekday-only schedule would have handed App Review a **rest card** if they opened it on a Saturday or Sunday. A rest card is not a broken screen, which is exactly why it would have been read as one.

**Still yours to do, and it is the one thing I cannot:** the account has **never had a password set**. Set it in Supabase → Authentication → Users for that address, to whatever you are going to type into App Store Connect, then prove the sign-in:

```
 REVIEW_PW='<the password>' node .tmp-review/verify-login.mjs
```

Leading space so your shell keeps it out of history; `.tmp-review/` is gitignored. It signs in as the account **as `authenticated`, not as the service role** — every check above was made as the service role, and a gate keyed on `auth.uid()` has shut the backend out of this product three times — then asserts the onboarding gate, the membership, that the advisor can read **her own book** (a pitch slot that is empty because the rows are unreadable looks identical to one that is empty because the data is thin), and that published films are readable. It exits non-zero with the reason if any of that fails.

One caveat I could not close: a sign-in probe with a deliberately wrong password returned the generic "Invalid login credentials", which is **evidence about the wrong-password case only** — it cannot rule out email confirmation having been a blocker. The address was confirmed regardless, so the question is moot.

## 2. App Store Connect, App Information

Apps, EDIAGD, App Information. Name EDIAGD. Subtitle "Five minutes a morning for service advisors". Primary category Business, secondary Education. Content rights: does not contain third-party content. Age rating: open the questionnaire, answer No to everything, it returns 4+.

## 3. Pricing and Availability

Price Free. Availability United States (add countries later; it is one click). No pre-order.

## 4. App Privacy

Get started. Data collected: Yes. Contact Info: Name, Email Address. Identifiers: User ID. Usage Data: Product Interaction. For each: used for App Functionality and Analytics, linked to the user's identity, not used for tracking. Nothing else. Publish the answers.

## 5. The version page (1.0)

Screenshots: drag the six PNGs into the 6.9-inch iPhone slot in this order: 01-morning, 02-item, 03-celebration, 04-swell, 05-certifications, 06-more.

Promotional text: leave empty.

Description:

> EDIAGD is five minutes a morning for service advisors. Watch one short film from Mitch Hardt, run the day's routine, and build the habits that raise your numbers: the walk-around, the menu, the handback. Finish the nine core tracks and earn your EDIAGD Certified Service Advisor credential, with a number and a page any hiring manager can check. Managers see the whole store's progress. Accounts are provided by your dealership.

Keywords: `service advisor,dealership,training,fixed ops,automotive,certification,coaching,habits`

Support URL `https://ediagd.ai`. Marketing URL `https://ediagd.ai`. Privacy Policy URL `https://ediagd.ai/privacy`. Copyright `2026 Pear Tree Companies`.

Build: click the plus, choose 1.0.0 (12).

## 6. App Review Information

Sign-in required: Yes. User name and password: the review account from step 1. Contact: your name, phone, email.

Notes:

> EDIAGD is a subscription training product for automotive dealerships. Any dealership can subscribe at ediagd.ai; accounts are issued by the dealership, so there is no in-app sign-up or purchase. Please sign in with the credentials above; the first screen is that day's five-minute routine. Account deletion is handled by the dealership or by writing to aloha@ediagd.ai, as stated at ediagd.ai/privacy. The app streams video and needs a network connection.

Version release: Automatically release this version.

## 7. Submit

Add for Review, then Submit to App Review. Status goes Waiting for Review, then In Review, then Ready for Sale. Expect one to three days; a first version is rejected once more often than not and a resubmission costs a day or two.

## 8. Same day, after submitting

Contact Us (bottom of App Store Connect), App Review, Request an Expedited Review. Reason: a dealership group went live on the product this month and its staff are installing through TestFlight until the store listing is approved. Apple grants a fair share of these.

## If it comes back

Guideline 3.2 (business apps that belong in Apple Business Manager): reply in Resolution Center that EDIAGD is sold to any dealership that subscribes, with the public pricing or contact page on ediagd.ai, and resubmit. Guideline 2.1 (could not sign in or see content): fix the review account per step 1 and resubmit. Anything else: paste the rejection to me.

## After approval

Rollcall platform stays `ios` for store installs. Send the nine at Beaumont the App Store link; TestFlight keeps working for 90 days per build so nobody is cut off. Then start the Play account registration if Android turns out to matter.
