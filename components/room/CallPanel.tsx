'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  LiveKitRoom, GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer, useTracks,
  TrackToggle, DisconnectButton, useLocalParticipant, useSpeakingParticipants, useParticipants, VideoTrack, StartAudio,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, type LocalVideoTrack, MediaDeviceFailure, ScreenSharePresets, AudioPresets } from 'livekit-client';
import { Minimize2, Maximize2, SwitchCamera, PhoneOff, Loader2, GripHorizontal, MonitorUp, MonitorX } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CallPanel({ roomId, withVideo, onLeave, onError }: {
  roomId: string; withVideo: boolean; onLeave(): void; onError(msg: string): void;
}) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const bounds = useRef<HTMLDivElement>(null);
  const cb = useRef({ onError, onLeave });
  cb.current = { onError, onLeave };

  useEffect(() => {
    let alive = true;
    fetch(`/api/livekit/token?room=${roomId}`).then(async (r) => {
      const d = await r.json();
      if (!alive) return;
      if (!r.ok) { cb.current.onError(d.error ?? 'Couldn’t start the call.'); cb.current.onLeave(); return; }
      setConn(d);
    }).catch(() => { cb.current.onError('Couldn’t reach the call server.'); cb.current.onLeave(); });
    return () => { alive = false; };
  }, [roomId]);

  return (
    <div ref={bounds} className="pointer-events-none fixed inset-2 z-[70]">
      <motion.div drag dragConstraints={bounds} dragMomentum={false}
        className={cn('glass-strong pointer-events-auto absolute bottom-24 right-0 overflow-hidden rounded-3xl shadow-2xl lg:bottom-4',
          minimized ? 'w-auto' : 'w-[min(94vw,420px)]')}>
        {!conn ? (
          <div className="flex items-center gap-3 p-4 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Connecting to the call…</div>
        ) : (
          <LiveKitRoom serverUrl={conn.url} token={conn.token} connect audio={false} video={withVideo} data-lk-theme="default"
            options={{ adaptiveStream: true, dynacast: true }}
            onDisconnected={onLeave}
            onError={(e) => onError(e.message)}
            onMediaDeviceFailure={(f) => {
              onError(f === MediaDeviceFailure.PermissionDenied
                ? 'Microphone or camera access is blocked. Allow it in your browser’s site settings, then try again.'
                : f === MediaDeviceFailure.NotFound ? 'No microphone or camera was found on this device.'
                : f === MediaDeviceFailure.DeviceInUse ? 'Your camera or microphone is being used by another app.'
                : 'Your microphone or camera couldn’t start.');
            }}>
            <CallBody minimized={minimized} setMinimized={setMinimized} />
            <RoomAudioRenderer />
            {/* Phones block sound until a tap; this shows a button only when that happens. */}
            <StartAudio label="Tap to hear the call" className="btn-primary absolute inset-x-3 bottom-3 justify-center" />
          </LiveKitRoom>
        )}
      </motion.div>
    </div>
  );
}

function CallBody({ minimized, setMinimized }: { minimized: boolean; setMinimized(b: boolean): void }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const participants = useParticipants();
  const speaking = useSpeakingParticipants();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => { setIsTouch(window.matchMedia('(pointer: coarse)').matches); }, []);

  async function flip() {
    const track = localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const next = facing === 'user' ? 'environment' : 'user';
    await track.restartTrack({ facingMode: next });
    setFacing(next);
  }

  const shareButton = !isTouch && <ShareScreenButton sharing={isScreenShareEnabled} />;

  if (minimized) {
    return (
      <>
      <ScreenStage />
      <div className="flex items-center gap-1.5 p-2">
        <GripHorizontal className="h-4 w-4 cursor-grab text-white/40" aria-hidden />
        <span className="px-1 text-xs text-white/70">{participants.length} in call{speaking[0] ? ` · ${speaking[0].name || 'Someone'} speaking` : ''}</span>
        <TrackToggle source={Track.Source.Microphone} showIcon className="icon-btn h-9 w-9" />
        <TrackToggle source={Track.Source.Camera} showIcon className="icon-btn h-9 w-9" />
        <button className="icon-btn h-9 w-9" onClick={() => setMinimized(false)} aria-label="Expand call"><Maximize2 className="h-4 w-4" /></button>
        {shareButton}
        <DisconnectButton className="icon-btn h-9 w-9 bg-rose-500/80"><PhoneOff className="h-4 w-4" /></DisconnectButton>
      </div>
      </>
    );
  }

  return (
    <div>
      <ScreenStage />
      <div className="flex cursor-grab items-center justify-between px-3 pt-2.5 active:cursor-grabbing">
        <span className="flex items-center gap-2 text-xs text-white/60"><GripHorizontal className="h-4 w-4" />{participants.length} in call{speaking[0] ? ` · ${speaking[0].name || 'Someone'} is speaking` : ''}</span>
        <div className="flex gap-1">
          {isTouch && <button className="icon-btn h-8 w-8" onClick={flip} aria-label="Switch camera"><SwitchCamera className="h-4 w-4" /></button>}
          <button className="icon-btn h-8 w-8" onClick={() => setMinimized(true)} aria-label="Minimize call"><Minimize2 className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="p-2" style={{ height: participants.length > 2 ? 300 : 220 }}>
        <GridLayout tracks={tracks} style={{ height: '100%' }}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <div className="flex items-center justify-center gap-2 px-2 pb-2">
        <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: true }} />
        {shareButton}
      </div>
    </div>
  );
}

/** Starts or stops sharing a screen or tab, with its sound, tuned for video rather than slides. */
function ShareScreenButton({ sharing }: { sharing: boolean }) {
  const { localParticipant } = useLocalParticipant();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (sharing) {
        await localParticipant.setScreenShareEnabled(false);
      } else {
        // The shared tab's sound is its own track, separate from the microphone,
        // so it reaches everyone even while the mic stays off.
        const pub = await localParticipant.setScreenShareEnabled(
          true,
          {
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            resolution: ScreenSharePresets.h1080fps30.resolution,
          },
          {
            // Video: sharp 1080p with smooth motion; lower layers for slow viewers.
            videoCodec: 'h264',
            screenShareEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 },
            simulcast: true,
            // Audio: full-quality stereo, never cut out during quiet scenes.
            audioPreset: AudioPresets.musicHighQualityStereo,
            forceStereo: true,
            dtx: false,
            red: true,
          },
        );
        // Tell the encoder to favour smooth motion over sharp text.
        const mst = pub?.track?.mediaStreamTrack;
        if (mst && 'contentHint' in mst) mst.contentHint = 'motion';
      }
    } catch {
      // The person closed the browser's picker; nothing to do.
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={cn('icon-btn h-9 w-9', sharing && 'bg-violet text-white')} onClick={toggle} disabled={busy}
      aria-label={sharing ? 'Stop sharing your screen' : 'Share your screen'} aria-pressed={sharing}
      title={sharing ? 'Stop sharing' : 'Share a tab or screen with sound'}>
      {sharing ? <MonitorX className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
    </button>
  );
}

/** Shows a shared screen full-size on the room's main player area instead of in the small call window. */
function ScreenStage() {
  const shares = useTracks([Track.Source.ScreenShare]);
  const { localParticipant } = useLocalParticipant();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById('nightcap-screen-stage')); }, []);

  const share = shares[0];
  if (!target || !share) return null;
  const mine = share.participant.identity === localParticipant.identity;
  const name = share.participant.name || 'Someone';

  return createPortal(
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black">
      {mine ? (
        <div className="flex flex-col items-center gap-3 p-6 text-center">
          <MonitorUp className="h-8 w-8 text-beam" />
          <p className="text-sm text-white/80">You’re sharing your screen. Everyone in the call sees it here.</p>
          <button className="btn-ghost px-4 py-2" onClick={() => localParticipant.setScreenShareEnabled(false)}>
            <MonitorX className="h-4 w-4" />Stop sharing
          </button>
        </div>
      ) : (
        <VideoTrack trackRef={share} className="h-full w-full object-contain" />
      )}
      <span className="chip absolute left-3 top-3 bg-black/60">
        <MonitorUp className="h-3 w-3" />{mine ? 'You are sharing' : `${name} is sharing`}
      </span>
    </div>,
    target,
  );
}
