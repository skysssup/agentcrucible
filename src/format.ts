/** Shortens text to at most `max` characters, ending with "…" when cut. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
