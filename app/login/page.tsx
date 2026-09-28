// app/login/page.tsx — the only public page (2026-09-28).
//
// Email-OTP sign-in. It is deliberately reachable WITHOUT a session (middleware
// exempts /api/auth, and this page redirects an already-signed-in visitor to
// /library), and it is a server component so the redirect decision never
// depends on client JS.

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import LoginForm from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Writer App",
};

export default async function LoginPage() {
  let signedIn = false;
  try {
    signedIn = (await getSessionUser()) !== null;
  } catch {
    // A database hiccup must not lock someone out of the login page itself —
    // the form is the only way to recover.
    signedIn = false;
  }
  if (signedIn) redirect("/library");
  return <LoginForm />;
}
