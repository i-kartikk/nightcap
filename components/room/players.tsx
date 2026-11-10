'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

export type PlayResult = 'ok' | 'muted' | 'blocked';

export interface PlayerHandle {
  play(): Promise<PlayResult>;
  pause(): void;
  seek(t: number): void;
  getTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  setRate(r: number): void;
  unmute(): void;
  /** True when small playbackRate nudges are possible (HTML5); YouTube only seeks. */
  readonly fineRate: boolean;
  qualities?(): { id: number; label: string }[];
  setQuality?(id: number): void;
  pip?(): Promise<void>;
  nativeFullscreen?(): void;
}

export interface PlayerEvents {
  onReady(): void;
  onPlay(): void;
  onPause(): void;
  onSeek(): void;
  onBuffering?(b: boolean): void;
}

/* ------------------------------------------------------------------ */
/* YouTube IFrame Player API                                           */
/* ------------------------------------------------------------------ */
let ytApi: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(w.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    document.head.appendChild(s);
  });
  return ytApi;
}

export const YouTubePlayer = forwardRef<PlayerHandle, { videoId: string } & PlayerEvents>(function YouTubePlayer(
  { videoId, onReady, onPlay, onPause, onSeek, onBuffering }, ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const cb = useRef({ onReady, onPlay, onPause, onSeek, onBuffering });
  cb.current = { onReady, onPlay, onPause, onSeek, onBuffering };
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    loadYouTubeApi().then((YT) => {
      if (disposed || !host.current) return;
      const el = document.createElement('div');
      host.current.appendChild(el);
      player.current = new YT.Player(el, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: window.location.origin, enablejsapi: 1 },
        events: {
          onReady: () => {
            cb.current.onReady();
            // The IFrame API has no seek event: detect jumps by comparing progress.
            let lastT = player.current.getCurrentTime?.() ?? 0;
            let lastWall = performance.now();
            poll = setInterval(() => {
              const p = player.current; if (!p?.getCurrentTime) return;
              const t = p.getCurrentTime();
              const now = performance.now();
              const playing = p.getPlayerState() === 1;
              const expected = lastT + (playing ? ((now - lastWall) / 1000) * (p.getPlaybackRate?.() ?? 1) : 0);
              if (Math.abs(t - expected) > 1.2) cb.current.onSeek();
              lastT = t; lastWall = now;
            }, 500);
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === 1) { cb.current.onBuffering?.(false); cb.current.onPlay(); }
            else if (e.data === 2 || e.data === 0) cb.current.onPause();
            else if (e.data === 3) cb.current.onBuffering?.(true);
          },
          onError: (e: { data: number }) => {
            setError(e.data === 101 || e.data === 150
              ? 'The owner of this video doesn’t allow it to play on other websites. Pick another video.'
              : 'YouTube couldn’t play this video. Check the link or pick another one.');
          },
        },
      });
    });
    return () => {
      disposed = true;
      if (poll) clearInterval(poll);
      try { player.current?.destroy(); } catch { /* already gone */ }
      player.current = null;
      if (host.current) host.current.innerHTML = '';
    };
  }, [videoId]);

  useImperativeHandle(ref, () => ({
    fineRate: false,
    async play() {
      const p = player.current; if (!p?.playVideo) return 'blocked';
      p.playVideo();
      await new Promise((r) => setTimeout(r, 1200));
      const s = p.getPlayerState?.();
      if (s === 1 || s === 3) return 'ok';
      p.mute(); p.playVideo();
      await new Promise((r) => setTimeout(r, 800));
      return p.getPlayerState?.() === 1 || p.getPlayerState?.() === 3 ? 'muted' : 'blocked';
    },
    pause() { player.current?.pauseVideo?.(); },
    seek(t) { player.current?.seekTo?.(t, true); },
    getTime() { return player.current?.getCurrentTime?.() ?? 0; },
    getDuration() { return player.current?.getDuration?.() ?? 0; },
    isPaused() { const s = player.current?.getPlayerState?.(); return s !== 1 && s !== 3; },
    setRate(r) { const p = player.current; if (p?.getPlaybackRate && p.getPlaybackRate() !== r) p.setPlaybackRate(r); },
    unmute() { player.current?.unMute?.(); },
  }), []);

  return (
    <div className="relative h-full w-full bg-black">
      <div ref={host} className="absolute inset-0 [&>iframe]:h-full [&>iframe]:w-full" />
      {error && <PlayerError text={error} />}
    </div>
  );
});
/* ------------------------------------------------------------------ */
/* HTML5 video (MP4/WebM/Ogg) and HLS via hls.js                       */
/* ------------------------------------------------------------------ */
export const Html5Player = forwardRef<PlayerHandle, { src: string; hls: boolean } & PlayerEvents>(function Html5Player(
  { src, hls, onReady, onPlay, onPause, onSeek, onBuffering }, ref,
) {
  const video = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const v = video.current; if (!v) return;
    setError(''); setLoading(true);
    let destroyed = false;
    if (hls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (destroyed) return;
        if (!Hls.isSupported()) { setError('This browser can’t play HLS streams.'); return; }
        const h = new Hls({ enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: true });
        hlsRef.current = h;
        h.loadSource(src);
        h.attachMedia(v);
        h.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
            else setError('The stream failed to load. The server may block other websites (CORS).');
          }
        });
      });
    } else {
      v.src = src;
    }
    return () => {
      destroyed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      v.removeAttribute('src');
      v.load();
    };
  }, [src, hls]);

  useImperativeHandle(ref, () => ({
    fineRate: true,
    async play() {
      const v = video.current; if (!v) return 'blocked';
      try { await v.play(); return 'ok'; } catch (e) {
        if ((e as DOMException).name !== 'NotAllowedError') return 'blocked';
        v.muted = true;
        try { await v.play(); return 'muted'; } catch { return 'blocked'; }
      }
    },
    pause() { video.current?.pause(); },
    seek(t) { const v = video.current; if (v && isFinite(t)) v.currentTime = Math.max(0, t); },
    getTime() { return video.current?.currentTime ?? 0; },
    getDuration() { return video.current?.duration ?? 0; },
    isPaused() { return video.current?.paused ?? true; },
    setRate(r) { const v = video.current; if (v && Math.abs(v.playbackRate - r) > 0.001) v.playbackRate = r; },
    unmute() { if (video.current) video.current.muted = false; },
    qualities() {
      const h = hlsRef.current; if (!h) return [];
      return [{ id: -1, label: 'Auto' }, ...h.levels.map((l, i) => ({ id: i, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps` }))];
    },
    setQuality(id) { if (hlsRef.current) hlsRef.current.currentLevel = id; },
    async pip() {
      const v = video.current; if (!v) return;
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    },
    nativeFullscreen() {
      const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      v?.webkitEnterFullscreen?.();
    },
  }), []);

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={video} className="h-full w-full" playsInline controls preload="auto" crossOrigin="anonymous"
        onLoadedMetadata={() => { setLoading(false); onReady(); }}
        onPlay={onPlay} onPause={onPause} onSeeked={onSeek}
        onWaiting={() => onBuffering?.(true)} onPlaying={() => onBuffering?.(false)}
        onError={() => { setLoading(false); setError('This video couldn’t load. The link may be broken, private, or blocked from other websites.'); }} />
      {loading && !error && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-white/60" /></div>}
      {error && <PlayerError text={error} />}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Third-party embeds (only when the site allows framing)              */
/* ------------------------------------------------------------------ */
export function IframeEmbed({ url, onCountdown }: { url: string; onCountdown?: () => void }) {
  const [check, setCheck] = useState<{ loading: boolean; embeddable?: boolean; reason?: string }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setCheck({ loading: true });
    fetch(`/api/embed-check?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((d) => alive && setCheck({ loading: false, embeddable: !!d.embeddable, reason: d.reason ?? d.error }))
      .catch(() => alive && setCheck({ loading: false, embeddable: false, reason: 'We couldn’t check this website.' }));
    return () => { alive = false; };
  }, [url]);

  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  if (check.loading) return <div className="flex h-full items-center justify-center bg-black"><Loader2 className="h-8 w-8 animate-spin text-white/60" /></div>;
  if (!check.embeddable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-black p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-beam" />
        <div>
          <p className="font-semibold">{host} can’t be shown inside Nightcap</p>
          <p className="mt-1 max-w-md text-sm text-white/60">
            {check.reason} If the site blocks framing, Nightcap can’t override that; everyone needs to open it separately.
            Use the room countdown to start together.
          </p>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary"><ExternalLink className="h-4 w-4" />Open {host}</a>
        {onCountdown && <button type="button" onClick={onCountdown} className="btn-ghost">Start 5-second room countdown</button>}
      </div>
    );
  }
  return (
    <div className="relative h-full w-full bg-black">
      <iframe src={url} title={`Embedded content from ${host}`} className="h-full w-full"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-forms"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      <a href={url} target="_blank" rel="noopener noreferrer" className="chip absolute right-2 top-2 bg-black/60 backdrop-blur"><ExternalLink className="h-3 w-3" />Open site</a>
    </div>
  );
}

function PlayerError({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center">
      <AlertTriangle className="h-8 w-8 text-beam" />
      <p className="max-w-md text-sm text-white/80">{text}</p>
    </div>
  );
}
