// components/LoginForm.tsx — the passwordless sign-in form (2026-09-28).
//
// Two steps in one component: email → "Send code" → 6-digit code → "Sign in".
// There is no password field, and no `alert()`: every failure renders as an
// inline banner (the same pattern LibraryList and the editor use) so the user
// always sees what happened next to the form.
//
// The server is deliberately vague about WHY a code failed, so the client shows
// the generic message it receives rather than guessing.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Stage = "email" | "code";

export default function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not send the code.");
      setNotice(body.message ?? "If that address can receive mail, a code is on its way.");
      setStage("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "That code is not valid.");
      router.push("/library");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code is not valid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm flex-1 px-6 py-16">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg text-[#fff]">
          ✎
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Sign in to Writer</h1>
        <p className="mt-1 text-sm text-zinc-500">
          No password — we email you a 6-digit code that expires in 10 minutes.
        </p>
      </div>

      <form
        onSubmit={stage === "email" ? sendCode : verifyCode}
        className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-zinc-700">
          Email address
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={stage === "code" || busy}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-zinc-50"
        />

        {stage === "code" && (
          <>
            <label htmlFor="login-code" className="mt-4 mb-1.5 block text-sm font-medium text-zinc-700">
              6-digit code
            </label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              aria-describedby="login-code-hint"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <p id="login-code-hint" className="mt-1.5 text-xs text-zinc-500">
              The code expires in 10 minutes and works once.
            </p>
          </>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        {notice && !error && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-[#fff] shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-40"
        >
          {busy ? "Working…" : stage === "email" ? "Send code" : "Sign in"}
        </button>

        {stage === "code" && (
          <button
            type="button"
            onClick={() => {
              setStage("email");
              setCode("");
              setError(null);
              setNotice(null);
            }}
            className="mt-3 w-full text-center text-xs text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
          >
            Use a different email
          </button>
        )}
      </form>
    </div>
  );
}
