import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginScreen } from "./LoginScreen";

/**
 * Server wrapper around the login screen.
 *
 * Someone who is already signed in has no business on the login form — send
 * them to "/", which routes by role. Redirecting there rather than to a
 * specific screen keeps the role logic in exactly one place.
 */
export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/");

  return <LoginScreen />;
}
