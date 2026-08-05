"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

export function LoginScreen() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Honour prefers-reduced-motion: hold the poster frame instead of looping.
  // CSS can't stop video playback, so this has to be imperative.
  useEffect(() => {
	const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

	function apply() {
	  const video = videoRef.current;
	  if (!video) return;
	  if (mq.matches) {
		video.pause();
		video.removeAttribute("autoplay");
		video.load(); // resets to the poster rather than freezing mid-frame
	  } else {
		video.play().catch(() => {
		  /* autoplay refused — the poster stands in */
		});
	  }
	}

	apply();
	mq.addEventListener("change", apply);
	return () => mq.removeEventListener("change", apply);
  }, []);

  async function handleLogin() {
	setLoading(true);
	setError(null);
	const { error } = await supabase.auth.signInWithPassword({ email, password });
	setLoading(false);
	if (error) {
	  setError(error.message);
	  return;
	}
	router.push("/");
	router.refresh();
  }

  return (
	<main className="relative min-h-screen w-full overflow-hidden">
	  {/* ---- Layer 1: looping video background ---- */}
	  <video
		ref={videoRef}
		className="absolute inset-0 h-full w-full object-cover"
		autoPlay
		muted
		loop
		playsInline
		poster="/video/ediagd-login-poster.jpg"
		aria-hidden="true"
	  >
		<source src="/video/ediagd-login.webm" type="video/webm" />
		<source src="/video/ediagd-login.mp4" type="video/mp4" />
	  </video>

	  {/* ---- Layer 2: scrim for text legibility ----
		  Off by default so the raw video can be evaluated first.
		  Tune opacities (e.g. from-navy/30 to-navy/60) after reviewing. */}
	  <div className="absolute inset-0 bg-gradient-to-b from-navy/0 via-navy/0 to-navy/0" />

	  {/* ---- Layer 3: foreground — logo, form, Aloha ---- */}
	  <div className="relative z-10 mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
		<div className="relative mb-6 flex flex-col items-center">
		  {/* Local halo — keeps the navy mark legible on every frame of the loop.
			  Soft radial fade, not a boxed panel. */}
		  <div
			aria-hidden="true"
			className="pointer-events-none absolute -inset-x-8 -inset-y-6"
			style={{
			  background:
				"radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.38) 45%, rgba(255,255,255,0) 72%)",
			}}
		  />
		  <div className="relative flex flex-col items-center">
			<img src="/brand/svg/ediagd-mark-primary-light.svg" alt="EDIAGD" className="h-20 w-auto" />
			<span className="mt-3 font-display text-3xl tracking-[0.22em] text-navy">{BRAND.name}</span>
			<span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-navy/80">
			  {BRAND.tagline}
			</span>
		  </div>
		</div>

		<div className="rounded-2xl bg-white/95 p-6 shadow-2xl backdrop-blur">
		  <div className="space-y-3">
			<input
			  type="email"
			  placeholder="Email"
			  aria-label="Email"
			  autoComplete="email"
			  value={email}
			  onChange={(e) => setEmail(e.target.value)}
			  className="w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold"
			/>
			<input
			  type="password"
			  placeholder="Password"
			  aria-label="Password"
			  autoComplete="current-password"
			  value={password}
			  onChange={(e) => setPassword(e.target.value)}
			  className="w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold"
			/>
			{error && <p className="text-sm text-clay">{error}</p>}
			<button
			  onClick={handleLogin}
			  disabled={loading}
			  className="w-full rounded-xl bg-gold p-3 font-extrabold text-navy transition hover:brightness-95 disabled:opacity-60"
			>
			  {loading ? "Signing in…" : "Sign in"}
			</button>
		  </div>
		</div>

		<p className="mt-6 text-center text-3xl text-navy/90" style={{ fontFamily: "var(--font-script)" }}>
		  {BRAND.greeting}
		</p>
	  </div>
	</main>
  );
}

export default LoginScreen;
