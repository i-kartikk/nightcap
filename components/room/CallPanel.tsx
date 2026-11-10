'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LiveKitRoom, GridLayout, ParticipantTile, ControlBar, RoomAudioRenderer, useTracks,
  TrackToggle, DisconnectButton, useLocalParticipant, useSpeakingParticipants, useParticipants, StartAudio,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track, type LocalVideoTrack, MediaDeviceFailure } from 'livekit-client';
import { Minimize2, Maximize2, SwitchCamera, PhoneOff, Loader2, GripHorizontal } from 'lucide-react';
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
  const { localParticipant } = useLocalParticipant();
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

  if (minimized) {
    return (
      <div className="flex items-center gap-1.5 p-2">
        <GripHorizontal className="h-4 w-4 cursor-grab text-white/40" aria-hidden />
        <span className="px-1 text-xs text-white/70">{participants.length} in call{speaking[0] ? ` · ${speaking[0].name || 'Someone'} speaking` : ''}</span>
        <TrackToggle source={Track.Source.Microphone} showIcon className="icon-btn h-9 w-9" />
        <TrackToggle source={Track.Source.Camera} showIcon className="icon-btn h-9 w-9" />
        <button className="icon-btn h-9 w-9" onClick={() => setMinimized(false)} aria-label="Expand call"><Maximize2 className="h-4 w-4" /></button>
        <DisconnectButton className="icon-btn h-9 w-9 bg-rose-500/80"><PhoneOff className="h-4 w-4" /></DisconnectButton>
      </div>
    );
  }

  return (
    <div>
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
      <ControlBar variation="minimal" controls={{ microphone: true, camera: true, screenShare: false, chat: false, leave: true }} />
    </div>
  );
}

