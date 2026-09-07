"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  AuthShell,
  AUTH_INPUT,
  AUTH_BUTTON,
  AUTH_QUIET_LINK,
} from "@/components/auth/AuthShell";

export function LoginScreen() {
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
	<AuthShell>
	  <div className="space-y-3">
		<input
		  type="email"
		  placeholder="Email"
		  aria-label="Email"
		  autoComplete="email"
		  value={email}
		  onChange={(e) => setEmail(e.target.value)}
		  className={AUTH_INPUT}
		/>
		<input
		  type="password"
		  placeholder="Password"
		  aria-label="Password"
		  autoComplete="current-password"
		  value={password}
		  onChange={(e) => setPassword(e.target.value)}
		  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
		  className={AUTH_INPUT}
		/>
		{error && <p className="text-sm font-bold text-clay">{error}</p>}
		<button onClick={handleLogin} disabled={loading} className={AUTH_BUTTON}>
		  {loading ? "Signing in…" : "Sign in"}
		</button>

		{/* QUIET, AND UNDER THE ACTION. Somebody who knows their password must
			not be offered a reset before the thing they came for; somebody who
			does not has to find it without hunting. Gold stays on Sign in. */}
		<Link href="/forgot-password" className={AUTH_QUIET_LINK}>
		  Forgot password?
		</Link>
	  </div>
	</AuthShell>
  );
}

export default LoginScreen;
