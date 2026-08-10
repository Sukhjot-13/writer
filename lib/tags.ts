// lib/tags.ts — tag parsing shared by the block editor and the toolbar (M5, FR-5/18).
// "a, b, #c" → ["a", "b", "c"] — lowercased, de-hashed, deduped, whitespace → "-".

export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase().replace(/^#+/, "").replace(/\s+/g, "-");
    if (tag && !seen.has(tag)) seen.add(tag);
  }
  return [...seen];
}
