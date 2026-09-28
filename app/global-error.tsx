// app/global-error.tsx — last-resort boundary (2026-09-28).
//
// Catches failures in the ROOT layout itself (a bad font fetch, a provider
// crash) — app/error.tsx cannot cover those. It must render its own <html> and
// <body>, and it deliberately uses inline styles: the stylesheet that Tailwind
// generates may itself be what failed to load.

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <main style={{ maxWidth: "32rem", padding: "2.5rem 1.5rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>Writer could not start</h1>
          <p style={{ fontSize: "0.875rem", lineHeight: 1.6, color: "#52525b", marginTop: "0.75rem" }}>
            A failure outside the page stopped the app from rendering. Reloading usually
            fixes it; if it does not, the deployment configuration is the likely cause.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "#a1a1aa", marginTop: "0.75rem" }}>
              reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
