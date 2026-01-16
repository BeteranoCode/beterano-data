function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

export function buildMetadata(name: string, key: string) {
  const readableKey = key.replace(/-/g, " ");
  const aliases = uniqueStrings([name, readableKey]);
  const keywords = uniqueStrings([
    ...tokenize(name),
    ...tokenize(key),
  ]);
  const confidenceHints = uniqueStrings([key, name.toLowerCase()]);

  return {
    aliases: aliases.length ? aliases : undefined,
    keywords: keywords.length ? keywords : undefined,
    confidenceHints: confidenceHints.length ? confidenceHints : undefined,
  };
}
