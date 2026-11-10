'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { serverNow } from '@/lib/clock';
import { isSyncable } from '@/lib/video';
import type { PlaybackState, Room, SourceType } from '@/lib/types';
import type { PlayerHandle } from '@/components/room/players';

export function stateFromRoom(r: Room, origin: PlaybackState['origin'] = 'db'): PlaybackState {
  return {
    is_playing: r.is_playing,
    position: r.position,
    playback_rate: r.playback_rate,
    updatedAtMs: new Date(r.state_updated_at).getTime(),
    version: Number(r.state_version),
    source_type: r.source_type,
    source_url: r.source_url,
    source_title: r.source_title,
    countdownAtMs: r.countdown_at ? new Date(r.countdown_at).getTime() : null,
    origin,
  };
}

/** Where the authoritative timeline is "now", in seconds. */
export function expectedPosition(s: PlaybackState, now = serverNow()) {
  if (!s.is_playing) return s.position;
  return s.position + Math.max(0, (now - s.updatedAtMs) / 1000) * s.playback_rate;
}

const DRIFT_SEEK_FINE = 2.0;   // HTML5: beyond this, hard seek
const DRIFT_NUDGE = 0.15;      // HTML5: beyond this, adjust rate
const DRIFT_SEEK_COARSE = 1.5; // YouTube: seek beyond this (its seeks re-buffer, so be patient)
const COARSE_SEEK_COOLDOWN = 5000; // YouTube: min ms between automatic correction seeks
const PAUSED_TOLERANCE = 0.35;

interface Options {
  roomId: string;
  initial: Room;
  controlling: boolean;
  player: React.RefObject<PlayerHandle>;
  broadcast: (s: PlaybackState) => void;
  onError: (msg: string) => void;
  onDenied: () => void;
}

export function useSync({ roomId, initial, controlling, player, broadcast, onError, onDenied }: Options) {
  const supabase = getSupabase();
  const stateRef = useRef<PlaybackState>(stateFromRoom(initial));
  const [state, setState] = useState<PlaybackState>(stateRef.current);
  const [needsGesture, setNeedsGesture] = useState<null | 'muted' | 'blocked'>(null);
  const [buffering, setBufferingState] = useState(false);
  const bufferingRef = useRef(false);
  const lastCoarseSeek = useRef(0);
  const setBuffering = useCallback((b: boolean) => { bufferingRef.current = b; setBufferingState(b); }, []);
  const suppressUntil = useRef(0);
  const ready = useRef(false);
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();
  const controllingRef = useRef(controlling);
  controllingRef.current = controlling;
  const gestureRef = useRef(needsGesture);
  gestureRef.current = needsGesture;
  const cbs = useRef({ broadcast, onError, onDenied });
  cbs.current = { broadcast, onError, onDenied };

  const suppress = (ms = 800) => { suppressUntil.current = performance.now() + ms; };

  /** Bring the local player in line with the authoritative state. */
  const enforce = useCallback(async (hard = false) => {
    const p = player.current;
    const s = stateRef.current;
    if (!p || !ready.current || !isSyncable(s.source_type)) return;
    // While the player is loading data, corrective seeks only cause more buffering.
    if (!hard && bufferingRef.current) return;
    const now = serverNow();
    const exp = expectedPosition(s, now);
    const shouldPlay = s.is_playing && now >= s.updatedAtMs - 40;
    const drift = p.getTime() - exp;

    if (!shouldPlay) {
      p.setRate(s.playback_rate);
      if (!p.isPaused()) { suppress(); p.pause(); }
      if (Math.abs(drift) > PAUSED_TOLERANCE) { suppress(); p.seek(exp); }
      return;
    }

    if (p.fineRate) {
      if (hard ? Math.abs(drift) > 0.3 : Math.abs(drift) > DRIFT_SEEK_FINE) { suppress(); p.seek(exp); p.setRate(s.playback_rate); }
      else if (Math.abs(drift) > DRIFT_NUDGE) p.setRate(s.playback_rate * (drift > 0 ? 0.94 : 1.06));
      else p.setRate(s.playback_rate);
    } else {
      p.setRate(s.playback_rate);
      const nowMs = performance.now();
      const canSeek = hard || nowMs - lastCoarseSeek.current > COARSE_SEEK_COOLDOWN;
      if (canSeek && Math.abs(drift) > (hard ? 0.5 : DRIFT_SEEK_COARSE)) { lastCoarseSeek.current = nowMs; suppress(1200); p.seek(exp + 0.2); }
    }

    if (p.isPaused() && gestureRef.current !== 'blocked') {
      suppress(1500);
      const r = await p.play();
      if (r !== 'ok') setNeedsGesture(r);
    }
  }, [player]);

  /** Accept a newer state from the database or a broadcast. */
  const applyRemote = useCallback((incoming: PlaybackState) => {
    const cur = stateRef.current;
    if (incoming.version < cur.version) return;
    if (incoming.version === cur.version && !(incoming.origin === 'db' && cur.origin !== 'db')) return;
    const sourceChanged = incoming.source_url !== cur.source_url || incoming.source_type !== cur.source_type;
    // Only snap hard when something meaningful changed. The database echo of our own
    // change differs by a few ms; snapping on it makes the host's video stutter.
    const meaningful = incoming.is_playing !== cur.is_playing
      || incoming.playback_rate !== cur.playback_rate
      || incoming.countdownAtMs !== cur.countdownAtMs
      || Math.abs(expectedPosition(incoming) - expectedPosition(cur)) > 1;
    stateRef.current = incoming;
    setState(incoming);
    if (sourceChanged) { ready.current = false; return; } // new player mounts and calls onReady
    enforce(meaningful);
  }, [enforce]);

  const commit = useCallback(async (next: PlaybackState, sourceChanged: boolean) => {
    stateRef.current = next;
    setState(next);
    cbs.current.broadcast(next);
    const { data, error } = await supabase.rpc('update_playback', {
      p_room: roomId,
      p_is_playing: next.is_playing,
      p_position: next.position,
      p_rate: next.playback_rate,
      p_sent_at: new Date(serverNow()).toISOString(),
      ...(sourceChanged ? { p_source_type: next.source_type, p_source_url: next.source_url, p_source_title: next.source_title } : {}),
    });
    if (error) {
      cbs.current.onError(error.message);
      const { data: fresh } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      if (fresh) { stateRef.current = { ...stateRef.current, version: -1 }; applyRemote(stateFromRoom(fresh as Room)); }
      return;
    }
    applyRemote(stateFromRoom(data as Room));
  }, [supabase, roomId, applyRemote]);

  /** Called on player play/pause/seek. Pushes host changes, reverts viewer changes. */
  const onLocalChange = useCallback(() => {
    if (performance.now() < suppressUntil.current || !ready.current) return;
    if (!controllingRef.current) {
      cbs.current.onDenied();
      suppress();
      enforce(true);
      return;
    }
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const p = player.current; if (!p) return;
      const s = stateRef.current;
      const isPlaying = !p.isPaused();
      const pos = p.getTime();
      if (isPlaying === s.is_playing && Math.abs(pos - expectedPosition(s)) < 0.6 && !s.countdownAtMs) return;
      commit({ ...s, is_playing: isPlaying, position: pos, updatedAtMs: serverNow(), version: s.version + 1, countdownAtMs: null, origin: 'local' }, false);
    }, 150);
  }, [player, enforce, commit]);

  const changeSource = useCallback((type: SourceType, url: string | null, title: string | null) => {
    const s = stateRef.current;
    if (url !== s.source_url || type !== s.source_type) ready.current = false;
    setNeedsGesture(null);
    commit({ ...s, source_type: type, source_url: url, source_title: title, is_playing: false, position: 0,
      updatedAtMs: serverNow(), version: s.version + 1, countdownAtMs: null, origin: 'local' }, true);
  }, [commit]);

  /** For sources without a controllable player (Netflix / blocked sites). */
  const setManual = useCallback((isPlaying: boolean, position: number) => {
    const s = stateRef.current;
    commit({ ...s, is_playing: isPlaying, position, updatedAtMs: serverNow(), version: s.version + 1, countdownAtMs: null, origin: 'local' }, false);
  }, [commit]);

  const startCountdown = useCallback(async (seconds = 5) => {
    const { data, error } = await supabase.rpc('start_countdown', { p_room: roomId, p_seconds: seconds });
    if (error) { cbs.current.onError(error.message); return; }
    const next = stateFromRoom(data as Room);
    cbs.current.broadcast(next);
    applyRemote(next);
  }, [supabase, roomId, applyRemote]);

  const onPlayerReady = useCallback(() => {
    ready.current = true;
    enforce(true);
  }, [enforce]);

  const resolveGesture = useCallback(async () => {
    const p = player.current; if (!p) return;
    p.unmute();
    setNeedsGesture(null);
    suppress(1500);
    if (stateRef.current.is_playing) {
      const r = await p.play();
      if (r === 'blocked') setNeedsGesture('blocked');
    }
    enforce(true);
  }, [player, enforce]);

  // Continuous drift correction + countdown-timed start.
  useEffect(() => {
    const t = setInterval(() => { if (performance.now() >= suppressUntil.current) enforce(false); }, 1000);
    const onVis = () => document.visibilityState === 'visible' && enforce(true);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [enforce]);

  // Fire exactly at a scheduled start time (countdown), not on the next tick.
  useEffect(() => {
    const wait = state.updatedAtMs - serverNow();
    if (!state.is_playing || wait <= 0 || wait > 15000) return;
    const t = setTimeout(() => enforce(true), wait);
    return () => clearTimeout(t);
  }, [state.updatedAtMs, state.is_playing, enforce]);

  return {
    state, stateRef, needsGesture, buffering, setBuffering,
    applyRemote, onLocalChange, changeSource, setManual, startCountdown, onPlayerReady, resolveGesture,
  };
}
