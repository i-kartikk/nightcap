'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, Play, Pause, Timer } from 'lucide-react';
import type { PlaybackState } from '@/lib/types';
import { expectedPosition } from '@/hooks/useSync';
import { formatTime } from '@/lib/utils';
import { serverNow } from '@/lib/clock';

function parseClock(v: string) {
  const parts = v.trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => !isFinite(n) || n < 0)) return null;
  return parts.reduce((s, n) => s * 60 + n, 0);
}

/** Netflix: no embedding, no programmatic control. A shared clock helps everyone line up. */
export function NetflixPanel({ url }: { url: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#1a0606] to-black p-6 text-center">
      <span className="font-display text-4xl font-extrabold tracking-tight text-[#E50914]">NETFLIX</span>
      <p className="max-w-md text-sm leading-relaxed text-white/75">
        Netflix doesn’t allow other websites to show or control its player. Each person opens the title in their own
        Netflix account, then uses the room clock below to start at the same moment.
      </p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary"><ExternalLink className="h-4 w-4" />Open in Netflix</a>
      <p className="text-xs text-white/40">Everyone needs their own Netflix subscription.</p>
    </div>
  );
}

export function ManualSyncBar({ state, controlling, onSet, onCountdown }: {
  state: PlaybackState; controlling: boolean; onSet(playing: boolean, pos: number): void; onCountdown(): void;
}) {
  const [, tick] = useState(0);
  const [input, setInput] = useState('');
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 250); return () => clearInterval(t); }, []);
  const pos = expectedPosition(state);
  const waiting = state.is_playing && state.updatedAtMs > serverNow();

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <Timer className="h-5 w-5 text-beam" />
      <div>
        <p className="font-display text-2xl font-bold tabular-nums">{formatTime(pos)}</p>
        <p className="text-xs text-white/50">{waiting ? 'Starting soon…' : state.is_playing ? 'Room clock is running. Match your player to it.' : 'Room clock is paused'}</p>
      </div>
      {controlling && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); const t = parseClock(input); if (t !== null) { onSet(false, t); setInput(''); } }} className="flex gap-1.5">
            <input className="input w-28 py-2 text-sm" placeholder="1:02:30" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Set room clock" />
            <button className="btn-ghost px-3 py-2">Set</button>
          </form>
          <button className="btn-ghost px-3 py-2" onClick={() => onSet(!state.is_playing, pos)}>
            {state.is_playing ? <><Pause className="h-4 w-4" />Pause clock</> : <><Play className="h-4 w-4" />Start clock</>}
          </button>
          <button className="btn-primary px-3 py-2" onClick={onCountdown}>3-2-1 countdown</button>
        </div>
      )}
    </div>
  );
}
