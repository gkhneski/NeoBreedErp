import "server-only";

// In-memory sliding window: best-effort koruma. Serverless instance'lari
// arasinda paylasilmaz; asil backstop Supabase Auth'un kendi rate limitleridir.
// Yalnizca BASARISIZ girisler sayilir (basarili giris mesru kullanimdir).
const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;

const failures = new Map<string, number[]>();

function prune(now: number): void {
  if (failures.size < 1000) return;
  for (const [key, stamps] of failures) {
    const live = stamps.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) failures.delete(key);
    else failures.set(key, live);
  }
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  const stamps = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, stamps);
  return stamps.length >= MAX_FAILURES;
}

export function registerFailure(key: string): void {
  const now = Date.now();
  prune(now);
  const stamps = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  stamps.push(now);
  failures.set(key, stamps);
}
