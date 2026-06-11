import "server-only";

// In-memory sliding window: best-effort koruma. Serverless instance'lari
// arasinda paylasilmaz; asil backstop Supabase Auth'un kendi rate limitleridir.
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, number[]>();

function prune(now: number): void {
  if (attempts.size < 1000) return;
  for (const [key, stamps] of attempts) {
    const live = stamps.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) attempts.delete(key);
    else attempts.set(key, live);
  }
}

export function isRateLimited(key: string): boolean {
  const now = Date.now();
  prune(now);
  const stamps = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= MAX_ATTEMPTS) {
    attempts.set(key, stamps);
    return true;
  }
  stamps.push(now);
  attempts.set(key, stamps);
  return false;
}
