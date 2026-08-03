"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
	  {/* ---- Sunrise sky ---- */}
	  <div className="absolute inset-0 bg-gradient-to-b from-[#F3E2BD] via-[#E8B44C] to-[#0C1C2C]" />

	  {/* ---- Sun ---- */}
	  <div
		className="absolute left-1/2 top-[22%] h-40 w-40 -translate-x-1/2 rounded-full"
		style={{
		  background: "radial-gradient(circle, #FBEFC8 0%, #E8B44C 55%, rgba(232,180,76,0) 72%)",
		  animation: "ediagd-sun 6s ease-in-out infinite",
		}}
	  />

	  {/* ---- Ocean + waves (SVG, layered, drifting) ---- */}
	  <div className="absolute inset-x-0 bottom-0 h-[45%]">
		<svg className="absolute bottom-0 h-full w-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
		  <path className="wave wave-back" fill="#163A54"
			d="M0,160 C240,220 480,100 720,140 C960,180 1200,120 1440,160 L1440,320 L0,320 Z" />
		  <path className="wave wave-mid" fill="#2C6E8A"
			d="M0,200 C240,160 480,240 720,200 C960,160 1200,240 1440,200 L1440,320 L0,320 Z" />
		  <path className="wave wave-front" fill="#0C1C2C"
			d="M0,240 C240,280 480,220 720,250 C960,280 1200,230 1440,260 L1440,320 L0,320 Z" />
		</svg>
	  </div>

	  {/* ---- Foreground: logo, form, Mahalo ---- */}
	  <div className="relative z-10 mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
		<div className="mb-6 flex flex-col items-center">
		  <img src="/brand/svg/ediagd-mark-primary-light.svg" alt="EDIAGD" className="h-20 w-auto drop-shadow" />
		  <span className="mt-3 font-display text-3xl tracking-[0.22em] text-white drop-shadow">EDIAGD</span>
		  <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/85">
			Everyday Is A Great Day
		  </span>
		</div>

		<div className="rounded-2xl bg-white/95 p-6 shadow-2xl backdrop-blur">
		  <div className="space-y-3">
			<input
			  type="email"
			  placeholder="Email"
			  value={email}
			  onChange={(e) => setEmail(e.target.value)}
			  className="w-full rounded-xl border border-line bg-cream-card p-3 text-navy outline-none focus:ring-2 focus:ring-gold"
			/>
			<input
			  type="password"
			  placeholder="Password"
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

		<p className="mt-6 text-center text-3xl text-white/90" style={{ fontFamily: "var(--font-script)" }}>
		  Mahalo
		</p>
	  </div>

	  {/* ---- Animations ---- */}
	  <style>{`
		.wave { transform-origin: center bottom; }
		.wave-back  { animation: ediagd-drift 14s ease-in-out infinite; opacity:.7; }
		.wave-mid   { animation: ediagd-drift 10s ease-in-out infinite reverse; opacity:.85; }
		.wave-front { animation: ediagd-drift 8s  ease-in-out infinite; }
		@keyframes ediagd-drift {
		  0%,100% { transform: translateX(0) translateY(0); }
		  50%     { transform: translateX(-28px) translateY(6px); }
		}
		@keyframes ediagd-sun {
		  0%,100% { transform: translateX(-50%) scale(1);    opacity:.95; }
		  50%     { transform: translateX(-50%) scale(1.05); opacity:1; }
		}
		@media (prefers-reduced-motion: reduce) {
		  .wave, [style*="ediagd-sun"] { animation: none !important; }
		}
	  `}</style>
	</main>
  );
}