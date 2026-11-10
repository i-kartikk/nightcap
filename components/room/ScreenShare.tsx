'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, AudioPresets, ScreenSharePresets, type RemoteTrack } from 'livekit-client';
import { Loader2, MonitorUp, MonitorX, Volume2 } from 'lucide-react';

/*
 * Screen sharing that works without joining the call.
 *
 * The sharer and the viewers connect to a separate LiveKit room
 * ("nightcap-<ROOM>-screen") under their own identities, so it never clashes
 * with the voice/video call, and nobody's mic or camera is ever used.
 * Who is sharing is announced through room presence (`sharing: true`), so
 * viewers connect only while a share is live and disconnect when it ends.
 */

async function getToken(roomId: string, kind: 'screen' | 'view') {
  const r = await fetch(`/api/livekit/token?room=${roomId}&kind=${kind}`, { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'Couldn’t reach the screen-share server.');
  return d as { token: string; url: string };
}

/** True when this browser can capture a screen or tab (desktop Chrome, Edge, Firefox, Safari). */
export function canShareScreen() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

/** Starts and stops this person's screen share. */
export function useScreenShare(roomId: string, onError: (msg: string) => void) {
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const errRef = useRef(onError);
  errRef.current = onError;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    roomRef.current?.disconnect();
    roomRef.current = null;
    setSharing(false);
  }, []);

  const start = useCallback(async () => {
    if (!canShareScreen()) {
      errRef.current('Phones and tablets can’t share their screen from a browser. Start the share from a laptop or desktop; you can still watch it here.');
      return;
    }
    if (roomRef.current || starting) return;
    setStarting(true);
    let stream: MediaStream;
    try {
      // Ask for the screen first, while the click still counts as a user gesture.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
        // Movie sound: no voice filters, so music and quiet dialogue stay intact.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Chrome-only hints; other browsers ignore them.
        selfBrowserSurface: 'exclude', systemAudio: 'include', surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions);
    } catch {
      setStarting(false); // picker was closed
      return;
    }

    try {
      streamRef.current = stream;
      const { token, url } = await getToken(roomId, 'screen');
      const room = new Room({ dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.Disconnected, () => { if (roomRef.current === room) stop(); });
      await room.connect(url, token);

      const video = stream.getVideoTracks()[0];
      if (video) {
        if ('contentHint' in video) video.contentHint = 'motion'; // smooth motion over sharp text
        video.addEventListener('ended', stop); // the browser's own "Stop sharing" bar
        await room.localParticipant.publishTrack(video, {
          source: Track.Source.ScreenShare,
          videoCodec: 'h264',
          // Up to 8 Mbps for a crisp 1080p picture, plus a 720p layer for viewers on slow connections.
          screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 30 },
          simulcast: true,
          screenShareSimulcastLayers: [ScreenSharePresets.h720fps30],
        });
      }
      const audio = stream.getAudioTracks()[0];
      if (audio) {
        await room.localParticipant.publishTrack(audio, {
          source: Track.Source.ScreenShareAudio,
          audioPreset: AudioPresets.musicHighQualityStereo,
          forceStereo: true,
          dtx: false,
          red: true,
        });
      } else {
        errRef.current('Sharing without sound. To include the movie’s audio, share a Chrome tab and turn on “Also share tab audio”.');
      }
      setSharing(true);
    } catch (e) {
      stop();
      errRef.current((e as Error).message || 'Screen sharing couldn’t start.');
    } finally {
      setStarting(false);
    }
  }, [roomId, starting, stop]);

  useEffect(() => stop, [stop]); // leaving the room ends the share

  return { sharing, starting, start, stop };
}

/** Button for the room's control row. */
export function ShareScreenButton({ sharing, starting, otherSharer, onStart, onStop }: {
  sharing: boolean; starting: boolean; otherSharer: string | null; onStart(): void; onStop(): void;
}) {
  if (sharing) {
    return <button className="btn-violet px-3.5 py-2" onClick={onStop}><MonitorX className="h-4 w-4" />Stop sharing</button>;
  }
  return (
    <button className="btn-ghost px-3.5 py-2" onClick={onStart} disabled={starting || !!otherSharer}
      title={otherSharer ? `${otherSharer} is already sharing` : 'Share a tab or screen with sound'}>
      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorUp className="h-4 w-4" />}Share screen
    </button>
  );
}

/** Shown to the sharer over the player, instead of a mirror of their own screen. */
export function SharingNotice({ onStop }: { onStop(): void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black p-6 text-center">
      <MonitorUp className="h-8 w-8 text-beam" />
      <p className="max-w-sm text-sm text-white/80">You’re sharing your screen. Everyone in the room sees it here, no call needed.</p>
      <button className="btn-ghost px-4 py-2" onClick={onStop}><MonitorX className="h-4 w-4" />Stop sharing</button>
    </div>
  );
}

/** Connects silently as a viewer while someone shares, and shows their screen full-size with sound. */
export function ScreenViewer({ roomId, sharerName }: { roomId: string; sharerName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    // Pick the stream layer for the real screen resolution (sharper on phones and Retina displays).
    const room = new Room({ adaptiveStream: { pixelDensity: 'screen' }, dynacast: true });
    roomRef.current = room;

    const attach = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && videoRef.current) { track.attach(videoRef.current); setHasVideo(true); }
      if (track.kind === Track.Kind.Audio && audioRef.current) track.attach(audioRef.current);
    };
    room.on(RoomEvent.TrackSubscribed, (track) => attach(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach();
      if (track.kind === Track.Kind.Video) setHasVideo(false);
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsTap(!room.canPlaybackAudio));

    getToken(roomId, 'view')
      .then(({ token, url }) => (alive ? room.connect(url, token) : undefined))
      .then(() => {
        if (!alive) return;
        room.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => { if (pub.track) attach(pub.track); }));
        setNeedsTap(!room.canPlaybackAudio);
      })
      .catch((e) => alive && setError((e as Error).message));

    return () => { alive = false; room.disconnect(); roomRef.current = null; };
  }, [roomId]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
      <video ref={videoRef} data-screen-share className="h-full w-full object-contain" autoPlay playsInline muted />
      <audio ref={audioRef} autoPlay />
      {!hasVideo && !error && (
        <span className="absolute flex items-center gap-2 text-sm text-white/70"><Loader2 className="h-4 w-4 animate-spin" />Connecting to {sharerName}’s screen…</span>
      )}
      {error && <p className="absolute max-w-sm p-6 text-center text-sm text-white/80">{error}</p>}
      {needsTap && (
        <button className="btn-primary absolute bottom-4 left-1/2 -translate-x-1/2 px-5 py-2.5"
          onClick={() => roomRef.current?.startAudio().then(() => setNeedsTap(false))}>
          <Volume2 className="h-4 w-4" />Tap to hear
        </button>
      )}
      <span className="chip absolute left-3 top-3 bg-black/60"><MonitorUp className="h-3 w-3" />{sharerName} is sharing</span>
    </div>
  );
}
