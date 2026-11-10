'use client';
/**
 * Estimates the offset between this device's clock and the server clock using
 * NTP-style sampling against /api/time. All playback maths uses serverNow().
 */
let offsetMs = 0;
let lastRtt = 0;
let syncing: Promise<void> | null = null;

export const serverNow = () => Date.now() + offsetMs;
export const clockRtt = () => lastRtt;

async function sample() {
  const t0 = performance.now();
  const wall0 = Date.now();
  const res = await fetch('/api/time', { cache: 'no-store' });
  const { now } = (await res.json()) as { now: number };
  const rtt = performance.now() - t0;
  return { rtt, offset: now + rtt / 2 - (wall0 + rtt) };
}

export function syncClock(): Promise<void> {
  if (syncing) return syncing;
  syncing = (async () => {
    const samples: { rtt: number; offset: number }[] = [];
    for (let i = 0; i < 5; i++) {
      try { samples.push(await sample()); } catch { /* offline: keep old offset */ }
    }
    if (samples.length) {
      samples.sort((a, b) => a.rtt - b.rtt);
      // The lowest-latency samples are the most accurate.
      const best = samples.slice(0, Math.max(1, Math.ceil(samples.length / 2)));
      offsetMs = best.reduce((s, x) => s + x.offset, 0) / best.length;
      lastRtt = best[0].rtt;
    }
  })().finally(() => { syncing = null; });
  return syncing;
}
