// components/SignOutButton.tsx — session sign-out control (2026-09-28).
//
// POSTs /api/auth/logout (which deletes the session ROW server-side, so a copied
// cookie is dead too) and then navigates to /login. Errors surface as an inline
// message next to the button — no alert().

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Could not sign out.");
      router.push("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-red-600">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        title="Sign out of Writer"
        className={
          className ??
          "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40"
        }
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
