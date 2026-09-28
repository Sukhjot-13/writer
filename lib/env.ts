// lib/env.ts — required-environment helpers.
//
// Security rule for the auth path: a MISSING secret is never defaulted to an
// empty string. `requireEnv` throws, so a misconfigured deploy fails loudly
// (500 on the OTP route) instead of silently sending mail with an empty api-key
// or issuing a session nobody can attribute.
//
// Optional settings (AI base URL / model) keep their documented defaults via
// `hasEnv` + explicit `||` fallbacks at the read site.

/** Return the trimmed value of `name`, or throw when it is missing/blank. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is required — set it in .env.local for local dev and in the ` +
        `Vercel project's environment variables for deploys. It is never defaulted.`,
    );
  }
  return value.trim();
}

/** True when `name` is present and non-blank. */
export function hasEnv(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "";
}
