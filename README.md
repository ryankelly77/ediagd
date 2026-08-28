# EDIAGD — Project Context for Claude Code

You are working in the EDIAGD codebase. Read this before making changes. When in doubt, follow this file over your defaults, and ask rather than guess on anything not covered here.

## What this is
EDIAGD ("Every Day Is A Great Day") is an AI-powered coaching platform for automotive dealership service advisors, managers, and technicians. Advisors get a 3-minute daily habit: a stat, a selling-skill video (chosen from their weakest service), and a lifestyle/sales-skill video. Managers coach from a team view. Owners/admins watch engagement across rooftops. Built for Mitch Hardt; developed by Pear Tree Companies (Ryan Kelly).

## Stack
- Next.js 16 (App Router, Turbopack), TypeScript, React
- Tailwind CSS v4 (CSS-first `@theme` in `app/globals.css` — there is NO tailwind.config.ts in use)
- Supabase (Postgres + Auth + RLS). `@supabase/ssr` for App Router auth.
- Session handling lives in `proxy.ts` (Next 16 renamed `middleware` → `proxy`).
- Deploy target: Vercel.

## Hard rules
- **Never invent brand colors or fonts.** Use the design tokens only (see Brand).
- **Never use red.** The brand is Aloha/positive. For attention/alerts use `clay` (#C9762F), never red. The lowest service status is "Pursue," never "needs work."
- **Mobile-first, always.** Design for phone first, scale up. Advisors use this on the service drive on a phone.
- **No PWA. Native is a Capacitor shell around the deployed web app.** _(Rewritten Aug 2026 — this replaces "plain mobile web for now; native (React Native) is a later if-needed call". The trigger was push: notifications are the feature that a browser tab cannot deliver, and everything else about going native follows from wanting them.)_
  - **Still no PWA plumbing.** No service worker, no `manifest.json`, no web push. Those solve the same problem worse and Apple's support for them is not something to build a product on.
  - **React Native is not planned.** It would mean rewriting every screen. The app is already mobile-first and ships continuously; a wrapper keeps one codebase and one deploy, and copy changes never wait on an App Store review.
  - **The shell is deliberately thin.** It loads the production URL in a webview and adds only what a tab cannot do: push, universal/app links, home-screen presence, and biometric unlock. If a feature can be built in the web app, build it there.
  - Config in `capacitor.config.ts`; native seam in `lib/native/bridge.ts` (every function no-ops in a browser); shell behaviour mounted once in `app/(app)/layout.tsx`. Bundle id `ai.ediagd.app` on both platforms.
- **RLS is the security boundary.** Never bypass it from client code. Provisioning/writes that must cross tenants run server-side with the service role only.
- **Don't hardcode secrets.** Anon key is public/client-safe; the service_role key is server-only and must never appear in `NEXT_PUBLIC_*` or client bundles.

## Brand (tokens live in styles/brand.css + app/globals.css @theme)
- Colors: Midnight `#0C1C2C` (navy), Deep Water `#163A54`, Ocean `#2C6E8A`, Reef/teal `#4AA8B0`, Seafoam `#7EC8CD`, Sunrise Gold `#E8B44C`, Sand/cream `#F4F0E4`, Mist `#D9ECEE`. Status: palm/green = on track, gold = close, clay = pursue.
- Tailwind utilities exist for these: `bg-navy`, `text-teal`, `bg-cream`, `text-clay`, `bg-teal-soft`, etc.
- Wordmark font is **Marcellus**; tagline font is **Montserrat SemiBold**; "Mahalo" accent is a chancery script (`var(--font-script)`). Body/UI is Helvetica/system sans. (Marcellus/Montserrat may not be loaded yet — if you set the wordmark as text, load them via next/font and point `--font-display` at Marcellus.)
- Tagline is **"Every Day Is A Great Day"** (product decision to use GREAT; the printed brand book says GOOD — GREAT wins in-app). Render it from `BRAND.tagline` in `lib/brand.ts` — never retype it inline.
- Logo files: `public/brand/svg|png|jpg/`. Use `-primary-dark` on dark backgrounds, `-primary-light` on light. `mark-*` = badge only; `lockup-*` = mark+wordmark; `mark-simple-*` = only below ~32px. "Mahalo" is a sign-off, never inside the logo.
- App shell: wrap pages in the `.ediagd-app` class (cream surface, body font). Cards use `rounded-card`, focus rings are gold.

## Data model (Supabase — migrations in supabase/migrations/)
- Tenancy: `org` → `rooftop` (the billing unit) → `membership` (a person's role AT a rooftop).
- Roles (`member_role`): `advisor`, `manager`, `technician`, `admin`. Technician is first-class (Joe the Pro add-on).
- Entitlements: `rooftop_product` = what a rooftop owns; products are `advisor_base`, `manager_meetings`, `joe_the_pro` (flat per-rooftop). `product_catalog` says who each product serves and who can buy it.
- **The core access rule everywhere: role × product.** You can see add-on content only if your role consumes it AND your rooftop owns the product. Enforced in RLS (0002).
- Content: `content_item` tagged by `library` (`coaching_cues`, `op_code_videos`, `general_sales`, `stats`, `manager_meetings`, `joe_the_pro`); `content_progress` drives streaks/engagement.
- Not built yet: performance layer (advisor metrics, attach rates, service families, periods) modeled on the real Doggett op-code report; billing (Stripe ↔ rooftop_product); video pipeline.

## Real data shape (for the performance layer)
Source is a monthly DMS op-code export (e.g., Doggett Chrysler June 2026). Per advisor: operator/op-code ID, tier (Elite/Strong/Low/Zero), ROs, labor sales, effective labor rate, GP%. Per advisor × service family: attach rate, with store average and store best for comparison. ~10 service families. No customer PII. Status dots compare an advisor's rate to the STORE AVERAGE; "Eddie's Pick" = their weakest family vs store average, revenue-weighted.

## Conventions
- Server components read data by default; add `"use client"` only for interactivity (forms, onClick).
- Supabase clients: `lib/supabase/server.ts` (server), `lib/supabase/client.ts` (browser).
- Keep components small and in `components/`. Brand primitives in `components/brand/`.
- After changes, make sure `npm run dev` compiles clean. Report what files you changed and why.

## Current status
Foundation done: branded shell, auth (email+password), multi-tenant schema + RLS verified, seeded test rooftop (admin user, all 3 products). Building now: mobile-first screens, starting with the animated sunrise/beach login.
